const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const router = express.Router();

// Funciones de normalización y matching inteligente
function normalizeName(name) {
  if (!name) return '';
  
  console.log(`🔤 Normalizando nombre: "${name}"`);
  
  // Convertir a minúsculas y remover caracteres especiales
  let normalized = name.toLowerCase()
    .replace(/[áäâà]/g, 'a')
    .replace(/[éëêè]/g, 'e')
    .replace(/[íïîì]/g, 'i')
    .replace(/[óöôò]/g, 'o')
    .replace(/[úüûù]/g, 'u')
    .replace(/[ñ]/g, 'n')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Ordenar palabras alfabéticamente para manejar diferentes órdenes
  const words = normalized.split(' ').filter(word => word.length > 0);
  const result = words.sort().join(' ');
  
  console.log(`🔤 Nombre normalizado: "${result}" (palabras: [${words.join(', ')}])`);
  
  return result;
}

function normalizeCUIT(cuit) {
  if (!cuit) return '';
  
  // Remover todos los caracteres no numéricos
  let normalized = cuit.replace(/[^0-9]/g, '');
  
  // Si tiene menos de 8 dígitos, no es válido
  if (normalized.length < 8) return '';
  
  // Si tiene exactamente 8 dígitos, agregar el tipo más común (20)
  if (normalized.length === 8) {
    normalized = '20' + normalized;
  }
  
  // Si tiene 9 dígitos, agregar el tipo más común (20)
  if (normalized.length === 9) {
    normalized = '20' + normalized;
  }
  
  // Si tiene 10 dígitos, agregar el tipo más común (20)
  if (normalized.length === 10) {
    normalized = '20' + normalized;
  }
  
  // Si tiene más de 11 dígitos, truncar a 11
  if (normalized.length > 11) {
    normalized = normalized.substring(0, 11);
  }
  
  // Si no tiene exactamente 11 dígitos después de la normalización, no es válido
  if (normalized.length !== 11) return '';
  
  return normalized;
}

function calculateCUITVerifier(baseCUIT) {
  if (!baseCUIT || baseCUIT.length !== 10) return null;
  
  // Serie para multiplicar: 2,3,4,5,6,7,2,3,4,5
  const serie = [2, 3, 4, 5, 6, 7, 2, 3, 4, 5];
  
  let suma = 0;
  
  // Multiplicar cada dígito por la serie correspondiente
  for (let i = 0; i < 10; i++) {
    suma += parseInt(baseCUIT[i]) * serie[i];
  }
  
  // Calcular módulo 11
  const resto = suma % 11;
  
  // Calcular dígito verificador
  let verificador;
  if (resto === 0) {
    verificador = 0;
  } else if (resto === 1) {
    // Casos especiales según el tipo
    const tipo = parseInt(baseCUIT.substring(0, 2));
    if (tipo === 20) {
      verificador = 9; // Hombre
    } else if (tipo === 27) {
      verificador = 4; // Mujer
    } else if (tipo === 24) {
      verificador = 3; // Repetido
    } else if (tipo === 30) {
      verificador = 9; // Empresa
    } else if (tipo === 34) {
      verificador = 3; // Repetida
    } else {
      verificador = 11 - resto;
    }
  } else {
    verificador = 11 - resto;
  }
  
  return verificador;
}

function generateAllCUITVariations(dni) {
  if (!dni) return [];
  
  // Normalizar DNI (remover caracteres no numéricos)
  let dniClean = dni.replace(/[^0-9]/g, '');
  
  // Si tiene menos de 7 dígitos, agregar ceros al inicio
  while (dniClean.length < 7) {
    dniClean = '0' + dniClean;
  }
  
  // Si tiene más de 8 dígitos, truncar
  if (dniClean.length > 8) {
    dniClean = dniClean.substring(0, 8);
  }
  
  const variations = [];
  
  // Tipos válidos
  const tiposPersonasFisicas = ['20', '23', '24', '25', '26', '27'];
  const tiposPersonasJuridicas = ['30', '33', '34'];
  const todosLosTipos = [...tiposPersonasFisicas, ...tiposPersonasJuridicas];
  
  // Generar variaciones para cada tipo
  for (const tipo of todosLosTipos) {
    const baseCUIT = tipo + dniClean;
    const verificador = calculateCUITVerifier(baseCUIT);
    
    if (verificador !== null) {
      const cuitCompleto = baseCUIT + verificador;
      variations.push(cuitCompleto);
    }
  }
  
  return variations;
}

function namesMatch(name1, name2, threshold = 0.8) {
  if (!name1 || !name2) return false;
  
  console.log(`🔍 Comparando nombres: "${name1}" vs "${name2}"`);
  
  const normalized1 = normalizeName(name1);
  const normalized2 = normalizeName(name2);
  
  // Coincidencia exacta después de normalización
  if (normalized1 === normalized2) {
    console.log(`✅ Coincidencia exacta: "${normalized1}"`);
    return true;
  }
  
  // Coincidencia parcial (al menos 80% de las palabras coinciden)
  const words1 = normalized1.split(' ');
  const words2 = normalized2.split(' ');
  
  if (words1.length === 0 || words2.length === 0) {
    console.log(`❌ Uno de los nombres está vacío después de normalización`);
    return false;
  }
  
  const commonWords = words1.filter(word => words2.includes(word));
  const similarity = commonWords.length / Math.max(words1.length, words2.length);
  
  console.log(`📊 Análisis de similitud:`);
  console.log(`   Palabras nombre1: [${words1.join(', ')}]`);
  console.log(`   Palabras nombre2: [${words2.join(', ')}]`);
  console.log(`   Palabras comunes: [${commonWords.join(', ')}]`);
  console.log(`   Similitud: ${commonWords.length}/${Math.max(words1.length, words2.length)} = ${(similarity * 100).toFixed(1)}%`);
  console.log(`   Umbral requerido: ${(threshold * 100).toFixed(1)}%`);
  
  const matches = similarity >= threshold;
  console.log(`   ${matches ? '✅' : '❌'} Coincidencia: ${matches ? 'SÍ' : 'NO'}`);
  
  return matches;
}

function cuitsMatch(cuit1, cuit2) {
  if (!cuit1 || !cuit2) return false;
  
  console.log(`🔍 Comparando CUITs: "${cuit1}" vs "${cuit2}"`);
  
  // Normalizar ambos CUITs
  const normalized1 = normalizeCUIT(cuit1);
  const normalized2 = normalizeCUIT(cuit2);
  
  console.log(`🔢 CUITs normalizados: "${normalized1}" vs "${normalized2}"`);
  
  // Coincidencia exacta después de normalización
  if (normalized1 === normalized2) {
    console.log(`✅ Coincidencia exacta de CUIT: "${normalized1}"`);
    return true;
  }
  
  // Si uno de los CUITs no se pudo normalizar, intentar generar variaciones
  if (!normalized1 || !normalized2) {
    console.log(`⚠️ Uno de los CUITs no se pudo normalizar, intentando variaciones...`);
    
    // Intentar extraer DNI del CUIT más largo
    const cuitLargo = cuit1.length >= cuit2.length ? cuit1 : cuit2;
    const cuitCorto = cuit1.length >= cuit2.length ? cuit2 : cuit1;
    
    console.log(`🔢 CUIT largo: "${cuitLargo}", CUIT corto: "${cuitCorto}"`);
    
    // Extraer DNI (últimos 8 dígitos antes del verificador)
    const dni = cuitLargo.replace(/[^0-9]/g, '').substring(2, 10);
    
    console.log(`🔢 DNI extraído: "${dni}"`);
    
    if (dni.length === 8) {
      const variations = generateAllCUITVariations(dni);
      console.log(`🔢 Variaciones generadas para DNI ${dni}: [${variations.join(', ')}]`);
      
      // Verificar si el CUIT corto coincide con alguna variación
      for (const variation of variations) {
        if (cuitsMatch(cuitCorto, variation)) {
          console.log(`✅ Coincidencia encontrada con variación: "${variation}"`);
          return true;
        }
      }
    }
  }
  
  console.log(`❌ No se encontró coincidencia de CUIT`);
  return false;
}

// Middleware para validar errores de validación
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Datos inválidos',
      details: errors.array() 
    });
  }
  next();
};

// Validaciones para el POST de notificaciones
const validateNotification = [
  body('cvu.id').isInt().withMessage('ID de CVU debe ser un número entero'),
  body('cvu.cvu').isLength({ min: 1 }).withMessage('CVU es requerido'),
  body('origin.name').isLength({ min: 1 }).withMessage('Nombre del originante es requerido'),
  body('origin.taxId').isLength({ min: 1 }).withMessage('Tax ID del originante es requerido'),
  body('origin.account').isLength({ min: 1 }).withMessage('Cuenta del originante es requerida'),
  body('coelsa_id').isLength({ min: 1 }).withMessage('ID de Coelsa es requerido'),
  body('amount').isLength({ min: 1 }).withMessage('Importe es requerido'),
  body('id').isInt().withMessage('ID de transacción debe ser un número entero'),
  handleValidationErrors
];

// POST /api/notification - Recibir notificación de transferencia
router.post('/notification', validateNotification, async (req, res) => {
  const client = await db.getClient();
  
  try {
    const {
      cvu,
      origin,
      coelsa_id,
      status,
      amount,
      type,
      id: transactionId
    } = req.body;

    // Convertir amount de centavos a pesos (asumiendo que viene sin decimales)
    const importe = parseFloat(amount) / 100;

    // Verificar si la transacción ya existe
    const existingTransaction = await client.query(
      'SELECT id FROM acreditaciones WHERE id_transaccion = $1',
      [transactionId.toString()]
    );

    if (existingTransaction.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Transacción duplicada',
        message: 'Esta transacción ya fue procesada anteriormente'
      });
    }

    // Buscar comisión del cliente (si hay id_cliente)
    let comision = 0.00;
    let importe_comision = 0.00;
    if (cvu.id) {
      const clienteResult = await client.query('SELECT comision FROM clientes WHERE id = $1', [cvu.id]);
      if (clienteResult.rows.length > 0) {
        comision = parseFloat(clienteResult.rows[0].comision) || 0.00;
      }
    }
    importe_comision = (parseFloat(importe) * comision / 100).toFixed(2);

    // Insertar la acreditación
    const result = await client.query(`
      INSERT INTO acreditaciones (
        id_transaccion,
        tipo,
        concepto,
        aplica_a,
        importe,
        estado,
        id_en_red,
        titular,
        cuit,
        origen,
        nota,
        fecha_hora,
        cvu,
        coelsa_id,
        origen_nombre,
        origen_tax_id,
        origen_cuenta,
        tipo_notificacion,
        fuente,
        procesado
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING id
    `, [
      transactionId.toString(),
      type || 'PI',
      'Transferencia entrante',
      '',
      importe,
      status || 'Pending',
      '',
      origin.name,
      origin.taxId,
      origin.account,
      '',
      new Date(),
      cvu.cvu,
      coelsa_id,
      origin.name,
      origin.taxId,
      origin.account,
      type || 'PI',
      'api',
      true
    ]);

    // Registrar log
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'notificacion_api',
      `Notificación recibida para CVU ${cvu.cvu}`,
      JSON.stringify(req.body),
      'exitoso'
    ]);

    const acreditacion = result.rows[0];
    
    res.status(200).json({
      success: true,
      message: 'Notificación procesada exitosamente',
      data: {
        id: acreditacion.id,
        id_transaccion: acreditacion.id_transaccion,
        importe: acreditacion.importe,
        fecha_hora: acreditacion.fecha_hora
      }
    });

  } catch (error) {
    console.error('Error procesando notificación:', error);
    
    // Registrar error en logs
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado, error)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      'notificacion_api',
      'Error procesando notificación API',
      JSON.stringify(req.body),
      'error',
      error.message
    ]);

    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo procesar la notificación'
    });
  } finally {
    client.release();
  }
});

