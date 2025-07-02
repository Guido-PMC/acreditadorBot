require('dotenv').config();
const fs = require('fs');
const csv = require('csv-parser');
const readline = require('readline');
const { Pool } = require('pg');

// Configuración directa de la base de datos Railway
// Necesitas proporcionar la contraseña de Railway
console.log('⚠️  NOTA: Necesitas la contraseña de Railway para conectarte');
console.log('💡 Puedes obtenerla desde el dashboard de Railway > Database > Connect');

const pool = new Pool({
  host: 'nozomi.proxy.rlwy.net',
  port: 39888,
  database: 'railway',
  user: 'postgres',
  password: 'qxxDSdtjcfdBpkVonqkYHFIsjVvzFDNz' || '',
  ssl: { rejectUnauthorized: false }
});

// Objeto de base de datos simplificado
const db = {
  async connect() {
    console.log('🔌 Conectando a Railway...');
    try {
      const client = await pool.connect();
      console.log('✅ Conexión a Railway establecida');
      client.release();
      return true;
    } catch (error) {
      console.error('❌ Error conectando a Railway:', error.message);
      throw error;
    }
  },
  
  async query(text, params) {
    return pool.query(text, params);
  },
  
  async disconnect() {
    await pool.end();
    console.log('🔌 Conexión a Railway cerrada');
  }
};

// Interfaz para input del usuario
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Función para hacer preguntas
function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

// Función para limpiar y convertir montos
function parseAmount(amountStr) {
  if (!amountStr || amountStr === '-') return 0;
  let cleaned = amountStr.replace(/[",\s]/g, '');
  return parseFloat(cleaned) || 0;
}

// Función para convertir fecha al formato ISO
function parseDate(dateStr) {
  if (!dateStr || dateStr === '-') return null;
  
  if (dateStr.includes('-') && dateStr.length > 10) {
    return new Date(dateStr);
  }
  
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const year = parseInt(parts[2]);
    return new Date(year, month, day);
  }
  
  return null;
}

// Obtener nombre de archivo por argumento o usar por defecto
const archivoCSV = process.argv[2] || 'datosFULL.csv';

// Función para analizar el CSV y extraer clientes únicos
async function analyzeCSV() {
  console.log(`📊 Analizando clientes en ${archivoCSV}...\n`);
  
  const clientesEnCSV = new Set();
  const estadisticasPorCliente = {};
  let totalLineas = 0;
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(archivoCSV)
      .pipe(csv({
        headers: ['ID', 'FECHA', 'ID_TRANSACCION', 'TIPO_OPERACION', 'MONTO', 'TITULAR', 'CUIT', 'FECHA_COMPROB', 'CLIENTE', 'COMISION', 'NETO', 'SALDO']
      }))
      .on('data', (row) => {
        totalLineas++;
        
        const cliente = row.CLIENTE?.trim();
        const tipoOperacion = row.TIPO_OPERACION?.trim();
        const monto = parseAmount(row.MONTO);
        
        // Saltar saldos anteriores y filas sin cliente
        if (tipoOperacion === 'SALDO ANTERIOR' || !cliente) return;
        
        clientesEnCSV.add(cliente);
        
        if (!estadisticasPorCliente[cliente]) {
          estadisticasPorCliente[cliente] = {
            transferenciasEntrantes: 0,
            transferenciasSalientes: 0,
            pagos: 0,
            totalImporte: 0
          };
        }
        
        if (tipoOperacion === 'Transferencia entrante') {
          estadisticasPorCliente[cliente].transferenciasEntrantes++;
        } else if (tipoOperacion === 'Transferencia saliente') {
          estadisticasPorCliente[cliente].transferenciasSalientes++;
        } else if (tipoOperacion === 'PAGO' || tipoOperacion === 'TRANSFERENCIA SALIENTE') {
          estadisticasPorCliente[cliente].pagos++;
        }
        
        estadisticasPorCliente[cliente].totalImporte += Math.abs(monto);
      })
      .on('end', () => {
        resolve({ clientesEnCSV: Array.from(clientesEnCSV), estadisticasPorCliente, totalLineas });
      })
      .on('error', reject);
  });
}

