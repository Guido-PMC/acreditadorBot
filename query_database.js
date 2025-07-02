require('dotenv').config();
const { Pool } = require('pg');

// Configuración directa de la base de datos Railway (tomada de bulk_import_interactive.js)
const pool = new Pool({
  host: 'nozomi.proxy.rlwy.net',
  port: 39888,
  database: 'railway',
  user: 'postgres',
  password: 'qxxDSdtjcfdBpkVonqkYHFIsjVvzFDNz',
  ssl: { rejectUnauthorized: false }
});

// Objeto de base de datos
const db = {
  async connect() {
    console.log('🔌 Conectando a Railway...');
    try {
      const client = await pool.connect();
      console.log('✅ Conexión a Railway establecida');
      client.release();
      return true;
    } catch (error) {
      console.error('❌ Error conectando a Railway:', error.message);
      throw error;
    }
  },
  
  async query(text, params) {
    return pool.query(text, params);
  },
  
  async disconnect() {
    await pool.end();
    console.log('🔌 Conexión a Railway cerrada');

    console.log('\n🔍 SCHEMA DE TABLA ACREDITACIONES (COLUMNAS DE COMPROBANTES):');
    console.log('======================================================================');

    const schemaQuery = `
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'acreditaciones' 
      AND column_name LIKE '%comprobante%'
      ORDER BY column_name
    `;

    try {
      await client.query('SELECT 1'); // Verificar conexión
      const schemaResult = await client.query(schemaQuery);
      
      if (schemaResult.rows.length > 0) {
        console.log('📋 Columnas relacionadas con comprobantes:');
        schemaResult.rows.forEach(row => {
          console.log(`   - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable}, default: ${row.column_default || 'NULL'})`);
        });
      } else {
        console.log('❌ No se encontraron columnas relacionadas con comprobantes');
      }
      
      // También verificar si existe la columna id_comprobante
      const allColumnsQuery = `
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'acreditaciones' 
        AND column_name IN ('id_comprobante', 'id_comprobante_whatsapp')
        ORDER BY column_name
      `;
      
      const allColumnsResult = await client.query(allColumnsQuery);
      console.log('\n📋 Columnas específicas de comprobante:');
      allColumnsResult.rows.forEach(row => {
        console.log(`   - ${row.column_name}: ${row.data_type}`);
      });
      
    } catch (error) {
      console.error('❌ Error consultando schema:', error.message);
    }
  }
};

