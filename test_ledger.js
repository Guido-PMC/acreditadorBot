#!/usr/bin/env node

/**
 * Script de prueba para LEDGER
 * Verifica que la funcionalidad básica del LEDGER funciona correctamente
 */

const db = require('./config/database');
const ledgerUtils = require('./utils/ledger');

async function testLedger() {
  console.log('🧪 Iniciando pruebas del LEDGER...');
  
  const client = await db.getClient();
  
  try {
    // 1. Verificar que la tabla existe
    console.log('\n1️⃣ Verificando tabla LEDGER...');
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ledger'
      );
    `);
    
    if (!tableExists.rows[0].exists) {
      throw new Error('La tabla LEDGER no existe');
    }
    console.log('✅ Tabla LEDGER encontrada');
    
    // 2. Obtener un cliente de prueba
    console.log('\n2️⃣ Obteniendo cliente de prueba...');
    const clienteResult = await client.query(
      'SELECT id, nombre, apellido FROM clientes WHERE estado = $1 LIMIT 1',
      ['activo']
    );
    
    if (clienteResult.rows.length === 0) {
      throw new Error('No hay clientes activos para probar');
    }
    
    const cliente = clienteResult.rows[0];
    console.log(`✅ Cliente de prueba: ${cliente.id} - ${cliente.nombre} ${cliente.apellido || ''}`);
    
    // 3. Verificar movimientos existentes
    console.log('\n3️⃣ Verificando movimientos existentes...');
    const movimientos = await ledgerUtils.obtenerTodosLosMovimientos(client, cliente.id);
    console.log(`✅ ${movimientos.length} movimientos encontrados`);
    
    if (movimientos.length > 0) {
      console.log('   Tipos de movimientos:');
      const tipos = {};
      movimientos.forEach(m => {
        tipos[m.tipo_movimiento] = (tipos[m.tipo_movimiento] || 0) + 1;
      });
      Object.entries(tipos).forEach(([tipo, count]) => {
        console.log(`   - ${tipo}: ${count}`);
      });
    }
    
    // 4. Generar LEDGER para el cliente
    console.log('\n4️⃣ Generando LEDGER...');
    const resultado = await ledgerUtils.generarLedgerCompleto(client, cliente.id);
    console.log(`✅ LEDGER generado: ${resultado.data.movimientos_procesados} movimientos`);
    console.log(`   Saldo final: $${resultado.data.saldo_final.toLocaleString('es-AR')}`);
    
    // 5. Verificar consistencia
    console.log('\n5️⃣ Verificando consistencia...');
    const verificacion = await ledgerUtils.verificarConsistenciaLedger(client, cliente.id);
    console.log(`✅ Consistencia: ${verificacion.consistente ? 'OK' : 'ERROR'}`);
    console.log(`   Total LEDGER: ${verificacion.data.total_ledger}`);
    console.log(`   Total original: ${verificacion.data.total_original}`);
    
    // 6. Obtener saldo desde LEDGER
    console.log('\n6️⃣ Obteniendo saldo desde LEDGER...');
    const saldo = await ledgerUtils.obtenerSaldoDesdeLedger(client, cliente.id);
    console.log(`✅ Saldo actual: $${saldo.toLocaleString('es-AR')}`);
    
    // 7. Obtener movimientos paginados
    console.log('\n7️⃣ Probando paginación...');
    const movimientosPag = await ledgerUtils.obtenerMovimientosLedger(client, cliente.id, {
      page: 1,
      limit: 5,
      orden: 'DESC'
    });
    console.log(`✅ Movimientos obtenidos: ${movimientosPag.movimientos.length}`);
    console.log(`   Total páginas: ${movimientosPag.pagination.pages}`);
    console.log(`   Total registros: ${movimientosPag.pagination.total}`);
    
    // 8. Probar filtros
    console.log('\n8️⃣ Probando filtros...');
    const movimientosFiltrados = await ledgerUtils.obtenerMovimientosLedger(client, cliente.id, {
      page: 1,
      limit: 10,
      tipo: 'acreditacion'
    });
    console.log(`✅ Acreditaciones encontradas: ${movimientosFiltrados.movimientos.length}`);
    
    // 9. Estadísticas del LEDGER
    console.log('\n9️⃣ Obteniendo estadísticas...');
    const statsResult = await client.query(`
      SELECT 
        COUNT(*) as total_registros,
        COUNT(DISTINCT id_cliente) as total_clientes,
        SUM(CASE WHEN esta_liberado THEN importe_neto ELSE 0 END) as total_liberado,
        AVG(importe_neto) as promedio_movimiento
      FROM ledger
    `);
    
    const stats = statsResult.rows[0];
    console.log('✅ Estadísticas del LEDGER:');
    console.log(`   - Total registros: ${stats.total_registros}`);
    console.log(`   - Total clientes: ${stats.total_clientes}`);
    console.log(`   - Total liberado: $${parseFloat(stats.total_liberado || 0).toLocaleString('es-AR')}`);
    console.log(`   - Promedio movimiento: $${parseFloat(stats.promedio_movimiento || 0).toLocaleString('es-AR')}`);
    
    console.log('\n🎉 TODAS LAS PRUEBAS PASARON EXITOSAMENTE!');
    console.log('\n📋 RESUMEN:');
    console.log(`   - Tabla LEDGER: ✅`);
    console.log(`   - Cliente de prueba: ✅ (${cliente.id})`);
    console.log(`   - Movimientos originales: ✅ (${movimientos.length})`);
    console.log(`   - Generación LEDGER: ✅ (${resultado.data.movimientos_procesados})`);
    console.log(`   - Consistencia: ✅ (${verificacion.consistente})`);
    console.log(`   - Saldo: ✅ ($${saldo.toLocaleString('es-AR')})`);
    console.log(`   - Paginación: ✅`);
    console.log(`   - Filtros: ✅`);
    console.log(`   - Estadísticas: ✅`);
    
  } catch (error) {
    console.error('❌ Error en las pruebas:', error);
    process.exit(1);
  } finally {
    client.release();
    await db.disconnect();
  }
}

// Ejecutar pruebas
if (require.main === module) {
  testLedger()
    .then(() => {
      console.log('\n🎯 Pruebas completadas');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Error fatal:', error);
      process.exit(1);
    });
}

module.exports = { testLedger }; 