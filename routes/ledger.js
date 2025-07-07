const express = require('express');
const router = express.Router();
const db = require('../config/database');
const ledgerUtils = require('../utils/ledger');

/**
 * POST /api/ledger/generar/:cliente_id - Genera el LEDGER completo para un cliente
 */
router.post('/generar/:cliente_id', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const cliente_id = parseInt(req.params.cliente_id);
    
    if (!cliente_id || isNaN(cliente_id)) {
      return res.status(400).json({
        error: 'ID de cliente inválido',
        message: 'Debe proporcionar un ID de cliente válido'
      });
    }
    
    console.log(`🚀 Iniciando generación de LEDGER para cliente ${cliente_id}...`);
    
    const resultado = await ledgerUtils.generarLedgerCompleto(client, cliente_id);
    
    res.json({
      success: true,
      message: resultado.message,
      data: resultado.data
    });
    
  } catch (error) {
    console.error('Error generando LEDGER:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo generar el LEDGER'
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/ledger/generar-todos - Genera LEDGER para todos los clientes
 */
router.post('/generar-todos', async (req, res) => {
  const client = await db.getClient();
  
  try {
    console.log('🚀 Iniciando generación de LEDGER para todos los clientes...');
    
    // Obtener todos los clientes activos
    const clientesResult = await client.query(
      'SELECT id FROM clientes WHERE estado = $1',
      ['activo']
    );
    
    const clientes = clientesResult.rows;
    const resultados = [];
    const errores = [];
    
    console.log(`📊 Procesando ${clientes.length} clientes...`);
    
    for (const cliente of clientes) {
      try {
        const resultado = await ledgerUtils.generarLedgerCompleto(client, cliente.id);
        resultados.push({
          cliente_id: cliente.id,
          success: true,
          ...resultado.data
        });
        console.log(`✅ Cliente ${cliente.id}: ${resultado.data.movimientos_procesados} movimientos`);
      } catch (error) {
        console.error(`❌ Error en cliente ${cliente.id}:`, error.message);
        errores.push({
          cliente_id: cliente.id,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      message: `LEDGER generado para ${resultados.length} clientes`,
      data: {
        total_clientes: clientes.length,
        exitosos: resultados.length,
        errores: errores.length,
        resultados,
        errores
      }
    });
    
  } catch (error) {
    console.error('Error generando LEDGER masivo:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo generar el LEDGER masivo'
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/ledger/:cliente_id/movimientos - Obtiene movimientos del LEDGER
 */
router.get('/:cliente_id/movimientos', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const cliente_id = parseInt(req.params.cliente_id);
    const {
      page = 1,
      limit = 25,
      ordenar_por = 'fecha_movimiento',
      orden = 'DESC',
      tipo = '',
      fecha_desde = null,
      fecha_hasta = null
    } = req.query;
    
    if (!cliente_id || isNaN(cliente_id)) {
      return res.status(400).json({
        error: 'ID de cliente inválido',
        message: 'Debe proporcionar un ID de cliente válido'
      });
    }
    
    const resultado = await ledgerUtils.obtenerMovimientosLedger(client, cliente_id, {
      page: parseInt(page),
      limit: parseInt(limit),
      ordenar_por,
      orden,
      tipo,
      fecha_desde,
      fecha_hasta
    });
    
    res.json({
      success: true,
      data: resultado.movimientos,
      pagination: resultado.pagination
    });
    
  } catch (error) {
    console.error('Error obteniendo movimientos del LEDGER:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudieron obtener los movimientos'
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/ledger/:cliente_id/saldo - Obtiene saldo actual desde LEDGER
 */
router.get('/:cliente_id/saldo', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const cliente_id = parseInt(req.params.cliente_id);
    const { fecha } = req.query;
    
    if (!cliente_id || isNaN(cliente_id)) {
      return res.status(400).json({
        error: 'ID de cliente inválido',
        message: 'Debe proporcionar un ID de cliente válido'
      });
    }
    
    const saldo = await ledgerUtils.obtenerSaldoDesdeLedger(client, cliente_id, fecha);
    
    res.json({
      success: true,
      data: {
        cliente_id,
        saldo,
        fecha_consulta: fecha || new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Error obteniendo saldo del LEDGER:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener el saldo'
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/ledger/:cliente_id/verificar - Verifica consistencia del LEDGER
 */
router.post('/:cliente_id/verificar', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const cliente_id = parseInt(req.params.cliente_id);
    
    if (!cliente_id || isNaN(cliente_id)) {
      return res.status(400).json({
        error: 'ID de cliente inválido',
        message: 'Debe proporcionar un ID de cliente válido'
      });
    }
    
    const resultado = await ledgerUtils.verificarConsistenciaLedger(client, cliente_id);
    
    res.json({
      success: true,
      data: resultado.data,
      consistente: resultado.consistente
    });
    
  } catch (error) {
    console.error('Error verificando consistencia del LEDGER:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo verificar la consistencia'
    });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/ledger/:cliente_id - Elimina LEDGER de un cliente
 */
router.delete('/:cliente_id', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const cliente_id = parseInt(req.params.cliente_id);
    
    if (!cliente_id || isNaN(cliente_id)) {
      return res.status(400).json({
        error: 'ID de cliente inválido',
        message: 'Debe proporcionar un ID de cliente válido'
      });
    }
    
    const result = await client.query(
      'DELETE FROM ledger WHERE id_cliente = $1 RETURNING id',
      [cliente_id]
    );
    
    res.json({
      success: true,
      message: `LEDGER eliminado para cliente ${cliente_id}`,
      data: {
        registros_eliminados: result.rowCount
      }
    });
    
  } catch (error) {
    console.error('Error eliminando LEDGER:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo eliminar el LEDGER'
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/ledger/estadisticas - Obtiene estadísticas generales del LEDGER
 */
router.get('/estadisticas', async (req, res) => {
  const client = await db.getClient();
  
  try {
    // Estadísticas generales
    const statsResult = await client.query(`
      SELECT 
        COUNT(*) as total_registros,
        COUNT(DISTINCT id_cliente) as total_clientes,
        SUM(CASE WHEN esta_liberado THEN importe_neto ELSE 0 END) as total_liberado,
        SUM(CASE WHEN NOT esta_liberado THEN importe_neto ELSE 0 END) as total_no_liberado,
        AVG(importe_neto) as promedio_movimiento,
        MIN(fecha_movimiento) as fecha_primer_movimiento,
        MAX(fecha_movimiento) as fecha_ultimo_movimiento
      FROM ledger
    `);
    
    // Estadísticas por tipo de movimiento
    const tiposResult = await client.query(`
      SELECT 
        tipo_movimiento,
        COUNT(*) as cantidad,
        SUM(importe_neto) as total_importe,
        AVG(importe_neto) as promedio_importe
      FROM ledger
      GROUP BY tipo_movimiento
      ORDER BY cantidad DESC
    `);
    
    // Top 5 clientes por saldo
    const topClientesResult = await client.query(`
      SELECT 
        l.id_cliente,
        c.nombre,
        c.apellido,
        l.saldo_posterior as saldo_actual,
        COUNT(l.id) as total_movimientos
      FROM ledger l
      JOIN clientes c ON l.id_cliente = c.id
      WHERE l.id IN (
        SELECT MAX(id) 
        FROM ledger 
        GROUP BY id_cliente
      )
      ORDER BY l.saldo_posterior DESC
      LIMIT 5
    `);
    
    res.json({
      success: true,
      data: {
        general: statsResult.rows[0],
        por_tipo: tiposResult.rows,
        top_clientes: topClientesResult.rows
      }
    });
    
  } catch (error) {
    console.error('Error obteniendo estadísticas del LEDGER:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudieron obtener las estadísticas'
    });
  } finally {
    client.release();
  }
});

module.exports = router; 