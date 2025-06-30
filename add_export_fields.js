const db = require('./config/database');

async function addExportFields() {
  await db.connect();
  const client = await db.getClient();
  
  try {
    console.log('🔧 Agregando campos de exportación a la tabla clientes...');
    
    // Verificar si los campos ya existen
    const checkFields = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'clientes' 
      AND column_name IN ('export_user', 'export_password')
    `);
    
    const existingFields = checkFields.rows.map(row => row.column_name);
    
    if (!existingFields.includes('export_user')) {
      await client.query(`
        ALTER TABLE clientes 
        ADD COLUMN export_user VARCHAR(50)
      `);
      console.log('✅ Campo export_user agregado');
    } else {
      console.log('ℹ️ Campo export_user ya existe');
    }
    
    if (!existingFields.includes('export_password')) {
      await client.query(`
        ALTER TABLE clientes 
        ADD COLUMN export_password VARCHAR(100)
      `);
      console.log('✅ Campo export_password agregado');
    } else {
      console.log('ℹ️ Campo export_password ya existe');
    }
    
    // Configurar credenciales para el cliente "cripto" (ID: 10)
    const updateResult = await client.query(`
      UPDATE clientes 
      SET export_user = $1, export_password = $2 
      WHERE id = $3
    `, ['cripto_export', 'cripto123!', 10]);
    
    if (updateResult.rowCount > 0) {
      console.log('✅ Credenciales de exportación configuradas para cliente "cripto"');
      console.log('📋 Usuario: cripto_export');
      console.log('🔑 Contraseña: cripto123!');
    } else {
      console.log('⚠️ No se encontró el cliente con ID 10');
    }
    
    console.log('🎉 Migración completada exitosamente');
    
  } catch (error) {
    console.error('❌ Error en la migración:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  addExportFields()
    .then(() => {
      console.log('✅ Script completado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error:', error);
      process.exit(1);
    });
}

module.exports = addExportFields; 