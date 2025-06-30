require('dotenv').config();
const fs = require('fs');
const csv = require('csv-parser');
const readline = require('readline');
const axios = require('axios');

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

// Función para crear una acreditación via HTTP
async function crearAcreditacionHTTP(datos) {
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
        const response = await axios.post(`${process.env.API_URL || 'https://acreditadorbot-production.up.railway.app'}/api/notifications`, {
            id_transaccion,
            importe,
            titular,
            cuit: cleanCUIT(cuit),
            fecha_hora: parseFecha(fecha_comprob),
            id_cliente: cliente_id,
            comision,
            importe_comision,
            tipo: 'Transferencia entrante',
            estado: 'confirmado',
            fuente: 'historico',
            cotejado: true
        });

        if (response.status !== 200 && response.status !== 201) {
            throw new Error(`HTTP ${response.status}: ${response.data}`);
        }

        return response.data.data.id;
    } catch (error) {
        console.error('Error creando acreditación via HTTP:', error);
        throw error;
    }
}

// Función para crear un comprobante via HTTP
async function crearComprobanteHTTP(datos, acreditacion_id) {
    const {
        id_transaccion,
        importe,
        titular,
        cuit,
        fecha_comprob,
        cliente_id
    } = datos;

    try {
        const response = await axios.post(`${process.env.API_URL || 'https://acreditadorbot-production.up.railway.app'}/api/comprobantes`, {
            id_transaccion,
            importe,
            nombre_remitente: titular,
            cuit: cleanCUIT(cuit),
            fecha_envio: parseFecha(fecha_comprob),
            id_cliente: cliente_id,
            cotejado: true,
            id_acreditacion: acreditacion_id,
            estado: 'confirmado',
            fuente: 'historico'
        });

        if (response.status !== 200 && response.status !== 201) {
            throw new Error(`HTTP ${response.status}: ${response.data}`);
        }

        return response.data.data.id;
    } catch (error) {
        console.error('Error creando comprobante via HTTP:', error);
        throw error;
    }
}

// Función para crear un crédito via HTTP
async function crearCreditoHTTP(datos) {
    const {
        importe,
        titular,
        fecha_comprob,
        cliente_id,
        metodo_pago = 'efectivo'
    } = datos;

    try {
        const response = await axios.post(`${process.env.API_URL || 'https://acreditadorbot-production.up.railway.app'}/api/pagos`, {
            id_cliente: cliente_id,
            concepto: `Crédito histórico: ${titular}`,
            importe,
            fecha_pago: parseFecha(fecha_comprob),
            tipo_pago: 'credito',
            metodo_pago,
            estado: 'confirmado',
            fuente: 'historico'
        });

        if (response.status !== 200 && response.status !== 201) {
            throw new Error(`HTTP ${response.status}: ${response.data}`);
        }

        return response.data.data.id;
    } catch (error) {
        console.error('Error creando crédito via HTTP:', error);
        throw error;
    }
}

// Función para crear un pago via HTTP
async function crearPagoHTTP(datos) {
    const {
        importe,
        titular,
        fecha_comprob,
        cliente_id,
        metodo_pago = 'transferencia'
    } = datos;

    try {
        const response = await axios.post(`${process.env.API_URL || 'https://acreditadorbot-production.up.railway.app'}/api/pagos`, {
            id_cliente: cliente_id,
            concepto: `Pago histórico: ${titular}`,
            importe,
            fecha_pago: parseFecha(fecha_comprob),
            tipo_pago: 'egreso',
            metodo_pago,
            estado: 'confirmado',
            fuente: 'historico'
        });

        if (response.status !== 200 && response.status !== 201) {
            throw new Error(`HTTP ${response.status}: ${response.data}`);
        }

        return response.data.data.id;
    } catch (error) {
        console.error('Error creando pago via HTTP:', error);
        throw error;
    }
}

// Función para buscar o crear cliente via HTTP
async function buscarOCrearClienteHTTP(nombreCliente) {
    try {
        // Primero intentar buscar el cliente
        const searchResponse = await axios.get(`${process.env.API_URL || 'https://acreditadorbot-production.up.railway.app'}/api/clientes?search=${encodeURIComponent(nombreCliente)}`);
        
        if (searchResponse.status === 200) {
            const searchResult = searchResponse.data;
            if (searchResult.data && searchResult.data.length > 0) {
                return searchResult.data[0];
            }
        }

        // Si no existe, crear nuevo cliente
        const createResponse = await axios.post(`${process.env.API_URL || 'https://acreditadorbot-production.up.railway.app'}/api/clientes`, {
            nombre: nombreCliente,
            apellido: '',
            estado: 'activo'
        });

        if (createResponse.status !== 200 && createResponse.status !== 201) {
            throw new Error(`HTTP ${createResponse.status}: ${createResponse.data}`);
        }

        return createResponse.data.data;
    } catch (error) {
        console.error('Error buscando/creando cliente via HTTP:', error);
        throw error;
    }
}

// Función principal para procesar el CSV
async function procesarCSV() {
    try {
        // Solicitar información al usuario
        const nombreClienteCSV = await pregunta('Nombre del cliente en el CSV (columna CLIENTE): ');
        const nombreClienteSistema = await pregunta('Nombre del cliente en nuestro sistema: ');
        const rutaCSV = await pregunta('Ruta del archivo CSV: ');

        console.log('\n🔍 Buscando cliente en el sistema...');
        
        // Buscar o crear el cliente en el sistema
        const cliente = await buscarOCrearClienteHTTP(nombreClienteSistema);
        console.log(`✅ Cliente: ${cliente.nombre} ${cliente.apellido} (ID: ${cliente.id})`);

        console.log('\n📊 Procesando CSV...');
        
        let contador = {
            acreditaciones: 0,
            comprobantes: 0,
            creditos: 0,
            pagos: 0,
            ignorados: 0
        };

        // Leer y procesar el CSV
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
                                const acreditacionId = await crearAcreditacionHTTP({
                                    id_transaccion: idTransaccion,
                                    importe: monto,
                                    titular,
                                    cuit,
                                    fecha_comprob: fechaComprob,
                                    cliente_id: cliente.id,
                                    comision,
                                    importe_comision: importeComision
                                });
                                
                                await crearComprobanteHTTP({
                                    id_transaccion: idTransaccion,
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
                                await crearCreditoHTTP({
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
                                await crearPagoHTTP({
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
        rl.close();
    }
}

// Ejecutar el script
console.log('🚀 Script de Importación de Histórico CSV (via HTTP)');
console.log('==================================================\n');

procesarCSV()
    .then(() => {
        console.log('\n✅ Importación completada exitosamente!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error en la importación:', error);
        process.exit(1);
    }); 