const moment = require('moment-timezone');
const { 
  calcularFechaLiberacion, 
  estaLiberado, 
  estaLiberadoEnFecha 
} = require('./liberacionFondos');

/**
 * Utilidades para manejo del LEDGER (libro mayor)
 * Esta tabla mantiene todos los movimientos con saldos pre-calculados
 */

/**
 * Genera el LEDGER completo para un cliente
 * @param {Object} client - Cliente de base de datos
 * @param {number} cliente_id - ID del cliente
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function generarLedgerCompleto(client, cliente_id) {
  try {
    console.log(`🔄 Generando LEDGER completo para cliente ${cliente_id}...`);
    
    // Obtener información del cliente
    const clienteResult = await client.query(
      'SELECT plazo_acreditacion FROM clientes WHERE id = $1',
      [cliente_id]
    );
    
    if (clienteResult.rows.length === 0) {
      throw new Error(`Cliente ${cliente_id} no encontrado`);
    }
    
    const plazoAcreditacion = clienteResult.rows[0].plazo_acreditacion || 24;
    
    // Limpiar LEDGER existente para este cliente
    await client.query('DELETE FROM ledger WHERE id_cliente = $1', [cliente_id]);
    console.log(`🗑️  LEDGER anterior eliminado para cliente ${cliente_id}`);
    
    // Obtener todos los movimientos ordenados por fecha
    const movimientos = await obtenerTodosLosMovimientos(client, cliente_id);
    
    if (movimientos.length === 0) {
      console.log(`ℹ️  No hay movimientos para cliente ${cliente_id}`);
      return { success: true, message: 'No hay movimientos para procesar' };
    }
    
    // Ordenar movimientos por fecha (más antiguo primero)
    movimientos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    
    // Calcular saldos acumulados
    let saldoAcumulado = 0;
    const ledgerEntries = [];
    
    for (const movimiento of movimientos) {
      const saldoAnterior = saldoAcumulado;
      
      // Calcular importe neto (después de comisiones)
      const importeNeto = parseFloat(movimiento.importe_bruto || 0) - parseFloat(movimiento.importe_comision || 0);
      
      // Determinar si suma o resta al saldo
      let impactoSaldo = 0;
      if (movimiento.tipo_movimiento === 'acreditacion' || movimiento.tipo_movimiento === 'credito') {
        impactoSaldo = importeNeto;
      } else if (movimiento.tipo_movimiento === 'pago') {
        impactoSaldo = -importeNeto;
      } else if (movimiento.tipo_movimiento === 'comprobante') {
        // Los comprobantes no afectan el saldo hasta que se acrediten
        impactoSaldo = 0;
      }
      
      // Actualizar saldo acumulado
      saldoAcumulado += impactoSaldo;
      
      // Determinar si está liberado
      let estaLib = false;
      let fechaLiberacion = null;
      
      if (movimiento.tipo_movimiento === 'acreditacion') {
        estaLib = estaLiberado(movimiento.fecha_movimiento, plazoAcreditacion);
        fechaLiberacion = calcularFechaLiberacion(movimiento.fecha_movimiento, plazoAcreditacion);
      } else if (movimiento.tipo_movimiento === 'credito' && movimiento.metodo_pago === 'deposito') {
        estaLib = estaLiberado(movimiento.fecha_movimiento, plazoAcreditacion);
        fechaLiberacion = calcularFechaLiberacion(movimiento.fecha_movimiento, plazoAcreditacion);
      } else if (movimiento.tipo_movimiento === 'credito') {
        // Otros créditos siempre están liberados
        estaLib = true;
        fechaLiberacion = movimiento.fecha_movimiento;
      } else if (movimiento.tipo_movimiento === 'pago') {
        // Los pagos siempre están "liberados" (afectan inmediatamente)
        estaLib = true;
        fechaLiberacion = movimiento.fecha_movimiento;
      }
      
      // Crear entrada del LEDGER
      const ledgerEntry = {
        id_cliente: cliente_id,
        fecha_movimiento: movimiento.fecha_movimiento,
        tipo_movimiento: movimiento.tipo_movimiento,
        id_movimiento: movimiento.id_movimiento,
        tabla_origen: movimiento.tabla_origen,
        concepto: movimiento.concepto,
        importe_bruto: parseFloat(movimiento.importe_bruto || 0),
        importe_neto: importeNeto,
        comision: parseFloat(movimiento.comision || 0),
        importe_comision: parseFloat(movimiento.importe_comision || 0),
        saldo_anterior: saldoAnterior,
        saldo_posterior: saldoAcumulado,
        esta_liberado: estaLib,
        fecha_liberacion: fechaLiberacion,
        metadata: movimiento.metadata || {}
      };
      
      ledgerEntries.push(ledgerEntry);
    }
    
    // Insertar todas las entradas del LEDGER
    if (ledgerEntries.length > 0) {
      const values = ledgerEntries.map((entry, index) => {
        const offset = index * 15;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15})`;
      }).join(',');
      
      const params = ledgerEntries.flatMap(entry => [
        entry.id_cliente,
        entry.fecha_movimiento,
        entry.tipo_movimiento,
        entry.id_movimiento,
        entry.tabla_origen,
        entry.concepto,
        entry.importe_bruto,
        entry.importe_neto,
        entry.comision,
        entry.importe_comision,
        entry.saldo_anterior,
        entry.saldo_posterior,
        entry.esta_liberado,
        entry.fecha_liberacion,
        JSON.stringify(entry.metadata)
      ]);
      
      await client.query(`
        INSERT INTO ledger (
          id_cliente, fecha_movimiento, tipo_movimiento, id_movimiento, tabla_origen,
          concepto, importe_bruto, importe_neto, comision, importe_comision,
          saldo_anterior, saldo_posterior, esta_liberado, fecha_liberacion, metadata
        ) VALUES ${values}
      `, params);
    }
    
    console.log(`✅ LEDGER generado para cliente ${cliente_id}: ${ledgerEntries.length} movimientos`);
    
    return {
      success: true,
      message: `LEDGER generado exitosamente`,
      data: {
        cliente_id,
        movimientos_procesados: ledgerEntries.length,
        saldo_final: saldoAcumulado
      }
    };
    
  } catch (error) {
    console.error(`❌ Error generando LEDGER para cliente ${cliente_id}:`, error);
    throw error;
  }
}

/**
 * Obtiene todos los movimientos de un cliente desde las tablas originales
 * @param {Object} client - Cliente de base de datos
 * @param {number} cliente_id - ID del cliente
 * @returns {Promise<Array>} - Array de movimientos
 */
