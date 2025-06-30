const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');

const router = express.Router();

// OPTIONS handler para CORS preflight
router.options('/sheets/:cliente_id', (req, res) => {
  const requestId = Math.random().toString(36).substr(2, 9);
  console.log(`🔍 [${requestId}] === OPTIONS REQUEST ===`);
  console.log(`🔍 [${requestId}] IP: ${req.ip}`);
  console.log(`🔍 [${requestId}] User-Agent: ${req.get('User-Agent') || 'No definido'}`);
  console.log(`🔍 [${requestId}] Origin: ${req.get('Origin') || 'No definido'}`);
  console.log(`🔍 [${requestId}] Cliente ID: ${req.params.cliente_id}`);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  console.log(`✅ [${requestId}] OPTIONS response enviado`);
  res.status(200).end();
});

// Rate limiting simple (en memoria)
const accessLog = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minuto
const MAX_REQUESTS_PER_WINDOW = 30; // Aumentado para Google Sheets

// Middleware de rate limiting
function rateLimiter(req, res, next) {
  const requestId = Math.random().toString(36).substr(2, 9);
  req.requestId = requestId; // Guardar para usar en logs
  
  const userAgent = req.get('User-Agent') || '';
  const isGoogleSheets = userAgent.includes('GoogleDocs') || userAgent.includes('apps-spreadsheets');
  
  console.log(`🔍 [${requestId}] Rate Limiter - IP: ${req.ip}, Google Sheets: ${isGoogleSheets}`);
  
  // Ser más permisivo con Google Sheets
  if (isGoogleSheets) {
    console.log(`✅ [${requestId}] Google Sheets detectado - saltando rate limit estricto`);
    return next();
  }
  
  const clientKey = `${req.ip}_${req.params.cliente_id}`;
  const now = Date.now();
  
  if (!accessLog.has(clientKey)) {
    accessLog.set(clientKey, []);
  }
  
  const requests = accessLog.get(clientKey);
  // Limpiar requests antiguos
  const validRequests = requests.filter(time => now - time < RATE_LIMIT_WINDOW);
  
  if (validRequests.length >= MAX_REQUESTS_PER_WINDOW) {
    console.log(`❌ [${requestId}] Rate limit excedido para ${clientKey} - ${validRequests.length} requests`);
    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Try again later.'
    });
  }
  
  validRequests.push(now);
  accessLog.set(clientKey, validRequests);
  console.log(`✅ [${requestId}] Rate limit OK - ${validRequests.length}/${MAX_REQUESTS_PER_WINDOW} requests`);
  next();
}

// Función para limpiar CUIT
function cleanCUIT(cuit) {
  if (!cuit) return '';
  return cuit.replace(/[^0-9]/g, '');
}

// Función para formatear fecha para CSV
function formatDateForCSV(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-AR') + ' ' + d.toLocaleTimeString('es-AR', {hour: '2-digit', minute: '2-digit'});
}

