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

module.exports = router; 