async function obtenerTodosLosMovimientos(client, cliente_id) {
  const movimientos = [];
  
  // Obtener acreditaciones
  const acreditacionesResult = await client.query(`
    SELECT 
      id as id_movimiento,
      'acreditaciones' as tabla_origen,
      'acreditacion' as tipo_movimiento,
      fecha_hora as fecha_movimiento,
      COALESCE(concepto, 'Acreditación bancaria') as concepto,
      importe as importe_bruto,
      COALESCE(comision, 0) as comision,
      COALESCE(importe_comision, 0) as importe_comision,
      jsonb_build_object(
        'titular', titular,
        'cuit', cuit,
        'cotejado', cotejado,
        'id_comprobante_whatsapp', id_comprobante_whatsapp
      ) as metadata
    FROM acreditaciones 
    WHERE id_cliente = $1
  `, [cliente_id]);
  
  movimientos.push(...acreditacionesResult.rows);
  
  // Obtener comprobantes pendientes (solo los no acreditados)
  const comprobantesResult = await client.query(`
    SELECT 
      id as id_movimiento,
      'comprobantes_whatsapp' as tabla_origen,
      'comprobante' as tipo_movimiento,
      fecha_envio as fecha_movimiento,
      COALESCE(nombre_remitente, 'Comprobante WhatsApp') as concepto,
      importe as importe_bruto,
      0 as comision,
      0 as importe_comision,
      jsonb_build_object(
        'cuit', cuit,
        'cotejado', cotejado,
        'id_acreditacion', id_acreditacion
      ) as metadata
    FROM comprobantes_whatsapp 
    WHERE id_cliente = $1 AND id_acreditacion IS NULL
  `, [cliente_id]);
  
  movimientos.push(...comprobantesResult.rows);
  
  // Obtener pagos y créditos
  const pagosResult = await client.query(`
    SELECT 
      id as id_movimiento,
      'pagos' as tabla_origen,
      CASE WHEN tipo_pago = 'egreso' THEN 'pago' ELSE 'credito' END as tipo_movimiento,
      fecha_pago as fecha_movimiento,
      concepto,
      importe as importe_bruto,
      COALESCE(comision, 0) as comision,
      COALESCE(importe_comision, 0) as importe_comision,
      jsonb_build_object(
        'tipo_pago', tipo_pago,
        'metodo_pago', metodo_pago,
        'referencia', referencia,
        'estado', estado
      ) as metadata
    FROM pagos 
    WHERE id_cliente = $1
  `, [cliente_id]);
  
  movimientos.push(...pagosResult.rows);
  
  return movimientos;
}