// GET /export/sheets/:cliente_id - Exportar datos para Google Sheets
router.get('/sheets/:cliente_id', rateLimiter, async (req, res) => {
  const startTime = Date.now();
  const requestId = req.requestId || Math.random().toString(36).substr(2, 9);
  
  console.log(`🔍 [${requestId}] === INICIO REQUEST EXPORT ===`);
  console.log(`🔍 [${requestId}] Timestamp: ${new Date().toISOString()}`);
  console.log(`🔍 [${requestId}] IP: ${req.ip}`);
  console.log(`🔍 [${requestId}] User-Agent: ${req.get('User-Agent') || 'No definido'}`);
  console.log(`🔍 [${requestId}] Referer: ${req.get('Referer') || 'No definido'}`);
  console.log(`🔍 [${requestId}] Origin: ${req.get('Origin') || 'No definido'}`);
  console.log(`🔍 [${requestId}] Headers completos:`, JSON.stringify(req.headers, null, 2));
  console.log(`🔍 [${requestId}] Cliente ID: ${req.params.cliente_id}`);
  console.log(`🔍 [${requestId}] Query params:`, JSON.stringify(req.query, null, 2));
  
  // Headers para compatibilidad con Google Sheets
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  console.log(`🔍 [${requestId}] Headers CORS configurados`);
  
  const client = await db.getClient();
  
  try {
    const { cliente_id } = req.params;
    const { 
      user, 
      pass, 
      format = 'csv',
      tipo = 'movimientos', // 'movimientos', 'resumen', 'all'
      fecha_desde,
      fecha_hasta
    } = req.query;

    // Validar parámetros requeridos
    console.log(`🔍 [${requestId}] Validando credenciales: user=${user ? 'SI' : 'NO'}, pass=${pass ? 'SI' : 'NO'}`);
    
    if (!user || !pass) {
      console.log(`❌ [${requestId}] Credenciales faltantes - user: ${user}, pass: ${pass ? '***' : 'undefined'}`);
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Parameters user and pass are required'
      });
    }

    // Verificar credenciales del cliente
    console.log(`🔍 [${requestId}] Consultando base de datos para cliente ${cliente_id}`);
    
    const clienteResult = await client.query(`
      SELECT 
        c.id,
        c.nombre,
        c.apellido,
        c.estado,
        pu.export_user,
        pu.export_password,
        pu.username as portal_username,
        pu.activo as portal_activo
      FROM clientes c
      LEFT JOIN portal_users pu ON c.id = CAST(pu.id_cliente AS INTEGER)
      WHERE c.id = $1 AND c.estado = 'activo'
    `, [parseInt(cliente_id)]);
    
    console.log(`🔍 [${requestId}] Resultados de consulta: ${clienteResult.rows.length} filas`);
    if (clienteResult.rows.length > 0) {
      const result = clienteResult.rows[0];
      console.log(`🔍 [${requestId}] Cliente encontrado: ${result.nombre} ${result.apellido}`);
      console.log(`🔍 [${requestId}] Estado cliente: ${result.estado}`);
      console.log(`🔍 [${requestId}] Portal username: ${result.portal_username || 'NULL'}`);
      console.log(`🔍 [${requestId}] Portal activo: ${result.portal_activo || 'NULL'}`);
      console.log(`🔍 [${requestId}] Export user: ${result.export_user || 'NULL'}`);
      console.log(`🔍 [${requestId}] Export password: ${result.export_password ? '***' : 'NULL'}`);
    }

    if (clienteResult.rows.length === 0) {
      console.log(`❌ [${requestId}] Cliente no encontrado o inactivo`);
      
      await client.query(`
        INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
        VALUES ($1, $2, $3, $4)
      `, [
        'export_access_denied',
        `[${requestId}] Intento de acceso a exportación con cliente_id inválido: ${cliente_id}`,
        JSON.stringify({ requestId, cliente_id, user, ip: req.ip, userAgent: req.get('User-Agent') }),
        'fallido'
      ]);
      
      return res.status(404).json({
        error: 'Client not found',
        message: 'Client not found or inactive'
      });
    }

    const cliente = clienteResult.rows[0];

    // Verificar credenciales de exportación
    console.log(`🔍 [${requestId}] Verificando credenciales de export`);
    console.log(`🔍 [${requestId}] Esperado user: ${cliente.export_user || 'NULL'}`);
    console.log(`🔍 [${requestId}] Recibido user: ${user}`);
    console.log(`🔍 [${requestId}] Password match: ${cliente.export_password === pass ? 'SI' : 'NO'}`);
    
    if (!cliente.export_user || !cliente.export_password || 
        cliente.export_user !== user || cliente.export_password !== pass) {
      
      console.log(`❌ [${requestId}] Credenciales inválidas`);
      console.log(`❌ [${requestId}] - export_user existe: ${!!cliente.export_user}`);
      console.log(`❌ [${requestId}] - export_password existe: ${!!cliente.export_password}`);
      console.log(`❌ [${requestId}] - user match: ${cliente.export_user === user}`);
      console.log(`❌ [${requestId}] - pass match: ${cliente.export_password === pass}`);
      
      await client.query(`
        INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
        VALUES ($1, $2, $3, $4)
      `, [
        'export_access_denied',
        `[${requestId}] Credenciales inválidas para exportación del cliente: ${cliente.nombre} ${cliente.apellido}`,
        JSON.stringify({ requestId, cliente_id, user, ip: req.ip, userAgent: req.get('User-Agent') }),
        'fallido'
      ]);
      
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Invalid export credentials'
      });
    }

    // Log de acceso exitoso
    console.log(`✅ [${requestId}] Credenciales válidas - acceso autorizado`);
    
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'export_access_success',
      `[${requestId}] Acceso exitoso a exportación: ${cliente.nombre} ${cliente.apellido}`,
      JSON.stringify({ requestId, cliente_id, user, tipo, format, ip: req.ip, userAgent: req.get('User-Agent') }),
      'exitoso'
    ]);

    let data = [];
    let headers = [];

    if (tipo === 'resumen' || tipo === 'all') {
      // Obtener resumen del cliente
      const resumenData = await getClientResumen(client, parseInt(cliente_id));
      
      if (tipo === 'resumen') {
        headers = ['Concepto', 'Valor'];
        data = [
          ['Total Acreditaciones', resumenData.acreditaciones.total_acreditaciones || 0],
          ['Acreditaciones Cotejadas', resumenData.acreditaciones.acreditaciones_cotejadas || 0],
          ['Acreditaciones Pendientes', resumenData.acreditaciones.acreditaciones_pendientes || 0],
          ['Comprobantes Pendientes', resumenData.comprobantes_pendientes.total_comprobantes_pendientes || 0],
          ['Total Pagos', resumenData.movimientos.total_pagos || 0],
          ['Total Créditos', resumenData.movimientos.total_creditos || 0],
          ['Saldo Actual', `$${(resumenData.saldo_actual || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`],
          ['Saldo Pendiente', `$${(resumenData.saldo_pendiente || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`],
          ['Saldo Total', `$${(resumenData.saldo_total || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`]
        ];
      }
    }

    if (tipo === 'movimientos' || tipo === 'all') {
      // Obtener movimientos del cliente
      const movimientosData = await getClientMovimientos(client, parseInt(cliente_id), fecha_desde, fecha_hasta);
      
      if (tipo === 'movimientos') {
        headers = ['Fecha', 'Tipo', 'Concepto', 'Importe', 'Comision_%', 'Importe_Comision', 'Neto', 'Estado', 'CUIT', 'Referencia'];
        data = movimientosData.map(mov => [
          formatDateForCSV(mov.fecha_original),
          mov.tipo_display,
          mov.concepto,
          mov.importe || 0,
          mov.comision || 0,
          mov.importe_comision || 0,
          (mov.importe || 0) - (mov.importe_comision || 0),
          mov.estado || '',
          cleanCUIT(mov.cuit) || '',
          mov.referencia || ''
        ]);
      }
    }

    // Formatear respuesta según el formato solicitado
    if (format === 'csv') {
      // Limpiar y formatear datos específicamente para Google Sheets
      const cleanData = data.map(row => row.map(cell => {
        let cellStr = String(cell || '');
        // Remover caracteres problemáticos
        cellStr = cellStr.replace(/[\r\n\t]/g, ' ');
        // Escapar comillas dobles
        if (cellStr.includes('"')) {
          cellStr = cellStr.replace(/"/g, '""');
        }
        // Envolver en comillas si contiene comas, espacios o caracteres especiales
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes(' ')) {
          cellStr = `"${cellStr}"`;
        }
        return cellStr;
      }));

      const csvContent = [
        headers.join(','),
        ...cleanData.map(row => row.join(','))
      ].join('\r\n'); // Usar CRLF para mejor compatibilidad

      // Headers ultra-compatibles con Google Sheets
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache');
      
      console.log(`✅ [${requestId}] Enviando CSV - ${data.length} filas de datos`);
      console.log(`✅ [${requestId}] Headers: ${headers.join(', ')}`);
      console.log(`✅ [${requestId}] CSV preview: ${csvContent.substring(0, 200)}...`);
      console.log(`✅ [${requestId}] Tiempo total: ${Date.now() - startTime}ms`);
      console.log(`🔍 [${requestId}] === FIN REQUEST EXPORT ===`);
      
      return res.send(csvContent);
    
    } else if (format === 'json') {
      return res.json({
        success: true,
        cliente: {
          id: cliente.id,
          nombre: cliente.nombre,
          apellido: cliente.apellido
        },
        headers,
        data,
        timestamp: new Date().toISOString()
      });
    
    } else {
      return res.status(400).json({
        error: 'Invalid format',
        message: 'Supported formats: csv, json'
      });
    }

  } catch (error) {
    const requestId = req.requestId || 'unknown';
    console.error(`❌ [${requestId}] Error en exportación:`, error);
    console.error(`❌ [${requestId}] Stack trace:`, error.stack);
    
    // Log del error
    try {
      await client.query(`
        INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
        VALUES ($1, $2, $3, $4)
      `, [
        'export_error',
        `[${requestId}] Error en exportación: ${error.message}`,
        JSON.stringify({ requestId, cliente_id: req.params.cliente_id, error: error.message, stack: error.stack }),
        'fallido'
      ]);
    } catch (logError) {
      console.error(`❌ [${requestId}] Error al guardar log:`, logError);
    }

    console.log(`🔍 [${requestId}] === FIN REQUEST EXPORT (ERROR) ===`);
    
    res.status(500).json({
      error: 'Internal server error',
      message: 'Export failed'
    });
  } finally {
    client.release();
  }
});

