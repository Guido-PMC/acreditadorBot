const { Pool } = require('pg');
require('dotenv').config();

async function deleteNonTransferAcreditaciones() {
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

    // Primero, ver qué tipos de acreditaciones hay
    console.log('📊 Analizando tipos de acreditaciones...');
    const tiposResult = await pool.query(`
      SELECT tipo, COUNT(*) as cantidad 
      FROM acreditaciones 
      GROUP BY tipo 
      ORDER BY cantidad DESC
    `);
    
    console.log('📋 Tipos de acreditaciones encontradas:');
    tiposResult.rows.forEach(row => {
      console.log(`   - ${row.tipo}: ${row.cantidad} registros`);
    });

    // Contar cuántas NO son "transferencia entrante"
    const countResult = await pool.query(`
      SELECT COUNT(*) as count 
      FROM acreditaciones 
      WHERE LOWER(tipo) NOT LIKE '%transferencia entrante%'
    `);
    
    const cantidadABorrar = parseInt(countResult.rows[0].count);
    console.log(`\n🗑️ Acreditaciones a borrar (que NO son transferencia entrante): ${cantidadABorrar}`);

    if (cantidadABorrar === 0) {
      console.log('✅ No hay acreditaciones para borrar');
      return;
    }

    // Mostrar algunos ejemplos de lo que se va a borrar
    const ejemplosResult = await pool.query(`
      SELECT id, tipo, titular, importe, fecha_hora 
      FROM acreditaciones 
      WHERE LOWER(tipo) NOT LIKE '%transferencia entrante%'
      LIMIT 5
    `);
    
    console.log('\n📋 Ejemplos de acreditaciones que se borrarán:');
    ejemplosResult.rows.forEach(row => {
      console.log(`   - ID: ${row.id}, Tipo: "${row.tipo}", Titular: "${row.titular}", Importe: $${row.importe}`);
    });

    // Confirmar antes de borrar
    console.log('\n⚠️  ¿Estás seguro de que quieres borrar estas acreditaciones?');
    console.log('   Esto no se puede deshacer.');
    
    // En un script automático, procedemos directamente
    console.log('\n🗑️ Procediendo a borrar...');

    // Borrar acreditaciones que NO son transferencia entrante
    const deleteResult = await pool.query(`
      DELETE FROM acreditaciones 
      WHERE LOWER(tipo) NOT LIKE '%transferencia entrante%'
    `);

    console.log(`✅ Borradas ${deleteResult.rowCount} acreditaciones`);

    // Mostrar estado final
    const finalCountResult = await pool.query('SELECT COUNT(*) as count FROM acreditaciones');
    console.log(`📊 Estado final: ${finalCountResult.rows[0].count} acreditaciones restantes`);

    // Mostrar tipos restantes
    const tiposFinalesResult = await pool.query(`
      SELECT tipo, COUNT(*) as cantidad 
      FROM acreditaciones 
      GROUP BY tipo 
      ORDER BY cantidad DESC
    `);
    
    console.log('\n📋 Tipos de acreditaciones restantes:');
    tiposFinalesResult.rows.forEach(row => {
      console.log(`   - ${row.tipo}: ${row.cantidad} registros`);
    });

  } catch (error) {
    console.error('❌ Error al borrar acreditaciones:', error.message);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
      console.log('🔌 Conexión cerrada');
    }
  }
}

// Ejecutar el script
deleteNonTransferAcreditaciones(); 