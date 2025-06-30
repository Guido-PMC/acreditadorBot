const fs = require('fs');
const csv = require('csv-parser');
const readline = require('readline');
const db = require('./config/database');

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

// Función para limpiar CUIT (quitar guiones y dejar solo números)
function cleanCUIT(cuit) {
    if (!cuit) return '';
    return cuit.replace(/[^0-9]/g, '');
}

// Función para limpiar importe (quitar comas y convertir a número)
function cleanImporte(importe) {
    if (!importe) return 0;
    // Quitar comillas y comas, convertir a número
    const limpio = importe.replace(/"/g, '').replace(/,/g, '');
    return parseFloat(limpio) || 0;
}

// Función para limpiar comisión (quitar % y convertir a número)
function cleanComision(comision) {
    if (!comision) return 0;
    // Quitar % y convertir a número
    const limpio = comision.replace(/%/g, '');
    return parseFloat(limpio) || 0;
}

// Función para convertir fecha del CSV a formato ISO
function parseFecha(fechaStr) {
    if (!fechaStr) return new Date().toISOString();
    
    try {
        // Intentar diferentes formatos de fecha
        let fecha;
        
        // Formato: 14/2/2025
        if (fechaStr.includes('/')) {
            const partes = fechaStr.split('/');
            if (partes.length === 3) {
                const dia = parseInt(partes[0]);
                const mes = parseInt(partes[1]) - 1; // Meses van de 0-11
                const año = parseInt(partes[2]);
                fecha = new Date(año, mes, dia);
            }
        }
        // Formato: 2025-02-14 15:50:34
        else if (fechaStr.includes('-')) {
            fecha = new Date(fechaStr);
        }
        
        if (fecha && !isNaN(fecha.getTime())) {
            return fecha.toISOString();
        }
    } catch (error) {
        console.error('Error parseando fecha:', fechaStr, error);
    }
    
    return new Date().toISOString();
}

// Función para crear una acreditación
async function crearAcreditacion(client, datos) {
    const {
        id_transaccion,
        importe,
        titular,
        cuit,
        fecha_comprob,
        cliente_id,
        comision,
        importe_comision
    } = datos;

    try {
        const result = await client.query(`
            INSERT INTO acreditaciones (
                id_transaccion,
                importe,
                titular,
                cuit,
                fecha_hora,
                id_cliente,
                comision,
                importe_comision,
                cotejado,
                estado,
                fuente,
                fecha_carga
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id
        `, [
            id_transaccion,
            importe,
            titular,
            cleanCUIT(cuit),
            parseFecha(fecha_comprob),
            cliente_id,
            comision,
            importe_comision,
            true, // Ya está cotejado
            'confirmado',
            'historico',
            new Date().toISOString()
        ]);

        return result.rows[0].id;
    } catch (error) {
        console.error('Error creando acreditación:', error);
        throw error;
    }
}

// Función para crear un comprobante
async function crearComprobante(client, datos, acreditacion_id) {
    const {
        id_transaccion,
        importe,
        titular,
        cuit,
        fecha_comprob,
        cliente_id
    } = datos;

    try {
        const result = await client.query(`
            INSERT INTO comprobantes_whatsapp (
                id_transaccion,
                importe,
                nombre_remitente,
                cuit,
                fecha_envio,
                id_cliente,
                cotejado,
                id_acreditacion,
                estado,
                fecha_carga
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
        `, [
            id_transaccion,
            importe,
            titular,
            cleanCUIT(cuit),
            parseFecha(fecha_comprob),
            cliente_id,
            true, // Ya está cotejado
            acreditacion_id,
            'confirmado',
            new Date().toISOString()
        ]);

        return result.rows[0].id;
    } catch (error) {
        console.error('Error creando comprobante:', error);
        throw error;
    }
}

// Función para crear un crédito
async function crearCredito(client, datos) {
    const {
        importe,
        titular,
        fecha_comprob,
        cliente_id,
        metodo_pago = 'efectivo'
    } = datos;

    try {
        const result = await client.query(`
            INSERT INTO pagos (
                id_cliente,
                concepto,
                importe,
                fecha_pago,
                tipo_pago,
                metodo_pago,
                estado,
                fecha_creacion
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
        `, [
            cliente_id,
            `Crédito histórico: ${titular}`,
            importe,
            parseFecha(fecha_comprob),
            'credito',
            metodo_pago,
            'confirmado',
            new Date().toISOString()
        ]);

        return result.rows[0].id;
    } catch (error) {
        console.error('Error creando crédito:', error);
        throw error;
    }
}

// Función para crear un pago
async function crearPago(client, datos) {
    const {
        importe,
        titular,
        fecha_comprob,
        cliente_id,
        metodo_pago = 'transferencia'
    } = datos;

    try {
        const result = await client.query(`
            INSERT INTO pagos (
                id_cliente,
                concepto,
                importe,
                fecha_pago,
                tipo_pago,
                metodo_pago,
                estado,
                fecha_creacion
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
        `, [
            cliente_id,
            `Pago histórico: ${titular}`,
            importe,
            parseFecha(fecha_comprob),
            'egreso',
            metodo_pago,
            'confirmado',
            new Date().toISOString()
        ]);

        return result.rows[0].id;
    } catch (error) {
        console.error('Error creando pago:', error);
        throw error;
    }
}

// Función principal para procesar el CSV
async function procesarCSV() {
    const client = await db.getClient();
    
    try {
        // Solicitar información al usuario
        const nombreClienteCSV = await pregunta('Nombre del cliente en el CSV (columna I): ');
        const nombreClienteSistema = await pregunta('Nombre del cliente en nuestro sistema: ');
        const rutaCSV = await pregunta('Ruta del archivo CSV: ');

        console.log('\n🔍 Buscando cliente en el sistema...');
        
        // Buscar el cliente en el sistema
        const clienteResult = await client.query(
            'SELECT id, nombre, apellido FROM clientes WHERE LOWER(nombre) = LOWER($1) OR LOWER(apellido) = LOWER($1) OR LOWER(CONCAT(nombre, \' \', apellido)) = LOWER($1)',
            [nombreClienteSistema]
        );

        if (clienteResult.rows.length === 0) {
            console.log('❌ Cliente no encontrado en el sistema. Creando nuevo cliente...');
            
            // Crear nuevo cliente
            const nuevoClienteResult = await client.query(`
                INSERT INTO clientes (nombre, apellido, estado, fecha_registro)
                VALUES ($1, $2, $3, $4)
                RETURNING id, nombre, apellido
            `, [nombreClienteSistema, '', 'activo', new Date().toISOString()]);
            
            var cliente = nuevoClienteResult.rows[0];
            console.log(`✅ Cliente creado: ${cliente.nombre} (ID: ${cliente.id})`);
        } else {
            var cliente = clienteResult.rows[0];
            console.log(`✅ Cliente encontrado: ${cliente.nombre} ${cliente.apellido} (ID: ${cliente.id})`);
        }

        console.log('\n📊 Procesando CSV...');
        
        let contador = {
            acreditaciones: 0,
            comprobantes: 0,
            creditos: 0,
            pagos: 0,
            ignorados: 0
        };

        // Leer y procesar el CSV
        const resultados = [];
        
        return new Promise((resolve, reject) => {
            fs.createReadStream(rutaCSV)
                .pipe(csv())
                .on('data', async (row) => {
                    try {
                        // Verificar si la línea corresponde al cliente
                        const clienteCSV = row['CLIENTE'] || row['I'] || '';
                        if (!clienteCSV || clienteCSV.toLowerCase() !== nombreClienteCSV.toLowerCase()) {
                            contador.ignorados++;
                            return;
                        }

                        // Extraer datos de la fila
                        const tipoOperacion = row['TIPO OPERACION'] || row['D'] || '';
                        const monto = cleanImporte(row['MONTO'] || row['E'] || '0');
                        const titular = row['TITULAR'] || row['F'] || '';
                        const cuit = row['CUIT'] || row['G'] || '';
                        const fechaComprob = row['FECHA COMPROB'] || row['H'] || '';
                        const comision = cleanComision(row['Comision'] || row['J'] || '0');
                        const idTransaccion = row['ID'] || '';

                        // Calcular importe de comisión
                        const importeComision = monto * (comision / 100);

                        console.log(`\n📄 Procesando: ${tipoOperacion} - $${monto} - ${titular}`);

                        // Procesar según el tipo de operación
                        switch (tipoOperacion.toLowerCase()) {
                            case 'transferencia entrante':
                                // Crear acreditación y comprobante
                                const acreditacionId = await crearAcreditacion(client, {
                                    id_transaccion,
                                    importe: monto,
                                    titular,
                                    cuit,
                                    fecha_comprob: fechaComprob,
                                    cliente_id: cliente.id,
                                    comision,
                                    importe_comision: importeComision
                                });
                                
                                await crearComprobante(client, {
                                    id_transaccion,
                                    importe: monto,
                                    titular,
                                    cuit,
                                    fecha_comprob: fechaComprob,
                                    cliente_id: cliente.id
                                }, acreditacionId);
                                
                                contador.acreditaciones++;
                                contador.comprobantes++;
                                break;

                            case 'saldo anterior':
                            case 'deposito':
                                // Crear crédito
                                await crearCredito(client, {
                                    importe: monto,
                                    titular,
                                    fecha_comprob: fechaComprob,
                                    cliente_id: cliente.id,
                                    metodo_pago: tipoOperacion.toLowerCase() === 'deposito' ? 'efectivo' : 'transferencia'
                                });
                                
                                contador.creditos++;
                                break;

                            case 'transferencia saliente':
                                // Crear pago
                                await crearPago(client, {
                                    importe: monto,
                                    titular,
                                    fecha_comprob: fechaComprob,
                                    cliente_id: cliente.id,
                                    metodo_pago: 'transferencia'
                                });
                                
                                contador.pagos++;
                                break;

                            default:
                                console.log(`⚠️  Tipo de operación no reconocido: ${tipoOperacion}`);
                                contador.ignorados++;
                                break;
                        }

                    } catch (error) {
                        console.error('❌ Error procesando fila:', error);
                        contador.ignorados++;
                    }
                })
                .on('end', () => {
                    console.log('\n✅ Procesamiento completado!');
                    console.log('\n📊 Resumen:');
                    console.log(`   - Acreditaciones creadas: ${contador.acreditaciones}`);
                    console.log(`   - Comprobantes creados: ${contador.comprobantes}`);
                    console.log(`   - Créditos creados: ${contador.creditos}`);
                    console.log(`   - Pagos creados: ${contador.pagos}`);
                    console.log(`   - Registros ignorados: ${contador.ignorados}`);
                    
                    resolve();
                })
                .on('error', (error) => {
                    console.error('❌ Error leyendo CSV:', error);
                    reject(error);
                });
        });

    } catch (error) {
        console.error('❌ Error en el procesamiento:', error);
        throw error;
    } finally {
        client.release();
        rl.close();
    }
}

// Ejecutar el script
console.log('🚀 Script de Importación de Histórico CSV');
console.log('==========================================\n');

procesarCSV()
    .then(() => {
        console.log('\n✅ Importación completada exitosamente!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error en la importación:', error);
        process.exit(1);
    }); 