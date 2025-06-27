const bcrypt = require('bcrypt');
const db = require('./config/database');

async function createPortalUser() {
    const client = await db.getClient();
    
    try {
        console.log('🔧 Creando usuario del portal de prueba...');
        
        // Verificar que el cliente existe
        const clienteResult = await client.query(
            'SELECT id, nombre, apellido FROM clientes WHERE id = 1'
        );

        if (clienteResult.rows.length === 0) {
            console.error('❌ Error: No existe un cliente con ID 1');
            console.log('💡 Primero crea un cliente en la página de clientes');
            return;
        }

        const cliente = clienteResult.rows[0];
        console.log(`✅ Cliente encontrado: ${cliente.nombre} ${cliente.apellido}`);

        // Verificar que el usuario no existe
        const existingUser = await client.query(
            'SELECT id FROM portal_users WHERE username = $1',
            ['cliente1']
        );

        if (existingUser.rows.length > 0) {
            console.log('⚠️  El usuario "cliente1" ya existe');
            return;
        }

        // Hash de la contraseña
        const saltRounds = 10;
        const password = 'cliente123';
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Crear usuario del portal
        const result = await client.query(`
            INSERT INTO portal_users (
                id_cliente,
                username,
                password_hash,
                email
            ) VALUES ($1, $2, $3, $4)
            RETURNING id, username, email, activo, fecha_creacion
        `, [1, 'cliente1', passwordHash, 'cliente1@test.com']);

        console.log('✅ Usuario del portal creado exitosamente!');
        console.log('📋 Detalles del usuario:');
        console.log(`   - Usuario: cliente1`);
        console.log(`   - Contraseña: cliente123`);
        console.log(`   - Email: cliente1@test.com`);
        console.log(`   - Cliente: ${cliente.nombre} ${cliente.apellido}`);
        console.log(`   - ID: ${result.rows[0].id}`);
        console.log('');
        console.log('🌐 Para acceder al portal:');
        console.log('   1. Ve a: https://tu-railway-url.railway.app/portal-login.html');
        console.log('   2. Usa las credenciales de arriba');
        console.log('   3. Verás tus comprobantes y movimientos');

    } catch (error) {
        console.error('❌ Error creando usuario del portal:', error);
    } finally {
        client.release();
        await db.disconnect();
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    createPortalUser();
}

module.exports = { createPortalUser }; 