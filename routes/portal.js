const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { calcularMontoPorAcreditar, calcularMontoDisponible, calcularMontoPorAcreditarCompleto, calcularMontoDisponibleCompleto, formatearFechaLiberacion, estaLiberado, calcularComisionesFondosLiberados, calcularSaldoDisponibleCompleto, calcularComisionesSaldoDisponible, debugSaldoDisponible } = require('../utils/liberacionFondos');

const router = express.Router();

// Configuración JWT
const JWT_SECRET = process.env.JWT_SECRET || 'acreditador_portal_secret_2024';
const JWT_EXPIRES_IN = '24h';

// Middleware para verificar token JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido' });
    }
    req.user = user;
    next();
  });
}

// Función para limpiar CUIT
function cleanCUIT(cuit) {
  if (!cuit) return '';
  return cuit.replace(/[^0-9]/g, '');
}

// POST /portal/login - Login de cliente
router.post('/login', [
  body('username').notEmpty().withMessage('Usuario es requerido'),
  body('password').notEmpty().withMessage('Contraseña es requerida')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Datos inválidos', 
      details: errors.array() 
    });
  }

  const client = await db.getClient();
  
  try {
    const { username, password } = req.body;

    // Buscar usuario
    const userResult = await client.query(`
      SELECT 
        pu.*,
        c.nombre,
        c.apellido,
        c.estado as cliente_estado
      FROM portal_users pu
      JOIN clientes c ON CAST(pu.id_cliente AS INTEGER) = c.id
      WHERE pu.username = $1 AND pu.activo = true
    `, [username]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        error: 'Credenciales inválidas'
      });
    }

    const user = userResult.rows[0];

    // Verificar si el cliente está activo
    if (user.cliente_estado !== 'activo') {
      return res.status(403).json({
        error: 'Cliente inactivo'
      });
    }

    // Verificar contraseña
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({
        error: 'Credenciales inválidas'
      });
    }

    // Actualizar último acceso
    await client.query(`
      UPDATE portal_users 
      SET ultimo_acceso = CURRENT_TIMESTAMP 
      WHERE id = $1
    `, [user.id]);

    // Generar token JWT
    const token = jwt.sign(
      { 
        id: user.id, 
        cliente_id: user.id_cliente,
        username: user.username,
        nombre: user.nombre,
        apellido: user.apellido
      }, 
      JWT_SECRET, 
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      message: 'Login exitoso',
      data: {
        token,
        user: {
          id: user.id,
          cliente_id: user.id_cliente,
          username: user.username,
          nombre: user.nombre,
          apellido: user.apellido,
          email: user.email
        }
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo procesar el login'
    });
  } finally {
    client.release();
  }
});

// GET /portal/profile - Obtener perfil del cliente
router.get('/profile', authenticateToken, async (req, res) => {
  const client = await db.getClient();
  
  try {
    const userResult = await client.query(`
      SELECT 
        pu.*,
        c.nombre,
        c.apellido,
        c.estado as cliente_estado,
        c.fecha_registro,
        c.comision
      FROM portal_users pu
      JOIN clientes c ON CAST(pu.id_cliente AS INTEGER) = c.id
      WHERE pu.id = $1
    `, [req.user.id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Usuario no encontrado'
      });
    }

    const user = userResult.rows[0];

    res.json({
      success: true,
      data: {
        id: user.id,
        cliente_id: user.id_cliente,
        username: user.username,
        email: user.email,
        nombre: user.nombre,
        apellido: user.apellido,
        cliente_estado: user.cliente_estado,
        fecha_registro: user.fecha_registro,
        ultimo_acceso: user.ultimo_acceso,
        comision: user.comision
      }
    });

  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener el perfil'
    });
  } finally {
    client.release();
  }
});

