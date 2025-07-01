const fs = require('fs');
const csv = require('csv-parser');
const Database = require('./config/database');

// Función para limpiar y convertir montos
function parseAmount(amountStr) {
  if (!amountStr || amountStr === '-') return 0;
  // Remover comillas, comas y espacios
  let cleaned = amountStr.replace(/[",\s]/g, '');
  // Convertir a número
  return parseFloat(cleaned) || 0;
}

// Función para convertir fecha al formato ISO
function parseDate(dateStr) {
  if (!dateStr || dateStr === '-') return null;
  
  // Si ya está en formato ISO (YYYY-MM-DD HH:MM:SS)
  if (dateStr.includes('-') && dateStr.length > 10) {
    return new Date(dateStr);
  }
  
  // Formato DD/MM/YYYY
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1; // Mes base 0
    const year = parseInt(parts[2]);
    return new Date(year, month, day);
  }
  
  return null;
}

// Mapeo de clientes
const clienteMap = {
  'DyS': 1,
  'CHARLY': 2,
  'SUPLEMENTOS PROFIT': 3,
  'CLIC': 4,
  'PILATES': 5,
  'ODONTOLOGIA': 6,
  'NICO BRAGA': 7,
  'DANIEL DINOTO': 8,
  'PURO ESCABIO': 9,
  'NICO FRICIA': 10,
  'JUAN LYNN': 11,
  'SOHO': 12,
  'MIRANDA': 13,
  'KIWI FINANCE': 14,
  'NO IDENTIFICADO': 15,
  'DOLARIZAMOS PARA CAMIONETA': 2 // Asignar a CHARLY
};

async function bulkImportData() {
  const db = new Database();
  
  try {
    console.log('🔌 Conectando a la base de datos...');
    await db.connect();
    
    console.log('📖 Leyendo archivo datosFULL.csv...');
    
    const acreditaciones = [];
    const pagos = [];
    let processedRows = 0;
    const maxRows = 1000;
    
    return new Promise((resolve, reject) => {
      fs.createReadStream('datosFULL.csv')
        .pipe(csv({
          headers: ['ID', 'FECHA', 'ID_TRANSACCION', 'TIPO_OPERACION', 'MONTO', 'TITULAR', 'CUIT', 'FECHA_COMPROB', 'CLIENTE', 'COMISION', 'NETO', 'SALDO']
        }))
        .on('data', (row) => {
          processedRows++;
          
          // Procesar solo las primeras 1000 líneas
          if (processedRows > maxRows) {
            return;
          }
          
          const tipoOperacion = row.TIPO_OPERACION?.trim();
          const monto = parseAmount(row.MONTO);
          const fecha = parseDate(row.FECHA);
          const cliente = row.CLIENTE?.trim();
          const idCliente = clienteMap[cliente] || null;
          
          // Saltar saldos anteriores
          if (tipoOperacion === 'SALDO ANTERIOR') {
            return;
          }
          
          console.log(`Procesando línea ${processedRows}: ${tipoOperacion} - ${monto} - ${cliente}`);
          
          if (tipoOperacion === 'Transferencia entrante' && monto > 0 && idCliente) {
            // Es una acreditación
            const comisionStr = row.COMISION?.replace('%', '') || '0';
            const comision = parseFloat(comisionStr) || 0;
            const importeComision = monto * (comision / 100);
            
            acreditaciones.push({
              id_transaccion: row.ID_TRANSACCION || `HIST_${processedRows}`,
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
          } 
          else if ((tipoOperacion === 'Transferencia saliente' || tipoOperacion === 'PAGO' || tipoOperacion === 'TRANSFERENCIA SALIENTE') && monto !== 0) {
            // Es un pago/egreso
            const montoAbsoluto = Math.abs(monto);
            
            // Determinar método de pago
            let metodoPago = 'transferencia';
            if (tipoOperacion === 'PAGO') {
              metodoPago = 'efectivo';
            }
            
            pagos.push({
              id_cliente: idCliente || 1, // Default a DyS si no se identifica
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
            console.log(`\n📊 Resumen de datos procesados:`);
            console.log(`- Líneas procesadas: ${processedRows}`);
            console.log(`- Acreditaciones: ${acreditaciones.length}`);
            console.log(`- Pagos: ${pagos.length}`);
            
            // Insertar acreditaciones en lotes
            if (acreditaciones.length > 0) {
              console.log('\n💰 Insertando acreditaciones...');
              const batchSize = 100;
              
              for (let i = 0; i < acreditaciones.length; i += batchSize) {
                const batch = acreditaciones.slice(i, i + batchSize);
                
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
                console.log(`  ✅ Insertadas ${batch.length} acreditaciones (lote ${Math.floor(i/batchSize) + 1})`);
              }
            }
            
            // Insertar pagos en lotes
            if (pagos.length > 0) {
              console.log('\n💸 Insertando pagos...');
              const batchSize = 100;
              
              for (let i = 0; i < pagos.length; i += batchSize) {
                const batch = pagos.slice(i, i + batchSize);
                
                const values = batch.map(pago => 
                  `(${pago.id_cliente}, '${pago.concepto.replace(/'/g, "''")}', ${pago.importe}, '${pago.fecha_pago.toISOString()}', '${pago.tipo_pago}', '${pago.metodo_pago}', '${pago.referencia}', '${pago.estado}', '${pago.fuente}')`
                ).join(',');
                
                const query = `
                  INSERT INTO pagos (
                    id_cliente, concepto, importe, fecha_pago, tipo_pago, metodo_pago, referencia, estado, fuente
                  ) VALUES ${values}
                `;
                
                await db.query(query);
                console.log(`  ✅ Insertados ${batch.length} pagos (lote ${Math.floor(i/batchSize) + 1})`);
              }
            }
            
            console.log('\n🎉 Importación completada exitosamente!');
            
            // Estadísticas finales
            const statsAcred = await db.query("SELECT COUNT(*) as total FROM acreditaciones WHERE fuente = 'historico'");
            const statsPagos = await db.query("SELECT COUNT(*) as total FROM pagos WHERE fuente = 'historico'");
            
            console.log(`\n📈 Estadísticas en base de datos:`);
            console.log(`- Acreditaciones históricas: ${statsAcred.rows[0].total}`);
            console.log(`- Pagos históricos: ${statsPagos.rows[0].total}`);
            
            resolve();
            
          } catch (error) {
            console.error('❌ Error durante la inserción:', error);
            reject(error);
          }
        })
        .on('error', (error) => {
          console.error('❌ Error leyendo el archivo:', error);
          reject(error);
        });
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await db.disconnect();
  }
}

// Ejecutar solo si se llama directamente
if (require.main === module) {
  console.log('🚀 Iniciando importación masiva de datosFULL.csv (primeras 1000 líneas)');
  console.log('⚠️  ADVERTENCIA: Este script insertará datos históricos en la base de datos');
  console.log('');
  
  bulkImportData()
    .then(() => {
      console.log('✅ Proceso completado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error fatal:', error);
      process.exit(1);
    });
}

module.exports = { bulkImportData }; 