require('dotenv').config();
const fs = require('fs');
const csv = require('csv-parser');
const readline = require('readline');
const axios = require('axios');

// Configuración para evitar rate limit
const DELAY_BETWEEN_REQUESTS = 2000; // 2 segundos por defecto
const MAX_RETRIES = 3; // Máximo número de reintentos

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

// Función para agregar delay y evitar rate limit
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Función para hacer request con retry automático
async function makeRequestWithRetry(requestFunction, maxRetries = MAX_RETRIES) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await requestFunction();
        } catch (error) {
            if (error.response?.status === 429) {
                const waitTime = 45000; // 45 segundos fijos para error 429
                console.log(`⚠️  Rate limit alcanzado (intento ${attempt}/${maxRetries}). Esperando ${waitTime/1000} segundos...`);
                console.log(`🕒 Esto puede tardar un poco, pero es necesario para respetar los límites del servidor`);
                
                if (attempt === maxRetries) {
                    throw error;
                }
                
                await delay(waitTime);
            } else if (error.response?.status === 400) {
                console.log(`❌ Error 400 - Datos inválidos:`, error.response.data);
                throw error;
            } else {
                throw error;
            }
        }
    }
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
        console.log('➡️ Enviando datos a /api/notifications:', {
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
        const response = await makeRequestWithRetry(() =>
            axios.post(`${process.env.API_URL || 'https://acreditadorbot-production.up.railway.app'}/api/notifications`, {
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
            })
        );
        console.log('⬅️ Respuesta:', response.status, response.data);
        if (response.status !== 200 && response.status !== 201) {
            throw new Error(`HTTP ${response.status}: ${response.data}`);
        }
        return response.data.data.id;
    } catch (error) {
        console.error('❌ Error creando acreditación via HTTP:', error, error.response && error.response.data);
        throw error;
    }
}