// GET /api/acreditaciones/sin-comprobante - Obtener acreditaciones disponibles para asignación
router.get('/acreditaciones/sin-comprobante', async (req, res) => {
  const client = await db.getClient();
  
  try {
    console.log('Iniciando consulta de acreditaciones sin comprobante...');
    
    const { 
      page = 1, 
      limit = 50,
      search,
      importe_min,
      importe_max,
      fecha_desde,
      fecha_hasta,
      cliente_id
    } = req.query;

    console.log('Parámetros recibidos:', { page, limit, search, importe_min, importe_max, fecha_desde, fecha_hasta, cliente_id });

    // Verificar que la tabla existe
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'acreditaciones'
      );
    `);

    if (!tableExists.rows[0].exists) {
      console.error('❌ Tabla acreditaciones no existe');
      return res.status(500).json({
        error: 'Error de configuración',
        message: 'La tabla acreditaciones no existe en la base de datos'
      });
    }

    let whereConditions = ['a.id_comprobante_whatsapp IS NULL'];
    let params = [];
    let paramIndex = 1;

    // Filtro de búsqueda
    if (search) {
      whereConditions.push(`(
        a.titular ILIKE $${paramIndex} OR 
        a.cuit ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Filtro por cliente
    if (cliente_id) {
      // Si se selecciona un cliente específico, mostrar acreditaciones de ese cliente O sin cliente asignado
      whereConditions.push(`(a.id_cliente = $${paramIndex} OR a.id_cliente IS NULL)`);
      params.push(parseInt(cliente_id));
      paramIndex++;
    }

    // Filtro por importe
    if (importe_min) {
      whereConditions.push(`a.importe >= $${paramIndex}`);
      params.push(parseFloat(importe_min));
      paramIndex++;
    }

    if (importe_max) {
      whereConditions.push(`a.importe <= $${paramIndex}`);
      params.push(parseFloat(importe_max));
      paramIndex++;
    }

    // Filtro por fecha
    if (fecha_desde) {
      whereConditions.push(`a.fecha_hora >= $${paramIndex}`);
      params.push(fecha_desde);
      paramIndex++;
    }

    if (fecha_hasta) {
      whereConditions.push(`a.fecha_hora <= $${paramIndex}`);
      params.push(fecha_hasta);
      paramIndex++;
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
    const offset = (page - 1) * limit;

    console.log('🔍 Ejecutando query de conteo...');
    // Query para contar total
    const countQuery = `SELECT COUNT(*) FROM acreditaciones a ${whereClause}`;
    console.log('📊 Count query:', countQuery);
    console.log('📊 Params:', params);
    
    const countResult = await client.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    console.log('🔍 Ejecutando query de datos...');
    // Query para obtener datos
    const dataQuery = `
      SELECT 
        a.*,
        cli.nombre as cliente_nombre,
        cli.apellido as cliente_apellido
      FROM acreditaciones a
      LEFT JOIN clientes cli ON a.id_cliente = cli.id
      ${whereClause}
      ORDER BY a.fecha_hora DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    const finalParams = [...params, parseInt(limit), offset];
    console.log('📊 Data query:', dataQuery);
    console.log('📊 Final params:', finalParams);
    
    const dataResult = await client.query(dataQuery, finalParams);

    console.log(`✅ Query exitoso. Total: ${total}, Resultados: ${dataResult.rows.length}`);

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
    console.error('💥 Error obteniendo acreditaciones sin comprobante:', error);
    console.error('💥 Stack trace:', error.stack);
    
    // Registrar error en logs si es posible
    try {
      await client.query(`
        INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado, error)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        'error_acreditaciones_sin_comprobante',
        'Error obteniendo acreditaciones sin comprobante',
        JSON.stringify(req.query),
        'error',
        error.message
      ]);
    } catch (logError) {
      console.error('💥 Error registrando log:', logError);
    }

    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudieron obtener las acreditaciones',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
});

// GET /api/acreditaciones/:id - Obtener acreditación específica
router.get('/acreditaciones/:id', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { id } = req.params;
    
    const result = await client.query(`
      SELECT * FROM acreditaciones WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'No encontrado',
        message: 'Acreditación no encontrada'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error obteniendo acreditación:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener la acreditación'
    });
  } finally {
    client.release();
  }
});

// GET /api/acreditaciones - Obtener acreditaciones con filtros y ordenamiento
router.get('/acreditaciones', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { 
      page = 1, 
      limit = 50, 
      search,
      cliente,
      ordenar_por = 'fecha_hora',
      orden = 'DESC',
      fecha_desde, 
      fecha_hasta, 
      cuit, 
      estado,
      fuente 
    } = req.query;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    // Filtro de búsqueda general
    if (search) {
      whereConditions.push(`(
        a.id_transaccion ILIKE $${paramIndex} OR 
        a.titular ILIKE $${paramIndex} OR 
        a.cuit ILIKE $${paramIndex} OR
        a.origen ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Filtro por cliente
    if (cliente) {
      whereConditions.push(`a.id_cliente = $${paramIndex}`);
      params.push(parseInt(cliente));
      paramIndex++;
    }

    // Filtros adicionales
    if (fecha_desde) {
      whereConditions.push(`a.fecha_hora >= $${paramIndex}`);
      params.push(fecha_desde);
      paramIndex++;
    }

    if (fecha_hasta) {
      whereConditions.push(`a.fecha_hora <= $${paramIndex}`);
      params.push(fecha_hasta);
      paramIndex++;
    }

    if (cuit) {
      whereConditions.push(`a.cuit = $${paramIndex}`);
      params.push(cuit);
      paramIndex++;
    }

    if (estado) {
      whereConditions.push(`a.estado = $${paramIndex}`);
      params.push(estado);
      paramIndex++;
    }

    if (fuente) {
      whereConditions.push(`a.fuente = $${paramIndex}`);
      params.push(fuente);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    // Validar campo de ordenamiento
    const camposPermitidos = ['id', 'fecha_hora', 'importe', 'titular', 'cuit', 'estado', 'fecha_carga'];
    const ordenPermitido = orden.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const campoOrden = camposPermitidos.includes(ordenar_por) ? ordenar_por : 'fecha_hora';

    // Query para contar total
    const countQuery = `
      SELECT COUNT(*) 
      FROM acreditaciones a 
      LEFT JOIN clientes c ON a.id_cliente = c.id 
      ${whereClause}
    `;
    const countResult = await client.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Query para obtener datos con JOIN a clientes
    const dataQuery = `
      SELECT 
        a.*,
        c.nombre as cliente_nombre,
        c.apellido as cliente_apellido,
        c.cuit as cliente_cuit
      FROM acreditaciones a
      LEFT JOIN clientes c ON a.id_cliente = c.id
      ${whereClause}
      ORDER BY a.${campoOrden} ${ordenPermitido}
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
    console.error('Error obteniendo acreditaciones:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudieron obtener las acreditaciones'
    });
  } finally {
    client.release();
  }
});

// GET /api/stats - Estadísticas generales
router.get('/stats', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const stats = await client.query(`
      SELECT 
        COUNT(*) as total_acreditaciones,
        COUNT(CASE WHEN fuente = 'api' THEN 1 END) as total_api,
        COUNT(CASE WHEN fuente = 'csv' THEN 1 END) as total_csv,
        COUNT(CASE WHEN cotejado = true THEN 1 END) as total_cotejadas,
        COUNT(CASE WHEN cotejado = false THEN 1 END) as total_pendientes,
        SUM(importe) as importe_total,
        SUM(CASE WHEN cotejado = false THEN importe ELSE 0 END) as importe_pendientes,
        AVG(importe) as importe_promedio,
        MIN(fecha_hora) as fecha_primera,
        MAX(fecha_hora) as fecha_ultima
      FROM acreditaciones
    `);

    res.json({
      success: true,
      data: stats.rows[0]
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudieron obtener las estadísticas'
    });
  } finally {
    client.release();
  }
});

// POST /api/notifications - Recibir notificaciones bancarias
router.post('/notifications', async (req, res) => {
  const client = await db.getClient();
  
  try {
    console.log('📥 Body recibido en /api/notifications:', req.body);
    
    // Detectar el tipo de formato
    const isHistoricalImport = req.body.id_transaccion && req.body.importe && req.body.titular;
    const isBankNotification = req.body.id && req.body.amount && req.body.coelsa_id;
    
    if (!isHistoricalImport && !isBankNotification) {
    return res.status(400).json({ 
      error: 'Datos inválidos', 
        message: 'Formato de datos no reconocido'
    });
  }

    let id_transaccion, importe, titular, cuit, fecha_hora, id_cliente, comision, importe_comision, tipo, estado, fuente, coelsa_id;

    if (isHistoricalImport) {
      // Formato del script de importación histórica
      id_transaccion = req.body.id_transaccion;
      importe = req.body.importe;
      titular = req.body.titular;
      cuit = req.body.cuit;
      fecha_hora = req.body.fecha_hora;
      id_cliente = req.body.id_cliente;
      comision = req.body.comision || 0;
      importe_comision = req.body.importe_comision || 0;
      tipo = req.body.tipo || 'Transfer';
      estado = req.body.estado || 'confirmado';
      fuente = req.body.fuente || 'historico';
      coelsa_id = req.body.coelsa_id || `HIST_${id_transaccion}`;
    } else {
      // Formato de notificaciones bancarias
      const { id, cvu, type, amount, origin, status, coelsa_id: bank_coelsa_id } = req.body;
      
      id_transaccion = id.toString();
      importe = parseFloat(amount) / 100; // Convertir de centavos a pesos
      fecha_hora = new Date().toISOString();
      titular = origin?.name || '';
      cuit = origin?.taxId || '';
      id_cliente = null; // No se especifica cliente en notificaciones bancarias
      comision = 0;
      importe_comision = 0;
      tipo = type || 'PI';
      estado = status || 'Pending';
      fuente = 'api';
      coelsa_id = bank_coelsa_id;
    }

    // Verificar si la transacción ya existe
    const existingTransaction = await client.query(
      'SELECT id FROM acreditaciones WHERE id_transaccion = $1',
      [id_transaccion]
    );

    if (existingTransaction.rows.length > 0) {
      return res.status(409).json({
        error: 'Transacción duplicada',
        message: 'Esta transacción ya existe en el sistema'
      });
    }

    // Insertar nueva acreditación
    const valores = [
      id_transaccion,
      (tipo || '').substring(0, 50), // Campo 'tipo' - VARCHAR(50)
      'Transferencia entrante'.substring(0, 100), // Campo 'concepto' - VARCHAR(100)
      '',
      importe,
      (estado || '').substring(0, 20), // Campo 'estado' - VARCHAR(20)
      '',
      (titular || '').substring(0, 200), // Campo 'titular' - VARCHAR(200)
      (cuit || '').substring(0, 20), // Campo 'cuit' - VARCHAR(20)
      '',
      '',
      fecha_hora,
      '',
      (coelsa_id || '').substring(0, 100), // Campo 'coelsa_id' - VARCHAR(100)
      (titular || '').substring(0, 200), // Campo 'origen_nombre' - VARCHAR(200)
      (cuit || '').substring(0, 20), // Campo 'origen_tax_id' - VARCHAR(20)
      '',
      (tipo || '').substring(0, 10), // Campo 'tipo_notificacion' - VARCHAR(10) ⚠️
      (fuente || '').substring(0, 20), // Campo 'fuente' - VARCHAR(20)
      true,
      id_cliente,
      comision,
      importe_comision
    ];

    // Log de valores para debug
    console.log('🔍 Valores a insertar:');
    console.log('  id_transaccion:', valores[0], 'length:', valores[0]?.toString().length);
    console.log('  tipo:', valores[1], 'length:', valores[1]?.toString().length);
    console.log('  concepto:', valores[2], 'length:', valores[2]?.toString().length);
    console.log('  aplica_a:', valores[3], 'length:', valores[3]?.toString().length);
    console.log('  importe:', valores[4], 'length:', valores[4]?.toString().length);
    console.log('  estado:', valores[5], 'length:', valores[5]?.toString().length);
    console.log('  id_en_red:', valores[6], 'length:', valores[6]?.toString().length);
    console.log('  titular:', valores[7], 'length:', valores[7]?.toString().length);
    console.log('  cuit:', valores[8], 'length:', valores[8]?.toString().length);
    console.log('  origen:', valores[9], 'length:', valores[9]?.toString().length);
    console.log('  nota:', valores[10], 'length:', valores[10]?.toString().length);
    console.log('  fecha_hora:', valores[11], 'length:', valores[11]?.toString().length);
    console.log('  cvu:', valores[12], 'length:', valores[12]?.toString().length);
    console.log('  coelsa_id:', valores[13], 'length:', valores[13]?.toString().length);
    console.log('  origen_nombre:', valores[14], 'length:', valores[14]?.toString().length);
    console.log('  origen_tax_id:', valores[15], 'length:', valores[15]?.toString().length);
    console.log('  origen_cuenta:', valores[16], 'length:', valores[16]?.toString().length);
    console.log('  tipo_notificacion:', valores[17], 'length:', valores[17]?.toString().length);
    console.log('  fuente:', valores[18], 'length:', valores[18]?.toString().length);
    console.log('  procesado:', valores[19], 'length:', valores[19]?.toString().length);
    console.log('  id_cliente:', valores[20], 'length:', valores[20]?.toString().length);
    console.log('  comision:', valores[21], 'length:', valores[21]?.toString().length);
    console.log('  importe_comision:', valores[22], 'length:', valores[22]?.toString().length);

    const result = await client.query(`
      INSERT INTO acreditaciones (
        id_transaccion,
        tipo,
        concepto,
        aplica_a,
        importe,
        estado,
        id_en_red,
        titular,
        cuit,
        origen,
        nota,
        fecha_hora,
        cvu,
        coelsa_id,
        origen_nombre,
        origen_tax_id,
        origen_cuenta,
        tipo_notificacion,
        fuente,
        procesado,
        id_cliente,
        comision,
        importe_comision
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING id
    `, valores);

    console.log('✅ Nueva acreditación creada:', result.rows[0]);

    // Registrar log
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'notificacion_api',
      `Nueva acreditación recibida: ${id_transaccion}`,
      JSON.stringify(req.body),
      'exitoso'
    ]);

    res.status(201).json({
      success: true,
      message: 'Acreditación registrada exitosamente',
      data: {
        id: result.rows[0].id,
        id_transaccion,
        importe,
        fecha_hora
      }
    });

  } catch (error) {
    console.error('❌ Error procesando notificación:', error);
    
    // Registrar error en logs
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado, error)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      'notificacion_api',
      'Error procesando notificación API',
      JSON.stringify(req.body),
      'error',
      error.message
    ]);

    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo procesar la notificación'
    });
  } finally {
    client.release();
  }
});

// GET /api/acreditaciones - Obtener acreditaciones con filtros y ordenamiento
router.get('/acreditaciones', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { 
      page = 1, 
      limit = 50, 
      search,
      cliente,
      ordenar_por = 'fecha_hora',
      orden = 'DESC',
      fecha_desde, 
      fecha_hasta, 
      cuit, 
      estado,
      fuente 
    } = req.query;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    // Filtro de búsqueda general
    if (search) {
      whereConditions.push(`(
        a.id_transaccion ILIKE $${paramIndex} OR 
        a.titular ILIKE $${paramIndex} OR 
        a.cuit ILIKE $${paramIndex} OR
        a.origen ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Filtro por cliente
    if (cliente) {
      whereConditions.push(`a.id_cliente = $${paramIndex}`);
      params.push(parseInt(cliente));
      paramIndex++;
    }

    // Filtros adicionales
    if (fecha_desde) {
      whereConditions.push(`a.fecha_hora >= $${paramIndex}`);
      params.push(fecha_desde);
      paramIndex++;
    }

    if (fecha_hasta) {
      whereConditions.push(`a.fecha_hora <= $${paramIndex}`);
      params.push(fecha_hasta);
      paramIndex++;
    }

    if (cuit) {
      whereConditions.push(`a.cuit = $${paramIndex}`);
      params.push(cuit);
      paramIndex++;
    }

    if (estado) {
      whereConditions.push(`a.estado = $${paramIndex}`);
      params.push(estado);
      paramIndex++;
    }

    if (fuente) {
      whereConditions.push(`a.fuente = $${paramIndex}`);
      params.push(fuente);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    // Validar campo de ordenamiento
    const camposPermitidos = ['id', 'fecha_hora', 'importe', 'titular', 'cuit', 'estado', 'fecha_carga'];
    const ordenPermitido = orden.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const campoOrden = camposPermitidos.includes(ordenar_por) ? ordenar_por : 'fecha_hora';

    // Query para contar total
    const countQuery = `
      SELECT COUNT(*) 
      FROM acreditaciones a 
      LEFT JOIN clientes c ON a.id_cliente = c.id 
      ${whereClause}
    `;
    const countResult = await client.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Query para obtener datos con JOIN a clientes
    const dataQuery = `
      SELECT 
        a.*,
        c.nombre as cliente_nombre,
        c.apellido as cliente_apellido,
        c.cuit as cliente_cuit
      FROM acreditaciones a
      LEFT JOIN clientes c ON a.id_cliente = c.id
      ${whereClause}
      ORDER BY a.${campoOrden} ${ordenPermitido}
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
    console.error('Error obteniendo acreditaciones:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudieron obtener las acreditaciones'
    });
  } finally {
    client.release();
  }
});

// GET /api/clientes - Obtener clientes
router.get('/clientes', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { 
      page = 1, 
      limit = 50, 
      search,
      estado = 'activo'
    } = req.query;

    let whereConditions = ['c.estado = $1'];
    let params = [estado];
    let paramIndex = 2;

    // Filtro de búsqueda
    if (search) {
      whereConditions.push(`(
        c.nombre ILIKE $${paramIndex} OR 
        c.apellido ILIKE $${paramIndex} OR 
        c.cuit ILIKE $${paramIndex} OR
        c.email ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
    const offset = (page - 1) * limit;

    // Query para contar total
    const countQuery = `SELECT COUNT(*) FROM clientes c ${whereClause}`;
    const countResult = await client.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Query para obtener datos
    const dataQuery = `
      SELECT 
        c.*,
        COUNT(DISTINCT a.id) as total_acreditaciones,
        COUNT(DISTINCT comp.id) as total_comprobantes
      FROM clientes c
      LEFT JOIN acreditaciones a ON c.id = a.id_cliente
      LEFT JOIN comprobantes_whatsapp comp ON c.id = comp.id_cliente
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.fecha_registro DESC
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
    console.error('Error obteniendo clientes:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudieron obtener los clientes'
    });
  } finally {
    client.release();
  }
});

// POST /api/clientes - Crear cliente
router.post('/clientes', [
  body('nombre').notEmpty().withMessage('Nombre es requerido'),
  body('comision').optional().isFloat({ min: 0, max: 100 }).withMessage('Comisión debe ser un número entre 0 y 100')
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
    const {
      nombre,
      apellido,
      observaciones,
      comision = 0.00
    } = req.body;

    // Insertar cliente
    const result = await client.query(`
      INSERT INTO clientes (
        nombre,
        apellido,
        observaciones,
        comision
      ) VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [
      nombre,
      apellido,
      observaciones,
      comision
    ]);

    // Registrar log
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'cliente_creado',
      `Cliente creado: ${nombre} ${apellido || ''} (Comisión: ${comision}%)`,
      JSON.stringify(req.body),
      'exitoso'
    ]);

    res.status(201).json({
      success: true,
      message: 'Cliente creado exitosamente',
      data: {
        id: result.rows[0].id,
        nombre,
        apellido,
        comision
      }
    });

  } catch (error) {
    console.error('Error creando cliente:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo crear el cliente'
    });
  } finally {
    client.release();
  }
});

// PUT /api/clientes/:id - Actualizar cliente
router.put('/clientes/:id', [
  body('nombre').notEmpty().withMessage('Nombre es requerido'),
  body('comision').optional().isFloat({ min: 0, max: 100 }).withMessage('Comisión debe ser un número entre 0 y 100')
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
    const { id } = req.params;
    const {
      nombre,
      apellido,
      observaciones,
      estado,
      comision
    } = req.body;

    // Verificar si el cliente existe
    const existingClient = await client.query(
      'SELECT id FROM clientes WHERE id = $1',
      [id]
    );

    if (existingClient.rows.length === 0) {
      return res.status(404).json({
        error: 'Cliente no encontrado',
        message: 'El cliente especificado no existe'
      });
    }

    // Actualizar cliente
    await client.query(`
      UPDATE clientes SET
        nombre = $1,
        apellido = $2,
        observaciones = $3,
        estado = $4,
        comision = COALESCE($5, comision)
      WHERE id = $6
    `, [
      nombre,
      apellido,
      observaciones,
      estado || 'activo',
      comision,
      id
    ]);

    // Registrar log
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'cliente_actualizado',
      `Cliente actualizado: ${nombre} ${apellido || ''} (Comisión: ${comision !== undefined ? comision : 'sin cambio'}%)`,
      JSON.stringify(req.body),
      'exitoso'
    ]);

    res.json({
      success: true,
      message: 'Cliente actualizado exitosamente'
    });

  } catch (error) {
    console.error('Error actualizando cliente:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo actualizar el cliente'
    });
  } finally {
    client.release();
  }
});