// GET /portal/comprobantes - Obtener comprobantes del cliente
router.get('/comprobantes', authenticateToken, async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { 
      page = 1, 
      limit = 20,
      ordenar_por = 'fecha_envio',
      orden = 'DESC',
      estado = '' // 'cotejado', 'pendiente', o vacío para todos
    } = req.query;

    const cliente_id = parseInt(req.user.cliente_id);
    const offset = (page - 1) * limit;

    console.log('🔍 Debug - cliente_id:', cliente_id, 'tipo:', typeof cliente_id);

    // Validar parámetros de ordenamiento
    const camposValidos = ['id', 'fecha_envio', 'fecha_recepcion', 'importe', 'nombre_remitente'];
    const ordenValido = orden.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const campoOrden = camposValidos.includes(ordenar_por) ? ordenar_por : 'fecha_envio';

    // Construir condiciones de filtro
    let whereConditions = ['CAST(c.id_cliente AS INTEGER) = $1'];
    let params = [cliente_id];
    let paramIndex = 2;

    if (estado === 'cotejado') {
      whereConditions.push('c.cotejado = true');
    } else if (estado === 'pendiente') {
      whereConditions.push('c.cotejado = false');
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    // Query para contar total
    const countQuery = `
      SELECT COUNT(*) 
      FROM comprobantes_whatsapp c 
      ${whereClause}
    `;
    const countResult = await client.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Query para obtener datos
    const dataQuery = `
      SELECT 
        c.id,
        c.id_comprobante,
        c.nombre_remitente,
        c.cuit,
        c.importe,
        c.fecha_envio,
        c.fecha_recepcion,
        c.estado,
        c.cotejado,
        c.id_acreditacion,
        c.fecha_cotejo,
        a.titular as acreditacion_titular,
        a.cuit as acreditacion_cuit,
        a.fecha_hora as acreditacion_fecha
      FROM comprobantes_whatsapp c
      LEFT JOIN acreditaciones a ON CAST(c.id_acreditacion AS INTEGER) = a.id
      ${whereClause}
      ORDER BY c.${campoOrden} ${ordenValido}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(parseInt(limit), offset);
    const dataResult = await client.query(dataQuery, params);

    // Procesar datos para el frontend
    const comprobantes = dataResult.rows.map(comp => ({
      id: comp.id,
      id_comprobante: comp.id_comprobante,
      nombre_remitente: comp.nombre_remitente,
      cuit: cleanCUIT(comp.cuit),
      importe: comp.importe,
      fecha_envio: comp.fecha_envio,
      fecha_recepcion: comp.fecha_recepcion,
      estado: comp.estado,
      cotejado: comp.cotejado,
      id_acreditacion: comp.id_acreditacion,
      fecha_cotejo: comp.fecha_cotejo,
      acreditacion: comp.id_acreditacion ? {
        titular: comp.acreditacion_titular,
        cuit: cleanCUIT(comp.acreditacion_cuit),
        fecha: comp.acreditacion_fecha
      } : null
    }));

    res.json({
      success: true,
      data: comprobantes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error obteniendo comprobantes:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudieron obtener los comprobantes'
    });
  } finally {
    client.release();
  }
});

// GET /portal/movimientos - Obtener movimientos (pagos y créditos) del cliente
router.get('/movimientos', authenticateToken, async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { 
      page = 1, 
      limit = 20,
      ordenar_por = 'fecha_pago',
      orden = 'DESC',
      tipo = '' // 'pago', 'credito', o vacío para todos
    } = req.query;

    const cliente_id = parseInt(req.user.cliente_id);
    const offset = (page - 1) * limit;

    console.log('🔍 Debug - cliente_id:', cliente_id, 'tipo:', typeof cliente_id);

    // Validar parámetros de ordenamiento
    const camposValidos = ['id', 'fecha_pago', 'importe', 'concepto'];
    const ordenValido = orden.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const campoOrden = camposValidos.includes(ordenar_por) ? ordenar_por : 'fecha_pago';

    // Construir condiciones de filtro
    let whereConditions = ['CAST(p.id_cliente AS INTEGER) = $1'];
    let params = [cliente_id];
    let paramIndex = 2;

    if (tipo === 'pago') {
      whereConditions.push('p.tipo_pago = \'egreso\'');
    } else if (tipo === 'credito') {
      whereConditions.push('p.tipo_pago = \'credito\'');
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    // Query para contar total
    const countQuery = `
      SELECT COUNT(*) 
      FROM pagos p 
      ${whereClause}
    `;
    const countResult = await client.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Query para obtener datos
    const dataQuery = `
      SELECT 
        p.id,
        p.concepto,
        p.importe,
        p.fecha_pago,
        p.tipo_pago,
        p.metodo_pago,
        p.referencia,
        p.observaciones,
        p.estado,
        p.fecha_creacion,
        p.comision,
        p.importe_comision
      FROM pagos p
      ${whereClause}
      ORDER BY p.${campoOrden} ${ordenValido}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(parseInt(limit), offset);
    const dataResult = await client.query(dataQuery, params);

    res.json({
      success: true,
      data: dataResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error obteniendo movimientos:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudieron obtener los movimientos'
    });
  } finally {
    client.release();
  }
});

