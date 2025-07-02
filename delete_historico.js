require('dotenv').config();
const { Pool } = require('pg');
const readline = require('readline');

// Configuración de la base de datos
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

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
    console.log('⚠️  ADVERTENCIA: Esta operación eliminará PERMANENTEMENTE todos los datos históricos y de CSV');
    console.log('📊 Esto incluye:');
    console.log('   - Comprobantes con id_comprobante que empiecen con "HIST_"');
    console.log('   - Acreditaciones con fuente = "historico" o "csv"');
    console.log('   - Pagos con fuente = "historico" o "csv"');
    console.log('');
    
    const confirmacion1 = await pregunta('¿Está seguro de que desea continuar? (escriba "SI" para confirmar): ');
    if (confirmacion1 !== 'SI') {
        console.log('❌ Operación cancelada.');
        return false;
    }
    
    const confirmacion2 = await pregunta('⚠️  ÚLTIMA CONFIRMACIÓN: ¿Realmente desea ELIMINAR todos los datos históricos y de CSV? (escriba "CONFIRMO" para proceder): ');
    if (confirmacion2 !== 'CONFIRMO') {
        console.log('❌ Operación cancelada.');
        return false;
    }
    
    return true;
}

// Función para contar registros históricos
async function contarHistoricos() {
    try {
        console.log('🔌 Conectando a Railway...');
        
        const comprobantes = await pool.query(`SELECT COUNT(*) as total FROM comprobantes_whatsapp WHERE id_comprobante LIKE 'HIST_%'`);
        const acreditaciones = await pool.query(`SELECT COUNT(*) as total FROM acreditaciones WHERE fuente = 'historico' OR fuente = 'csv'`);
        const pagos = await pool.query(`SELECT COUNT(*) as total FROM pagos WHERE fuente = 'historico' OR fuente = 'csv'`);
        
        return {
            comprobantes: parseInt(comprobantes.rows[0].total),
            acreditaciones: parseInt(acreditaciones.rows[0].total),
            pagos: parseInt(pagos.rows[0].total)
        };
        
    } catch (error) {
        console.error('❌ Error contando registros históricos/CSV:', error.message);
        throw error;
    }
}

// Función principal para eliminar registros históricos
async function eliminarHistoricos() {
    try {
        console.log('🗑️  Script de Eliminación de Datos Históricos y CSV');
        console.log('=======================================================\n');
        
        // Contar registros históricos y CSV
        console.log('📊 Consultando registros históricos y CSV...');
        const totalesAntes = await contarHistoricos();
        console.log(`   - Comprobantes históricos: ${totalesAntes.comprobantes}`);
        console.log(`   - Acreditaciones históricas/CSV: ${totalesAntes.acreditaciones}`);
        console.log(`   - Pagos históricos/CSV: ${totalesAntes.pagos}`);
        const total = totalesAntes.comprobantes + totalesAntes.acreditaciones + totalesAntes.pagos;
        
        if (total === 0) {
            console.log('ℹ️  No hay registros históricos ni CSV para eliminar.');
            return;
        }
        
        console.log('');
        
        // Confirmar eliminación
        const confirmado = await confirmarEliminacion();
        if (!confirmado) {
            return;
        }
        
        console.log('\n🗑️  Iniciando eliminación...\n');
        
        // Eliminar pagos históricos y CSV
        console.log('🔄 Eliminando pagos históricos y CSV...');
        const deletePagos = await pool.query(`DELETE FROM pagos WHERE fuente = 'historico' OR fuente = 'csv'`);
        
        // Eliminar acreditaciones históricas y CSV
        console.log('🔄 Eliminando acreditaciones históricas y CSV...');
        const deleteAcred = await pool.query(`DELETE FROM acreditaciones WHERE fuente = 'historico' OR fuente = 'csv'`);
        
        // Eliminar comprobantes históricos
        console.log('🔄 Eliminando comprobantes históricos...');
        const deleteComprob = await pool.query(`DELETE FROM comprobantes_whatsapp WHERE id_comprobante LIKE 'HIST_%'`);
        
        const comprobantesEliminados = deleteComprob.rowCount;
        const acreditacionesEliminadas = deleteAcred.rowCount;
        const pagosEliminados = deletePagos.rowCount;
        
        console.log('\n✅ Eliminación completada exitosamente!');
        console.log('\n📊 Resumen de eliminación:');
        console.log(`   - Comprobantes eliminados: ${comprobantesEliminados}`);
        console.log(`   - Acreditaciones históricas/CSV eliminadas: ${acreditacionesEliminadas}`);
        console.log(`   - Pagos históricos/CSV eliminados: ${pagosEliminados}`);
        
        if (comprobantesEliminados === 0 && acreditacionesEliminadas === 0 && pagosEliminados === 0) {
            console.log('\nℹ️  No había registros históricos ni CSV para eliminar.');
        } else {
            console.log(`\n✅ Eliminación exitosa: ${comprobantesEliminados} comprobantes históricos, ${acreditacionesEliminadas} acreditaciones históricas/CSV y ${pagosEliminados} pagos históricos/CSV eliminados del sistema.`);
        }
        
        // Verificar que se eliminaron correctamente
        console.log('\n🔍 Verificando eliminación...');
        const totalesDespues = await contarHistoricos();
        console.log(`   - Comprobantes históricos restantes: ${totalesDespues.comprobantes}`);
        console.log(`   - Acreditaciones históricas/CSV restantes: ${totalesDespues.acreditaciones}`);
        console.log(`   - Pagos históricos/CSV restantes: ${totalesDespues.pagos}`);
        
        if (totalesDespues.comprobantes === 0 && totalesDespues.acreditaciones === 0 && totalesDespues.pagos === 0) {
            console.log('✅ Verificación exitosa: No quedan registros históricos ni CSV en el sistema.');
        } else {
            console.log('⚠️  Advertencia: Aún quedan registros históricos o CSV en el sistema.');
        }
        
    } catch (error) {
        console.error('❌ Error durante la eliminación:', error.message);
        throw error;
        
    } finally {
        await pool.end();
        rl.close();
    }
}

// Ejecutar el script
eliminarHistoricos()
    .then(() => {
        console.log('\n✅ Script completado exitosamente!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error en el script:', error);
        process.exit(1);
    }); 