// DELETE /api/clientes/:id - Eliminar cliente (soft delete)
router.delete('/clientes/:id', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { id } = req.params;

    // Verificar si el cliente existe
    const existingClient = await client.query(
      'SELECT nombre, apellido FROM clientes WHERE id = $1',
      [id]
    );

    if (existingClient.rows.length === 0) {
      return res.status(404).json({
        error: 'Cliente no encontrado',
        message: 'El cliente especificado no existe'
      });
    }

    // Soft delete - cambiar estado a inactivo
    await client.query(`
      UPDATE clientes SET estado = 'inactivo' WHERE id = $1
    `, [id]);

    const cliente = existingClient.rows[0];

    // Registrar log
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'cliente_eliminado',
      `Cliente eliminado: ${cliente.nombre} ${cliente.apellido || ''}`,
      JSON.stringify({ id }),
      'exitoso'
    ]);

    res.json({
      success: true,
      message: 'Cliente eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando cliente:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo eliminar el cliente'
    });
  } finally {
    client.release();
  }
});

// GET /api/clientes/:id/comprobantes - Obtener comprobantes de un cliente
router.get('/clientes/:id/comprobantes', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { id } = req.params;
    const { 
      page = 1, 
      limit = 50 
    } = req.query;

    // Verificar si el cliente existe
    const existingClient = await client.query(
      'SELECT nombre, apellido FROM clientes WHERE id = $1',
      [id]
    );

    if (existingClient.rows.length === 0) {
      return res.status(404).json({
        error: 'Cliente no encontrado',
        message: 'El cliente especificado no existe'
      });
    }

    const offset = (page - 1) * limit;

    // Query para contar total
    const countQuery = `
      SELECT COUNT(*) 
      FROM comprobantes_whatsapp 
      WHERE id_cliente = $1
    `;
    const countResult = await client.query(countQuery, [id]);
    const total = parseInt(countResult.rows[0].count);

    // Query para obtener datos
    const dataQuery = `
      SELECT 
        c.*,
        a.id as id_acreditacion,
        a.importe as acreditacion_importe,
        a.fecha_hora as acreditacion_fecha
      FROM comprobantes_whatsapp c
      LEFT JOIN acreditaciones a ON c.id_acreditacion::integer = a.id
      WHERE c.id_cliente = $1
      ORDER BY c.fecha_recepcion DESC
      LIMIT $2 OFFSET $3
    `;
    
    const dataResult = await client.query(dataQuery, [id, parseInt(limit), offset]);

    res.json({
      success: true,
      data: dataResult.rows,
      cliente: existingClient.rows[0],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error obteniendo comprobantes del cliente:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudieron obtener los comprobantes del cliente'
    });
  } finally {
    client.release();
  }
});