// Función para obtener clientes del sistema
async function getClientesDelSistema() {
  const result = await db.query('SELECT id, nombre FROM clientes ORDER BY id');
  return result.rows;
}

// Función para mostrar el mapeo interactivo
async function crearMapeoClientes(clientesCSV, clientesSistema, estadisticas) {
  console.log('🎯 MAPEO DE CLIENTES\n');
  console.log('='.repeat(60));
  
  console.log('\n📋 CLIENTES EN EL SISTEMA:');
  clientesSistema.forEach(cliente => {
    console.log(`  ${cliente.id}. ${cliente.nombre}`);
  });
  
  console.log('\n📄 CLIENTES ENCONTRADOS EN EL CSV:');
  console.log('='.repeat(60));
  
  const mapeo = {};
  
  for (const clienteCSV of clientesCSV) {
    const stats = estadisticas[clienteCSV];
    
    // Saltar automáticamente clientes vacíos o headers
    if (!clienteCSV || clienteCSV === 'CLIENTE' || stats.totalImporte === 0) {
      console.log(`\n⏭️  SALTANDO automáticamente: "${clienteCSV}" (cliente vacío o header)`);
      mapeo[clienteCSV] = null;
      continue;
    }
    
    console.log(`\n🏢 Cliente: "${clienteCSV}"`);
    console.log(`   📊 Estadísticas:`);
    console.log(`      - Transferencias entrantes: ${stats.transferenciasEntrantes}`);
    console.log(`      - Transferencias salientes: ${stats.transferenciasSalientes}`);
    console.log(`      - Pagos: ${stats.pagos}`);
    console.log(`      - Total importe: $${stats.totalImporte.toLocaleString('es-AR')}`);
    
    console.log('\n   ¿A qué cliente del sistema asignar estas transacciones?');
    console.log('   Opciones:');
    clientesSistema.forEach(cliente => {
      console.log(`     ${cliente.id} = ${cliente.nombre}`);
    });
    console.log('     0 = SALTAR (no importar)');
    
    let respuesta;
    do {
      respuesta = await question(`\n   👉 Ingresa el ID del cliente (0-${clientesSistema.length}): `);
      respuesta = parseInt(respuesta);
    } while (isNaN(respuesta) || respuesta < 0 || respuesta > clientesSistema.length);
    
    if (respuesta === 0) {
      console.log(`   ❌ SALTANDO cliente "${clienteCSV}"`);
      mapeo[clienteCSV] = null; // No importar
    } else {
      const clienteSeleccionado = clientesSistema.find(c => c.id === respuesta);
      mapeo[clienteCSV] = respuesta;
      console.log(`   ✅ "${clienteCSV}" → ${clienteSeleccionado.nombre} (ID: ${respuesta})`);
    }
  }
  
  return mapeo;
}

