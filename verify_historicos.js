require('dotenv').config();

const { Pool } = require('pg');

// Configuración de la base de datos
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function verificarEstructuraTablas() {
    try {
        console.log('🔌 Conectando a Railway...');
        
        // Verificar estructura de acreditaciones
        console.log('\n📋 ESTRUCTURA DE TABLA ACREDITACIONES:');
        const estructuraAcreditaciones = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'acreditaciones' 
            AND column_name IN ('id', 'id_comprobante_whatsapp', 'id_transaccion', 'fuente')
            ORDER BY ordinal_position
        `);
        
        estructuraAcreditaciones.rows.forEach(col => {
            console.log(`   - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
        });
        
        // Verificar estructura de comprobantes_whatsapp
        console.log('\n📋 ESTRUCTURA DE TABLA COMPROBANTES_WHATSAPP:');
        const estructuraComprobantes = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'comprobantes_whatsapp' 
            AND column_name IN ('id_comprobante', 'id_acreditacion', 'id_cliente')
            ORDER BY ordinal_position
        `);
        
        estructuraComprobantes.rows.forEach(col => {
            console.log(`   - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
        });
        
        // Verificar algunos datos de muestra
        console.log('\n📊 MUESTRA DE DATOS HISTÓRICOS:');
        
        const muestraAcreditaciones = await pool.query(`
            SELECT id, id_transaccion, id_comprobante_whatsapp, fuente 
            FROM acreditaciones 
            WHERE fuente = 'historico' 
            LIMIT 3
        `);
        
        console.log('\n   ACREDITACIONES:');
        muestraAcreditaciones.rows.forEach((row, i) => {
            console.log(`   ${i+1}. ID: ${row.id} (${typeof row.id}), id_transaccion: ${row.id_transaccion}, id_comprobante_whatsapp: ${row.id_comprobante_whatsapp}`);
        });
        
        const muestraComprobantes = await pool.query(`
            SELECT id_comprobante, id_acreditacion, id_cliente 
            FROM comprobantes_whatsapp 
            WHERE id_comprobante LIKE 'HIST_WH_%' 
            LIMIT 3
        `);
        
        console.log('\n   COMPROBANTES:');
        muestraComprobantes.rows.forEach((row, i) => {
            console.log(`   ${i+1}. id_comprobante: ${row.id_comprobante}, id_acreditacion: ${row.id_acreditacion} (${typeof row.id_acreditacion}), id_cliente: ${row.id_cliente}`);
        });
        
        // Intentar hacer el JOIN problemático paso a paso
        console.log('\n🔍 PROBANDO VINCULACIONES:');
        
        try {
            const testJoin = await pool.query(`
                SELECT a.id, a.id_transaccion, c.id_comprobante, c.id_acreditacion
                FROM acreditaciones a 
                INNER JOIN comprobantes_whatsapp c ON a.id = c.id_acreditacion 
                WHERE a.fuente = 'historico' AND c.id_comprobante LIKE 'HIST_WH_%'
                LIMIT 3
            `);
            
            console.log(`   ✅ JOIN exitoso. Encontradas ${testJoin.rows.length} vinculaciones:`);
            testJoin.rows.forEach((row, i) => {
                console.log(`   ${i+1}. Acred ID: ${row.id} ↔ Comprob ID: ${row.id_comprobante} (id_acred en comprob: ${row.id_acreditacion})`);
            });
            
        } catch (joinError) {
            console.log(`   ❌ Error en JOIN: ${joinError.message}`);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

// Ejecutar verificación
verificarEstructuraTablas(); 