require('dotenv').config();
const db = require('./config/database');

async function limpiarComprobantesHuerfanos() {
    const client = await db.getClient();
    
    try {
        console.log('🔍 Buscando acreditaciones con referencias a comprobantes inexistentes...\n');
        
        // Buscar acreditaciones que tienen id_comprobante_whatsapp pero el comprobante no existe
        const acreditacionesHuerfanas = await client.query(`
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
        
        const totalHuerfanas = acreditacionesHuerfanas.rows.length;
        
        if (totalHuerfanas === 0) {
            console.log('✅ No se encontraron acreditaciones con referencias huérfanas');
            return;
        }
        
        console.log(`📊 Encontradas ${totalHuerfanas} acreditaciones con referencias huérfanas:`);
        console.log('===============================================================');
        
        acreditacionesHuerfanas.rows.forEach((acred, index) => {
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
        
        // Actualizar acreditaciones para limpiar referencias huérfanas
        const resultado = await client.query(`
            UPDATE acreditaciones 
            SET id_comprobante_whatsapp = NULL
            WHERE id_comprobante_whatsapp IS NOT NULL 
            AND id_comprobante_whatsapp NOT IN (
                SELECT id_comprobante FROM comprobantes_whatsapp
            )
        `);
        
        console.log(`✅ Limpieza completada: ${resultado.rowCount} acreditaciones actualizadas`);
        
        // Registrar log
        await client.query(`
            INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
            VALUES ($1, $2, $3, $4)
        `, [
            'limpieza_huerfanos',
            `Limpieza de referencias huérfanas: ${resultado.rowCount} acreditaciones actualizadas`,
            JSON.stringify({ 
                total_encontradas: totalHuerfanas,
                total_limpiadas: resultado.rowCount,
                acreditaciones_afectadas: acreditacionesHuerfanas.rows.map(r => r.id)
            }),
            'exitoso'
        ]);
        
        console.log('\n📊 Resumen:');
        console.log(`   - Referencias huérfanas encontradas: ${totalHuerfanas}`);
        console.log(`   - Acreditaciones limpiadas: ${resultado.rowCount}`);
        console.log('   - Log registrado en la base de datos');
        
    } catch (error) {
        console.error('❌ Error durante la limpieza:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Ejecutar el script
console.log('🧹 Script de Limpieza de Referencias Huérfanas');
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