const { Pool } = require('pg');

// Configuración de la base de datos
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function updateDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Actualizando estructura de la base de datos...');
    
    // Eliminar columnas que no se usan de comprobantes_whatsapp
    console.log('🗑️ Eliminando columnas no utilizadas de comprobantes_whatsapp...');
    
    try {
      await client.query('ALTER TABLE comprobantes_whatsapp DROP COLUMN IF EXISTS numero_telefono');
      console.log('✅ Columna numero_telefono eliminada');
    } catch (error) {
      console.log('⚠️ Error eliminando numero_telefono:', error.message);
    }
    
    try {
      await client.query('ALTER TABLE comprobantes_whatsapp DROP COLUMN IF EXISTS archivo_url');
      console.log('✅ Columna archivo_url eliminada');
    } catch (error) {
      console.log('⚠️ Error eliminando archivo_url:', error.message);
    }
    
    try {
      await client.query('ALTER TABLE comprobantes_whatsapp DROP COLUMN IF EXISTS texto_mensaje');
      console.log('✅ Columna texto_mensaje eliminada');
    } catch (error) {
      console.log('⚠️ Error eliminando texto_mensaje:', error.message);
    }
    
    try {
      await client.query('ALTER TABLE comprobantes_whatsapp DROP COLUMN IF EXISTS observaciones');
      console.log('✅ Columna observaciones eliminada');
    } catch (error) {
      console.log('⚠️ Error eliminando observaciones:', error.message);
    }
    
    // Agregar columna CUIT si no existe
    console.log('➕ Verificando columna CUIT...');
    const cuitExists = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'comprobantes_whatsapp' 
      AND column_name = 'cuit'
    `);
    
    if (cuitExists.rows.length === 0) {
      await client.query('ALTER TABLE comprobantes_whatsapp ADD COLUMN cuit VARCHAR(20)');
      console.log('✅ Columna CUIT agregada');
    } else {
      console.log('ℹ️ Columna CUIT ya existe');
    }
    
    // Limpiar CUIT existente en comprobantes_whatsapp (quitar guiones)
    console.log('🧹 Limpiando CUIT existente en comprobantes_whatsapp...');
    const comprobantesWithCUIT = await client.query(`
      SELECT id, cuit FROM comprobantes_whatsapp WHERE cuit IS NOT NULL AND cuit != ''
    `);
    
    for (const comprobante of comprobantesWithCUIT.rows) {
      const cuitLimpio = comprobante.cuit.replace(/[^0-9]/g, '');
      if (cuitLimpio !== comprobante.cuit) {
        await client.query(`
          UPDATE comprobantes_whatsapp SET cuit = $1 WHERE id = $2
        `, [cuitLimpio, comprobante.id]);
        console.log(`✅ CUIT limpiado para comprobante ${comprobante.id}: ${comprobante.cuit} → ${cuitLimpio}`);
      }
    }
    
    // Limpiar CUIT existente en acreditaciones (quitar guiones)
    console.log('🧹 Limpiando CUIT existente en acreditaciones...');
    const acreditacionesWithCUIT = await client.query(`
      SELECT id, cuit FROM acreditaciones WHERE cuit IS NOT NULL AND cuit != ''
    `);
    
    for (const acreditacion of acreditacionesWithCUIT.rows) {
      const cuitLimpio = acreditacion.cuit.replace(/[^0-9]/g, '');
      if (cuitLimpio !== acreditacion.cuit) {
        await client.query(`
          UPDATE acreditaciones SET cuit = $1 WHERE id = $2
        `, [cuitLimpio, acreditacion.id]);
        console.log(`✅ CUIT limpiado para acreditación ${acreditacion.id}: ${acreditacion.cuit} → ${cuitLimpio}`);
      }
    }
    
    console.log('✅ Actualización de la base de datos completada');
    
  } catch (error) {
    console.error('❌ Error actualizando la base de datos:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  updateDatabase()
    .then(() => {
      console.log('🎉 Script completado exitosamente');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Error en el script:', error);
      process.exit(1);
    });
}

module.exports = { updateDatabase }; 