// PUT /api/comprobantes/:id/asignar - Asignar comprobante a acreditación
router.put('/comprobantes/:id/asignar', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { id } = req.params;
    const { id_acreditacion } = req.body;

    console.log('🚀 Iniciando asignación de comprobante:', { comprobante_id: id, id_acreditacion: id_acreditacion });

    if (!id_acreditacion) {
      return res.status(400).json({
        error: 'ID de acreditación requerido',
        message: 'Debe especificar el ID de la acreditación'
      });
    }

    // Verificar que el comprobante existe
    const comprobante = await client.query(
      'SELECT id_comprobante, id_acreditacion FROM comprobantes_whatsapp WHERE id = $1',
      [id]
    );

    if (comprobante.rows.length === 0) {
      console.log('❌ Comprobante no encontrado:', id);
      return res.status(404).json({
        error: 'Comprobante no encontrado',
        message: 'El comprobante especificado no existe'
      });
    }

    console.log('📋 Estado ANTES de asignación - Comprobante:', {
      id: comprobante.rows[0].id,
      nombre: comprobante.rows[0].nombre_remitente,
      importe: comprobante.rows[0].importe,
      cotejado: comprobante.rows[0].cotejado,
      id_acreditacion: comprobante.rows[0].id_acreditacion,
      id_acreditacion: comprobante.rows[0].id_acreditacion,
      fecha_cotejo: comprobante.rows[0].fecha_cotejo
    });

    // Verificar que la acreditación existe
    const acreditacion = await client.query(
      'SELECT * FROM acreditaciones WHERE id = $1',
      [id_acreditacion]
    );

    if (acreditacion.rows.length === 0) {
      console.log('❌ Acreditación no encontrada:', id_acreditacion);
      return res.status(404).json({
        error: 'Acreditación no encontrada',
        message: 'La acreditación especificada no existe'
      });
    }

    console.log('💰 Estado ANTES de asignación - Acreditación:', {
      id: acreditacion.rows[0].id,
      titular: acreditacion.rows[0].titular,
      importe: acreditacion.rows[0].importe,
      cotejado: acreditacion.rows[0].cotejado,
      id_comprobante_whatsapp: acreditacion.rows[0].id_comprobante_whatsapp,
      fecha_cotejo: acreditacion.rows[0].fecha_cotejo
    });

    // Verificar que la acreditación no esté ya asignada
    const acreditacionAsignada = await client.query(
      'SELECT id FROM comprobantes_whatsapp WHERE id_acreditacion = $1 AND id != $2',
      [id_acreditacion, id]
    );

    if (acreditacionAsignada.rows.length > 0) {
      console.log('❌ Acreditación ya asignada a otro comprobante:', id_acreditacion);
      return res.status(409).json({
        error: 'Acreditación ya asignada',
        message: 'Esta acreditación ya está asignada a otro comprobante'
      });
    }

    console.log('✅ Iniciando actualización de base de datos...');

    // Actualizar el comprobante
    await client.query(`
      UPDATE comprobantes_whatsapp 
      SET id_acreditacion = $1, cotejado = true, fecha_cotejo = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [id_acreditacion, id]);

    console.log('✅ Comprobante actualizado');

    // Actualizar la acreditación
    await client.query(`
      UPDATE acreditaciones 
      SET id_comprobante_whatsapp = $1, cotejado = true, fecha_cotejo = CURRENT_TIMESTAMP, id_cliente = $2
      WHERE id = $3
    `, [comprobante.rows[0].id_comprobante, comprobante.rows[0].id_cliente, id_acreditacion]);

    console.log('✅ Acreditación actualizada');

    // Verificar estado DESPUÉS de la asignación
    const comprobanteDespues = await client.query(
      'SELECT * FROM comprobantes_whatsapp WHERE id = $1',
      [id]
    );

    console.log('📋 Estado DESPUÉS de asignación - Comprobante:', {
      id: comprobanteDespues.rows[0].id,
      nombre: comprobanteDespues.rows[0].nombre_remitente,
      importe: comprobanteDespues.rows[0].importe,
      cotejado: comprobanteDespues.rows[0].cotejado,
      id_acreditacion: comprobanteDespues.rows[0].id_acreditacion,
      fecha_cotejo: comprobanteDespues.rows[0].fecha_cotejo
    });

    const acreditacionDespues = await client.query(
      'SELECT * FROM acreditaciones WHERE id = $1',
      [id_acreditacion]
    );

    console.log('💰 Estado DESPUÉS de asignación - Acreditación:', {
      id: acreditacionDespues.rows[0].id,
      titular: acreditacionDespues.rows[0].titular,
      importe: acreditacionDespues.rows[0].importe,
      cotejado: acreditacionDespues.rows[0].cotejado,
      id_comprobante_whatsapp: acreditacionDespues.rows[0].id_comprobante_whatsapp,
      fecha_cotejo: acreditacionDespues.rows[0].fecha_cotejo
    });

    // Registrar log
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'comprobante_asignado',
      `Comprobante ${comprobante.rows[0].id_comprobante} asignado a acreditación ${id_acreditacion}`,
      JSON.stringify({ comprobante_id: id, id_acreditacion: id_acreditacion }),
      'exitoso'
    ]);

    console.log('✅ Log registrado');

    res.json({
      success: true,
      message: 'Comprobante asignado exitosamente'
    });

  } catch (error) {
    console.error('💥 Error asignando comprobante:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo asignar el comprobante'
    });
  } finally {
    client.release();
  }
});

// PUT /api/comprobantes/:id/desasignar - Desasignar comprobante
router.put('/comprobantes/:id/desasignar', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { id } = req.params;

    // Verificar que el comprobante existe y está asignado
    const comprobante = await client.query(
      'SELECT id_comprobante, id_acreditacion FROM comprobantes_whatsapp WHERE id = $1',
      [id]
    );

    if (comprobante.rows.length === 0) {
      return res.status(404).json({
        error: 'Comprobante no encontrado',
        message: 'El comprobante especificado no existe'
      });
    }

    if (!comprobante.rows[0].id_acreditacion) {
      return res.status(400).json({
        error: 'Comprobante no asignado',
        message: 'Este comprobante no está asignado a ninguna acreditación'
      });
    }

    const id_acreditacion = comprobante.rows[0].id_acreditacion;

    // Desasignar el comprobante
    await client.query(`
      UPDATE comprobantes_whatsapp 
      SET id_acreditacion = NULL, cotejado = false, fecha_cotejo = NULL
      WHERE id = $1
    `, [id]);

    // Desasignar la acreditación
    await client.query(`
      UPDATE acreditaciones 
      SET id_comprobante_whatsapp = NULL, cotejado = false, fecha_cotejo = NULL, id_cliente = NULL
      WHERE id = $1
    `, [id_acreditacion]);

    // Registrar log
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'comprobante_desasignado',
      `Comprobante ${comprobante.rows[0].id_comprobante} desasignado de acreditación ${id_acreditacion}`,
      JSON.stringify({ comprobante_id: id, id_acreditacion: id_acreditacion }),
      'exitoso'
    ]);

    res.json({
      success: true,
      message: 'Comprobante desasignado exitosamente'
    });

  } catch (error) {
    console.error('Error desasignando comprobante:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo desasignar el comprobante'
    });
  } finally {
    client.release();
  }
});

// GET /api/comprobantes/sin-acreditacion - Obtener comprobantes disponibles para asignación
router.get('/comprobantes/sin-acreditacion', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { 
      page = 1, 
      limit = 50,
      search,
      importe_min,
      importe_max,
      fecha_desde,
      fecha_hasta,
      cliente_id
    } = req.query;

    console.log('Parámetros recibidos:', { page, limit, search, importe_min, importe_max, fecha_desde, fecha_hasta, cliente_id });

    // Verificar que la tabla existe
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'comprobantes_whatsapp'
      );
    `);

    if (!tableExists.rows[0].exists) {
      console.error('❌ Tabla comprobantes_whatsapp no existe');
      return res.status(500).json({
        error: 'Error de configuración',
        message: 'La tabla comprobantes_whatsapp no existe en la base de datos'
      });
    }

    let whereConditions = ['c.id_acreditacion IS NULL'];
    let params = [];
    let paramIndex = 1;

    // Filtro de búsqueda
    if (search) {
      whereConditions.push(`(
        c.nombre_remitente ILIKE $${paramIndex} OR 
        c.cuit ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Filtro por cliente
    if (cliente_id) {
      whereConditions.push(`c.id_cliente = $${paramIndex}`);
      params.push(parseInt(cliente_id));
      paramIndex++;
    }

    // Filtro por importe
    if (importe_min) {
      whereConditions.push(`c.importe >= $${paramIndex}`);
      params.push(parseFloat(importe_min));
      paramIndex++;
    }

    if (importe_max) {
      whereConditions.push(`c.importe <= $${paramIndex}`);
      params.push(parseFloat(importe_max));
      paramIndex++;
    }

    // Filtro por fecha
    if (fecha_desde) {
      whereConditions.push(`c.fecha_envio >= $${paramIndex}`);
      params.push(fecha_desde);
      paramIndex++;
    }

    if (fecha_hasta) {
      whereConditions.push(`c.fecha_envio <= $${paramIndex}`);
      params.push(fecha_hasta);
      paramIndex++;
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
    const offset = (page - 1) * limit;

    console.log('🔍 Ejecutando query de conteo...');
    // Query para contar total
    const countQuery = `SELECT COUNT(*) FROM comprobantes_whatsapp c ${whereClause}`;
    console.log('📊 Count query:', countQuery);
    console.log('📊 Params:', params);
    
    const countResult = await client.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    console.log('🔍 Ejecutando query de datos...');
    // Query para obtener datos
    const dataQuery = `
      SELECT 
        c.*,
        cli.nombre as cliente_nombre,
        cli.apellido as cliente_apellido
      FROM comprobantes_whatsapp c
      LEFT JOIN clientes cli ON c.id_cliente = cli.id
      ${whereClause}
      ORDER BY c.fecha_envio DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    const finalParams = [...params, parseInt(limit), offset];
    console.log('📊 Data query:', dataQuery);
    console.log('📊 Final params:', finalParams);
    
    const dataResult = await client.query(dataQuery, finalParams);

    console.log(`✅ Query exitoso. Total: ${total}, Resultados: ${dataResult.rows.length}`);

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
    console.error('💥 Error obteniendo comprobantes sin acreditación:', error);
    console.error('💥 Stack trace:', error.stack);
    
    // Registrar error en logs si es posible
    try {
      await client.query(`
        INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado, error)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        'error_comprobantes_sin_acreditacion',
        'Error obteniendo comprobantes sin acreditación',
        JSON.stringify(req.query),
        'error',
        error.message
      ]);
    } catch (logError) {
      console.error('💥 Error registrando log:', logError);
    }

    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudieron obtener los comprobantes',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
});

// POST /api/comprobantes - Crear nuevo comprobante de WhatsApp
router.post('/comprobantes', [
  body('id_comprobante').notEmpty().withMessage('ID del comprobante es requerido'),
  body('importe').isNumeric().withMessage('Importe debe ser numérico'),
  body('fecha_envio').isISO8601().withMessage('Fecha de envío debe ser válida')
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
    const {
      id_comprobante,
      nombre_remitente,
      importe,
      fecha_envio,
      id_cliente
    } = req.body;

    // Verificar si el comprobante ya existe
    const existingComprobante = await client.query(
      'SELECT id FROM comprobantes_whatsapp WHERE id_comprobante = $1',
      [id_comprobante]
    );

    if (existingComprobante.rows.length > 0) {
      return res.status(409).json({
        error: 'Comprobante duplicado',
        message: 'Este comprobante ya existe en el sistema'
      });
    }

    // Insertar nuevo comprobante
    const result = await client.query(`
      INSERT INTO comprobantes_whatsapp (
        id_comprobante,
        nombre_remitente,
        importe,
        fecha_envio,
        id_cliente
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id, id_comprobante
    `, [
      id_comprobante,
      nombre_remitente || null,
      importe,
      fecha_envio,
      id_cliente || null
    ]);

    // Registrar log
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'comprobante_creado',
      `Nuevo comprobante creado: ${id_comprobante}`,
      JSON.stringify(req.body),
      'exitoso'
    ]);

    res.status(201).json({
      success: true,
      message: 'Comprobante creado exitosamente',
      data: {
        id: result.rows[0].id,
        id_comprobante: result.rows[0].id_comprobante
      }
    });

  } catch (error) {
    console.error('Error creando comprobante:', error);
    
    // Registrar error en logs
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado, error)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      'comprobante_creado',
      `Error creando comprobante: ${req.body.id_comprobante}`,
      JSON.stringify(req.body),
      'error',
      error.message
    ]);

    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo crear el comprobante'
    });
  } finally {
    client.release();
  }
});

// DELETE /api/comprobantes/:id - Eliminar comprobante
router.delete('/comprobantes/:id', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { id } = req.params;

    // Verificar que el comprobante existe
    const comprobante = await client.query(
      'SELECT id_comprobante, id_acreditacion FROM comprobantes_whatsapp WHERE id = $1',
      [id]
    );

    if (comprobante.rows.length === 0) {
      return res.status(404).json({
        error: 'Comprobante no encontrado',
        message: 'El comprobante especificado no existe'
      });
    }

    // Verificar si está asignado a una acreditación
    if (comprobante.rows[0].id_acreditacion) {
      return res.status(400).json({
        error: 'Comprobante asignado',
        message: 'No se puede eliminar un comprobante que está asignado a una acreditación'
      });
    }

    // Eliminar el comprobante
    await client.query(
      'DELETE FROM comprobantes_whatsapp WHERE id = $1',
      [id]
    );

    // Registrar log
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'comprobante_eliminado',
      `Comprobante ${comprobante.rows[0].id_comprobante} eliminado`,
      JSON.stringify({ comprobante_id: id }),
      'exitoso'
    ]);

    res.json({
      success: true,
      message: 'Comprobante eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando comprobante:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo eliminar el comprobante'
    });
  } finally {
    client.release();
  }
});

// GET /api/clientes/:id/resumen - Obtener resumen completo del cliente
router.get('/clientes/:id/resumen', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { id } = req.params;

    // Verificar si el cliente existe
    const cliente = await client.query(
      'SELECT * FROM clientes WHERE id = $1',
      [id]
    );

    if (cliente.rows.length === 0) {
      return res.status(404).json({
        error: 'Cliente no encontrado',
        message: 'El cliente especificado no existe'
      });
    }

    // Obtener estadísticas de comprobantes
    const comprobantesStats = await client.query(`
      SELECT 
        COUNT(*) as total_comprobantes,
        SUM(importe) as total_importe_comprobantes,
        COUNT(CASE WHEN cotejado = true THEN 1 END) as comprobantes_cotejados,
        COUNT(CASE WHEN cotejado = false THEN 1 END) as comprobantes_pendientes,
        COUNT(CASE WHEN id_acreditacion IS NOT NULL THEN 1 END) as comprobantes_asignados,
        COUNT(CASE WHEN id_acreditacion IS NULL THEN 1 END) as comprobantes_sin_asignar,
        SUM(CASE WHEN cotejado = true THEN importe ELSE 0 END) as total_importe_cotejados
      FROM comprobantes_whatsapp 
      WHERE id_cliente = $1
    `, [id]);

    // Obtener estadísticas de acreditaciones (considerando comisiones)
    const acreditacionesStats = await client.query(`
      SELECT 
        COUNT(*) as total_acreditaciones,
        SUM(importe) as total_importe_acreditaciones,
        COUNT(CASE WHEN cotejado = true THEN 1 END) as acreditaciones_cotejadas,
        COUNT(CASE WHEN cotejado = false THEN 1 END) as acreditaciones_pendientes,
        SUM(CASE WHEN cotejado = true THEN importe ELSE 0 END) as total_importe_cotejadas,
        SUM(CASE WHEN cotejado = false THEN importe ELSE 0 END) as total_importe_pendientes,
        SUM(importe_comision) as total_comisiones,
        SUM(CASE WHEN cotejado = true THEN importe_comision ELSE 0 END) as total_comisiones_cotejadas,
        SUM(CASE WHEN cotejado = false THEN importe_comision ELSE 0 END) as total_comisiones_pendientes
      FROM acreditaciones 
      WHERE id_cliente = $1
    `, [id]);

    // Obtener estadísticas de pagos
    const pagosStats = await client.query(`
      SELECT 
        COUNT(*) as total_pagos,
        SUM(CASE WHEN tipo_pago = 'egreso' THEN importe ELSE 0 END) as total_importe_pagos,
        SUM(CASE WHEN tipo_pago = 'credito' THEN importe ELSE 0 END) as total_importe_creditos
      FROM pagos 
      WHERE id_cliente = $1 AND estado = 'confirmado'
    `, [id]);

    // Calcular saldo real (acreditaciones cotejadas - comisiones + créditos - pagos)
    const totalAcreditacionesCotejadas = parseFloat(acreditacionesStats.rows[0].total_importe_cotejadas || 0);
    const totalComisionesCotejadas = parseFloat(acreditacionesStats.rows[0].total_comisiones_cotejadas || 0);
    const totalPagos = parseFloat(pagosStats.rows[0].total_importe_pagos || 0);
    const totalCreditos = parseFloat(pagosStats.rows[0].total_importe_creditos || 0);
    
    const saldo = totalAcreditacionesCotejadas - totalComisionesCotejadas + totalCreditos - totalPagos;

    res.json({
      success: true,
      data: {
        cliente: cliente.rows[0],
        resumen: {
          comprobantes: comprobantesStats.rows[0],
          acreditaciones: acreditacionesStats.rows[0],
          pagos: pagosStats.rows[0],
          saldo: saldo
        }
      }
    });

  } catch (error) {
    console.error('Error obteniendo resumen del cliente:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener el resumen del cliente'
    });
  } finally {
    client.release();
  }
});

// GET /api/clientes/:id/pagos - Obtener pagos de un cliente
router.get('/clientes/:id/pagos', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { id } = req.params;
    const { 
      page = 1, 
      limit = 50 
    } = req.query;

    // Verificar si el cliente existe
    const existingClient = await client.query(
      'SELECT nombre, apellido FROM clientes WHERE id = $1',
      [id]
    );

    if (existingClient.rows.length === 0) {
      return res.status(404).json({
        error: 'Cliente no encontrado',
        message: 'El cliente especificado no existe'
      });
    }

    const offset = (page - 1) * limit;

    // Query para contar total
    const countQuery = `
      SELECT COUNT(*) 
      FROM pagos 
      WHERE id_cliente = $1
    `;
    const countResult = await client.query(countQuery, [id]);
    const total = parseInt(countResult.rows[0].count);

    // Query para obtener datos
    const dataQuery = `
      SELECT * FROM pagos
      WHERE id_cliente = $1
      ORDER BY fecha_pago DESC
      LIMIT $2 OFFSET $3
    `;
    
    const dataResult = await client.query(dataQuery, [id, parseInt(limit), offset]);

    res.json({
      success: true,
      data: dataResult.rows,
      cliente: existingClient.rows[0],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error obteniendo pagos del cliente:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudieron obtener los pagos del cliente'
    });
  } finally {
    client.release();
  }
});

// POST /api/pagos - Crear nuevo pago
router.post('/pagos', [
  body('id_cliente').isInt().withMessage('ID del cliente es requerido'),
  body('concepto').notEmpty().withMessage('Concepto es requerido'),
  body('importe').isNumeric().withMessage('Importe debe ser numérico')
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
    const {
      id_cliente,
      concepto,
      importe,
      fecha_pago,
      tipo_pago = 'egreso',
      metodo_pago,
      referencia,
      observaciones
    } = req.body;

    // Verificar que el cliente existe
    const existingClient = await client.query(
      'SELECT nombre, apellido FROM clientes WHERE id = $1',
      [id_cliente]
    );

    if (existingClient.rows.length === 0) {
      return res.status(404).json({
        error: 'Cliente no encontrado',
        message: 'El cliente especificado no existe'
      });
    }

    // Insertar nuevo pago
    const result = await client.query(`
      INSERT INTO pagos (
        id_cliente,
        concepto,
        importe,
        fecha_pago,
        tipo_pago,
        metodo_pago,
        referencia,
        observaciones
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, concepto, importe
    `, [
      id_cliente,
      concepto,
      importe,
      fecha_pago || new Date().toISOString(),
      tipo_pago,
      metodo_pago || null,
      referencia || null,
      observaciones || null
    ]);

    // Registrar log
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'pago_creado',
      `Pago creado: ${concepto} - $${importe} para ${existingClient.rows[0].nombre} ${existingClient.rows[0].apellido}`,
      JSON.stringify(req.body),
      'exitoso'
    ]);

    res.status(201).json({
      success: true,
      message: 'Pago registrado exitosamente',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error creando pago:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo crear el pago'
    });
  } finally {
    client.release();
  }
});

// DELETE /api/pagos/:id - Eliminar pago
router.delete('/pagos/:id', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { id } = req.params;

    // Verificar que el pago existe
    const pago = await client.query(
      'SELECT p.*, c.nombre, c.apellido FROM pagos p JOIN clientes c ON p.id_cliente = c.id WHERE p.id = $1',
      [id]
    );

    if (pago.rows.length === 0) {
      return res.status(404).json({
        error: 'Pago no encontrado',
        message: 'El pago especificado no existe'
      });
    }

    // Eliminar el pago
    await client.query(
      'DELETE FROM pagos WHERE id = $1',
      [id]
    );

    // Registrar log
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'pago_eliminado',
      `Pago eliminado: ${pago.rows[0].concepto} - $${pago.rows[0].importe} de ${pago.rows[0].nombre} ${pago.rows[0].apellido}`,
      JSON.stringify({ pago_id: id }),
      'exitoso'
    ]);

    res.json({
      success: true,
      message: 'Pago eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando pago:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo eliminar el pago'
    });
  } finally {
    client.release();
  }
});

// DELETE /api/comprobantes/limpiar-todos - Borrar todos los comprobantes de WhatsApp
router.delete('/comprobantes/limpiar-todos', async (req, res) => {
  const client = await db.getClient();
  
  try {
    console.log('🧹 Iniciando limpieza de todos los comprobantes de WhatsApp...');

    // Obtener conteo antes de borrar
    const countBefore = await client.query('SELECT COUNT(*) FROM comprobantes_whatsapp');
    const totalBefore = parseInt(countBefore.rows[0].count);

    console.log(`📊 Total de comprobantes antes de limpiar: ${totalBefore}`);

    // Borrar todos los comprobantes de WhatsApp
    const result = await client.query('DELETE FROM comprobantes_whatsapp');
    const deletedCount = result.rowCount;

    console.log(`✅ Comprobantes eliminados: ${deletedCount}`);

    // Registrar log
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'limpieza_comprobantes',
      `Limpieza masiva: ${deletedCount} comprobantes eliminados`,
      JSON.stringify({ total_eliminados: deletedCount }),
      'exitoso'
    ]);

    res.json({
      success: true,
      message: `Limpieza completada exitosamente`,
      data: {
        total_eliminados: deletedCount,
        total_antes: totalBefore
      }
    });

  } catch (error) {
    console.error('💥 Error en limpieza de comprobantes:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo completar la limpieza'
    });
  } finally {
    client.release();
  }
});

// Función para limpiar CUIT (quitar guiones y dejar solo números)
function cleanCUIT(cuit) {
  if (!cuit) return null;
  return cuit.replace(/[^0-9]/g, '');
}

// POST /api/comprobantes/whatsapp - Endpoint para recibir comprobantes de WhatsApp
router.post('/comprobantes/whatsapp', [
  body('nombre_remitente').optional(), // Hacer el nombre opcional también
  body('cuit').optional(), // Hacer el CUIT opcional
  body('fecha').notEmpty().withMessage('Fecha es requerida'),
  body('hora').optional(),
  body('monto').isNumeric().withMessage('Monto debe ser numérico'),
  body('cliente').notEmpty().withMessage('Cliente es requerido')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('❌ Errores de validación:', errors.array());
    return res.status(400).json({ 
      error: 'Datos inválidos', 
      details: errors.array() 
    });
  }

  const client = await db.getClient();
  
  try {
    const {
      nombre_remitente,
      cuit,
      fecha,
      hora,
      monto,
      cliente
    } = req.body;

    // Limpiar nombre del remitente (si está vacío o es inválido, usar null)
    let nombre_limpio = null;
    if (nombre_remitente && nombre_remitente !== 'null' && nombre_remitente !== 'undefined' && nombre_remitente.trim() !== '') {
      nombre_limpio = nombre_remitente.trim();
    }

    // Limpiar CUIT (quitar guiones y dejar solo números)
    // Si el CUIT es "No especificado" o similar, usar null
    let cuit_limpio = null;
    if (cuit && cuit !== 'No especificado' && cuit !== 'null' && cuit !== 'undefined' && cuit.trim() !== '') {
      cuit_limpio = cleanCUIT(cuit);
      // Si después de limpiar está vacío, usar null
      if (!cuit_limpio || cuit_limpio === '') {
        cuit_limpio = null;
      }
    }

    // Verificar que al menos uno de los dos (nombre o CUIT) esté presente
    if (!nombre_limpio && !cuit_limpio) {
      return res.status(400).json({
        error: 'Datos insuficientes',
        message: 'Se requiere al menos el nombre del remitente o el CUIT'
      });
    }

    // LOGGING DETALLADO DE LO QUE SE RECIBE
    console.log('='.repeat(80));
    console.log('📱 POST RECIBIDO EN /api/comprobantes/whatsapp');
    console.log('='.repeat(80));
    console.log('📋 DATOS RECIBIDOS:');
    console.log('   nombre_remitente original:', nombre_remitente);
    console.log('   nombre_remitente limpio:', nombre_limpio);
    console.log('   cuit original:', cuit);
    console.log('   cuit limpio:', cuit_limpio);
    console.log('   fecha:', fecha);
    console.log('   hora:', hora);
    console.log('   monto:', monto, '(tipo:', typeof monto, ')');
    console.log('   cliente:', cliente);
    console.log('📋 DATOS PROCESADOS:', JSON.stringify({
      nombre_remitente: nombre_limpio,
      cuit: cuit_limpio,
      fecha,
      hora,
      monto,
      cliente
    }, null, 2));
    console.log('='.repeat(80));

    console.log('📱 Recibiendo comprobante de WhatsApp:', {
      nombre_remitente: nombre_limpio,
      cuit: cuit_limpio,
      fecha,
      hora,
      monto,
      cliente
    });

    // Generar ID único para el comprobante
    const id_comprobante = `WH_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Buscar o crear cliente (usando el campo 'cliente', no nombre_remitente)
    let cliente_id;
    let cliente_creado = false;

    const clienteResult = await client.query(
      'SELECT id, nombre, apellido FROM clientes WHERE nombre = $1',
      [cliente] // Usar el campo 'cliente', no 'nombre_remitente'
    );

    if (clienteResult.rows.length === 0) {
      console.log('👤 Cliente no encontrado, creando nuevo cliente...');
      
      // Crear nuevo cliente
      const nuevoCliente = await client.query(`
        INSERT INTO clientes (nombre, apellido, observaciones, estado)
        VALUES ($1, $2, $3, $4)
        RETURNING id, nombre, apellido
      `, [
        cliente, // Usar el campo 'cliente'
        null, // apellido
        `Cliente creado automáticamente desde WhatsApp`,
        'activo'
      ]);

      cliente_id = nuevoCliente.rows[0].id;
      cliente_creado = true;
      
      console.log('✅ Cliente creado:', nuevoCliente.rows[0]);
    } else {
      cliente_id = clienteResult.rows[0].id;
      console.log('✅ Cliente encontrado:', clienteResult.rows[0]);
    }

    // Buscar acreditación que coincida
    let fecha_envio_obj;
    
    try {
      console.log('🔧 Iniciando parsing de fecha...');
      console.log('   fecha recibida:', fecha);
      console.log('   hora recibida:', hora);
      
      // Estrategia 1: Si la fecha ya viene en formato ISO completo con hora, usarla directamente
      if (fecha.includes('T') && fecha.includes('Z')) {
        console.log('📅 Fecha en formato ISO completo detectada');
        fecha_envio_obj = new Date(fecha);
      } 
      // Estrategia 2: Si la fecha incluye hora pero no es ISO (ej: "2025-06-26 23:41")
      else if (fecha.includes(' ') && fecha.includes(':')) {
        console.log('📅 Fecha con hora en formato local detectada');
        fecha_envio_obj = new Date(fecha);
      }
      // Estrategia 3: Si la fecha incluye hora con T (ej: "2025-06-26T23:41")
      else if (fecha.includes('T') && fecha.includes(':')) {
        console.log('📅 Fecha con hora en formato ISO sin Z detectada');
        fecha_envio_obj = new Date(fecha);
      }
      // Estrategia 4: Formato DD/MM/YYYY
      else if (fecha.includes('/')) {
        console.log('📅 Fecha en formato DD/MM/YYYY detectada');
        const [day, month, year] = fecha.split('/');
        fecha_envio_obj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      } 
      // Estrategia 5: Formato YYYY-MM-DD (solo fecha)
      else if (fecha.includes('-') && !fecha.includes(':')) {
        console.log('📅 Fecha en formato YYYY-MM-DD detectada');
        fecha_envio_obj = new Date(fecha);
      } 
      // Estrategia 6: Otros formatos
      else {
        console.log('📅 Otro formato de fecha detectado');
        fecha_envio_obj = new Date(fecha);
      }
      
      // Si hay hora separada, aplicarla solo si la fecha no tiene hora específica
      if (hora && hora !== 'null' && hora !== '0' && hora !== 0) {
        try {
          console.log('🕐 Aplicando hora separada:', hora);
          const [hours, minutes, seconds] = hora.split(':');
          
          // Verificar si la fecha actual tiene hora específica (no es medianoche)
          const currentHours = fecha_envio_obj.getHours();
          const currentMinutes = fecha_envio_obj.getMinutes();
          const currentSeconds = fecha_envio_obj.getSeconds();
          
          if (currentHours === 0 && currentMinutes === 0 && currentSeconds === 0) {
            fecha_envio_obj.setHours(parseInt(hours) || 0, parseInt(minutes) || 0, parseInt(seconds) || 0);
            console.log('✅ Hora separada aplicada correctamente');
          } else {
            console.log('⚠️ Fecha ya tiene hora específica, no se aplica hora separada');
            console.log(`   Hora actual en fecha: ${currentHours}:${currentMinutes}:${currentSeconds}`);
          }
        } catch (error) {
          console.log('⚠️ No se pudo parsear la hora separada:', error.message);
        }
      }
      
      // Verificar que la fecha sea válida
      if (isNaN(fecha_envio_obj.getTime())) {
        throw new Error('Fecha inválida después del parsing');
      }
      
      console.log('📅 Fecha final parseada:', fecha_envio_obj.toISOString());
      console.log('📅 Fecha local:', fecha_envio_obj.toLocaleString('es-AR'));
      
    } catch (error) {
      console.error('❌ Error parseando fecha:', fecha, error);
      return res.status(400).json({
        error: 'Formato de fecha inválido',
        message: `La fecha '${fecha}' no es válida. Formatos soportados: DD/MM/YYYY, YYYY-MM-DD, ISO 8601, o fecha+hora separadas`,
        details: error.message
      });
    }

    // Verificar si ya existe un comprobante similar (duplicado) - DESPUÉS DEL PARSING
    const comprobanteDuplicado = await client.query(`
      SELECT id, id_comprobante, nombre_remitente, importe, fecha_envio, id_cliente
      FROM comprobantes_whatsapp 
      WHERE nombre_remitente = $1 
        AND cuit = $2 
        AND importe = $3 
        AND fecha_envio BETWEEN $4 AND $5
        AND id_cliente = $6
    `, [
      nombre_limpio,
      cuit_limpio,
      parseFloat(monto),
      new Date(fecha_envio_obj.getTime() - 5 * 60 * 1000), // 5 minutos antes
      new Date(fecha_envio_obj.getTime() + 5 * 60 * 1000), // 5 minutos después
      cliente_id
    ]);

    if (comprobanteDuplicado.rows.length > 0) {
      console.log('⚠️ Comprobante duplicado detectado:', comprobanteDuplicado.rows[0]);
      
      // Registrar log del intento de duplicado
      await client.query(`
        INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
        VALUES ($1, $2, $3, $4)
      `, [
        'comprobante_duplicado',
        `Intento de crear comprobante duplicado: ${nombre_limpio || 'Sin nombre'} - $${monto}`,
        JSON.stringify({
          nombre_remitente: nombre_limpio,
          cuit: cuit_limpio,
          monto,
          fecha: fecha_envio_obj,
          cliente_id,
          comprobante_existente: comprobanteDuplicado.rows[0].id_comprobante
        }),
        'advertencia'
      ]);

      return res.status(409).json({
        error: 'Comprobante duplicado',
        message: 'Este comprobante ya fue procesado anteriormente',
        data: {
          comprobante_existente: comprobanteDuplicado.rows[0].id_comprobante,
          fecha_procesamiento: comprobanteDuplicado.rows[0].fecha_envio
        }
      });
    }

    const fecha_desde = new Date(fecha_envio_obj.getTime() - 24 * 60 * 60 * 1000); // 1 día antes
    const fecha_hasta = new Date(fecha_envio_obj.getTime() + 24 * 60 * 60 * 1000); // 1 día después

    console.log('🔍 Buscando acreditación coincidente con matching inteligente...');

    // Buscar acreditaciones por importe y fecha primero
    const acreditacionesCandidatas = await client.query(`
      SELECT id, titular, cuit, importe, fecha_hora, cotejado
      FROM acreditaciones 
      WHERE importe = $1 
        AND fecha_hora BETWEEN $2 AND $3
        AND cotejado = false
        AND id_comprobante_whatsapp IS NULL
      ORDER BY ABS(EXTRACT(EPOCH FROM (fecha_hora - $4))) ASC
      LIMIT 10
    `, [
      parseFloat(monto),
      fecha_desde,
      fecha_hasta,
      fecha_envio_obj
    ]);

    console.log(`📊 Acreditaciones candidatas encontradas: ${acreditacionesCandidatas.rows.length}`);
    if (acreditacionesCandidatas.rows.length === 0) {
      console.log('❌ No hay acreditaciones candidatas que coincidan con importe y fecha');
      console.log(`   Importe buscado: $${monto}`);
      console.log(`   Fecha desde: ${fecha_desde.toISOString()}`);
      console.log(`   Fecha hasta: ${fecha_hasta.toISOString()}`);
    } else {
      console.log('📋 Acreditaciones candidatas:');
      acreditacionesCandidatas.rows.forEach((acred, index) => {
        console.log(`   ${index + 1}. ID: ${acred.id}, Titular: "${acred.titular}", CUIT: "${acred.cuit}", Importe: $${acred.importe}, Fecha: ${acred.fecha_hora}`);
      });
    }

    let id_acreditacion = null;
    let acreditacion_encontrada = false;
    let mejor_coincidencia = null;
    let mejor_score = 0;

    // Evaluar cada acreditación candidata con matching inteligente
    for (const acreditacion of acreditacionesCandidatas.rows) {
      console.log(`\n🔍 Evaluando acreditación ${acreditacion.id}:`);
      console.log(`   Titular: "${acreditacion.titular}"`);
      console.log(`   CUIT: "${acreditacion.cuit}"`);
      console.log(`   Importe: $${acreditacion.importe}`);
      console.log(`   Fecha: ${acreditacion.fecha_hora}`);
      
      let score = 0;
      let coincidencias = [];

      // Coincidencia de importe (ya filtrado, score base)
      score += 30;
      coincidencias.push('importe');
      console.log(`   ✅ Importe coincidente: +30 puntos`);

      // Coincidencia de fecha (más cercana = mejor score)
      const diffHoras = Math.abs(acreditacion.fecha_hora - fecha_envio_obj) / (1000 * 60 * 60);
      if (diffHoras <= 1) {
        score += 25;
        coincidencias.push('fecha_exacta');
        console.log(`   ✅ Fecha exacta (${diffHoras.toFixed(2)}h): +25 puntos`);
      } else if (diffHoras <= 6) {
        score += 20;
        coincidencias.push('fecha_cercana');
        console.log(`   ✅ Fecha cercana (${diffHoras.toFixed(2)}h): +20 puntos`);
      } else if (diffHoras <= 12) {
        score += 15;
        coincidencias.push('fecha_media');
        console.log(`   ✅ Fecha media (${diffHoras.toFixed(2)}h): +15 puntos`);
      } else {
        score += 10;
        coincidencias.push('fecha_lejana');
        console.log(`   ✅ Fecha lejana (${diffHoras.toFixed(2)}h): +10 puntos`);
      }

      // Coincidencia de nombre
      console.log(`\n   🔤 Evaluando nombre: "${nombre_limpio || 'Sin nombre'}" vs "${acreditacion.titular}"`);
      if (nombre_limpio && namesMatch(nombre_limpio, acreditacion.titular)) {
        score += 25;
        coincidencias.push('nombre_exacto');
        console.log(`   ✅ Nombre exacto: +25 puntos`);
      } else if (nombre_limpio && namesMatch(nombre_limpio, acreditacion.titular, 0.6)) {
        score += 15;
        coincidencias.push('nombre_parcial');
        console.log(`   ✅ Nombre parcial: +15 puntos`);
      } else {
        console.log(`   ❌ Nombre no coincide o no disponible`);
      }

      // Coincidencia de CUIT
      if (cuit_limpio && acreditacion.cuit) {
        console.log(`\n   🔢 Evaluando CUIT: "${cuit_limpio}" vs "${acreditacion.cuit}"`);
        if (cuitsMatch(cuit_limpio, acreditacion.cuit)) {
          score += 20;
          coincidencias.push('cuit_exacto');
          console.log(`   ✅ CUIT exacto: +20 puntos`);
        } else {
          console.log(`   ❌ CUIT no coincide`);
        }
      } else {
        console.log(`   ⚠️ No hay CUIT para comparar`);
      }

      console.log(`\n   📊 Score final: ${score} puntos`);
      console.log(`   📋 Coincidencias: [${coincidencias.join(', ')}]`);

      // Verificar si hay al menos una coincidencia de nombre O CUIT
      const tieneCoincidenciaNombre = coincidencias.includes('nombre_exacto') || coincidencias.includes('nombre_parcial');
      const tieneCoincidenciaCUIT = coincidencias.includes('cuit_exacto');
      const tieneCoincidenciaRequerida = tieneCoincidenciaNombre || tieneCoincidenciaCUIT;

      console.log(`   🔍 Coincidencias requeridas:`);
      console.log(`      Nombre: ${tieneCoincidenciaNombre ? '✅' : '❌'}`);
      console.log(`      CUIT: ${tieneCoincidenciaCUIT ? '✅' : '❌'}`);
      console.log(`      Al menos una: ${tieneCoincidenciaRequerida ? '✅' : '❌'}`);

      // Solo considerar si tiene score suficiente Y al menos una coincidencia requerida
      if (score >= 50 && tieneCoincidenciaRequerida) {
        if (score > mejor_score) {
          mejor_score = score;
          mejor_coincidencia = acreditacion;
          id_acreditacion = acreditacion.id;
          acreditacion_encontrada = true;
          console.log(`   🏆 ¡Nueva mejor coincidencia! (Score: ${score}, Coincidencias requeridas: ✅)`);
        } else {
          console.log(`   📉 No supera el mejor score actual: ${mejor_score}`);
        }
      } else {
        if (score >= 50 && !tieneCoincidenciaRequerida) {
          console.log(`   ❌ Score suficiente (${score}) pero sin coincidencias requeridas`);
        } else if (score < 50 && tieneCoincidenciaRequerida) {
          console.log(`   ❌ Coincidencias requeridas ✅ pero score insuficiente (${score})`);
        } else {
          console.log(`   ❌ Score insuficiente (${score}) y sin coincidencias requeridas`);
        }
      }
    }

    // Solo considerar como coincidencia si el score es suficientemente alto Y tiene coincidencias requeridas
    if (mejor_score >= 50) { // Mínimo 50 puntos para considerar coincidencia
      console.log('\n💰 Acreditación coincidente encontrada con matching inteligente:');
      console.log(`   Acreditación ID: ${mejor_coincidencia.id}`);
      console.log(`   Titular: "${mejor_coincidencia.titular}"`);
      console.log(`   CUIT: "${mejor_coincidencia.cuit}"`);
      console.log(`   Importe: $${mejor_coincidencia.importe}`);
      console.log(`   Score final: ${mejor_score} puntos`);
      console.log(`   ✅ Coincidencia requerida (nombre O CUIT) verificada`);
    } else {
      console.log('\n❌ No se encontró acreditación con score suficiente O sin coincidencias requeridas:');
      console.log(`   Mejor score obtenido: ${mejor_score}`);
      console.log(`   Umbral mínimo requerido: 50 puntos`);
      console.log(`   Requisito adicional: Al menos coincidencia de nombre O CUIT`);
      id_acreditacion = null;
      acreditacion_encontrada = false;
    }

    console.log('\n💾 Guardando comprobante en base de datos...');
    console.log(`   acreditacion_encontrada: ${acreditacion_encontrada}`);
    console.log(`   id_acreditacion: ${id_acreditacion}`);
    console.log(`   cotejado: ${acreditacion_encontrada}`);
    console.log(`   estado: ${acreditacion_encontrada ? 'cotejado' : 'pendiente'}`);

    // Insertar comprobante
    const comprobanteResult = await client.query(`
      INSERT INTO comprobantes_whatsapp (
        id_comprobante,
        nombre_remitente,
        cuit,
        importe,
        fecha_envio,
        id_cliente,
        id_acreditacion,
        cotejado,
        fecha_cotejo,
        estado
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, id_comprobante, cotejado, id_acreditacion
    `, [
      id_comprobante,
      nombre_limpio,
      cuit_limpio,
      parseFloat(monto),
      fecha_envio_obj,
      cliente_id,
      id_acreditacion,
      acreditacion_encontrada, // cotejado
      acreditacion_encontrada ? new Date() : null, // fecha_cotejo
      acreditacion_encontrada ? 'cotejado' : 'pendiente'
    ]);

    const comprobante = comprobanteResult.rows[0];

    // Si se encontró acreditación, actualizarla
    if (acreditacion_encontrada && id_acreditacion) {
      await client.query(`
        UPDATE acreditaciones 
        SET id_comprobante_whatsapp = $1, cotejado = true, fecha_cotejo = CURRENT_TIMESTAMP, id_cliente = $2
        WHERE id = $3
      `, [comprobante.id_comprobante, comprobante.id_cliente, id_acreditacion]);

      console.log('✅ Acreditación actualizada con comprobante');
    }

    // Registrar log
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'comprobante_whatsapp_creado',
      `Comprobante de WhatsApp creado: ${nombre_limpio || 'Sin nombre'} - $${monto}`,
      JSON.stringify({
        comprobante_id: comprobante.id,
        id_comprobante: id_comprobante,
        cliente_id,
        cliente_creado,
        acreditacion_encontrada,
        id_acreditacion
      }),
      'exitoso'
    ]);

    console.log('✅ Comprobante creado exitosamente');

    // Determinar el mensaje de estado más claro
    let estadoMensaje = '';
    if (acreditacion_encontrada) {
      estadoMensaje = 'Comprobante cotejado automáticamente con acreditación';
      console.log('✅ Comprobante cotejado automáticamente');
    } else {
      estadoMensaje = 'Comprobante pendiente de cotejo manual';
      console.log('⏳ Comprobante pendiente de cotejo manual');
    }

    res.json({
      success: true,
      message: estadoMensaje,
      data: {
        comprobante_id: comprobante.id,
        id_comprobante: id_comprobante,
        cliente: {
          id: cliente_id,
          creado: cliente_creado,
          nombre: nombre_remitente
        },
        acreditacion: acreditacion_encontrada ? {
          id: id_acreditacion,
          encontrada: true,
          cotejado: true
        } : {
          encontrada: false,
          cotejado: false
        },
        estado: acreditacion_encontrada ? 'cotejado' : 'pendiente',
        estado_detalle: estadoMensaje,
        score: acreditacion_encontrada ? mejor_score : 0
      }
    });

  } catch (error) {
    console.error('💥 Error procesando comprobante de WhatsApp:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo procesar el comprobante'
    });
  } finally {
    client.release();
  }
});

// ===== GESTIÓN DE USUARIOS DEL PORTAL =====

// GET /api/portal-users - Listar usuarios del portal
router.get('/portal-users', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(`(pu.username ILIKE $${paramIndex} OR c.nombre ILIKE $${paramIndex} OR c.apellido ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Query para contar total
    const countQuery = `
      SELECT COUNT(*) 
      FROM portal_users pu
      JOIN clientes c ON CAST(pu.id_cliente AS INTEGER) = c.id
      ${whereClause}
    `;
    const countResult = await client.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Query para obtener datos
    const dataQuery = `
      SELECT 
        pu.id,
        pu.username,
        pu.email,
        pu.activo,
        pu.fecha_creacion,
        pu.ultimo_acceso,
        c.id as cliente_id,
        c.nombre as cliente_nombre,
        c.apellido as cliente_apellido,
        c.estado as cliente_estado
      FROM portal_users pu
      JOIN clientes c ON CAST(pu.id_cliente AS INTEGER) = c.id
      ${whereClause}
      ORDER BY pu.fecha_creacion DESC
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
    console.error('Error obteniendo usuarios del portal:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudieron obtener los usuarios del portal'
    });
  } finally {
    client.release();
  }
});

