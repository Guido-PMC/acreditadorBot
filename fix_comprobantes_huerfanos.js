require('dotenv').config();
const axios = require('axios');

// Configuración
const API_URL = process.env.API_URL;
const USE_HTTP = !!API_URL;

// Importar base de datos solo si no usamos HTTP
let db;
if (!USE_HTTP) {
    db = require('./config/database');
}

// Función para buscar acreditaciones huérfanas
async function buscarAcreditacionesHuerfanas() {
    if (USE_HTTP) {
        // Usar endpoint HTTP (necesitamos crear este endpoint)
        const response = await axios.get(`${API_URL}/api/comprobantes/huerfanos`);
        if (!response.data.success) {
            throw new Error('Error obteniendo datos del servidor');
        }
        return response.data.data;
    } else {
        // Conexión directa a base de datos
        const client = await db.getClient();
        try {
            const result = await client.query(`
                SELECT 
                    a.id,
                    a.id_comprobante_whatsapp,
                    a.titular,
                    a.importe
                FROM acreditaciones a
                LEFT JOIN comprobantes_whatsapp cw ON a.id_comprobante_whatsapp = cw.id_comprobante
                WHERE a.id_comprobante_whatsapp IS NOT NULL 
                AND cw.id_comprobante IS NULL
            `);
            return result.rows;
        } finally {
            client.release();
        }
    }
}

// Función para limpiar referencias huérfanas
async function ejecutarLimpieza() {
    if (USE_HTTP) {
        // Usar endpoint HTTP
        const response = await axios.delete(`${API_URL}/api/comprobantes/huerfanos`);
        if (!response.data.success) {
            throw new Error('Error en la limpieza: ' + response.data.message);
        }
        return response.data.data;
    } else {
        // Conexión directa a base de datos
        const client = await db.getClient();
        try {
            const resultado = await client.query(`
                UPDATE acreditaciones 
                SET id_comprobante_whatsapp = NULL
                WHERE id_comprobante_whatsapp IS NOT NULL 
                AND id_comprobante_whatsapp NOT IN (
                    SELECT id_comprobante FROM comprobantes_whatsapp
                )
            `);
            
            // Registrar log
            await client.query(`
                INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
                VALUES ($1, $2, $3, $4)
            `, [
                'limpieza_huerfanos',
                `Limpieza de referencias huérfanas: ${resultado.rowCount} acreditaciones actualizadas`,
                JSON.stringify({ 
                    total_limpiadas: resultado.rowCount,
                    metodo: 'conexion_directa'
                }),
                'exitoso'
            ]);
            
            return { total_limpiadas: resultado.rowCount };
        } finally {
            client.release();
        }
    }
}

async function limpiarComprobantesHuerfanos() {
    try {
        if (USE_HTTP) {
            console.log(`🌐 Conectando al servidor: ${API_URL}`);
            console.log('🔍 Buscando acreditaciones con referencias a comprobantes inexistentes...\n');
            
            // Verificar conectividad
            const testResponse = await axios.get(`${API_URL}/api/stats`);
            if (!testResponse.data.success) {
                throw new Error('Error conectando al servidor remoto');
            }
            console.log('✅ Conexión establecida con el servidor remoto\n');
        } else {
            console.log('🔍 Conectando a base de datos local...');
            console.log('🔍 Buscando acreditaciones con referencias a comprobantes inexistentes...\n');
        }
        
        // Buscar acreditaciones huérfanas
        const acreditacionesHuerfanas = await buscarAcreditacionesHuerfanas();
        const totalHuerfanas = acreditacionesHuerfanas.length;
        
        if (totalHuerfanas === 0) {
            console.log('✅ No se encontraron acreditaciones con referencias huérfanas');
            return;
        }
        
        console.log(`📊 Encontradas ${totalHuerfanas} acreditaciones con referencias huérfanas:`);
        console.log('===============================================================');
        
        acreditacionesHuerfanas.forEach((acred, index) => {
            console.log(`${index + 1}. ID: ${acred.id} | Comprobante inexistente: ${acred.id_comprobante_whatsapp}`);
            console.log(`   Titular: ${acred.titular || 'N/A'} | Importe: $${parseFloat(acred.importe).toLocaleString('es-AR')}`);
            console.log('');
        });
        
        // Confirmar limpieza
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        const respuesta = await new Promise((resolve) => {
            rl.question('¿Desea limpiar estas referencias huérfanas? (escriba "SI" para confirmar): ', resolve);
        });
        
        rl.close();
        
        if (respuesta !== 'SI') {
            console.log('❌ Operación cancelada');
            return;
        }
        
        console.log('\n🧹 Limpiando referencias huérfanas...');
        
        // Ejecutar limpieza
        const resultado = await ejecutarLimpieza();
        
        console.log(`✅ Limpieza completada: ${resultado.total_limpiadas} acreditaciones actualizadas`);
        
        console.log('\n📊 Resumen:');
        console.log(`   - Referencias huérfanas encontradas: ${totalHuerfanas}`);
        console.log(`   - Acreditaciones limpiadas: ${resultado.total_limpiadas}`);
        console.log(`   - Método: ${USE_HTTP ? 'HTTP API' : 'Conexión directa'}`);
        console.log('   - Log registrado en la base de datos');
        
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.error(`❌ No se pudo conectar al servidor en ${API_URL}`);
            console.error('   ¿Está ejecutándose el servidor? Puedes iniciarlo con: npm start');
        } else if (error.response) {
            console.error(`❌ Error HTTP ${error.response.status}:`, error.response.data.message || error.response.data.error);
        } else {
            console.error('❌ Error durante la limpieza:', error.message);
        }
        throw error;
    }
}

// Ejecutar el script
console.log('🧹 Script de Limpieza de Referencias Huérfanas');
console.log('===========================================');
if (USE_HTTP) {
    console.log(`🌐 Modo: HTTP API (${API_URL})`);
} else {
    console.log('🔗 Modo: Conexión directa a base de datos');
}
console.log('===========================================\n');

limpiarComprobantesHuerfanos()
    .then(() => {
        console.log('\n✅ Script completado exitosamente!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error en el script:', error);
        process.exit(1);
    }); 