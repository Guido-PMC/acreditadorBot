const bcrypt = require('bcrypt');
const db = require('./config/database');

async function changeUserPassword(username, newPassword) {
  const client = await db.getClient();
  
  try {
    // Verificar que el usuario existe
    const userCheck = await client.query(
      'SELECT id FROM portal_users WHERE username = $1',
      [username]
    );

    if (userCheck.rows.length === 0) {
      console.error('❌ Usuario no encontrado:', username);
      return false;
    }

    // Generar hash de la nueva contraseña
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Actualizar contraseña
    await client.query(
      'UPDATE portal_users SET password_hash = $1 WHERE username = $2',
      [passwordHash, username]
    );

    console.log('✅ Contraseña actualizada exitosamente para:', username);
    return true;

  } catch (error) {
    console.error('❌ Error cambiando contraseña:', error);
    return false;
  } finally {
    client.release();
  }
}

// Función para listar usuarios
async function listUsers() {
  const client = await db.getClient();
  
  try {
    const result = await client.query(`
      SELECT pu.username, pu.email, c.nombre, c.apellido, pu.activo
      FROM portal_users pu
      LEFT JOIN clientes c ON pu.id_cliente = c.id
      ORDER BY pu.username
    `);

    console.log('\n📋 Usuarios del Portal:');
    console.log('Username | Email | Nombre | Apellido | Activo');
    console.log('---------|-------|--------|----------|--------');
    
    result.rows.forEach(user => {
      console.log(`${user.username} | ${user.email || 'N/A'} | ${user.nombre || 'N/A'} | ${user.apellido || 'N/A'} | ${user.activo ? 'Sí' : 'No'}`);
    });

  } catch (error) {
    console.error('❌ Error listando usuarios:', error);
  } finally {
    client.release();
  }
}

// Ejecutar desde línea de comandos
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('📖 Uso del script:');
    console.log('  node change_password.js list                    # Listar usuarios');
    console.log('  node change_password.js <username> <password>   # Cambiar contraseña');
    console.log('');
    console.log('📝 Ejemplos:');
    console.log('  node change_password.js list');
    console.log('  node change_password.js cliente1 nueva123');
  } else if (args[0] === 'list') {
    listUsers();
  } else if (args.length === 2) {
    const [username, password] = args;
    changeUserPassword(username, password);
  } else {
    console.error('❌ Argumentos incorrectos. Usa: node change_password.js <username> <password>');
  }
}

module.exports = { changeUserPassword, listUsers }; 