// GET /api/portal-users/:id - Obtener usuario del portal por ID
router.get('/portal-users/:id', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { id } = req.params;

    const userResult = await client.query(`
      SELECT 
        pu.id,
        pu.username,
        pu.email,
        pu.activo,
        pu.fecha_creacion,
        pu.ultimo_acceso,
        pu.id_cliente as cliente_id,
        c.nombre as cliente_nombre,
        c.apellido as cliente_apellido,
        c.estado as cliente_estado
      FROM portal_users pu
      JOIN clientes c ON CAST(pu.id_cliente AS INTEGER) = c.id
      WHERE pu.id = $1
    `, [id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Usuario no encontrado',
        message: 'El usuario especificado no existe'
      });
    }

    const user = userResult.rows[0];

    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        activo: user.activo,
        fecha_creacion: user.fecha_creacion,
        ultimo_acceso: user.ultimo_acceso,
        cliente_id: user.cliente_id,
        cliente_nombre: user.cliente_nombre,
        cliente_apellido: user.cliente_apellido,
        cliente_estado: user.cliente_estado
      }
    });

  } catch (error) {
    console.error('Error obteniendo usuario del portal:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener el usuario del portal'
    });
  } finally {
    client.release();
  }
});

// POST /api/portal-users - Crear usuario del portal
router.post('/portal-users', [
  body('id_cliente').notEmpty().withMessage('ID del cliente es requerido').isInt({ min: 1 }).withMessage('ID del cliente debe ser un número entero válido'),
  body('username').notEmpty().withMessage('Usuario es requerido').isLength({ min: 3, max: 50 }).withMessage('Usuario debe tener entre 3 y 50 caracteres').matches(/^[a-zA-Z0-9_]+$/).withMessage('Usuario solo puede contener letras, números y guiones bajos'),
  body('password').notEmpty().withMessage('Contraseña es requerida').isLength({ min: 6, max: 100 }).withMessage('Contraseña debe tener entre 6 y 100 caracteres'),
  body('email').optional().isEmail().withMessage('Email debe ser válido')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('❌ Errores de validación al crear usuario del portal:', errors.array());
    return res.status(400).json({ 
      error: 'Datos inválidos', 
      details: errors.array() 
    });
  }

  const client = await db.getClient();
  
  try {
    const { id_cliente, username, password, email } = req.body;
    
    console.log('🔧 Intentando crear usuario del portal:', { id_cliente, username, email: email || 'no especificado' });

    // Verificar que el cliente existe
    const clienteResult = await client.query(
      'SELECT id, nombre, apellido FROM clientes WHERE id = $1',
      [parseInt(id_cliente)]
    );

    if (clienteResult.rows.length === 0) {
      console.log('❌ Cliente no encontrado:', id_cliente);
      return res.status(404).json({
        error: 'Cliente no encontrado',
        message: 'El cliente especificado no existe'
      });
    }

    // Verificar que el username no existe
    const existingUser = await client.query(
      'SELECT id FROM portal_users WHERE username = $1',
      [username]
    );

    if (existingUser.rows.length > 0) {
      console.log('❌ Usuario duplicado:', username);
      return res.status(409).json({
        error: 'Usuario duplicado',
        message: 'Este nombre de usuario ya existe'
      });
    }

    // Hash de la contraseña
    const bcrypt = require('bcrypt');
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Crear usuario del portal
    const result = await client.query(`
      INSERT INTO portal_users (
        id_cliente,
        username,
        password_hash,
        email
      ) VALUES ($1, $2, $3, $4)
      RETURNING id, username, email, activo, fecha_creacion
    `, [parseInt(id_cliente), username, passwordHash, email || null]);

    const cliente = clienteResult.rows[0];
    console.log('✅ Usuario del portal creado exitosamente:', result.rows[0].id);

    // Registrar log
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'portal_user_creado',
      `Usuario del portal creado: ${username} para ${cliente.nombre} ${cliente.apellido}`,
      JSON.stringify({ username, id_cliente, email }),
      'exitoso'
    ]);

    res.status(201).json({
      success: true,
      message: 'Usuario del portal creado exitosamente',
      data: {
        ...result.rows[0],
        cliente: {
          id: cliente.id,
          nombre: cliente.nombre,
          apellido: cliente.apellido
        }
      }
    });

  } catch (error) {
    console.error('❌ Error creando usuario del portal:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo crear el usuario del portal'
    });
  } finally {
    client.release();
  }
});

