const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const router = express.Router();

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

module.exports = router; 