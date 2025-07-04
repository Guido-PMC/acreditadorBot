const db = require('./config/database');

async function debugTimezoneAcreditaciones() {
  console.log('🔍 Debugging timezone de acreditaciones...');
  
  try {
    await db.connect();
    const client = await db.getClient();
    
    // Verificar el tipo de columna fecha_hora
    const columnInfo = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'acreditaciones' AND column_name = 'fecha_hora'
    `);
    
    console.log('📊 Información de columna fecha_hora:');
    console.log(columnInfo.rows[0]);
    
    // Obtener algunas acreditaciones de ejemplo
    const acreditaciones = await client.query(`
      SELECT id, titular, importe, fecha_hora,
             fecha_hora::text as fecha_hora_text,
             fecha_hora AT TIME ZONE 'UTC' as fecha_hora_utc,
             fecha_hora AT TIME ZONE 'America/Argentina/Buenos_Aires' as fecha_hora_arg
      FROM acreditaciones 
      WHERE id IN (10360, 10359, 10358)
      ORDER BY id DESC
    `);
    
    console.log('\n📋 Acreditaciones de ejemplo:');
    acreditaciones.rows.forEach(acred => {
      console.log(`\n🔍 ID: ${acred.id} - ${acred.titular} - $${acred.importe}`);
      console.log(`   fecha_hora (object): ${acred.fecha_hora}`);
      console.log(`   fecha_hora (text): ${acred.fecha_hora_text}`);
      console.log(`   fecha_hora AT TIME ZONE 'UTC': ${acred.fecha_hora_utc}`);
      console.log(`   fecha_hora AT TIME ZONE 'America/Argentina/Buenos_Aires': ${acred.fecha_hora_arg}`);
      
      // Crear Date objects para comparar
      const dateObj = new Date(acred.fecha_hora);
      const dateUTC = new Date(acred.fecha_hora_utc);
      const dateArg = new Date(acred.fecha_hora_arg);
      
      console.log(`   Date(fecha_hora): ${dateObj.toISOString()} (${dateObj.getUTCHours()}:${dateObj.getUTCMinutes()})`);
      console.log(`   Date(fecha_hora_utc): ${dateUTC.toISOString()} (${dateUTC.getUTCHours()}:${dateUTC.getUTCMinutes()})`);
      console.log(`   Date(fecha_hora_arg): ${dateArg.toISOString()} (${dateArg.getUTCHours()}:${dateArg.getUTCMinutes()})`);
    });
    
    // Verificar la zona horaria del servidor PostgreSQL
    const timezone = await client.query('SHOW timezone');
    console.log('\n🌍 Zona horaria del servidor PostgreSQL:', timezone.rows[0].TimeZone);
    
    client.release();
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await db.disconnect();
  }
}

debugTimezoneAcreditaciones(); 