// PUT /api/portal-users/:id - Actualizar usuario del portal
router.put('/portal-users/:id', [
  body('username').optional().isLength({ min: 3 }).withMessage('Usuario debe tener al menos 3 caracteres'),
  body('email').optional().isEmail().withMessage('Email debe ser válido'),
  body('activo').optional().isBoolean().withMessage('Activo debe ser true o false')
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
    const { id } = req.params;
    const { username, email, activo, password } = req.body;

    // Verificar que el usuario existe
    const existingUser = await client.query(`
      SELECT pu.*, c.nombre, c.apellido 
      FROM portal_users pu
      JOIN clientes c ON CAST(pu.id_cliente AS INTEGER) = c.id
      WHERE pu.id = $1
    `, [id]);

    if (existingUser.rows.length === 0) {
      return res.status(404).json({
        error: 'Usuario no encontrado',
        message: 'El usuario especificado no existe'
      });
    }

    // Verificar que el username no existe (si se está cambiando)
    if (username && username !== existingUser.rows[0].username) {
      const usernameCheck = await client.query(
        'SELECT id FROM portal_users WHERE username = $1 AND id != $2',
        [username, id]
      );

      if (usernameCheck.rows.length > 0) {
        return res.status(409).json({
          error: 'Usuario duplicado',
          message: 'Este nombre de usuario ya existe'
        });
      }
    }

    // Preparar campos a actualizar
    let updateFields = [];
    let params = [];
    let paramIndex = 1;

    if (username !== undefined) {
      updateFields.push(`username = $${paramIndex}`);
      params.push(username);
      paramIndex++;
    }

    if (email !== undefined) {
      updateFields.push(`email = $${paramIndex}`);
      params.push(email);
      paramIndex++;
    }

    if (activo !== undefined) {
      updateFields.push(`activo = $${paramIndex}`);
      params.push(activo);
      paramIndex++;
    }

    if (password) {
      const bcrypt = require('bcrypt');
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      updateFields.push(`password_hash = $${paramIndex}`);
      params.push(passwordHash);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        error: 'Sin cambios',
        message: 'No se especificaron campos para actualizar'
      });
    }

    params.push(id);

    // Actualizar usuario
    await client.query(`
      UPDATE portal_users 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
    `, params);

    // Registrar log
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'portal_user_actualizado',
      `Usuario del portal actualizado: ${existingUser.rows[0].username}`,
      JSON.stringify({ id, username, email, activo, password_changed: !!password }),
      'exitoso'
    ]);

    res.json({
      success: true,
      message: 'Usuario del portal actualizado exitosamente'
    });

  } catch (error) {
    console.error('Error actualizando usuario del portal:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo actualizar el usuario del portal'
    });
  } finally {
    client.release();
  }
});