// GET /portal/movimientos-unificados - Obtener todos los movimientos unificados del cliente
router.get('/movimientos-unificados', authenticateToken, async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { 
      page = 1, 
      limit = 25,
      ordenar_por = 'fecha',
      orden = 'DESC',
      tipo = '' // 'acreditacion', 'comprobante', 'pago', 'credito', o vacío para todos
    } = req.query;

    const cliente_id = parseInt(req.user.cliente_id);
    const offset = (page - 1) * limit;

    // Obtener plazo de acreditación del cliente
    const clienteResult = await client.query('SELECT plazo_acreditacion FROM clientes WHERE id = $1', [cliente_id]);
    const plazoAcreditacion = clienteResult.rows[0]?.plazo_acreditacion || 24;

    // Construir condiciones de filtro
    let whereConditions = ['CAST(id_cliente AS INTEGER) = $1'];
    let params = [cliente_id];
    let paramIndex = 2;

    if (tipo === 'acreditacion') {
      whereConditions.push('tipo = \'acreditacion\'');
    } else if (tipo === 'comprobante') {
      whereConditions.push('tipo = \'comprobante\'');
    } else if (tipo === 'pago') {
      whereConditions.push('tipo = \'pago\'');
    } else if (tipo === 'credito') {
      whereConditions.push('tipo = \'credito\'');
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    // Query para obtener todos los movimientos unificados
    const dataQuery = `
      (
        -- Acreditaciones
        SELECT 
          CAST(id AS INTEGER) as id,
          'acreditacion' as tipo,
          concepto,
          importe,
          fecha_hora as fecha,
          fecha_hora as fecha_original,
          NULL as fecha_recepcion,
          NULL as cuit,
          NULL as metodo_pago,
          NULL as referencia,
          NULL as observaciones,
          'confirmado' as estado,
          comision,
          importe_comision,
          NULL as id_comprobante,
          CAST(id AS VARCHAR) as id_acreditacion,
          cotejado,
          NULL as nombre_remitente,
          'historico' as fuente
        FROM acreditaciones 
        WHERE CAST(id_cliente AS INTEGER) = $1
      )
      UNION ALL
      (
        -- Comprobantes (solo pendientes, no los ya acreditados)
        SELECT 
          CAST(id AS INTEGER) as id,
          'comprobante' as tipo,
          nombre_remitente as concepto,
          importe,
          fecha_envio as fecha,
          fecha_envio as fecha_original,
          fecha_recepcion,
          cuit,
          NULL as metodo_pago,
          NULL as referencia,
          NULL as observaciones,
          'confirmado' as estado,
          0 as comision,
          0 as importe_comision,
          CAST(id AS VARCHAR) as id_comprobante,
          id_acreditacion,
          CASE WHEN id_acreditacion IS NOT NULL THEN true ELSE false END as cotejado,
          nombre_remitente,
          'whatsapp' as fuente
        FROM comprobantes_whatsapp 
        WHERE CAST(id_cliente AS INTEGER) = $1 AND id_acreditacion IS NULL
      )
      UNION ALL
      (
        -- Pagos y Créditos
        SELECT 
          CAST(id AS INTEGER) as id,
          CASE WHEN tipo_pago = 'egreso' THEN 'pago' ELSE 'credito' END as tipo,
          concepto,
          importe,
          CASE WHEN concepto ILIKE '%deposito%' THEN fecha_creacion ELSE fecha_pago END as fecha,
          CASE WHEN concepto ILIKE '%deposito%' THEN fecha_creacion ELSE fecha_pago END as fecha_original,
          NULL as fecha_recepcion,
          NULL as cuit,
          metodo_pago,
          referencia,
          observaciones,
          estado,
          comision,
          importe_comision,
          NULL as id_comprobante,
          NULL as id_acreditacion,
          true as cotejado,
          NULL as nombre_remitente,
          'manual' as fuente
        FROM pagos 
        WHERE CAST(id_cliente AS INTEGER) = $1
      )
      ORDER BY fecha_original ${orden === 'ASC' ? 'ASC' : 'DESC'}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(parseInt(limit), offset);
    const dataResult = await client.query(dataQuery, params);

    // Calcular fechas estimadas de liberación para acreditaciones, comprobantes y pagos tipo depósito
    const movimientosConFechas = dataResult.rows.map(mov => {
      if (mov.tipo === 'acreditacion' || mov.tipo === 'comprobante') {
        const fechaRecepcion = mov.fecha_recepcion || mov.fecha;
        mov.fecha_estimada_liberacion = formatearFechaLiberacion(fechaRecepcion, plazoAcreditacion);
        mov.esta_liberado = estaLiberado(fechaRecepcion, plazoAcreditacion);
      } else if (mov.tipo === 'pago' && mov.concepto && mov.concepto.toLowerCase().includes('deposito')) {
        // Los pagos tipo depósito también tienen plazo de acreditación
        mov.fecha_estimada_liberacion = formatearFechaLiberacion(mov.fecha, plazoAcreditacion);
        mov.esta_liberado = estaLiberado(mov.fecha, plazoAcreditacion);
      }
      return mov;
    });

    // Query para contar total usando UNION
    const countQuery = `
      SELECT COUNT(*) as total FROM (
        SELECT 1 FROM acreditaciones WHERE CAST(id_cliente AS INTEGER) = $1
        UNION ALL
        SELECT 1 FROM comprobantes_whatsapp WHERE CAST(id_cliente AS INTEGER) = $1
        UNION ALL
        SELECT 1 FROM pagos WHERE CAST(id_cliente AS INTEGER) = $1
      ) as combined_movements
    `;
    const countResult = await client.query(countQuery, [cliente_id]);
    const total = parseInt(countResult.rows[0].total || 0);

    res.json({
      success: true,
      data: movimientosConFechas,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error obteniendo movimientos unificados:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudieron obtener los movimientos'
    });
  } finally {
    client.release();
  }
});

// GET /portal/resumen - Obtener resumen del cliente
router.get('/resumen', authenticateToken, async (req, res) => {
  const client = await db.getClient();
  
  try {
    const cliente_id = parseInt(req.user.cliente_id);

    // Obtener plazo de acreditación del cliente
    const clienteResult = await client.query('SELECT plazo_acreditacion FROM clientes WHERE id = $1', [cliente_id]);
    const plazoAcreditacion = clienteResult.rows[0]?.plazo_acreditacion || 24;

    // Obtener todas las acreditaciones del cliente
    const acreditacionesResult = await client.query('SELECT importe, fecha_hora, comision, importe_comision FROM acreditaciones WHERE id_cliente = $1', [cliente_id]);
    const acreditaciones = acreditacionesResult.rows;

    // Obtener todos los pagos del cliente (para incluir depósitos, créditos y pagos)
    const pagosResult = await client.query('SELECT importe, fecha_pago, concepto, tipo_pago, importe_comision, CASE WHEN concepto ILIKE \'%deposito%\' THEN fecha_creacion ELSE fecha_pago END as fecha FROM pagos WHERE CAST(id_cliente AS INTEGER) = $1 AND estado = \'confirmado\'', [cliente_id]);
    const pagos = pagosResult.rows;

    // Calcular montos por acreditar y disponibles (incluyendo depósitos)
    const montoPorAcreditar = calcularMontoPorAcreditarCompleto(acreditaciones, pagos, plazoAcreditacion);
    const montoDisponible = calcularMontoDisponibleCompleto(acreditaciones, pagos, plazoAcreditacion);

    // Estadísticas de acreditaciones (considerando comisiones)
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

    // Estadísticas de movimientos (solo confirmados)
    const movimientosStats = await client.query(`
      SELECT 
        COUNT(*) as total_movimientos,
        COUNT(CASE WHEN tipo_pago = 'egreso' THEN 1 END) as total_pagos,
        COUNT(CASE WHEN tipo_pago = 'credito' THEN 1 END) as total_creditos,
        SUM(CASE WHEN tipo_pago = 'egreso' THEN importe ELSE 0 END) as total_importe_pagos,
        SUM(CASE WHEN tipo_pago = 'credito' THEN importe ELSE 0 END) as total_importe_creditos,
        SUM(CASE WHEN tipo_pago = 'credito' THEN importe_comision ELSE 0 END) as total_comisiones_creditos
      FROM pagos 
      WHERE CAST(id_cliente AS INTEGER) = $1 AND estado = 'confirmado'
    `, [cliente_id]);

    // Estadísticas de comprobantes pendientes (sin asignar)
    const comprobantesPendientesStats = await client.query(`
      SELECT 
        COUNT(*) as total_comprobantes_pendientes,
        SUM(importe) as total_importe_comprobantes_pendientes
      FROM comprobantes_whatsapp 
      WHERE CAST(id_cliente AS INTEGER) = $1 AND id_acreditacion IS NULL
    `, [cliente_id]);

    // Calcular saldo actual con la fórmula correcta
    const saldo_actual = calcularSaldoDisponibleCompleto(acreditaciones, pagos, plazoAcreditacion);

    // Saldo pendiente (acreditaciones no cotejadas - comisiones)
    const saldo_pendiente = (acreditacionesStats.rows[0].total_importe_pendientes || 0) - 
                           (acreditacionesStats.rows[0].total_comisiones_pendientes || 0);

    // Debug: Desglose del saldo
    const debugSaldo = debugSaldoDisponible(acreditaciones, pagos, plazoAcreditacion);

    res.json({
      success: true,
      data: {
        acreditaciones: acreditacionesStats.rows[0],
        movimientos: movimientosStats.rows[0],
        comprobantes_pendientes: comprobantesPendientesStats.rows[0],
        saldo_actual: saldo_actual,
        saldo_pendiente: saldo_pendiente,
        saldo_total: saldo_actual + saldo_pendiente,
        porAcreditar: montoPorAcreditar,
        disponible: montoDisponible,
        debug_saldo: debugSaldo
      }
    });

  } catch (error) {
    console.error('Error obteniendo resumen:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener el resumen'
    });
  } finally {
    client.release();
  }
});

module.exports = router; 