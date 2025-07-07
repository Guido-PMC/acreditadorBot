#!/usr/bin/env node

/**
 * Script de migración a LEDGER
 * Migra todos los datos existentes a la nueva tabla LEDGER
 */

const { Pool } = require('pg');
const ledgerUtils = require('./utils/ledger');

// Configuración de Railway
const pool = new Pool({
  host: 'nozomi.proxy.rlwy.net',
  port: 39888,
  database: 'railway',
  user: 'postgres',
  password: 'qxxDSdtjcfdBpkVonqkYHFIsjVvzFDNz' || '',
  ssl: { rejectUnauthorized: false }
});

// Wrapper para compatibilidad con el código existente
const db = {
  getClient: () => pool.connect(),
  disconnect: () => pool.end()
};

async function migrarALedger() {
  console.log('🚀 Iniciando migración a LEDGER...');
  console.log('⏰ Fecha y hora:', new Date().toISOString());
  
  const client = await db.getClient();
  
  try {
    // Verificar que la tabla LEDGER existe
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ledger'
      );
    `);
    
    if (!tableExists.rows[0].exists) {
      console.error('❌ La tabla LEDGER no existe. Ejecute primero la migración de base de datos.');
      process.exit(1);
    }
    
    console.log('✅ Tabla LEDGER encontrada');
    
    // Obtener estadísticas iniciales
    const statsInicial = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM acreditaciones) as total_acreditaciones,
        (SELECT COUNT(*) FROM comprobantes_whatsapp) as total_comprobantes,
        (SELECT COUNT(*) FROM pagos) as total_pagos,
        (SELECT COUNT(*) FROM clientes WHERE estado = 'activo') as total_clientes_activos,
        (SELECT COUNT(*) FROM ledger) as total_ledger_existente
    `);
    
    const stats = statsInicial.rows[0];
    console.log('\n📊 ESTADÍSTICAS INICIALES:');
    console.log(`   - Acreditaciones: ${stats.total_acreditaciones}`);
    console.log(`   - Comprobantes: ${stats.total_comprobantes}`);
    console.log(`   - Pagos: ${stats.total_pagos}`);
    console.log(`   - Clientes activos: ${stats.total_clientes_activos}`);
    console.log(`   - Registros LEDGER existentes: ${stats.total_ledger_existente}`);
    
    // Preguntar si limpiar LEDGER existente
    if (stats.total_ledger_existente > 0) {
      console.log('\n⚠️  Ya existen registros en el LEDGER.');
      console.log('   Esto sobrescribirá los datos existentes.');
      
      // En modo automático, limpiar
      console.log('🗑️  Limpiando LEDGER existente...');
      await client.query('DELETE FROM ledger');
      console.log('✅ LEDGER limpiado');
    }
    
    // Obtener todos los clientes activos
    const clientesResult = await client.query(
      'SELECT id, nombre, apellido FROM clientes WHERE estado = $1 ORDER BY id',
      ['activo']
    );
    
    const clientes = clientesResult.rows;
    console.log(`\n🔄 Procesando ${clientes.length} clientes...`);
    
    const resultados = [];
    const errores = [];
    let totalMovimientos = 0;
    
    for (let i = 0; i < clientes.length; i++) {
      const cliente = clientes[i];
      const nombreCliente = `${cliente.nombre} ${cliente.apellido || ''}`.trim();
      
      console.log(`\n[${i + 1}/${clientes.length}] Procesando cliente ${cliente.id}: ${nombreCliente}`);
      
      try {
        const resultado = await ledgerUtils.generarLedgerCompleto(client, cliente.id);
        
        resultados.push({
          cliente_id: cliente.id,
          nombre: nombreCliente,
          success: true,
          movimientos_procesados: resultado.data.movimientos_procesados,
          saldo_final: resultado.data.saldo_final
        });
        
        totalMovimientos += resultado.data.movimientos_procesados;
        
        console.log(`   ✅ ${resultado.data.movimientos_procesados} movimientos procesados`);
        console.log(`   💰 Saldo final: $${resultado.data.saldo_final.toLocaleString('es-AR')}`);
        
      } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        errores.push({
          cliente_id: cliente.id,
          nombre: nombreCliente,
          error: error.message
        });
      }
    }
    
    // Estadísticas finales
    const statsFinal = await client.query(`
      SELECT 
        COUNT(*) as total_registros_ledger,
        COUNT(DISTINCT id_cliente) as total_clientes_ledger,
        SUM(CASE WHEN esta_liberado THEN importe_neto ELSE 0 END) as total_liberado,
        SUM(CASE WHEN NOT esta_liberado THEN importe_neto ELSE 0 END) as total_no_liberado,
        AVG(importe_neto) as promedio_movimiento
      FROM ledger
    `);
    
    console.log('\n🎉 MIGRACIÓN COMPLETADA!');
    console.log('\n📈 ESTADÍSTICAS FINALES:');
    console.log(`   - Clientes procesados: ${resultados.length}`);
    console.log(`   - Errores: ${errores.length}`);
    console.log(`   - Total movimientos: ${totalMovimientos}`);
    console.log(`   - Registros en LEDGER: ${statsFinal.rows[0].total_registros_ledger}`);
    console.log(`   - Clientes en LEDGER: ${statsFinal.rows[0].total_clientes_ledger}`);
    console.log(`   - Total liberado: $${parseFloat(statsFinal.rows[0].total_liberado || 0).toLocaleString('es-AR')}`);
    console.log(`   - Total no liberado: $${parseFloat(statsFinal.rows[0].total_no_liberado || 0).toLocaleString('es-AR')}`);
    console.log(`   - Promedio por movimiento: $${parseFloat(statsFinal.rows[0].promedio_movimiento || 0).toLocaleString('es-AR')}`);
    
    if (errores.length > 0) {
      console.log('\n❌ ERRORES ENCONTRADOS:');
      errores.forEach(error => {
        console.log(`   - Cliente ${error.cliente_id} (${error.nombre}): ${error.error}`);
      });
    }
    
    // Verificar consistencia
    console.log('\n🔍 Verificando consistencia...');
    let inconsistencias = 0;
    
    for (const resultado of resultados) {
      try {
        const verificacion = await ledgerUtils.verificarConsistenciaLedger(client, resultado.cliente_id);
        if (!verificacion.consistente) {
          console.log(`   ⚠️  Cliente ${resultado.cliente_id}: Inconsistencia detectada`);
          inconsistencias++;
        }
      } catch (error) {
        console.log(`   ❌ Cliente ${resultado.cliente_id}: Error en verificación`);
        inconsistencias++;
      }
    }
    
    if (inconsistencias === 0) {
      console.log('✅ Todas las verificaciones de consistencia pasaron');
    } else {
      console.log(`⚠️  ${inconsistencias} inconsistencias detectadas`);
    }
    
    // Generar reporte
    const reporte = {
      fecha_migracion: new Date().toISOString(),
      estadisticas_iniciales: stats,
      estadisticas_finales: statsFinal.rows[0],
      resultados: {
        total_clientes: clientes.length,
        exitosos: resultados.length,
        errores: errores.length,
        total_movimientos: totalMovimientos
      },
      clientes_exitosos: resultados,
      clientes_con_errores: errores,
      inconsistencias
    };
    
    // Guardar reporte en logs
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'migracion_ledger',
      `Migración a LEDGER completada: ${resultados.length} clientes exitosos, ${errores.length} errores`,
      JSON.stringify(reporte),
      errores.length === 0 ? 'exitoso' : 'parcial'
    ]);
    
    console.log('\n📄 Reporte guardado en logs_procesamiento');
    console.log('\n✅ Migración completada exitosamente!');
    
  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    
    // Log del error
    try {
      await client.query(`
        INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado, error)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        'migracion_ledger_error',
        'Error durante migración a LEDGER',
        JSON.stringify({ error: error.message, stack: error.stack }),
        'error',
        error.message
      ]);
    } catch (logError) {
      console.error('Error guardando log:', logError);
    }
    
    process.exit(1);
  } finally {
    client.release();
    await db.disconnect();
  }
}

// Ejecutar migración
if (require.main === module) {
  migrarALedger()
    .then(() => {
      console.log('\n🎯 Script completado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Error fatal:', error);
      process.exit(1);
    });
}

module.exports = { migrarALedger }; 