// Función auxiliar para obtener resumen del cliente
async function getClientResumen(client, cliente_id) {
  // Estadísticas de acreditaciones
  const acreditacionesStats = await client.query(`
    SELECT 
      COUNT(*) as total_acreditaciones,
      COUNT(CASE WHEN cotejado = true THEN 1 END) as acreditaciones_cotejadas,
      COUNT(CASE WHEN cotejado = false THEN 1 END) as acreditaciones_pendientes,
      SUM(importe) as total_importe_acreditaciones,
      SUM(CASE WHEN cotejado = true THEN importe ELSE 0 END) as total_importe_cotejadas,
      SUM(CASE WHEN cotejado = false THEN importe ELSE 0 END) as total_importe_pendientes,
      SUM(importe_comision) as total_comisiones,
      SUM(CASE WHEN cotejado = true THEN importe_comision ELSE 0 END) as total_comisiones_cotejadas,
      SUM(CASE WHEN cotejado = false THEN importe_comision ELSE 0 END) as total_comisiones_pendientes
    FROM acreditaciones 
    WHERE id_cliente = $1
  `, [cliente_id]);

  // Estadísticas de movimientos
  const movimientosStats = await client.query(`
    SELECT 
      COUNT(*) as total_movimientos,
      COUNT(CASE WHEN tipo_pago = 'egreso' THEN 1 END) as total_pagos,
      COUNT(CASE WHEN tipo_pago = 'credito' THEN 1 END) as total_creditos,
      SUM(CASE WHEN tipo_pago = 'egreso' THEN importe ELSE 0 END) as total_importe_pagos,
      SUM(CASE WHEN tipo_pago = 'credito' THEN importe ELSE 0 END) as total_importe_creditos
    FROM pagos 
    WHERE CAST(id_cliente AS INTEGER) = $1
  `, [cliente_id]);

  // Estadísticas de comprobantes pendientes
  const comprobantesPendientesStats = await client.query(`
    SELECT 
      COUNT(*) as total_comprobantes_pendientes,
      SUM(importe) as total_importe_comprobantes_pendientes
    FROM comprobantes_whatsapp 
    WHERE CAST(id_cliente AS INTEGER) = $1 AND id_acreditacion IS NULL
  `, [cliente_id]);

  // Calcular saldos
  const saldo_actual = (acreditacionesStats.rows[0].total_importe_cotejadas || 0) - 
                       (acreditacionesStats.rows[0].total_comisiones_cotejadas || 0) + 
                       (movimientosStats.rows[0].total_importe_creditos || 0) - 
                       (movimientosStats.rows[0].total_importe_pagos || 0);

  const saldo_pendiente = (acreditacionesStats.rows[0].total_importe_pendientes || 0) - 
                         (acreditacionesStats.rows[0].total_comisiones_pendientes || 0) +
                         (comprobantesPendientesStats.rows[0].total_importe_comprobantes_pendientes || 0);

  return {
    acreditaciones: acreditacionesStats.rows[0],
    movimientos: movimientosStats.rows[0],
    comprobantes_pendientes: comprobantesPendientesStats.rows[0],
    saldo_actual,
    saldo_pendiente,
    saldo_total: saldo_actual + saldo_pendiente
  };
}