async function analyzeDatabase() {
  try {
    await db.connect();
    
    console.log('\n📊 ANÁLISIS DE ACREDITACIONES EN LA BASE DE DATOS');
    console.log('='.repeat(70));
    
    // 1. Buscar 1 acreditación cargada por bulk import (fuente = 'historico')
    console.log('\n🔍 1. ACREDITACIÓN CARGADA VIA BULK IMPORT (fuente = "historico"):');
    const acredHistorica = await db.query(`
      SELECT id, id_transaccion, tipo, concepto, importe, estado, titular, cuit, 
             fecha_hora, fuente, id_cliente, comision, importe_comision, procesado, cotejado
      FROM acreditaciones 
      WHERE fuente = 'historico' 
      LIMIT 1
    `);
    
    if (acredHistorica.rows.length > 0) {
      const acred = acredHistorica.rows[0];
      console.log('   📄 Registro encontrado:');
      console.log(`   - ID: ${acred.id}`);
      console.log(`   - ID Transacción: ${acred.id_transaccion}`);
      console.log(`   - Tipo: ${acred.tipo}`);
      console.log(`   - Concepto: ${acred.concepto}`);
      console.log(`   - Importe: $${parseFloat(acred.importe).toLocaleString('es-AR')}`);
      console.log(`   - Estado: ${acred.estado}`);
      console.log(`   - Titular: ${acred.titular}`);
      console.log(`   - CUIT: ${acred.cuit}`);
      console.log(`   - Fecha/Hora: ${acred.fecha_hora}`);
      console.log(`   - Fuente: ${acred.fuente}`);
      console.log(`   - ID Cliente: ${acred.id_cliente}`);
      console.log(`   - Comisión: ${acred.comision}%`);
      console.log(`   - Importe Comisión: $${parseFloat(acred.importe_comision || 0).toLocaleString('es-AR')}`);
      console.log(`   - Procesado: ${acred.procesado}`);
      console.log(`   - Cotejado: ${acred.cotejado}`);
    } else {
      console.log('   ❌ No se encontraron acreditaciones con fuente = "historico"');
    }
    
    // 2. Buscar 1 acreditación NO cargada por bulk import
    console.log('\n🔍 2. ACREDITACIÓN NO CARGADA VIA BULK IMPORT (fuente != "historico"):');
    const acredNormal = await db.query(`
      SELECT id, id_transaccion, tipo, concepto, importe, estado, titular, cuit, 
             fecha_hora, fuente, id_cliente, comision, importe_comision, procesado, cotejado
      FROM acreditaciones 
      WHERE fuente != 'historico' OR fuente IS NULL
      LIMIT 1
    `);
    
    if (acredNormal.rows.length > 0) {
      const acred = acredNormal.rows[0];
      console.log('   📄 Registro encontrado:');
      console.log(`   - ID: ${acred.id}`);
      console.log(`   - ID Transacción: ${acred.id_transaccion}`);
      console.log(`   - Tipo: ${acred.tipo}`);
      console.log(`   - Concepto: ${acred.concepto}`);
      console.log(`   - Importe: $${parseFloat(acred.importe).toLocaleString('es-AR')}`);
      console.log(`   - Estado: ${acred.estado}`);
      console.log(`   - Titular: ${acred.titular}`);
      console.log(`   - CUIT: ${acred.cuit}`);
      console.log(`   - Fecha/Hora: ${acred.fecha_hora}`);
      console.log(`   - Fuente: ${acred.fuente || 'NULL'}`);
      console.log(`   - ID Cliente: ${acred.id_cliente || 'NULL'}`);
      console.log(`   - Comisión: ${acred.comision || 0}%`);
      console.log(`   - Importe Comisión: $${parseFloat(acred.importe_comision || 0).toLocaleString('es-AR')}`);
      console.log(`   - Procesado: ${acred.procesado}`);
      console.log(`   - Cotejado: ${acred.cotejado}`);
    } else {
      console.log('   ❌ No se encontraron acreditaciones con fuente != "historico"');
    }
    
    // 3. Buscar 1 pago cargado por bulk import
    console.log('\n🔍 3. PAGO CARGADO VIA BULK IMPORT (fuente = "historico"):');
    const pagoHistorico = await db.query(`
      SELECT id, id_cliente, concepto, importe, fecha_pago, tipo_pago, metodo_pago, 
             referencia, observaciones, estado, fecha_creacion, fuente
      FROM pagos 
      WHERE fuente = 'historico' 
      LIMIT 1
    `);
    
    if (pagoHistorico.rows.length > 0) {
      const pago = pagoHistorico.rows[0];
      console.log('   📄 Registro encontrado:');
      console.log(`   - ID: ${pago.id}`);
      console.log(`   - ID Cliente: ${pago.id_cliente}`);
      console.log(`   - Concepto: ${pago.concepto}`);
      console.log(`   - Importe: $${parseFloat(pago.importe).toLocaleString('es-AR')}`);
      console.log(`   - Fecha Pago: ${pago.fecha_pago}`);
      console.log(`   - Tipo Pago: ${pago.tipo_pago}`);
      console.log(`   - Método Pago: ${pago.metodo_pago}`);
      console.log(`   - Referencia: ${pago.referencia}`);
      console.log(`   - Observaciones: ${pago.observaciones || 'NULL'}`);
      console.log(`   - Estado: ${pago.estado}`);
      console.log(`   - Fecha Creación: ${pago.fecha_creacion}`);
      console.log(`   - Fuente: ${pago.fuente}`);
    } else {
      console.log('   ❌ No se encontraron pagos con fuente = "historico"');
    }
    
    // 4. Buscar 1 pago NO cargado por bulk import
    console.log('\n🔍 4. PAGO NO CARGADO VIA BULK IMPORT (fuente != "historico"):');
    const pagoNormal = await db.query(`
      SELECT id, id_cliente, concepto, importe, fecha_pago, tipo_pago, metodo_pago, 
             referencia, observaciones, estado, fecha_creacion, fuente
      FROM pagos 
      WHERE fuente != 'historico' OR fuente IS NULL
      LIMIT 1
    `);
    
    if (pagoNormal.rows.length > 0) {
      const pago = pagoNormal.rows[0];
      console.log('   📄 Registro encontrado:');
      console.log(`   - ID: ${pago.id}`);
      console.log(`   - ID Cliente: ${pago.id_cliente}`);
      console.log(`   - Concepto: ${pago.concepto}`);
      console.log(`   - Importe: $${parseFloat(pago.importe).toLocaleString('es-AR')}`);
      console.log(`   - Fecha Pago: ${pago.fecha_pago}`);
      console.log(`   - Tipo Pago: ${pago.tipo_pago}`);
      console.log(`   - Método Pago: ${pago.metodo_pago || 'NULL'}`);
      console.log(`   - Referencia: ${pago.referencia || 'NULL'}`);
      console.log(`   - Observaciones: ${pago.observaciones || 'NULL'}`);
      console.log(`   - Estado: ${pago.estado}`);
      console.log(`   - Fecha Creación: ${pago.fecha_creacion}`);
      console.log(`   - Fuente: ${pago.fuente || 'NULL'}`);
    } else {
      console.log('   ❌ No se encontraron pagos con fuente != "historico"');
    }
    
    // 5. Estadísticas generales
    console.log('\n📈 ESTADÍSTICAS GENERALES:');
    console.log('='.repeat(70));
    
    const statsAcred = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN fuente = 'historico' THEN 1 END) as historicas,
        COUNT(CASE WHEN fuente != 'historico' OR fuente IS NULL THEN 1 END) as normales
      FROM acreditaciones
    `);
    
    const statsPagos = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN fuente = 'historico' THEN 1 END) as historicos,
        COUNT(CASE WHEN fuente != 'historico' OR fuente IS NULL THEN 1 END) as normales
      FROM pagos
    `);
    
    const acredStats = statsAcred.rows[0];
    const pagoStats = statsPagos.rows[0];
    
    console.log(`📊 ACREDITACIONES:`);
    console.log(`   - Total: ${acredStats.total}`);
    console.log(`   - Históricas (bulk import): ${acredStats.historicas}`);
    console.log(`   - Normales (otras fuentes): ${acredStats.normales}`);
    
    console.log(`\n💳 PAGOS:`);
    console.log(`   - Total: ${pagoStats.total}`);
    console.log(`   - Históricos (bulk import): ${pagoStats.historicos}`);
    console.log(`   - Normales (otras fuentes): ${pagoStats.normales}`);
    
    // 6. Verificar si hay comprobantes_whatsapp
    console.log('\n🔍 5. COMPROBANTES WHATSAPP:');
    const comprobantes = await db.query(`
      SELECT COUNT(*) as total FROM comprobantes_whatsapp
    `);
    
    console.log(`   - Total comprobantes WhatsApp: ${comprobantes.rows[0].total}`);
    
    if (parseInt(comprobantes.rows[0].total) > 0) {
      const comprobante = await db.query(`
        SELECT id, id_comprobante, nombre_remitente, cuit, importe, fecha_envio, 
               fecha_recepcion, estado, procesado, cotejado, id_acreditacion, id_cliente
        FROM comprobantes_whatsapp 
        LIMIT 1
      `);
      
      if (comprobante.rows.length > 0) {
        const comp = comprobante.rows[0];
        console.log('   📄 Ejemplo de comprobante WhatsApp:');
        console.log(`   - ID: ${comp.id}`);
        console.log(`   - ID Comprobante: ${comp.id_comprobante}`);
        console.log(`   - Nombre Remitente: ${comp.nombre_remitente}`);
        console.log(`   - CUIT: ${comp.cuit}`);
        console.log(`   - Importe: $${parseFloat(comp.importe || 0).toLocaleString('es-AR')}`);
        console.log(`   - Fecha Envío: ${comp.fecha_envio}`);
        console.log(`   - Fecha Recepción: ${comp.fecha_recepcion}`);
        console.log(`   - Estado: ${comp.estado}`);
        console.log(`   - Procesado: ${comp.procesado}`);
        console.log(`   - Cotejado: ${comp.cotejado}`);
        console.log(`   - ID Acreditación: ${comp.id_acreditacion || 'NULL'}`);
        console.log(`   - ID Cliente: ${comp.id_cliente || 'NULL'}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await db.disconnect();
  }
}

// Ejecutar
if (require.main === module) {
  analyzeDatabase()
    .then(() => {
      console.log('\n✅ Análisis completado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error fatal:', error);
      process.exit(1);
    });
}

module.exports = { analyzeDatabase }; 