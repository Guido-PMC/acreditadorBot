const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function debugClienteAcreditaciones() {
  await client.connect();
  
  try {
    console.log('🔍 DIAGNÓSTICO: Relación Clientes-Acreditaciones\n');

    // 1. Verificar acreditación específica ID 301
    console.log('1️⃣ Verificando acreditación ID 301:');
    const acreditacion301 = await client.query(`
      SELECT 
        a.id,
        a.titular,
        a.importe,
        a.id_comprobante_whatsapp,
        a.cotejado,
        a.id_cliente,
        c.nombre as cliente_nombre,
        c.apellido as cliente_apellido
      FROM acreditaciones a
      LEFT JOIN clientes c ON a.id_cliente = c.id
      WHERE a.id = 301
    `);
    
    if (acreditacion301.rows.length > 0) {
      const acred = acreditacion301.rows[0];
      console.log(`   Titular: ${acred.titular}`);
      console.log(`   Importe: $${acred.importe}`);
      console.log(`   Comprobante: ${acred.id_comprobante_whatsapp}`);
      console.log(`   Cotejado: ${acred.cotejado}`);
      console.log(`   ID Cliente: ${acred.id_cliente}`);
      console.log(`   Cliente: ${acred.cliente_nombre} ${acred.cliente_apellido || ''}`);
      
      // Buscar el comprobante relacionado
      if (acred.id_comprobante_whatsapp) {
        console.log(`\n   🔍 Buscando comprobante: ${acred.id_comprobante_whatsapp}`);
        const comprobante = await client.query(`
          SELECT 
            id,
            id_comprobante,
            nombre_remitente,
            importe,
            id_cliente,
            id_acreditacion,
            cl.nombre as comprobante_cliente_nombre,
            cl.apellido as comprobante_cliente_apellido
          FROM comprobantes_whatsapp cw
          LEFT JOIN clientes cl ON cw.id_cliente = cl.id
          WHERE cw.id_comprobante = $1
        `, [acred.id_comprobante_whatsapp]);
        
        if (comprobante.rows.length > 0) {
          const comp = comprobante.rows[0];
          console.log(`   📋 Comprobante encontrado:`);
          console.log(`      ID interno: ${comp.id}`);
          console.log(`      Remitente: ${comp.nombre_remitente}`);
          console.log(`      Importe: $${comp.importe}`);
          console.log(`      ID Cliente: ${comp.id_cliente}`);
          console.log(`      Cliente: ${comp.comprobante_cliente_nombre} ${comp.comprobante_cliente_apellido || ''}`);
          console.log(`      ID Acreditación: ${comp.id_acreditacion}`);
        } else {
          console.log(`   ❌ Comprobante NO encontrado`);
        }
      }
    } else {
      console.log(`   ❌ Acreditación 301 NO encontrada`);
    }

    // 2. Buscar acreditaciones cotejadas sin cliente
    console.log('\n2️⃣ Acreditaciones cotejadas SIN cliente:');
    const acreditacionesSinCliente = await client.query(`
      SELECT 
        a.id,
        a.titular,
        a.importe,
        a.id_comprobante_whatsapp,
        a.cotejado,
        a.id_cliente
      FROM acreditaciones a
      WHERE a.cotejado = true 
        AND a.id_comprobante_whatsapp IS NOT NULL
        AND a.id_cliente IS NULL
      ORDER BY a.id DESC
      LIMIT 10
    `);
    
    console.log(`   📊 Total encontradas: ${acreditacionesSinCliente.rows.length}`);
    
    for (const acred of acreditacionesSinCliente.rows) {
      console.log(`\n   🔍 Acreditación ${acred.id}:`);
      console.log(`      Titular: ${acred.titular}`);
      console.log(`      Comprobante: ${acred.id_comprobante_whatsapp}`);
      
      // Buscar el comprobante relacionado
      const comprobante = await client.query(`
        SELECT 
          id,
          id_cliente,
          nombre_remitente,
          cl.nombre as cliente_nombre,
          cl.apellido as cliente_apellido
        FROM comprobantes_whatsapp cw
        LEFT JOIN clientes cl ON cw.id_cliente = cl.id
        WHERE cw.id_comprobante = $1
      `, [acred.id_comprobante_whatsapp]);
      
      if (comprobante.rows.length > 0) {
        const comp = comprobante.rows[0];
        console.log(`      ✅ Comprobante encontrado - Cliente: ${comp.id_cliente} (${comp.cliente_nombre} ${comp.cliente_apellido || ''})`);
        
        if (comp.id_cliente) {
          console.log(`      🔧 PUEDE CORREGIRSE: Asignar cliente ${comp.id_cliente} a acreditación ${acred.id}`);
        }
      } else {
        console.log(`      ❌ Comprobante NO encontrado`);
      }
    }

    // 3. Verificar comprobantes sin acreditación asignada
    console.log('\n3️⃣ Comprobantes sin acreditación asignada:');
    const comprobantesSinAcreditacion = await client.query(`
      SELECT 
        cw.id,
        cw.id_comprobante,
        cw.nombre_remitente,
        cw.importe,
        cw.id_cliente,
        cw.id_acreditacion,
        cl.nombre as cliente_nombre
      FROM comprobantes_whatsapp cw
      LEFT JOIN clientes cl ON cw.id_cliente = cl.id
      WHERE cw.id_acreditacion IS NULL
      ORDER BY cw.id DESC
      LIMIT 5
    `);
    
    console.log(`   📊 Total encontrados: ${comprobantesSinAcreditacion.rows.length}`);
    comprobantesSinAcreditacion.rows.forEach(comp => {
      console.log(`   📋 ${comp.id_comprobante}: ${comp.nombre_remitente} - $${comp.importe} (Cliente: ${comp.cliente_nombre || 'Sin cliente'})`);
    });

    // 4. Estadísticas generales
    console.log('\n4️⃣ Estadísticas generales:');
    const stats = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM acreditaciones WHERE cotejado = true) as acreditaciones_cotejadas,
        (SELECT COUNT(*) FROM acreditaciones WHERE cotejado = true AND id_cliente IS NOT NULL) as acreditaciones_con_cliente,
        (SELECT COUNT(*) FROM acreditaciones WHERE cotejado = true AND id_cliente IS NULL) as acreditaciones_sin_cliente,
        (SELECT COUNT(*) FROM comprobantes_whatsapp WHERE id_acreditacion IS NOT NULL) as comprobantes_asignados,
        (SELECT COUNT(*) FROM comprobantes_whatsapp WHERE id_acreditacion IS NULL) as comprobantes_sin_asignar
    `);
    
    const s = stats.rows[0];
    console.log(`   📊 Acreditaciones cotejadas: ${s.acreditaciones_cotejadas}`);
    console.log(`   ✅ Con cliente asignado: ${s.acreditaciones_con_cliente}`);
    console.log(`   ❌ Sin cliente asignado: ${s.acreditaciones_sin_cliente}`);
    console.log(`   📋 Comprobantes asignados: ${s.comprobantes_asignados}`);
    console.log(`   ⏳ Comprobantes sin asignar: ${s.comprobantes_sin_asignar}`);

    console.log('\n✅ Diagnóstico completado');

  } catch (error) {
    console.error('❌ Error en diagnóstico:', error);
  } finally {
    await client.end();
  }
}

// Función para corregir automáticamente
async function corregirClientesAcreditaciones() {
  await client.connect();
  
  try {
    console.log('🔧 CORRECCIÓN: Asignando clientes a acreditaciones\n');

    // Buscar acreditaciones cotejadas sin cliente pero con comprobante
    const acreditacionesParaCorregir = await client.query(`
      SELECT 
        a.id as acreditacion_id,
        a.id_comprobante_whatsapp,
        cw.id_cliente as comprobante_cliente_id,
        cl.nombre as cliente_nombre
      FROM acreditaciones a
      JOIN comprobantes_whatsapp cw ON a.id_comprobante_whatsapp = cw.id_comprobante
      LEFT JOIN clientes cl ON cw.id_cliente = cl.id
      WHERE a.cotejado = true 
        AND a.id_cliente IS NULL
        AND cw.id_cliente IS NOT NULL
    `);

    console.log(`📊 Acreditaciones a corregir: ${acreditacionesParaCorregir.rows.length}`);

    let corregidas = 0;
    for (const acred of acreditacionesParaCorregir.rows) {
      try {
        await client.query(`
          UPDATE acreditaciones 
          SET id_cliente = $1
          WHERE id = $2
        `, [acred.comprobante_cliente_id, acred.acreditacion_id]);

        console.log(`✅ Acreditación ${acred.acreditacion_id} → Cliente ${acred.comprobante_cliente_id} (${acred.cliente_nombre})`);
        corregidas++;
      } catch (error) {
        console.error(`❌ Error corrigiendo acreditación ${acred.acreditacion_id}:`, error.message);
      }
    }

    console.log(`\n🎉 Corrección completada: ${corregidas} acreditaciones corregidas`);

  } catch (error) {
    console.error('❌ Error en corrección:', error);
  } finally {
    await client.end();
  }
}

// Ejecutar según argumento
const accion = process.argv[2];

if (accion === 'corregir') {
  corregirClientesAcreditaciones();
} else {
  debugClienteAcreditaciones();
} 