/**
 * Obtiene el saldo actual de un cliente desde el LEDGER
 * @param {Object} client - Cliente de base de datos
 * @param {number} cliente_id - ID del cliente
 * @param {Date} fecha_opcional - Fecha opcional para obtener saldo histórico
 * @returns {Promise<number>} - Saldo actual o histórico
 */
async function obtenerSaldoDesdeLedger(client, cliente_id, fecha_opcional = null) {
  let query = `
    SELECT saldo_posterior 
    FROM ledger 
    WHERE id_cliente = $1
  `;
  
  const params = [cliente_id];
  
  if (fecha_opcional) {
    query += ` AND fecha_movimiento <= $2`;
    params.push(fecha_opcional);
  }
  
  query += ` ORDER BY fecha_movimiento DESC, id DESC LIMIT 1`;
  
  const result = await client.query(query, params);
  
  if (result.rows.length === 0) {
    return 0;
  }
  
  return parseFloat(result.rows[0].saldo_posterior || 0);
}

/**
 * Obtiene movimientos del LEDGER con paginación
 * @param {Object} client - Cliente de base de datos
 * @param {number} cliente_id - ID del cliente
 * @param {Object} options - Opciones de paginación y filtros
 * @returns {Promise<Object>} - Movimientos y metadatos de paginación
 */