// Función para importar datos con el mapeo
async function importarConMapeo(mapeo) {
  console.log(`\n🚀 INICIANDO IMPORTACIÓN DE ${archivoCSV}...\n`);
  
  const acreditaciones = [];
  const comprobantes = [];
  const pagos = [];
  let processedRows = 0;
  let lastRow = null;
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(archivoCSV)
      .pipe(csv({
        headers: ['ID', 'FECHA', 'ID_TRANSACCION', 'TIPO_OPERACION', 'MONTO', 'TITULAR', 'CUIT', 'FECHA_COMPROB', 'CLIENTE', 'COMISION', 'NETO', 'SALDO']
      }))
      .on('data', (row) => {
        lastRow = row;
        processedRows++;
        
        const tipoOperacion = row.TIPO_OPERACION?.trim();
        const montoOriginal = row.MONTO;
        const monto = parseAmount(montoOriginal);
        const fecha = parseDate(row.FECHA);
        const cliente = row.CLIENTE?.trim();
        const idTransaccion = row.ID_TRANSACCION || `HIST_${processedRows}`;
        
        // Saltar saldos anteriores
        if (tipoOperacion === 'SALDO ANTERIOR') return;
        
        // LOG DETALLADO para SUPLEMENTOS PROFIT y Transferencia entrante
        if (tipoOperacion === 'Transferencia entrante' && cliente === 'SUPLEMENTOS PROFIT') {
          let motivo = null;
          let existeEnArray = acreditaciones.some(a => a.id_transaccion === idTransaccion);
          let idCliente = mapeo[cliente];
          if (!cliente || idCliente === null || idCliente === undefined) {
            motivo = 'Cliente no mapeado';
          } else if (!monto || isNaN(monto) || monto <= 0) {
            motivo = 'Monto inválido';
          } else if (existeEnArray) {
            motivo = 'ID_TRANSACCION duplicado en array';
          }
          console.log(`[LOG] Línea ${processedRows} | Cliente: ${cliente} | Monto original: "${montoOriginal}" | Monto parseado: ${monto} | ID_TRANSACCION: ${idTransaccion} | idCliente: ${idCliente} | Ya en array: ${existeEnArray} ${motivo ? '| MOTIVO: ' + motivo : ''}`);
        }
        
        // Verificar si el cliente tiene mapeo
        const idCliente = mapeo[cliente];
        if (idCliente === null || idCliente === undefined) {
          return;
        }
        
        console.log(`📝 Procesando línea ${processedRows}: ${tipoOperacion} - $${monto.toLocaleString('es-AR')} - ${cliente} → ID:${idCliente}`);
        
        if (tipoOperacion === 'Transferencia entrante' && monto > 0) {
          // Es una acreditación
          console.log(`[DEBUG] Valor crudo de la celda COMISION:`, row.COMISION);
          const comisionStr = (row.COMISION || '0').replace('%', '').replace(',', '.');
          const comision = parseFloat(comisionStr) || 0;
          const importeComision = monto * (comision / 100);
          console.log(`[DEBUG] Comisión para acreditación: original="${row.COMISION}" | parseada=${comision} | monto=${monto} | importeComision=${importeComision}`);
          const idTransaccion = row.ID_TRANSACCION || `HIST_${processedRows}`;
          
          acreditaciones.push({
            id_transaccion: idTransaccion,
            tipo: 'transferencia_entrante',
            concepto: 'Transferencia bancaria',
            importe: monto,
            estado: 'confirmado',
            titular: row.TITULAR || '',
            cuit: row.CUIT || '',
            fecha_hora: fecha || new Date(),
            fuente: 'historico',
            id_cliente: idCliente,
            comision: comision,
            importe_comision: importeComision,
            procesado: true,
            cotejado: true
          });
          
          // Crear comprobante simulado correspondiente
          const idComprobante = `HIST_WH_${idTransaccion}_${Date.now()}`;
          comprobantes.push({
            id_comprobante: idComprobante,
            nombre_remitente: row.TITULAR || 'Remitente Histórico',
            cuit: row.CUIT || '',
            importe: monto,
            fecha_envio: fecha || new Date(),
            fecha_recepcion: fecha || new Date(),
            estado: 'cotejado',
            procesado: true,
            cotejado: true,
            id_acreditacion: idTransaccion, // Vinculación con acreditación
            id_cliente: idCliente
          });
        } 
        // NUEVO: Procesar DEPOSITO como CRÉDITO en pagos
        else if (tipoOperacion === 'DEPOSITO' && monto > 0) {
          const idTransaccion = row.ID_TRANSACCION || `HIST_${processedRows}`;
          const comisionStr = (row.COMISION || '0').replace('%', '').replace(',', '.');
          const comision = parseFloat(comisionStr) || 0;
          const importeComision = monto * (comision / 100);
          pagos.push({
            id_cliente: idCliente,
            concepto: row.TITULAR || 'Depósito bancario',
            importe: monto,
            fecha_pago: fecha || new Date(),
            tipo_pago: 'credito',
            metodo_pago: 'deposito',
            referencia: idTransaccion,
            estado: 'confirmado',
            fuente: 'historico',
            comision: comision,
            importe_comision: importeComision
          });
        }
        else if ((tipoOperacion === 'Transferencia saliente' || tipoOperacion === 'PAGO' || tipoOperacion === 'TRANSFERENCIA SALIENTE') && monto !== 0) {
          // Es un pago/egreso
          const montoAbsoluto = Math.abs(monto);
          
          let metodoPago = 'transferencia';
          if (tipoOperacion === 'PAGO') {
            metodoPago = 'efectivo';
          }
          
          pagos.push({
            id_cliente: idCliente,
            concepto: `${tipoOperacion} - ${row.TITULAR || 'Sin especificar'}`,
            importe: montoAbsoluto,
            fecha_pago: fecha || new Date(),
            tipo_pago: 'egreso',
            metodo_pago: metodoPago,
            referencia: row.ID_TRANSACCION || '',
            estado: 'confirmado',
            fuente: 'historico'
          });
        }
      })
      .on('end', async () => {
        try {
          // Log de la última línea leída antes del EOF
          console.log(`\n🟢 Última línea leída antes de EOF:`, lastRow);

          // Log de la última línea procesada
          console.log(`\n🔚 Última línea procesada: ${processedRows}`);

          // Separar acreditaciones y cobros
          const acreditacionesTransfer = acreditaciones.filter(a => a.tipo === 'transferencia_entrante');
          const cobros = acreditaciones.filter(a => a.tipo === 'cobro');

          console.log(`\n📊 RESUMEN FINAL:`);
          console.log(`- Líneas procesadas: ${processedRows}`);
          console.log(`- Acreditaciones a insertar: ${acreditacionesTransfer.length}`);
          console.log(`- Cobros a insertar: ${cobros.length}`);
          console.log(`- Comprobantes a insertar: ${comprobantes.length}`);
          console.log(`- Pagos a insertar: ${pagos.length}`);

          // Mostrar detalle de acreditaciones (transferencias entrantes)
          if (acreditacionesTransfer.length > 0) {
            console.log('\n🔎 Detalle de acreditaciones a insertar:');
            acreditacionesTransfer.forEach((a, i) => {
              console.log(`${i+1}. [${a.tipo}] | Importe: $${a.importe} | Fecha: ${a.fecha_hora}`);
            });
          }
          // Mostrar detalle de cobros
          if (cobros.length > 0) {
            console.log('\n🔎 Detalle de cobros a insertar:');
            cobros.forEach((a, i) => {
              console.log(`${i+1}. [${a.tipo}] | Importe: $${a.importe} | Fecha: ${a.fecha_hora}`);
            });
          }
          // Mostrar detalle de comprobantes
          if (comprobantes.length > 0) {
            console.log('\n🔎 Detalle de comprobantes a insertar:');
            comprobantes.forEach((c, i) => {
              console.log(`${i+1}. Importe: $${c.importe} | Fecha: ${c.fecha_envio}`);
            });
          }
          // Mostrar detalle de pagos
          if (pagos.length > 0) {
            console.log('\n🔎 Detalle de pagos a insertar:');
            pagos.forEach((p, i) => {
              console.log(`${i+1}. | Importe: $${p.importe} | Fecha: ${p.fecha_pago}`);
            });
          }
          
          // Confirmar antes de insertar
          const confirmar = await question('\n❓ ¿Proceder con la inserción en la base de datos? (s/n): ');
          if (confirmar.toLowerCase() !== 's' && confirmar.toLowerCase() !== 'si') {
            console.log('❌ Importación cancelada por el usuario');
            resolve();
            return;
          }
          
          // Insertar acreditaciones y establecer vinculaciones
          if (acreditacionesTransfer.length > 0) {
            console.log('\n💰 Insertando acreditaciones...');
            const batchSize = 50;
            
            for (let i = 0; i < acreditacionesTransfer.length; i += batchSize) {
              const batch = acreditacionesTransfer.slice(i, i + batchSize);
              
              const values = batch.map(acred => 
                `('${acred.id_transaccion}', '${acred.tipo}', '${acred.concepto}', ${acred.importe}, '${acred.estado}', '${acred.titular.replace(/'/g, "''")}', '${acred.cuit}', '${acred.fecha_hora.toISOString()}', '${acred.fuente}', ${acred.id_cliente}, ${acred.comision}, ${acred.importe_comision}, ${acred.procesado}, ${acred.cotejado})`
              ).join(',');
              
              const query = `
                INSERT INTO acreditaciones (
                  id_transaccion, tipo, concepto, importe, estado, titular, cuit, 
                  fecha_hora, fuente, id_cliente, comision, importe_comision, procesado, cotejado
                ) VALUES ${values}
                ON CONFLICT (id_transaccion) DO NOTHING
              `;
              
              await db.query(query);
              console.log(`  ✅ Lote ${Math.floor(i/batchSize) + 1}: ${batch.length} acreditaciones`);
            }
          }
          
          // Insertar comprobantes WhatsApp simulados con vinculación correcta
          if (comprobantes.length > 0) {
            console.log('\n📱 Insertando comprobantes WhatsApp simulados...');
            const batchSize = 50;
            
            for (let i = 0; i < comprobantes.length; i += batchSize) {
              const batch = comprobantes.slice(i, i + batchSize);
              
              // Insertar comprobantes uno por uno para obtener vinculaciones correctas
              for (const comp of batch) {
                // Obtener el ID real de la acreditación
                const acredResult = await db.query(
                  'SELECT id FROM acreditaciones WHERE id_transaccion = $1', 
                  [comp.id_acreditacion]
                );
                
                if (acredResult.rows.length > 0) {
                  const idAcreditacionReal = acredResult.rows[0].id;
                  
                  // Insertar comprobante con ID real de acreditación (como string)
                  await db.query(`
                    INSERT INTO comprobantes_whatsapp (
                      id_comprobante, nombre_remitente, cuit, importe, fecha_envio, 
                      fecha_recepcion, estado, procesado, cotejado, id_acreditacion, id_cliente
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    ON CONFLICT (id_comprobante) DO NOTHING
                  `, [
                    comp.id_comprobante,
                    comp.nombre_remitente,
                    comp.cuit,
                    comp.importe,
                    comp.fecha_envio,
                    comp.fecha_recepcion,
                    comp.estado,
                    comp.procesado,
                    comp.cotejado,
                    idAcreditacionReal.toString(), // Convertir a string para coincidir con el tipo VARCHAR
                    comp.id_cliente
                  ]);
                  
                  // Actualizar acreditación con id_comprobante_whatsapp
                  await db.query(
                    'UPDATE acreditaciones SET id_comprobante_whatsapp = $1 WHERE id = $2',
                    [comp.id_comprobante, idAcreditacionReal]
                  );
                }
              }
              
              console.log(`  ✅ Lote ${Math.floor(i/batchSize) + 1}: ${batch.length} comprobantes con vinculaciones`);
            }
          }
          
          // Insertar pagos
          if (pagos.length > 0) {
            console.log('\n💸 Insertando pagos...');
            const batchSize = 50;
            
            for (let i = 0; i < pagos.length; i += batchSize) {
              const batch = pagos.slice(i, i + batchSize);
              
              const values = batch.map(pago => 
                `(${pago.id_cliente}, '${pago.concepto.replace(/'/g, "''")}', ${pago.importe}, '${pago.fecha_pago.toISOString()}', '${pago.tipo_pago}', '${pago.metodo_pago}', '${pago.referencia}', '${pago.estado}', '${pago.fuente}', ${pago.comision ?? 0}, ${pago.importe_comision ?? 0})`
              ).join(',');
              
              const query = `
                INSERT INTO pagos (
                  id_cliente, concepto, importe, fecha_pago, tipo_pago, metodo_pago, referencia, estado, fuente, comision, importe_comision
                ) VALUES ${values}
              `;
              
              await db.query(query);
              console.log(`  ✅ Lote ${Math.floor(i/batchSize) + 1}: ${batch.length} pagos`);
            }
          }
          
          console.log('\n🎉 IMPORTACIÓN COMPLETADA!');
          
          // Estadísticas finales
          const statsAcred = await db.query("SELECT COUNT(*) as total FROM acreditaciones WHERE fuente = 'historico'");
          const statsComprob = await db.query("SELECT COUNT(*) as total FROM comprobantes_whatsapp WHERE id_comprobante LIKE 'HIST_WH_%'");
          const statsPagos = await db.query("SELECT COUNT(*) as total FROM pagos WHERE fuente = 'historico'");
          
          console.log(`\n📈 ESTADÍSTICAS EN BASE DE DATOS:`);
          console.log(`- Acreditaciones históricas: ${statsAcred.rows[0].total}`);
          console.log(`- Comprobantes históricos: ${statsComprob.rows[0].total}`);
          console.log(`- Pagos históricos: ${statsPagos.rows[0].total}`);
          
          // Verificar vinculaciones bidireccionales
          const vinculaciones = await db.query(`
            SELECT COUNT(*) as total 
            FROM acreditaciones a 
            INNER JOIN comprobantes_whatsapp c ON a.id = c.id_acreditacion::integer 
            WHERE a.fuente = 'historico' AND c.id_comprobante LIKE 'HIST_WH_%'
            AND a.id_comprobante_whatsapp = c.id_comprobante
          `);
          console.log(`- Vinculaciones bidireccionales acreditación ↔ comprobante: ${vinculaciones.rows[0].total}`);
          
          // Verificar acreditaciones sin comprobante
          const sinComprobante = await db.query(`
            SELECT COUNT(*) as total 
            FROM acreditaciones 
            WHERE fuente = 'historico' AND id_comprobante_whatsapp IS NULL
          `);
          console.log(`- Acreditaciones sin comprobante vinculado: ${sinComprobante.rows[0].total}`);
          
          // Verificar comprobantes sin acreditación
          const sinAcreditacion = await db.query(`
            SELECT COUNT(*) as total 
            FROM comprobantes_whatsapp 
            WHERE id_comprobante LIKE 'HIST_WH_%' AND id_acreditacion IS NULL
          `);
          console.log(`- Comprobantes sin acreditación vinculada: ${sinAcreditacion.rows[0].total}`);
          
          resolve();
          
        } catch (error) {
          console.error('❌ Error durante la inserción:', error);
          reject(error);
        }
      })
      .on('error', reject);
  });
}

