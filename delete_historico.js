require('dotenv').config();
const axios = require('axios');
const readline = require('readline');

// Configuración
const API_URL = process.env.API_URL || 'https://acreditadorbot-production.up.railway.app';



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

// Función para contar registros históricos via API
async function contarRegistrosHistoricos() {
    try {
        console.log(`🌐 Consultando: ${API_URL}/api/stats`);
        
        // Primero intentamos obtener estadísticas generales para verificar conectividad
        const statsResponse = await axios.get(`${API_URL}/api/stats`);
        
        if (!statsResponse.data.success) {
            throw new Error('Error obteniendo estadísticas del servidor');
        }
        
        console.log('✅ Conexión con el servidor establecida');
        
        // Para contar específicamente los históricos, necesitamos hacer consultas específicas
        // Como no tenemos un endpoint específico para contar históricos, usaremos el endpoint de eliminación 
        // en modo "dry-run" (pero como no lo implementamos así, haremos una estimación)
        
        // Por ahora, hacemos una estimación basada en que el endpoint de eliminación nos dará el conteo
        console.log('📊 Para obtener el conteo exacto de registros históricos, se consultará el endpoint de eliminación...');
        
        return {
            acreditaciones: '?',
            comprobantes: '?', 
            pagos: '?',
            nota: 'El conteo exacto se obtendrá al ejecutar la eliminación'
        };
        
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            throw new Error(`No se pudo conectar al servidor en ${API_URL}. ¿Está ejecutándose el servidor?`);
        }
        console.error('Error consultando registros históricos:', error.message);
        throw error;
    }
}

// Función principal para eliminar datos históricos via API
async function eliminarDatosHistoricos() {
    try {
        console.log(`🌐 Conectando al servidor: ${API_URL}\n`);
        
        // Verificar conectividad y obtener información inicial
        const infoInicial = await contarRegistrosHistoricos();
        
        console.log('📊 Información de registros históricos:');
        console.log(`   - Acreditaciones: ${infoInicial.acreditaciones}`);
        console.log(`   - Comprobantes: ${infoInicial.comprobantes}`);
        console.log(`   - Pagos: ${infoInicial.pagos}`);
        if (infoInicial.nota) {
            console.log(`   ℹ️  ${infoInicial.nota}`);
        }
        console.log('');
        
        // Confirmar eliminación
        const confirmado = await confirmarEliminacion();
        if (!confirmado) {
            return;
        }
        
        console.log('\n🗑️  Iniciando eliminación via API...\n');
        console.log(`🌐 Llamando: DELETE ${API_URL}/api/historico/limpiar`);
        
        // Llamar al endpoint de eliminación
        const response = await axios.delete(`${API_URL}/api/historico/limpiar`);
        
        if (!response.data.success) {
            throw new Error(`Error del servidor: ${response.data.message || 'Error desconocido'}`);
        }
        
        const resultado = response.data.data;
        
        console.log('\n✅ Eliminación completada exitosamente!');
        console.log('\n📊 Resumen de eliminación:');
        console.log(`   - Comprobantes eliminados: ${resultado.eliminados.comprobantes}`);
        console.log(`   - Pagos eliminados: ${resultado.eliminados.pagos}`);
        console.log(`   - Acreditaciones eliminadas: ${resultado.eliminados.acreditaciones}`);
        console.log(`   - TOTAL ELIMINADO: ${resultado.total_eliminado}`);
        
        if (resultado.conteo_inicial) {
            console.log('\n📊 Conteo inicial encontrado:');
            console.log(`   - Acreditaciones: ${resultado.conteo_inicial.acreditaciones}`);
            console.log(`   - Comprobantes: ${resultado.conteo_inicial.comprobantes}`);
            console.log(`   - Pagos: ${resultado.conteo_inicial.pagos}`);
        }
        
        if (resultado.total_eliminado === 0) {
            console.log('\nℹ️  No había registros históricos para eliminar.');
        } else {
            console.log(`\n✅ Eliminación exitosa: ${resultado.total_eliminado} registros históricos eliminados del sistema.`);
        }
        
    } catch (error) {
        if (error.response) {
            // Error de respuesta HTTP
            console.error(`❌ Error HTTP ${error.response.status}:`, error.response.data.message || error.response.data.error);
            if (error.response.data.details) {
                console.error('   Detalles:', error.response.data.details);
            }
        } else if (error.code === 'ECONNREFUSED') {
            console.error(`❌ No se pudo conectar al servidor en ${API_URL}`);
            console.error('   ¿Está ejecutándose el servidor? Puedes iniciarlo con: npm start');
        } else {
            console.error('❌ Error durante la eliminación:', error.message);
        }
        throw error;
        
    } finally {
        rl.close();
    }
}

// Ejecutar el script
console.log('🗑️  Script de Eliminación de Datos Históricos (via HTTP API)');
console.log('========================================================');
console.log(`🌐 Servidor: ${API_URL}`);
console.log('========================================================\n');

eliminarDatosHistoricos()
    .then(() => {
        console.log('\n✅ Script completado exitosamente!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error en el script:', error);
        process.exit(1);
    }); 