// Función auxiliar para obtener movimientos del cliente
async function getClientMovimientos(client, cliente_id, fecha_desde, fecha_hasta) {
  const movimientos = [];

  // Construir filtros de fecha
  let fechaFilter = '';
  let fechaParams = [cliente_id];
  let paramIndex = 2;

  if (fecha_desde) {
    fechaFilter += ` AND fecha_hora >= $${paramIndex}`;
    fechaParams.push(fecha_desde);
    paramIndex++;
  }
  if (fecha_hasta) {
    fechaFilter += ` AND fecha_hora <= $${paramIndex}`;
    fechaParams.push(fecha_hasta);
    paramIndex++;
  }

  // Obtener acreditaciones
  const acreditaciones = await client.query(`
    SELECT 
      id, titular, importe, comision, importe_comision, fecha_hora, cuit, cotejado
    FROM acreditaciones 
    WHERE id_cliente = $1 ${fechaFilter}
    ORDER BY fecha_hora DESC
  `, fechaParams);

  acreditaciones.rows.forEach(acred => {
    movimientos.push({
      tipo: 'acreditacion',
      tipo_display: 'Acreditación',
      concepto: `Acreditación: ${acred.titular || 'Sin titular'}`,
      importe: acred.importe,
      comision: acred.comision,
      importe_comision: acred.importe_comision,
      fecha_original: acred.fecha_hora,
      cuit: acred.cuit,
      estado: acred.cotejado ? 'Cotejado' : 'Pendiente',
      referencia: ''
    });
  });

  // Obtener comprobantes pendientes (sin asignar)
  let comprobanteFechaFilter = '';
  let comprobanteFechaParams = [cliente_id];
  let comprobanteParamIndex = 2;

  if (fecha_desde) {
    comprobanteFechaFilter += ` AND fecha_envio >= $${comprobanteParamIndex}`;
    comprobanteFechaParams.push(fecha_desde);
    comprobanteParamIndex++;
  }
  if (fecha_hasta) {
    comprobanteFechaFilter += ` AND fecha_envio <= $${comprobanteParamIndex}`;
    comprobanteFechaParams.push(fecha_hasta);
    comprobanteParamIndex++;
  }

  const comprobantes = await client.query(`
    SELECT 
      id, nombre_remitente, importe, fecha_envio, cuit, id_comprobante
    FROM comprobantes_whatsapp 
    WHERE CAST(id_cliente AS INTEGER) = $1 AND id_acreditacion IS NULL ${comprobanteFechaFilter}
    ORDER BY fecha_envio DESC
  `, comprobanteFechaParams);

  comprobantes.rows.forEach(comp => {
    movimientos.push({
      tipo: 'comprobante',
      tipo_display: 'Comprobante Pendiente',
      concepto: `Comprobante: ${comp.nombre_remitente || 'Sin nombre'}`,
      importe: comp.importe,
      comision: 0,
      importe_comision: 0,
      fecha_original: comp.fecha_envio,
      cuit: comp.cuit,
      estado: 'Pendiente',
      referencia: comp.id_comprobante || ''
    });
  });

  // Obtener pagos y créditos
  let pagoFechaFilter = '';
  let pagoFechaParams = [cliente_id];
  let pagoParamIndex = 2;

  if (fecha_desde) {
    pagoFechaFilter += ` AND fecha_pago >= $${pagoParamIndex}`;
    pagoFechaParams.push(fecha_desde);
    pagoParamIndex++;
  }
  if (fecha_hasta) {
    pagoFechaFilter += ` AND fecha_pago <= $${pagoParamIndex}`;
    pagoFechaParams.push(fecha_hasta);
    pagoParamIndex++;
  }

  const pagos = await client.query(`
    SELECT 
      id, concepto, importe, fecha_pago, tipo_pago, metodo_pago, referencia, estado
    FROM pagos 
    WHERE CAST(id_cliente AS INTEGER) = $1 ${pagoFechaFilter}
    ORDER BY fecha_pago DESC
  `, pagoFechaParams);

  pagos.rows.forEach(pago => {
    movimientos.push({
      tipo: 'movimiento',
      tipo_display: pago.tipo_pago === 'credito' ? 'Crédito' : 'Pago',
      concepto: pago.concepto,
      importe: pago.importe,
      comision: 0,
      importe_comision: 0,
      fecha_original: pago.fecha_pago,
      cuit: '',
      estado: pago.estado || '',
      referencia: pago.referencia || ''
    });
  });

  // Ordenar por fecha (más reciente primero)
  movimientos.sort((a, b) => {
    const fechaA = a.fecha_original ? new Date(a.fecha_original) : new Date(0);
    const fechaB = b.fecha_original ? new Date(b.fecha_original) : new Date(0);
    return fechaB - fechaA;
  });

  return movimientos;
}

// GET /export/test/:cliente_id - Endpoint de prueba simple para Google Sheets
router.get('/test/:cliente_id', async (req, res) => {
  const requestId = Math.random().toString(36).substr(2, 9);
  console.log(`🔍 [${requestId}] === TEST ENDPOINT ===`);
  
  try {
    // Headers ultra-simples
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // CSV de prueba ultra-simple
    const testCsv = [
      'Fecha,Tipo,Importe',
      '2025-01-01,Prueba,1000',
      '2025-01-02,Test,2000'
    ].join('\r\n');
    
    console.log(`✅ [${requestId}] Enviando CSV de prueba`);
    return res.send(testCsv);
    
  } catch (error) {
    console.error(`❌ [${requestId}] Error en test:`, error);
    res.status(500).send('Error');
  }
});

module.exports = router; 