// Función principal
async function main() {
  try {
    console.log(`🚀 IMPORTACIÓN INTERACTIVA DE ${archivoCSV}`);
    console.log('📋 Procesando archivo completo\n');
    
    // Conectar a la base de datos
    console.log('🔌 Conectando a la base de datos...');
    await db.connect();
    
    // Preguntar si quiere importar solo un cliente
    console.log('🎯 MODO DE IMPORTACIÓN');
    console.log('='.repeat(50));
    console.log('1. Importar todos los clientes (modo completo)');
    console.log('2. Importar datos de UN SOLO cliente específico');
    
    let modoImportacion;
    do {
      modoImportacion = await question('\n👉 Selecciona el modo (1 o 2): ');
      modoImportacion = parseInt(modoImportacion);
    } while (modoImportacion !== 1 && modoImportacion !== 2);
    
    let clienteEspecifico = null;
    if (modoImportacion === 2) {
      // Analizar CSV para mostrar clientes disponibles
      const { clientesEnCSV } = await analyzeCSV();
      
      console.log('\n📄 CLIENTES DISPONIBLES EN EL CSV:');
      console.log('='.repeat(50));
      const clientesLimpios = clientesEnCSV.filter(cliente => cliente && cliente !== 'CLIENTE');
      clientesLimpios.forEach((cliente, index) => {
        console.log(`${index + 1}. ${cliente}`);
      });
      
      console.log('\n👥 También puedes escribir el nombre exacto si no aparece en la lista');
      console.log('💡 Tip: Puedes escribir solo una parte del nombre para buscar');
      clienteEspecifico = await question('\n👉 Ingresa el nombre del cliente a importar: ');
      clienteEspecifico = clienteEspecifico.trim();
      
      console.log(`\n✅ Modo seleccionado: Importar SOLO datos de "${clienteEspecifico}"`);
    } else {
      console.log('\n✅ Modo seleccionado: Importar TODOS los clientes');
    }
    
    // Analizar CSV (completo o filtrado)
    const { clientesEnCSV, estadisticasPorCliente } = await analyzeCSV();
    
    // Filtrar clientes si se seleccionó modo específico
    let clientesFiltrados = clientesEnCSV;
    if (clienteEspecifico) {
      clientesFiltrados = clientesEnCSV.filter(cliente => 
        cliente && cliente.toLowerCase().includes(clienteEspecifico.toLowerCase())
      );
      
      if (clientesFiltrados.length === 0) {
        console.log(`\n❌ No se encontró el cliente "${clienteEspecifico}" en el CSV`);
        console.log('Los clientes disponibles son:');
        clientesEnCSV.forEach(cliente => {
          if (cliente && cliente !== 'CLIENTE') {
            console.log(`  - ${cliente}`);
          }
        });
        return;
      }
      
      if (clientesFiltrados.length > 1) {
        console.log(`\n⚠️  Se encontraron múltiples coincidencias para "${clienteEspecifico}":`);
        clientesFiltrados.forEach((cliente, index) => {
          console.log(`${index + 1}. ${cliente}`);
        });
        
        let seleccion;
        do {
          seleccion = await question(`\n👉 Selecciona el cliente exacto (1-${clientesFiltrados.length}): `);
          seleccion = parseInt(seleccion);
        } while (isNaN(seleccion) || seleccion < 1 || seleccion > clientesFiltrados.length);
        
        clientesFiltrados = [clientesFiltrados[seleccion - 1]];
      }
      
      console.log(`\n🎯 Cliente seleccionado: "${clientesFiltrados[0]}"`);
    }
    
    // Obtener clientes del sistema
    const clientesSistema = await getClientesDelSistema();
    
    console.log(`\n✅ Análisis completado:`);
    console.log(`- Clientes a procesar: ${clientesFiltrados.length}`);
    console.log(`- Clientes en sistema: ${clientesSistema.length}`);
    
    // Crear mapeo interactivo (solo para los clientes filtrados)
    const mapeo = await crearMapeoClientes(clientesFiltrados, clientesSistema, estadisticasPorCliente);
    
    console.log('\n📋 RESUMEN DEL MAPEO:');
    console.log('='.repeat(50));
    Object.keys(mapeo).forEach(clienteCSV => {
      const idCliente = mapeo[clienteCSV];
      if (idCliente === null) {
        console.log(`❌ "${clienteCSV}" → SALTAR`);
      } else {
        const clienteSistema = clientesSistema.find(c => c.id === idCliente);
        console.log(`✅ "${clienteCSV}" → ${clienteSistema.nombre} (ID: ${idCliente})`);
      }
    });
    
    // Importar con el mapeo
    await importarConMapeo(mapeo);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    rl.close();
    await db.disconnect();
  }
}

// Ejecutar
if (require.main === module) {
  main()
    .then(() => {
      console.log('\n✅ Proceso completado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error fatal:', error);
      process.exit(1);
    });
}

module.exports = { main };