// DELETE /api/portal-users/:id - Eliminar usuario del portal
router.delete('/portal-users/:id', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { id } = req.params;

    // Verificar que el usuario existe
    const userResult = await client.query(`
      SELECT pu.username, c.nombre, c.apellido 
      FROM portal_users pu
      JOIN clientes c ON CAST(pu.id_cliente AS INTEGER) = c.id
      WHERE pu.id = $1
    `, [id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Usuario no encontrado',
        message: 'El usuario especificado no existe'
      });
    }

    // Eliminar usuario (soft delete - cambiar a inactivo)
    await client.query(`
      UPDATE portal_users 
      SET activo = false 
      WHERE id = $1
    `, [id]);

    const user = userResult.rows[0];

    // Registrar log
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'portal_user_eliminado',
      `Usuario del portal eliminado: ${user.username} (${user.nombre} ${user.apellido})`,
      JSON.stringify({ id }),
      'exitoso'
    ]);

    res.json({
      success: true,
      message: 'Usuario del portal eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando usuario del portal:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo eliminar el usuario del portal'
    });
  } finally {
    client.release();
  }
});

// GET /api/diagnostico - Endpoint de diagnóstico para verificar estado de BD
router.get('/diagnostico', async (req, res) => {
  const client = await db.getClient();
  
  try {
    console.log('🔍 Iniciando diagnóstico de base de datos...');
    
    const diagnostico = {
      timestamp: new Date().toISOString(),
      conexion: 'OK',
      tablas: {},
      errores: []
    };

    // Verificar conexión
    try {
      await client.query('SELECT 1 as test');
      console.log('✅ Conexión a BD exitosa');
    } catch (error) {
      diagnostico.conexion = 'ERROR';
      diagnostico.errores.push(`Error de conexión: ${error.message}`);
      console.error('❌ Error de conexión:', error);
    }

    // Verificar tablas principales
    const tablas = ['comprobantes_whatsapp', 'acreditaciones', 'clientes', 'logs_procesamiento'];
    
    for (const tabla of tablas) {
      try {
        const tableExists = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          );
        `, [tabla]);

        if (tableExists.rows[0].exists) {
          // Contar registros
          const countResult = await client.query(`SELECT COUNT(*) FROM ${tabla}`);
          const count = parseInt(countResult.rows[0].count);
          
          diagnostico.tablas[tabla] = {
            existe: true,
            registros: count
          };
          console.log(`✅ Tabla ${tabla}: existe con ${count} registros`);
        } else {
          diagnostico.tablas[tabla] = {
            existe: false,
            registros: 0
          };
          console.log(`❌ Tabla ${tabla}: NO existe`);
        }
      } catch (error) {
        diagnostico.tablas[tabla] = {
          existe: false,
          error: error.message
        };
        diagnostico.errores.push(`Error verificando tabla ${tabla}: ${error.message}`);
        console.error(`❌ Error verificando tabla ${tabla}:`, error);
      }
    }

    // Verificar estructura de tabla comprobantes_whatsapp si existe
    if (diagnostico.tablas.comprobantes_whatsapp?.existe) {
      try {
        const columns = await client.query(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns 
          WHERE table_name = 'comprobantes_whatsapp'
          ORDER BY ordinal_position;
        `);
        
        diagnostico.tablas.comprobantes_whatsapp.columnas = columns.rows;
        console.log(`✅ Columnas de comprobantes_whatsapp:`, columns.rows.map(c => c.column_name));
      } catch (error) {
        diagnostico.errores.push(`Error obteniendo columnas de comprobantes_whatsapp: ${error.message}`);
        console.error('❌ Error obteniendo columnas:', error);
      }
    }

    console.log('📊 Diagnóstico completado:', diagnostico);

    res.json({
      success: true,
      diagnostico
    });

  } catch (error) {
    console.error('💥 Error en diagnóstico:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo completar el diagnóstico',
      details: error.message
    });
  } finally {
    client.release();
  }
});

