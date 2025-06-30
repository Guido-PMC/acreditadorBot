require('dotenv').config();
const db = require('./config/database');
const readline = require('readline');

// Configuración de la interfaz de línea de comandos
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Función para hacer pregunta y obtener respuesta
function pregunta(pregunta) {
    return new Promise((resolve) => {
        rl.question(pregunta, (respuesta) => {
            resolve(respuesta);
        });
    });
}

// Función para confirmar la eliminación
async function confirmarEliminacion() {
    console.log('⚠️  ADVERTENCIA: Esta operación eliminará PERMANENTEMENTE todos los registros con fuente "historico"');
    console.log('📊 Esto incluye:');
    console.log('   - Acreditaciones con fuente = "historico"');
    console.log('   - Comprobantes con fuente = "historico"');
    console.log('   - Pagos con fuente = "historico"');
    console.log('');
    
    const confirmacion1 = await pregunta('¿Está seguro de que desea continuar? (escriba "SI" para confirmar): ');
    if (confirmacion1 !== 'SI') {
        console.log('❌ Operación cancelada.');
        return false;
    }
    
    const confirmacion2 = await pregunta('⚠️  ÚLTIMA CONFIRMACIÓN: ¿Realmente desea ELIMINAR todos los datos históricos? (escriba "CONFIRMO" para proceder): ');
    if (confirmacion2 !== 'CONFIRMO') {
        console.log('❌ Operación cancelada.');
        return false;
    }
    
    return true;
}

// Función para contar registros antes de eliminar
async function contarRegistros(client) {
    try {
        const acreditaciones = await client.query(`
            SELECT COUNT(*) as total FROM acreditaciones WHERE fuente = 'historico'
        `);
        
        const comprobantes = await client.query(`
            SELECT COUNT(*) as total FROM comprobantes WHERE fuente = 'historico'
        `);
        
        const pagos = await client.query(`
            SELECT COUNT(*) as total FROM pagos WHERE fuente = 'historico'
        `);
        
        return {
            acreditaciones: parseInt(acreditaciones.rows[0].total),
            comprobantes: parseInt(comprobantes.rows[0].total),
            pagos: parseInt(pagos.rows[0].total)
        };
    } catch (error) {
        console.error('Error contando registros:', error);
        throw error;
    }
}

// Función principal para eliminar datos históricos
async function eliminarDatosHistoricos() {
    const client = await db.getClient();
    
    try {
        console.log('🔍 Contando registros con fuente "historico"...\n');
        
        // Contar registros antes de eliminar
        const conteoInicial = await contarRegistros(client);
        
        console.log('📊 Registros encontrados:');
        console.log(`   - Acreditaciones: ${conteoInicial.acreditaciones}`);
        console.log(`   - Comprobantes: ${conteoInicial.comprobantes}`);
        console.log(`   - Pagos: ${conteoInicial.pagos}`);
        console.log(`   - TOTAL: ${conteoInicial.acreditaciones + conteoInicial.comprobantes + conteoInicial.pagos}\n`);
        
        if (conteoInicial.acreditaciones === 0 && conteoInicial.comprobantes === 0 && conteoInicial.pagos === 0) {
            console.log('ℹ️  No se encontraron registros con fuente "historico" para eliminar.');
            return;
        }
        
        // Confirmar eliminación
        const confirmado = await confirmarEliminacion();
        if (!confirmado) {
            return;
        }
        
        console.log('\n🗑️  Iniciando eliminación...\n');
        
        // Iniciar transacción
        await client.query('BEGIN');
        
        let eliminados = {
            comprobantes: 0,
            pagos: 0,
            acreditaciones: 0
        };
        
        // 1. Eliminar comprobantes primero (tienen FK a acreditaciones)
        if (conteoInicial.comprobantes > 0) {
            console.log('🗑️  Eliminando comprobantes...');
            const resultComprobantes = await client.query(`
                DELETE FROM comprobantes WHERE fuente = 'historico'
            `);
            eliminados.comprobantes = resultComprobantes.rowCount;
            console.log(`✅ Eliminados ${eliminados.comprobantes} comprobantes`);
        }
        
        // 2. Eliminar pagos
        if (conteoInicial.pagos > 0) {
            console.log('🗑️  Eliminando pagos...');
            const resultPagos = await client.query(`
                DELETE FROM pagos WHERE fuente = 'historico'
            `);
            eliminados.pagos = resultPagos.rowCount;
            console.log(`✅ Eliminados ${eliminados.pagos} pagos`);
        }
        
        // 3. Eliminar acreditaciones al final
        if (conteoInicial.acreditaciones > 0) {
            console.log('🗑️  Eliminando acreditaciones...');
            const resultAcreditaciones = await client.query(`
                DELETE FROM acreditaciones WHERE fuente = 'historico'
            `);
            eliminados.acreditaciones = resultAcreditaciones.rowCount;
            console.log(`✅ Eliminadas ${eliminados.acreditaciones} acreditaciones`);
        }
        
        // Confirmar transacción
        await client.query('COMMIT');
        
        console.log('\n✅ Eliminación completada exitosamente!');
        console.log('\n📊 Resumen de eliminación:');
        console.log(`   - Comprobantes eliminados: ${eliminados.comprobantes}`);
        console.log(`   - Pagos eliminados: ${eliminados.pagos}`);
        console.log(`   - Acreditaciones eliminadas: ${eliminados.acreditaciones}`);
        console.log(`   - TOTAL ELIMINADO: ${eliminados.comprobantes + eliminados.pagos + eliminados.acreditaciones}`);
        
        // Verificar que no queden registros
        console.log('\n🔍 Verificando eliminación...');
        const conteoFinal = await contarRegistros(client);
        
        if (conteoFinal.acreditaciones === 0 && conteoFinal.comprobantes === 0 && conteoFinal.pagos === 0) {
            console.log('✅ Verificación exitosa: No quedan registros con fuente "historico"');
        } else {
            console.log('⚠️  Advertencia: Aún quedan algunos registros:');
            console.log(`   - Acreditaciones: ${conteoFinal.acreditaciones}`);
            console.log(`   - Comprobantes: ${conteoFinal.comprobantes}`);
            console.log(`   - Pagos: ${conteoFinal.pagos}`);
        }
        
    } catch (error) {
        // Rollback en caso de error
        try {
            await client.query('ROLLBACK');
            console.log('🔄 Transacción revertida debido al error');
        } catch (rollbackError) {
            console.error('❌ Error en rollback:', rollbackError);
        }
        
        console.error('❌ Error durante la eliminación:', error);
        throw error;
        
    } finally {
        client.release();
        rl.close();
    }
}

// Ejecutar el script
console.log('🗑️  Script de Eliminación de Datos Históricos');
console.log('===========================================\n');

eliminarDatosHistoricos()
    .then(() => {
        console.log('\n✅ Script completado exitosamente!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error en el script:', error);
        process.exit(1);
    }); 