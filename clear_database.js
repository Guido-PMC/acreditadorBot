const { Pool } = require('pg');
require('dotenv').config();

async function clearDatabase() {
  let pool;
  
  try {
    // Crear conexión a la base de datos PostgreSQL
    pool = new Pool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT || 5432,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    console.log('🔗 Conectado a la base de datos PostgreSQL');

    // Limpiar tabla de comprobantes de WhatsApp
    console.log('🗑️ Limpiando tabla comprobantes_whatsapp...');
    try {
      await pool.query('DELETE FROM comprobantes_whatsapp');
      console.log('✅ Tabla comprobantes_whatsapp limpiada');
    } catch (err) {
      console.error('❌ Error al limpiar comprobantes_whatsapp:', err);
      throw err;
    }

    // Limpiar tabla de acreditaciones
    console.log('🗑️ Limpiando tabla acreditaciones...');
    try {
      await pool.query('DELETE FROM acreditaciones');
      console.log('✅ Tabla acreditaciones limpiada');
    } catch (err) {
      console.error('❌ Error al limpiar acreditaciones:', err);
      throw err;
    }

    // Resetear secuencias en PostgreSQL
    console.log('🔄 Reseteando secuencias...');
    await pool.query('ALTER SEQUENCE comprobantes_whatsapp_id_seq RESTART WITH 1');
    await pool.query('ALTER SEQUENCE acreditaciones_id_seq RESTART WITH 1');
    console.log('✅ Secuencias reseteadas');

    console.log('🎉 Base de datos limpiada exitosamente');
    console.log('📊 Estado actual:');
    
    // Mostrar conteo de registros
    const comprobantesResult = await pool.query('SELECT COUNT(*) as count FROM comprobantes_whatsapp');
    const acreditacionesResult = await pool.query('SELECT COUNT(*) as count FROM acreditaciones');
    
    console.log(`   - Comprobantes WhatsApp: ${comprobantesResult.rows[0].count} registros`);
    console.log(`   - Acreditaciones: ${acreditacionesResult.rows[0].count} registros`);

  } catch (error) {
    console.error('❌ Error al limpiar la base de datos:', error.message);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
      console.log('🔌 Conexión cerrada');
    }
  }
}

// Ejecutar el script
clearDatabase(); 