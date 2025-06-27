const db = require('./config/database');

async function fixIdCliente() {
  const client = await db.getClient();
  
  try {
    console.log('🔧 Iniciando corrección de tipos de datos en id_cliente...');
    
    // Verificar el tipo actual de id_cliente en comprobantes_whatsapp
    const comprobantesType = await client.query(`
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_name = 'comprobantes_whatsapp' AND column_name = 'id_cliente'
    `);
    
    console.log('📊 Tipo actual de id_cliente en comprobantes_whatsapp:', comprobantesType.rows[0]?.data_type);
    
    if (comprobantesType.rows.length > 0 && comprobantesType.rows[0].data_type === 'character varying') {
      console.log('🔄 Convirtiendo id_cliente en comprobantes_whatsapp...');
      
      // Crear columna temporal
      await client.query(`
        ALTER TABLE comprobantes_whatsapp 
        ADD COLUMN id_cliente_temp INTEGER
      `);
      
      // Convertir datos existentes
      await client.query(`
        UPDATE comprobantes_whatsapp 
        SET id_cliente_temp = CASE 
          WHEN id_cliente ~ '^[0-9]+$' THEN id_cliente::INTEGER 
          ELSE NULL 
        END
      `);
      
      // Eliminar columna antigua y renombrar la nueva
      await client.query(`
        ALTER TABLE comprobantes_whatsapp 
        DROP COLUMN id_cliente
      `);
      
      await client.query(`
        ALTER TABLE comprobantes_whatsapp 
        RENAME COLUMN id_cliente_temp TO id_cliente
      `);
      
      // Agregar foreign key si no existe
      try {
        await client.query(`
          ALTER TABLE comprobantes_whatsapp 
          ADD CONSTRAINT fk_comprobantes_cliente 
          FOREIGN KEY (id_cliente) REFERENCES clientes(id)
        `);
      } catch (error) {
        console.log('⚠️  Foreign key ya existe o no se pudo crear');
      }
      
      console.log('✅ Conversión de comprobantes_whatsapp completada');
    }
    
    // Verificar el tipo actual de id_cliente en pagos
    const pagosType = await client.query(`
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_name = 'pagos' AND column_name = 'id_cliente'
    `);
    
    console.log('📊 Tipo actual de id_cliente en pagos:', pagosType.rows[0]?.data_type);
    
    if (pagosType.rows.length > 0 && pagosType.rows[0].data_type === 'character varying') {
      console.log('🔄 Convirtiendo id_cliente en pagos...');
      
      // Crear columna temporal
      await client.query(`
        ALTER TABLE pagos 
        ADD COLUMN id_cliente_temp INTEGER
      `);
      
      // Convertir datos existentes
      await client.query(`
        UPDATE pagos 
        SET id_cliente_temp = CASE 
          WHEN id_cliente ~ '^[0-9]+$' THEN id_cliente::INTEGER 
          ELSE NULL 
        END
      `);
      
      // Eliminar columna antigua y renombrar la nueva
      await client.query(`
        ALTER TABLE pagos 
        DROP COLUMN id_cliente
      `);
      
      await client.query(`
        ALTER TABLE pagos 
        RENAME COLUMN id_cliente_temp TO id_cliente
      `);
      
      // Agregar foreign key si no existe
      try {
        await client.query(`
          ALTER TABLE pagos 
          ADD CONSTRAINT fk_pagos_cliente 
          FOREIGN KEY (id_cliente) REFERENCES clientes(id)
        `);
      } catch (error) {
        console.log('⚠️  Foreign key ya existe o no se pudo crear');
      }
      
      console.log('✅ Conversión de pagos completada');
    }
    
    // Verificar el tipo actual de id_cliente en acreditaciones
    const acreditacionesType = await client.query(`
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_name = 'acreditaciones' AND column_name = 'id_cliente'
    `);
    
    console.log('📊 Tipo actual de id_cliente en acreditaciones:', acreditacionesType.rows[0]?.data_type);
    
    if (acreditacionesType.rows.length > 0 && acreditacionesType.rows[0].data_type === 'character varying') {
      console.log('🔄 Convirtiendo id_cliente en acreditaciones...');
      
      // Crear columna temporal
      await client.query(`
        ALTER TABLE acreditaciones 
        ADD COLUMN id_cliente_temp INTEGER
      `);
      
      // Convertir datos existentes
      await client.query(`
        UPDATE acreditaciones 
        SET id_cliente_temp = CASE 
          WHEN id_cliente ~ '^[0-9]+$' THEN id_cliente::INTEGER 
          ELSE NULL 
        END
      `);
      
      // Eliminar columna antigua y renombrar la nueva
      await client.query(`
        ALTER TABLE acreditaciones 
        DROP COLUMN id_cliente
      `);
      
      await client.query(`
        ALTER TABLE acreditaciones 
        RENAME COLUMN id_cliente_temp TO id_cliente
      `);
      
      // Agregar foreign key si no existe
      try {
        await client.query(`
          ALTER TABLE acreditaciones 
          ADD CONSTRAINT fk_acreditaciones_cliente 
          FOREIGN KEY (id_cliente) REFERENCES clientes(id)
        `);
      } catch (error) {
        console.log('⚠️  Foreign key ya existe o no se pudo crear');
      }
      
      console.log('✅ Conversión de acreditaciones completada');
    }
    
    console.log('🎉 Corrección de tipos de datos completada exitosamente!');
    
  } catch (error) {
    console.error('❌ Error corrigiendo tipos de datos:', error);
  } finally {
    client.release();
    await db.disconnect();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  fixIdCliente();
}

module.exports = { fixIdCliente }; 