async function obtenerMovimientosLedger(client, cliente_id, options = {}) {
  const {
    page = 1,
    limit = 25,
    ordenar_por = 'fecha_movimiento',
    orden = 'DESC',
    tipo = '',
    fecha_desde = null,
    fecha_hasta = null
  } = options;
  
  let whereConditions = ['id_cliente = $1'];
  let params = [cliente_id];
  let paramIndex = 2;
  
  // Filtros
  if (tipo) {
    whereConditions.push(`tipo_movimiento = $${paramIndex}`);
    params.push(tipo);
    paramIndex++;
  }
  
  if (fecha_desde) {
    whereConditions.push(`fecha_movimiento >= $${paramIndex}`);
    params.push(fecha_desde);
    paramIndex++;
  }
  
  if (fecha_hasta) {
    whereConditions.push(`fecha_movimiento <= $${paramIndex}`);
    params.push(fecha_hasta);
    paramIndex++;
  }
  
  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
  
  // Validar orden
  const ordenValido = orden.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const campoOrden = ['fecha_movimiento', 'importe_bruto', 'saldo_posterior'].includes(ordenar_por) 
    ? ordenar_por 
    : 'fecha_movimiento';
  
  // Contar total
  const countQuery = `SELECT COUNT(*) as total FROM ledger ${whereClause}`;
  const countResult = await client.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);
  
  // Obtener datos paginados
  const offset = (page - 1) * limit;
  const dataQuery = `
    SELECT * FROM ledger 
    ${whereClause}
    ORDER BY ${campoOrden} ${ordenValido}, id ${ordenValido}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  
  params.push(parseInt(limit), offset);
  const dataResult = await client.query(dataQuery, params);
  
  return {
    movimientos: dataResult.rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

/**
 * Actualiza el LEDGER después de un nuevo movimiento
 * @param {Object} client - Cliente de base de datos
 * @param {number} cliente_id - ID del cliente
 * @param {Object} movimiento - Datos del nuevo movimiento
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function actualizarLedgerIncremental(client, cliente_id, movimiento) {
  try {
    console.log(`🔄 Actualizando LEDGER incremental para cliente ${cliente_id}...`);
    
    // Obtener información del cliente
    const clienteResult = await client.query(
      'SELECT plazo_acreditacion FROM clientes WHERE id = $1',
      [cliente_id]
    );
    
    if (clienteResult.rows.length === 0) {
      throw new Error(`Cliente ${cliente_id} no encontrado`);
    }
    
    const plazoAcreditacion = clienteResult.rows[0].plazo_acreditacion || 24;
    
    // Obtener el último saldo del LEDGER
    const ultimoSaldoResult = await client.query(`
      SELECT saldo_posterior 
      FROM ledger 
      WHERE id_cliente = $1 
      ORDER BY fecha_movimiento DESC, id DESC 
      LIMIT 1
    `, [cliente_id]);
    
    const saldoAnterior = ultimoSaldoResult.rows.length > 0 
      ? parseFloat(ultimoSaldoResult.rows[0].saldo_posterior || 0)
      : 0;
    
    // Calcular importe neto
    const importeNeto = parseFloat(movimiento.importe_bruto || 0) - parseFloat(movimiento.importe_comision || 0);
    
    // Determinar impacto en saldo
    let impactoSaldo = 0;
    if (movimiento.tipo_movimiento === 'acreditacion' || movimiento.tipo_movimiento === 'credito') {
      impactoSaldo = importeNeto;
    } else if (movimiento.tipo_movimiento === 'pago') {
      impactoSaldo = -importeNeto;
    }
    
    const saldoPosterior = saldoAnterior + impactoSaldo;
    
    // Determinar si está liberado
    let estaLib = false;
    let fechaLiberacion = null;
    
    if (movimiento.tipo_movimiento === 'acreditacion') {
      estaLib = estaLiberado(movimiento.fecha_movimiento, plazoAcreditacion);
      fechaLiberacion = calcularFechaLiberacion(movimiento.fecha_movimiento, plazoAcreditacion);
    } else if (movimiento.tipo_movimiento === 'credito' && movimiento.metadata?.metodo_pago === 'deposito') {
      estaLib = estaLiberado(movimiento.fecha_movimiento, plazoAcreditacion);
      fechaLiberacion = calcularFechaLiberacion(movimiento.fecha_movimiento, plazoAcreditacion);
    } else if (movimiento.tipo_movimiento === 'credito') {
      estaLib = true;
      fechaLiberacion = movimiento.fecha_movimiento;
    } else if (movimiento.tipo_movimiento === 'pago') {
      estaLib = true;
      fechaLiberacion = movimiento.fecha_movimiento;
    }
    
    // Insertar nueva entrada en LEDGER
    await client.query(`
      INSERT INTO ledger (
        id_cliente, fecha_movimiento, tipo_movimiento, id_movimiento, tabla_origen,
        concepto, importe_bruto, importe_neto, comision, importe_comision,
        saldo_anterior, saldo_posterior, esta_liberado, fecha_liberacion, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `, [
      cliente_id,
      movimiento.fecha_movimiento,
      movimiento.tipo_movimiento,
      movimiento.id_movimiento,
      movimiento.tabla_origen,
      movimiento.concepto,
      parseFloat(movimiento.importe_bruto || 0),
      importeNeto,
      parseFloat(movimiento.comision || 0),
      parseFloat(movimiento.importe_comision || 0),
      saldoAnterior,
      saldoPosterior,
      estaLib,
      fechaLiberacion,
      JSON.stringify(movimiento.metadata || {})
    ]);
    
    console.log(`✅ LEDGER actualizado para cliente ${cliente_id}: saldo ${saldoAnterior} → ${saldoPosterior}`);
    
    return {
      success: true,
      message: 'LEDGER actualizado exitosamente',
      data: {
        saldo_anterior: saldoAnterior,
        saldo_posterior: saldoPosterior,
        impacto: impactoSaldo
      }
    };
    
  } catch (error) {
    console.error(`❌ Error actualizando LEDGER para cliente ${cliente_id}:`, error);
    throw error;
  }
}

/**
 * Verifica la consistencia del LEDGER con las tablas originales
 * @param {Object} client - Cliente de base de datos
 * @param {number} cliente_id - ID del cliente
 * @returns {Promise<Object>} - Resultado de la verificación
 */
async function verificarConsistenciaLedger(client, cliente_id) {
  try {
    console.log(`🔍 Verificando consistencia del LEDGER para cliente ${cliente_id}...`);
    
    // Obtener movimientos del LEDGER
    const ledgerResult = await client.query(`
      SELECT COUNT(*) as total_ledger, 
             SUM(CASE WHEN esta_liberado THEN importe_neto ELSE 0 END) as total_liberado
      FROM ledger 
      WHERE id_cliente = $1
    `, [cliente_id]);
    
    // Obtener movimientos de las tablas originales
    const movimientos = await obtenerTodosLosMovimientos(client, cliente_id);
    
    // Verificar que coincidan los conteos
    const totalLedger = parseInt(ledgerResult.rows[0].total_ledger || 0);
    const totalOriginal = movimientos.length;
    
    const consistente = totalLedger === totalOriginal;
    
    return {
      success: true,
      consistente,
      data: {
        total_ledger: totalLedger,
        total_original: totalOriginal,
        diferencia: totalOriginal - totalLedger,
        ultimo_saldo_ledger: ledgerResult.rows[0].total_liberado || 0
      }
    };
    
  } catch (error) {
    console.error(`❌ Error verificando consistencia del LEDGER para cliente ${cliente_id}:`, error);
    throw error;
  }
}

module.exports = {
  generarLedgerCompleto,
  obtenerTodosLosMovimientos,
  obtenerSaldoDesdeLedger,
  obtenerMovimientosLedger,
  actualizarLedgerIncremental,
  verificarConsistenciaLedger
}; 