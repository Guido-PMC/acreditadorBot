const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const router = express.Router();

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

    // Insertar la acreditación
    const result = await client.query(`
      INSERT INTO acreditaciones (
        id_transaccion,
        tipo,
        importe,
        estado,
        id_en_red,
        titular,
        cuit,
        origen,
        fecha_hora,
        cvu,
        coelsa_id,
        origen_nombre,
        origen_tax_id,
        origen_cuenta,
        tipo_notificacion,
        fuente,
        procesado
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id, id_transaccion, importe, fecha_hora
    `, [
      transactionId.toString(),
      type || 'PI',
      importe,
      status || 'Pending',
      coelsa_id,
      origin.name,
      origin.taxId,
      origin.account,
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
      fecha_hasta
    } = req.query;

    console.log('Parámetros recibidos:', { page, limit, search, importe_min, importe_max, fecha_desde, fecha_hasta });

    let whereConditions = ['a.id_comprobante_whatsapp IS NULL'];
    let params = [];
    let paramIndex = 1;

    // Filtro de búsqueda
    if (search) {
      whereConditions.push(`(
        a.titular ILIKE $${paramIndex} OR 
        a.cuit ILIKE $${paramIndex} OR
        a.concepto ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
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

    console.log('WHERE clause:', whereClause);
    console.log('Parámetros:', params);

    // Query para contar total
    const countQuery = `SELECT COUNT(*) FROM acreditaciones a ${whereClause}`;
    console.log('Count query:', countQuery);
    
    const countResult = await client.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    console.log('Total encontrado:', total);

    // Query para obtener datos
    const dataQuery = `
      SELECT 
        a.*,
        c.nombre as cliente_nombre,
        c.apellido as cliente_apellido
      FROM acreditaciones a
      LEFT JOIN clientes c ON a.id_cliente = c.id
      ${whereClause}
      ORDER BY a.fecha_hora DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(parseInt(limit), offset);
    console.log('Data query:', dataQuery);
    console.log('Parámetros finales:', params);
    
    const dataResult = await client.query(dataQuery, params);
    console.log('Datos obtenidos:', dataResult.rows.length);

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
    console.error('Error obteniendo acreditaciones sin comprobante:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudieron obtener las acreditaciones'
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

// GET /api/acreditaciones - Obtener acreditaciones
router.get('/acreditaciones', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { 
      page = 1, 
      limit = 50, 
      fecha_desde, 
      fecha_hasta, 
      cuit, 
      estado,
      fuente 
    } = req.query;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (fecha_desde) {
      whereConditions.push(`fecha_hora >= $${paramIndex}`);
      params.push(fecha_desde);
      paramIndex++;
    }

    if (fecha_hasta) {
      whereConditions.push(`fecha_hora <= $${paramIndex}`);
      params.push(fecha_hasta);
      paramIndex++;
    }

    if (cuit) {
      whereConditions.push(`cuit = $${paramIndex}`);
      params.push(cuit);
      paramIndex++;
    }

    if (estado) {
      whereConditions.push(`estado = $${paramIndex}`);
      params.push(estado);
      paramIndex++;
    }

    if (fuente) {
      whereConditions.push(`fuente = $${paramIndex}`);
      params.push(fuente);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    const offset = (page - 1) * limit;
    
    // Query para contar total
    const countQuery = `SELECT COUNT(*) FROM acreditaciones ${whereClause}`;
    const countResult = await client.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Query para obtener datos
    const dataQuery = `
      SELECT 
        id,
        id_transaccion,
        tipo,
        concepto,
        importe,
        estado,
        titular,
        cuit,
        origen,
        fecha_hora,
        cvu,
        coelsa_id,
        fuente,
        procesado,
        cotejado,
        fecha_carga
      FROM acreditaciones 
      ${whereClause}
      ORDER BY fecha_hora DESC
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
router.post('/notifications', [
  body('id_transaccion').notEmpty().withMessage('ID de transacción es requerido'),
  body('importe').isNumeric().withMessage('Importe debe ser numérico'),
  body('fecha_hora').isISO8601().withMessage('Fecha debe ser válida')
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
      id_transaccion,
      tipo = 'Transferencia entrante',
      concepto,
      aplica_a,
      importe,
      estado = 'Completed',
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
      id_cliente
    } = req.body;

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
        id_cliente
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      RETURNING id
    `, [
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
      'api',
      true,
      id_cliente
    ]);

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
        id_transaccion
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
      orden = 'DESC'
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

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    // Validar campo de ordenamiento
    const camposPermitidos = ['fecha_hora', 'importe', 'titular', 'cuit', 'estado', 'fecha_carga'];
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
  body('cuit').optional().isLength({ min: 11, max: 11 }).withMessage('CUIT debe tener 11 dígitos')
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
      email,
      telefono,
      cuit,
      direccion,
      observaciones
    } = req.body;

    // Verificar si el CUIT ya existe
    if (cuit) {
      const existingClient = await client.query(
        'SELECT id FROM clientes WHERE cuit = $1',
        [cuit]
      );

      if (existingClient.rows.length > 0) {
        return res.status(409).json({
          error: 'CUIT duplicado',
          message: 'Ya existe un cliente con este CUIT'
        });
      }
    }

    // Insertar cliente
    const result = await client.query(`
      INSERT INTO clientes (
        nombre,
        apellido,
        email,
        telefono,
        cuit,
        direccion,
        observaciones
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      nombre,
      apellido,
      email,
      telefono,
      cuit,
      direccion,
      observaciones
    ]);

    // Registrar log
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'cliente_creado',
      `Cliente creado: ${nombre} ${apellido || ''}`,
      JSON.stringify(req.body),
      'exitoso'
    ]);

    res.status(201).json({
      success: true,
      message: 'Cliente creado exitosamente',
      data: {
        id: result.rows[0].id,
        nombre,
        apellido
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
  body('cuit').optional().isLength({ min: 11, max: 11 }).withMessage('CUIT debe tener 11 dígitos')
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
      email,
      telefono,
      cuit,
      direccion,
      observaciones,
      estado
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

    // Verificar si el CUIT ya existe en otro cliente
    if (cuit) {
      const duplicateCuit = await client.query(
        'SELECT id FROM clientes WHERE cuit = $1 AND id != $2',
        [cuit, id]
      );

      if (duplicateCuit.rows.length > 0) {
        return res.status(409).json({
          error: 'CUIT duplicado',
          message: 'Ya existe otro cliente con este CUIT'
        });
      }
    }

    // Actualizar cliente
    await client.query(`
      UPDATE clientes SET
        nombre = $1,
        apellido = $2,
        email = $3,
        telefono = $4,
        cuit = $5,
        direccion = $6,
        observaciones = $7,
        estado = $8
      WHERE id = $9
    `, [
      nombre,
      apellido,
      email,
      telefono,
      cuit,
      direccion,
      observaciones,
      estado || 'activo',
      id
    ]);

    // Registrar log
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'cliente_actualizado',
      `Cliente actualizado: ${nombre} ${apellido || ''}`,
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
        a.id_transaccion,
        a.importe as acreditacion_importe,
        a.fecha_hora as acreditacion_fecha
      FROM comprobantes_whatsapp c
      LEFT JOIN acreditaciones a ON c.id_acreditacion = a.id_transaccion
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

    if (!id_acreditacion) {
      return res.status(400).json({
        error: 'ID de acreditación requerido',
        message: 'Debe especificar el ID de la acreditación'
      });
    }

    // Verificar que el comprobante existe
    const comprobante = await client.query(
      'SELECT * FROM comprobantes_whatsapp WHERE id = $1',
      [id]
    );

    if (comprobante.rows.length === 0) {
      return res.status(404).json({
        error: 'Comprobante no encontrado',
        message: 'El comprobante especificado no existe'
      });
    }

    // Verificar que la acreditación existe
    const acreditacion = await client.query(
      'SELECT * FROM acreditaciones WHERE id = $1',
      [id_acreditacion]
    );

    if (acreditacion.rows.length === 0) {
      return res.status(404).json({
        error: 'Acreditación no encontrada',
        message: 'La acreditación especificada no existe'
      });
    }

    // Verificar que la acreditación no esté ya asignada
    const acreditacionAsignada = await client.query(
      'SELECT id FROM comprobantes_whatsapp WHERE id_acreditacion = $1 AND id != $2',
      [id_acreditacion, id]
    );

    if (acreditacionAsignada.rows.length > 0) {
      return res.status(409).json({
        error: 'Acreditación ya asignada',
        message: 'Esta acreditación ya está asignada a otro comprobante'
      });
    }

    // Actualizar el comprobante
    await client.query(`
      UPDATE comprobantes_whatsapp 
      SET id_acreditacion = $1, cotejado = true, fecha_cotejo = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [id_acreditacion, id]);

    // Actualizar la acreditación
    await client.query(`
      UPDATE acreditaciones 
      SET id_comprobante_whatsapp = $1, cotejado = true, fecha_cotejo = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [comprobante.rows[0].id_comprobante, id_acreditacion]);

    // Registrar log
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'comprobante_asignado',
      `Comprobante ${comprobante.rows[0].id_comprobante} asignado a acreditación ${id_acreditacion}`,
      JSON.stringify({ comprobante_id: id, acreditacion_id: id_acreditacion }),
      'exitoso'
    ]);

    res.json({
      success: true,
      message: 'Comprobante asignado exitosamente'
    });

  } catch (error) {
    console.error('Error asignando comprobante:', error);
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
      SET id_comprobante_whatsapp = NULL, cotejado = false, fecha_cotejo = NULL
      WHERE id = $1
    `, [id_acreditacion]);

    // Registrar log
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'comprobante_desasignado',
      `Comprobante ${comprobante.rows[0].id_comprobante} desasignado de acreditación ${id_acreditacion}`,
      JSON.stringify({ comprobante_id: id, acreditacion_id: id_acreditacion }),
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
      fecha_hasta
    } = req.query;

    let whereConditions = ['c.id_acreditacion IS NULL'];
    let params = [];
    let paramIndex = 1;

    // Filtro de búsqueda
    if (search) {
      whereConditions.push(`(
        c.nombre_remitente ILIKE $${paramIndex} OR 
        c.numero_telefono ILIKE $${paramIndex} OR
        c.texto_mensaje ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
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

    // Query para contar total
    const countQuery = `SELECT COUNT(*) FROM comprobantes_whatsapp c ${whereClause}`;
    const countResult = await client.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

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
    console.error('Error obteniendo comprobantes sin acreditación:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudieron obtener los comprobantes'
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
      numero_telefono,
      nombre_remitente,
      importe,
      fecha_envio,
      archivo_url,
      texto_mensaje,
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
        numero_telefono,
        nombre_remitente,
        importe,
        fecha_envio,
        archivo_url,
        texto_mensaje,
        id_cliente
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, id_comprobante
    `, [
      id_comprobante,
      numero_telefono || null,
      nombre_remitente || null,
      importe,
      fecha_envio,
      archivo_url || null,
      texto_mensaje || null,
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
        COUNT(CASE WHEN cotejado = false THEN 1 END) as comprobantes_pendientes
      FROM comprobantes_whatsapp 
      WHERE id_cliente = $1
    `, [id]);

    // Obtener estadísticas de acreditaciones
    const acreditacionesStats = await client.query(`
      SELECT 
        COUNT(*) as total_acreditaciones,
        SUM(importe) as total_importe_acreditaciones,
        COUNT(CASE WHEN cotejado = true THEN 1 END) as acreditaciones_cotejadas,
        COUNT(CASE WHEN cotejado = false THEN 1 END) as acreditaciones_pendientes
      FROM acreditaciones 
      WHERE id_cliente = $1
    `, [id]);

    // Obtener estadísticas de pagos
    const pagosStats = await client.query(`
      SELECT 
        COUNT(*) as total_pagos,
        SUM(importe) as total_importe_pagos
      FROM pagos 
      WHERE id_cliente = $1 AND estado = 'confirmado'
    `, [id]);

    // Calcular saldo (comprobantes - pagos)
    const totalComprobantes = parseFloat(comprobantesStats.rows[0].total_importe_comprobantes || 0);
    const totalPagos = parseFloat(pagosStats.rows[0].total_importe_pagos || 0);
    const saldo = totalComprobantes - totalPagos;

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

module.exports = router; 