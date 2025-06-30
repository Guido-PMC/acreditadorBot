const { Client } = require('pg');

const client = new Client({
  user: 'postgres',
  host: 'nozomi.proxy.rlwy.net',
  database: 'railway',
  password: 'qxxDSdtjcfdBpkVonqkYHFIsjVvzFDNz',
  port: 39888,
  ssl: { rejectUnauthorized: false }
});

async function fixAcreditacionesClientes() {
  await client.connect();
  try {
    console.log('🔧 Iniciando corrección de clientes en acreditaciones...');
    // Buscar acreditaciones que tienen comprobante pero no cliente
    const acreditacionesSinCliente = await client.query(`
      SELECT 
        a.id,
        a.titular,
        a.cuit,
        a.importe,
        a.id_comprobante_whatsapp,
        a.cotejado,
        cw.id_cliente as comprobante_cliente_id,
        cl.nombre as cliente_nombre,
        cl.apellido as cliente_apellido
      FROM acreditaciones a
      JOIN comprobantes_whatsapp cw ON a.id_comprobante_whatsapp = cw.id_comprobante
      LEFT JOIN clientes cl ON cw.id_cliente = cl.id
      WHERE a.id_cliente IS NULL 
        AND a.id_comprobante_whatsapp IS NOT NULL
        AND a.cotejado = true
      ORDER BY a.id DESC
    `);
    
    console.log(`📊 Acreditaciones encontradas sin cliente: ${acreditacionesSinCliente.rows.length}`);
    if (acreditacionesSinCliente.rows.length === 0) {
      console.log('✅ No hay acreditaciones que necesiten corrección');
      return;
    }
    let corregidas = 0;
    let errores = 0;
    for (const acreditacion of acreditacionesSinCliente.rows) {
      try {
        console.log(`\n🔍 Procesando acreditación ${acreditacion.id}:`);
        console.log(`   Titular: ${acreditacion.titular}`);
        console.log(`   CUIT: ${acreditacion.cuit}`);
        console.log(`   Comprobante: ${acreditacion.id_comprobante_whatsapp}`);
        console.log(`   Cliente del comprobante: ${acreditacion.comprobante_cliente_id}`);
        console.log(`   Nombre del cliente: ${acreditacion.cliente_nombre} ${acreditacion.cliente_apellido}`);
        if (acreditacion.comprobante_cliente_id) {
          // Actualizar la acreditación con el cliente del comprobante
          await client.query(`
            UPDATE acreditaciones 
            SET id_cliente = $1
            WHERE id = $2
          `, [acreditacion.comprobante_cliente_id, acreditacion.id]);
          console.log(`   ✅ Cliente asignado: ${acreditacion.comprobante_cliente_id}`);
          corregidas++;
        } else {
          console.log(`   ⚠️ Comprobante no tiene cliente asignado`);
          errores++;
        }
      } catch (error) {
        console.error(`   ❌ Error procesando acreditación ${acreditacion.id}:`, error.message);
        errores++;
      }
    }
    console.log(`\n🎉 Corrección completada:`);
    console.log(`   ✅ Acreditaciones corregidas: ${corregidas}`);
    console.log(`   ❌ Errores: ${errores}`);
    // Verificar el resultado
    const verificacion = await client.query(`
      SELECT COUNT(*) as total_sin_cliente
      FROM acreditaciones 
      WHERE id_cliente IS NULL 
        AND id_comprobante_whatsapp IS NOT NULL
        AND cotejado = true
    `);
    console.log(`📊 Acreditaciones sin cliente después de la corrección: ${verificacion.rows[0].total_sin_cliente}`);
  } catch (error) {
    console.error('❌ Error corrigiendo acreditaciones:', error);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  fixAcreditacionesClientes();
}

module.exports = { fixAcreditacionesClientes }; 