// GET /api/comprobantes/stats - Obtener estadísticas de comprobantes
router.get('/comprobantes/stats', async (req, res) => {
  const client = await db.getClient();
  
  try {
    // Obtener estadísticas generales de comprobantes
    const statsQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN cotejado = true THEN 1 END) as cotejados,
        COUNT(CASE WHEN cotejado = false THEN 1 END) as pendientes,
        SUM(importe) as importe_total,
        SUM(CASE WHEN cotejado = true THEN importe ELSE 0 END) as importe_cotejado,
        SUM(CASE WHEN cotejado = false THEN importe ELSE 0 END) as importe_pendiente
      FROM comprobantes_whatsapp
    `;
    
    const statsResult = await client.query(statsQuery);
    const stats = statsResult.rows[0];

    res.json({
      success: true,
      data: {
        total: parseInt(stats.total || 0),
        cotejados: parseInt(stats.cotejados || 0),
        pendientes: parseInt(stats.pendientes || 0),
        importe_total: parseFloat(stats.importe_total || 0),
        importe_cotejado: parseFloat(stats.importe_cotejado || 0),
        importe_pendiente: parseFloat(stats.importe_pendiente || 0)
      }
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas de comprobantes:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudieron obtener las estadísticas'
    });
  } finally {
    client.release();
  }
});

// GET /api/comprobantes - Listar comprobantes con paginación y filtros
router.get('/comprobantes', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const {
      page = 1,
      limit = 20,
      sort = 'fecha_envio',
      order = 'DESC',
      search = '',
      cotejado = '',
      cliente_id = ''
    } = req.query;

    console.log('🔍 GET /api/comprobantes - Parámetros:', { page, limit, sort, order, search, cotejado, cliente_id });

    // Validar parámetros
    const validSortFields = ['id', 'fecha_envio', 'importe', 'nombre_remitente', 'cuit_remitente'];
    const validOrders = ['ASC', 'DESC'];
    
    if (!validSortFields.includes(sort)) {
      return res.status(400).json({
        error: 'Campo de ordenamiento inválido',
        validFields: validSortFields
      });
    }
    
    if (!validOrders.includes(order.toUpperCase())) {
      return res.status(400).json({
        error: 'Orden inválido',
        validOrders: validOrders
      });
    }

    // Construir query base
    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    // Filtro de búsqueda
    if (search) {
      whereConditions.push(`(
        nombre_remitente ILIKE $${paramIndex} OR 
        cuit_remitente ILIKE $${paramIndex} OR 
        numero_comprobante ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    // Filtro de cotejado
    if (cotejado !== '') {
      whereConditions.push(`cotejado = $${paramIndex}`);
      queryParams.push(cotejado === 'true');
      paramIndex++;
    }

    // Filtro de cliente
    if (cliente_id) {
      whereConditions.push(`id_cliente = $${paramIndex}`);
      queryParams.push(cliente_id);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Query para contar total
    const countQuery = `
      SELECT COUNT(*) as total
      FROM comprobantes_whatsapp
      ${whereClause}
    `;
    
    const countResult = await client.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Calcular paginación
    const offset = (page - 1) * limit;
    const totalPages = Math.ceil(total / limit);

    // Query principal con JOIN para obtener información del cliente
    const mainQuery = `
      SELECT 
        cw.*,
        c.nombre as cliente_nombre,
        c.apellido as cliente_apellido
      FROM comprobantes_whatsapp cw
      LEFT JOIN clientes c ON cw.id_cliente = c.id
      ${whereClause}
      ORDER BY cw.${sort} ${order}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    queryParams.push(parseInt(limit), offset);
    
    const result = await client.query(mainQuery, queryParams);
    const comprobantes = result.rows;

    console.log(`📊 Comprobantes encontrados: ${comprobantes.length} de ${total} total`);

    res.json({
      success: true,
      data: comprobantes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
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

// PUT /api/acreditaciones/:id - Editar comisión de una acreditación
router.put('/acreditaciones/:id', [
  body('comision').isFloat({ min: 0, max: 100 }).withMessage('Comisión debe ser un número entre 0 y 100')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
  }
  const client = await db.getClient();
  try {
    const { id } = req.params;
    const { comision } = req.body;
    // Obtener acreditación
    const acreditacionResult = await client.query('SELECT importe FROM acreditaciones WHERE id = $1', [id]);
    if (acreditacionResult.rows.length === 0) {
      return res.status(404).json({ error: 'No encontrado', message: 'Acreditación no encontrada' });
    }
    const importe = parseFloat(acreditacionResult.rows[0].importe);
    const importe_comision = (importe * comision / 100).toFixed(2);
    // Actualizar acreditación
    await client.query('UPDATE acreditaciones SET comision = $1, importe_comision = $2 WHERE id = $3', [comision, importe_comision, id]);
    res.json({ success: true, message: 'Comisión actualizada', data: { id, comision, importe_comision } });
  } catch (error) {
    console.error('Error actualizando comisión:', error);
    res.status(500).json({ error: 'Error interno del servidor', message: 'No se pudo actualizar la comisión' });
  } finally {
    client.release();
  }
});

module.exports = router; 