require('dotenv').config();
const { Pool } = require('pg');

// Configuración de la base de datos
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixComisionesCotejadas() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 === DIAGNÓSTICO DE COMISIONES FALTANTES ===');
    
    // 1. Buscar acreditaciones cotejadas sin comisión calculada
    const acreditacionesSinComision = await client.query(`
      SELECT 
        a.id,
        a.id_transaccion,
        a.titular,
        a.importe,
        a.cotejado,
        a.id_cliente,
        a.comision,
        a.importe_comision,
        c.nombre as cliente_nombre,
        c.apellido as cliente_apellido,
        c.comision as cliente_comision
      FROM acreditaciones a
      LEFT JOIN clientes c ON a.id_cliente = c.id
      WHERE a.cotejado = true 
        AND a.id_cliente IS NOT NULL
        AND (a.comision = 0 OR a.importe_comision = 0 OR a.comision IS NULL OR a.importe_comision IS NULL)
      ORDER BY a.fecha_hora DESC
    `);

    console.log(`📊 Acreditaciones cotejadas sin comisión: ${acreditacionesSinComision.rows.length}`);
    
    if (acreditacionesSinComision.rows.length === 0) {
      console.log('✅ No hay acreditaciones que necesiten corrección de comisiones');
      return;
    }

    // Mostrar las primeras 10 para revisión
    console.log('\n📋 Primeras 10 acreditaciones a corregir:');
    acreditacionesSinComision.rows.slice(0, 10).forEach((acred, index) => {
      console.log(`${index + 1}. ID: ${acred.id}, Cliente: ${acred.cliente_nombre} ${acred.cliente_apellido}, Importe: $${acred.importe}, Comisión cliente: ${acred.cliente_comision}%`);
    });

    // Preguntar confirmación
    console.log(`\n⚠️  Se van a corregir ${acreditacionesSinComision.rows.length} acreditaciones`);
    console.log('Presiona Ctrl+C para cancelar o Enter para continuar...');
    
    // En Railway no hay interacción, así que procedemos automáticamente
    if (process.env.NODE_ENV === 'production') {
      console.log('🚀 Ejecutando en producción, procediendo automáticamente...');
    } else {
      // En desarrollo, esperar input
      await new Promise(resolve => {
        process.stdin.once('data', resolve);
      });
    }

    console.log('\n🔧 === INICIANDO CORRECCIÓN ===');
    
    let corregidas = 0;
    let errores = 0;

    // Procesar cada acreditación
    for (const acred of acreditacionesSinComision.rows) {
      try {
        const comision_cliente = parseFloat(acred.cliente_comision) || 0.00;
        const importe = parseFloat(acred.importe);
        const importe_comision = (importe * comision_cliente / 100);

        console.log(`🔄 Corrigiendo acreditación ${acred.id}: ${comision_cliente}% sobre $${importe} = $${importe_comision.toFixed(2)}`);

        // Actualizar la acreditación
        await client.query(`
          UPDATE acreditaciones 
          SET comision = $1, importe_comision = $2
          WHERE id = $3
        `, [comision_cliente, importe_comision, acred.id]);

        corregidas++;
        
        // Log cada 10 correcciones
        if (corregidas % 10 === 0) {
          console.log(`📊 Progreso: ${corregidas}/${acreditacionesSinComision.rows.length} corregidas`);
        }

      } catch (error) {
        console.error(`❌ Error corrigiendo acreditación ${acred.id}:`, error.message);
        errores++;
      }
    }

    console.log('\n✅ === CORRECCIÓN COMPLETADA ===');
    console.log(`✅ Acreditaciones corregidas: ${corregidas}`);
    console.log(`❌ Errores: ${errores}`);
    
    // Verificar resultados
    const verificacion = await client.query(`
      SELECT COUNT(*) as count
      FROM acreditaciones 
      WHERE cotejado = true 
        AND id_cliente IS NOT NULL
        AND (comision = 0 OR importe_comision = 0 OR comision IS NULL OR importe_comision IS NULL)
    `);

    console.log(`📊 Acreditaciones restantes sin comisión: ${verificacion.rows[0].count}`);

    // Mostrar resumen de comisiones
    const resumenComisiones = await client.query(`
      SELECT 
        COUNT(*) as total_cotejadas,
        SUM(importe) as total_importe,
        SUM(importe_comision) as total_comisiones,
        AVG(comision) as comision_promedio
      FROM acreditaciones 
      WHERE cotejado = true AND id_cliente IS NOT NULL
    `);

    if (resumenComisiones.rows.length > 0) {
      const resumen = resumenComisiones.rows[0];
      console.log('\n📈 === RESUMEN FINAL ===');
      console.log(`📊 Total acreditaciones cotejadas: ${resumen.total_cotejadas}`);
      console.log(`💰 Total importe: $${parseFloat(resumen.total_importe || 0).toLocaleString()}`);
      console.log(`💸 Total comisiones: $${parseFloat(resumen.total_comisiones || 0).toLocaleString()}`);
      console.log(`📊 Comisión promedio: ${parseFloat(resumen.comision_promedio || 0).toFixed(2)}%`);
    }

  } catch (error) {
    console.error('❌ Error ejecutando script:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  fixComisionesCotejadas().catch(console.error);
}

module.exports = { fixComisionesCotejadas }; 