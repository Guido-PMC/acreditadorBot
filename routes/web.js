const express = require('express');
const path = require('path');
const db = require('../config/database');
const router = express.Router();

// GET / - Página principal
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// GET /dashboard - Dashboard principal
router.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// GET /upload - Página de subida de archivos
router.get('/upload', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/upload.html'));
});

// GET /acreditaciones - Página de acreditaciones
router.get('/acreditaciones', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/acreditaciones.html'));
});

// GET /logs - Página de logs
router.get('/logs', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/logs.html'));
});

// GET /api/dashboard-stats - Estadísticas para el dashboard
router.get('/api/dashboard-stats', async (req, res) => {
  const client = await db.getClient();
  
  try {
    // Estadísticas generales
    const stats = await client.query(`
      SELECT 
        COUNT(*) as total_acreditaciones,
        COUNT(CASE WHEN fuente = 'api' THEN 1 END) as total_api,
        COUNT(CASE WHEN fuente = 'csv' THEN 1 END) as total_csv,
        COUNT(CASE WHEN cotejado = true THEN 1 END) as total_cotejadas,
        COUNT(CASE WHEN cotejado = false THEN 1 END) as total_pendientes,
        SUM(importe) as importe_total,
        AVG(importe) as importe_promedio
      FROM acreditaciones
    `);

    // Acreditaciones de hoy
    const hoy = await client.query(`
      SELECT COUNT(*) as count, SUM(importe) as total
      FROM acreditaciones 
      WHERE DATE(fecha_hora) = CURRENT_DATE
    `);

    // Acreditaciones de ayer
    const ayer = await client.query(`
      SELECT COUNT(*) as count, SUM(importe) as total
      FROM acreditaciones 
      WHERE DATE(fecha_hora) = CURRENT_DATE - INTERVAL '1 day'
    `);

    // Últimas 5 acreditaciones
    const ultimas = await client.query(`
      SELECT 
        id_transaccion,
        titular,
        importe,
        fecha_hora,
        fuente,
        cotejado
      FROM acreditaciones 
      ORDER BY fecha_hora DESC 
      LIMIT 5
    `);

    // Logs recientes
    const logs = await client.query(`
      SELECT 
        tipo,
        descripcion,
        estado,
        fecha
      FROM logs_procesamiento 
      ORDER BY fecha DESC 
      LIMIT 10
    `);

    res.json({
      success: true,
      data: {
        general: stats.rows[0],
        hoy: hoy.rows[0],
        ayer: ayer.rows[0],
        ultimas_acreditaciones: ultimas.rows,
        logs_recientes: logs.rows
      }
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas del dashboard:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudieron obtener las estadísticas'
    });
  } finally {
    client.release();
  }
});

// GET /api/acreditaciones-pendientes - Acreditaciones pendientes de cotejo
router.get('/api/acreditaciones-pendientes', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { limit = 20 } = req.query;

    const result = await client.query(`
      SELECT 
        id,
        id_transaccion,
        titular,
        cuit,
        importe,
        fecha_hora,
        fuente,
        observaciones
      FROM acreditaciones 
      WHERE cotejado = false
      ORDER BY fecha_hora DESC 
      LIMIT $1
    `, [parseInt(limit)]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error obteniendo acreditaciones pendientes:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudieron obtener las acreditaciones pendientes'
    });
  } finally {
    client.release();
  }
});

// POST /api/cotejar - Marcar acreditación como cotejada
router.post('/api/cotejar', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { id_acreditacion, id_comprobante, observaciones } = req.body;

    if (!id_acreditacion) {
      return res.status(400).json({
        error: 'ID de acreditación requerido'
      });
    }

    const result = await client.query(`
      UPDATE acreditaciones 
      SET 
        cotejado = true,
        id_comprobante_whatsapp = $1,
        fecha_cotejo = CURRENT_TIMESTAMP,
        observaciones = $2
      WHERE id = $3
      RETURNING id, id_transaccion, titular, importe
    `, [id_comprobante || null, observaciones || null, id_acreditacion]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Acreditación no encontrada'
      });
    }

    // Registrar log
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'cotejo_manual',
      `Acreditación ${result.rows[0].id_transaccion} marcada como cotejada`,
      JSON.stringify({
        id_acreditacion,
        id_comprobante,
        observaciones
      }),
      'exitoso'
    ]);

    res.json({
      success: true,
      message: 'Acreditación marcada como cotejada',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error cotejando acreditación:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo cotejar la acreditación'
    });
  } finally {
    client.release();
  }
});

// GET /api/buscar-acreditacion - Buscar acreditación por criterios
router.get('/api/buscar-acreditacion', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { cuit, importe, fecha_desde, fecha_hasta } = req.query;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (cuit) {
      whereConditions.push(`cuit = $${paramIndex}`);
      params.push(cuit);
      paramIndex++;
    }

    if (importe) {
      whereConditions.push(`importe = $${paramIndex}`);
      params.push(parseFloat(importe));
      paramIndex++;
    }

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

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const result = await client.query(`
      SELECT 
        id,
        id_transaccion,
        titular,
        cuit,
        importe,
        fecha_hora,
        fuente,
        cotejado,
        observaciones
      FROM acreditaciones 
      ${whereClause}
      ORDER BY fecha_hora DESC 
      LIMIT 50
    `, params);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error buscando acreditaciones:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudieron buscar las acreditaciones'
    });
  } finally {
    client.release();
  }
});

module.exports = router; 