// Función para crear un comprobante via HTTP y asignarlo a una acreditación
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
        // Crear el comprobante con retry
        const response = await makeRequestWithRetry(() =>
            axios.post(`${process.env.API_URL || 'https://acreditadorbot-production.up.railway.app'}/api/comprobantes`, {
                id_comprobante: id_transaccion, // El endpoint requiere id_comprobante, no id_transaccion
                importe,
                nombre_remitente: titular,
                fecha_envio: parseFecha(fecha_comprob),
                id_cliente: cliente_id
            })
        );

        if (response.status !== 200 && response.status !== 201) {
            throw new Error(`HTTP ${response.status}: ${response.data}`);
        }

        const comprobante_id = response.data.data.id;
        console.log(`✅ Comprobante creado con ID: ${comprobante_id}`);

        // Pequeño delay antes de la asignación
        console.log(`⏳ Esperando ${DELAY_BETWEEN_REQUESTS}ms antes de asignar...`);
        await delay(DELAY_BETWEEN_REQUESTS);

        // Asignar el comprobante a la acreditación (esto los coteja automáticamente)
        console.log(`🔄 Asignando comprobante ${comprobante_id} a acreditación ${acreditacion_id}`);
        const asignacionResponse = await makeRequestWithRetry(() =>
            axios.put(`${process.env.API_URL || 'https://acreditadorbot-production.up.railway.app'}/api/comprobantes/${comprobante_id}/asignar`, {
                id_acreditacion: acreditacion_id
            })
        );

        if (asignacionResponse.status !== 200 && asignacionResponse.status !== 201) {
            throw new Error(`HTTP ${asignacionResponse.status}: ${asignacionResponse.data}`);
        }

        console.log(`✅ Comprobante ${comprobante_id} asignado y cotejado con acreditación ${acreditacion_id}`);
        return comprobante_id;
    } catch (error) {
        console.error('Error creando/asignando comprobante via HTTP:', error);
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
        const response = await makeRequestWithRetry(() =>
            axios.post(`${process.env.API_URL || 'https://acreditadorbot-production.up.railway.app'}/api/pagos`, {
                id_cliente: cliente_id,
                concepto: `Crédito histórico: ${titular}`,
                importe,
                fecha_pago: parseFecha(fecha_comprob),
                tipo_pago: 'credito',
                metodo_pago,
                estado: 'confirmado',
                fuente: 'historico'
            })
        );

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
        const response = await makeRequestWithRetry(() =>
            axios.post(`${process.env.API_URL || 'https://acreditadorbot-production.up.railway.app'}/api/pagos`, {
                id_cliente: cliente_id,
                concepto: `Pago histórico: ${titular}`,
                importe,
                fecha_pago: parseFecha(fecha_comprob),
                tipo_pago: 'egreso',
                metodo_pago,
                estado: 'confirmado',
                fuente: 'historico'
            })
        );

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
        // Primero intentar buscar el cliente con retry
        const searchResponse = await makeRequestWithRetry(() => 
            axios.get(`${process.env.API_URL || 'https://acreditadorbot-production.up.railway.app'}/api/clientes?search=${encodeURIComponent(nombreCliente)}`)
        );
        
        if (searchResponse.status === 200) {
            const searchResult = searchResponse.data;
            if (searchResult.data && searchResult.data.length > 0) {
                return searchResult.data[0];
            }
        }

        // Si no existe, crear nuevo cliente con retry
        const createResponse = await makeRequestWithRetry(() =>
            axios.post(`${process.env.API_URL || 'https://acreditadorbot-production.up.railway.app'}/api/clientes`, {
                nombre: nombreCliente,
                apellido: '',
                estado: 'activo'
            })
        );

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

        // Leer todas las filas del CSV primero
        const filas = [];
        await new Promise((resolve, reject) => {
            fs.createReadStream(rutaCSV)
                .pipe(csv())
                .on('data', (row) => {
                    filas.push(row);
                })
                .on('end', resolve)
                .on('error', reject);
        });

        console.log(`📄 Total de filas en CSV: ${filas.length}`);
        console.log(`⏳ Delay configurado: ${DELAY_BETWEEN_REQUESTS}ms entre requests para evitar rate limit`);
        console.log(`⏱️  Tiempo estimado: ~${Math.ceil((filas.length * DELAY_BETWEEN_REQUESTS) / 1000 / 60)} minutos\n`);

        // Procesar filas secuencialmente
        for (let i = 0; i < filas.length; i++) {
            const row = filas[i];
            
            try {
                // Verificar si la línea corresponde al cliente
                const clienteCSV = row['CLIENTE'] || row['I'] || '';
                console.log(`\n[${i + 1}/${filas.length}] 🔍 Comparando: CSV="${clienteCSV}" vs Buscado="${nombreClienteCSV}"`);
                
                if (!clienteCSV || clienteCSV.toLowerCase() !== nombreClienteCSV.toLowerCase()) {
                    console.log(`❌ No coincide, ignorando fila`);
                    contador.ignorados++;
                    mostrarContadores(contador);
                    
                    // Pequeño delay incluso para filas ignoradas para mantener consistencia
                    await delay(100);
                    continue;
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

                console.log(`📄 Procesando: ${tipoOperacion} - $${monto} - ${titular}`);

                // Procesar según el tipo de operación
                switch (tipoOperacion.toLowerCase()) {
                    case 'transferencia entrante':
                        console.log(`🔄 Creando acreditación para: ${idTransaccion}`);
                        try {
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
                            
                            console.log(`✅ Acreditación creada con ID: ${acreditacionId}`);
                            
                            // Delay antes de crear el comprobante
                            console.log(`⏳ Esperando ${DELAY_BETWEEN_REQUESTS}ms antes de crear comprobante...`);
                            await delay(DELAY_BETWEEN_REQUESTS);
                            
                            console.log(`🔄 Creando comprobante para acreditación: ${acreditacionId}`);
                            await crearComprobanteHTTP({
                                id_transaccion: idTransaccion,
                                importe: monto,
                                titular,
                                cuit,
                                fecha_comprob: fechaComprob,
                                cliente_id: cliente.id
                            }, acreditacionId);
                            
                            console.log(`✅ Comprobante creado`);
                            
                            contador.acreditaciones++;
                            contador.comprobantes++;
                        } catch (error) {
                            console.error(`❌ Error procesando transferencia entrante:`, error.message);
                            contador.ignorados++;
                        }
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
                    case 'pago':
                        // Crear pago - usar valor absoluto porque los pagos representan salidas
                        // Si el CSV ya trae signo negativo, lo convertimos a positivo
                        const importePago = Math.abs(monto);
                        if (monto !== importePago) {
                            console.log(`💰 Convirtiendo monto negativo ${monto} a positivo ${importePago} para pago`);
                        }
                        
                        await crearPagoHTTP({
                            importe: importePago,
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

                // Mostrar contadores después de cada procesamiento
                mostrarContadores(contador);

                // Agregar delay para evitar rate limit
                console.log(`⏳ Esperando ${DELAY_BETWEEN_REQUESTS}ms para evitar rate limit...`);
                await delay(DELAY_BETWEEN_REQUESTS);

            } catch (error) {
                console.error('❌ Error procesando fila:', error);
                contador.ignorados++;
                mostrarContadores(contador);
                
                // También agregar delay en caso de error
                console.log(`⏳ Esperando ${DELAY_BETWEEN_REQUESTS}ms antes de continuar...`);
                await delay(DELAY_BETWEEN_REQUESTS);
            }
        }

        console.log('\n✅ Procesamiento completado!');
        console.log('\n📊 Resumen Final:');
        mostrarContadores(contador);

    } catch (error) {
        console.error('❌ Error en el procesamiento:', error);
        throw error;
    } finally {
        rl.close();
    }
}

// Función para mostrar contadores
function mostrarContadores(contador) {
    console.log(`\n📊 Contadores actuales:`);
    console.log(`   - Acreditaciones: ${contador.acreditaciones}`);
    console.log(`   - Comprobantes: ${contador.comprobantes}`);
    console.log(`   - Créditos: ${contador.creditos}`);
    console.log(`   - Pagos: ${contador.pagos}`);
    console.log(`   - Ignorados: ${contador.ignorados}`);
    console.log(`   - Total procesados: ${contador.acreditaciones + contador.comprobantes + contador.creditos + contador.pagos + contador.ignorados}`);
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