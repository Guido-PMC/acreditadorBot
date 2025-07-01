const fs = require('fs');
const csv = require('csv-parser');

// Función para limpiar y convertir montos
function parseAmount(amountStr) {
  if (!amountStr || amountStr === '-') return 0;
  let cleaned = amountStr.replace(/[",\s]/g, '');
  return parseFloat(cleaned) || 0;
}

// Función para analizar el CSV y extraer clientes únicos
async function analyzeCSV() {
  console.log('📊 Analizando clientes en datosFULL.csv...\n');
  
  const clientesEnCSV = new Set();
  const estadisticasPorCliente = {};
  let totalLineas = 0;
  const maxRows = 1000;
  
  return new Promise((resolve, reject) => {
    fs.createReadStream('datosFULL.csv')
      .pipe(csv({
        headers: ['ID', 'FECHA', 'ID_TRANSACCION', 'TIPO_OPERACION', 'MONTO', 'TITULAR', 'CUIT', 'FECHA_COMPROB', 'CLIENTE', 'COMISION', 'NETO', 'SALDO']
      }))
      .on('data', (row) => {
        totalLineas++;
        
        if (totalLineas > maxRows) return;
        
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
            totalImporteBruto: 0,
            totalComisiones: 0,
            totalImporteNeto: 0,
            ejemploTitular: '',
            ejemploComision: ''
          };
        }
        
        // Guardar un ejemplo de titular para referencia
        if (row.TITULAR && !estadisticasPorCliente[cliente].ejemploTitular) {
          estadisticasPorCliente[cliente].ejemploTitular = row.TITULAR;
        }
        
        // Procesar comisiones
        const comisionStr = row.COMISION?.replace('%', '') || '0';
        const comision = parseFloat(comisionStr) || 0;
        const importeComision = Math.abs(monto) * (comision / 100);
        const importeNeto = Math.abs(monto) - importeComision;
        
        // Guardar ejemplo de comisión
        if (comision > 0 && !estadisticasPorCliente[cliente].ejemploComision) {
          estadisticasPorCliente[cliente].ejemploComision = `${comision}%`;
        }
        
        if (tipoOperacion === 'Transferencia entrante') {
          estadisticasPorCliente[cliente].transferenciasEntrantes++;
        } else if (tipoOperacion === 'Transferencia saliente') {
          estadisticasPorCliente[cliente].transferenciasSalientes++;
        } else if (tipoOperacion === 'PAGO' || tipoOperacion === 'TRANSFERENCIA SALIENTE') {
          estadisticasPorCliente[cliente].pagos++;
        }
        
        estadisticasPorCliente[cliente].totalImporteBruto += Math.abs(monto);
        estadisticasPorCliente[cliente].totalComisiones += importeComision;
        estadisticasPorCliente[cliente].totalImporteNeto += importeNeto;
      })
      .on('end', () => {
        resolve({ clientesEnCSV: Array.from(clientesEnCSV), estadisticasPorCliente, totalLineas });
      })
      .on('error', reject);
  });
}

// Función principal
async function main() {
  try {
    console.log('🔍 ANÁLISIS DE CLIENTES EN datosFULL.csv');
    console.log('📋 Analizando primeras 1000 líneas\n');
    console.log('='.repeat(70));
    
    // Analizar CSV
    const { clientesEnCSV, estadisticasPorCliente, totalLineas } = await analyzeCSV();
    
    console.log(`\n✅ ANÁLISIS COMPLETADO:`);
    console.log(`- Total líneas procesadas: ${totalLineas}`);
    console.log(`- Clientes únicos encontrados: ${clientesEnCSV.length}\n`);
    
    console.log('📊 CLIENTES ENCONTRADOS EN EL CSV:');
    console.log('='.repeat(70));
    
    // Ordenar clientes por volumen total (importe bruto)
    const clientesOrdenados = clientesEnCSV.sort((a, b) => {
      return estadisticasPorCliente[b].totalImporteBruto - estadisticasPorCliente[a].totalImporteBruto;
    });
    
    clientesOrdenados.forEach((cliente, index) => {
      const stats = estadisticasPorCliente[cliente];
      
      console.log(`\n${index + 1}. 🏢 "${cliente}"`);
      console.log(`   💰 Importe bruto: $${stats.totalImporteBruto.toLocaleString('es-AR', {minimumFractionDigits: 2})}`);
      console.log(`   💸 Comisiones: $${stats.totalComisiones.toLocaleString('es-AR', {minimumFractionDigits: 2})}`);
      console.log(`   💵 Importe neto: $${stats.totalImporteNeto.toLocaleString('es-AR', {minimumFractionDigits: 2})}`);
      console.log(`   📈 Transferencias entrantes: ${stats.transferenciasEntrantes}`);
      console.log(`   📉 Transferencias salientes: ${stats.transferenciasSalientes}`);
      console.log(`   💳 Pagos: ${stats.pagos}`);
      if (stats.ejemploComision) {
        console.log(`   📊 Comisión típica: ${stats.ejemploComision}`);
      }
      if (stats.ejemploTitular) {
        console.log(`   👤 Ejemplo titular: ${stats.ejemploTitular}`);
      }
    });
    
    console.log('\n' + '='.repeat(70));
    console.log('📋 RESUMEN POR TIPO DE OPERACIÓN:');
    
    let totalEntrantes = 0;
    let totalSalientes = 0;
    let totalPagos = 0;
    let totalImporteBruto = 0;
    let totalComisiones = 0;
    let totalImporteNeto = 0;
    
    clientesOrdenados.forEach(cliente => {
      const stats = estadisticasPorCliente[cliente];
      totalEntrantes += stats.transferenciasEntrantes;
      totalSalientes += stats.transferenciasSalientes;
      totalPagos += stats.pagos;
      totalImporteBruto += stats.totalImporteBruto;
      totalComisiones += stats.totalComisiones;
      totalImporteNeto += stats.totalImporteNeto;
    });
    
    console.log(`- Total transferencias entrantes: ${totalEntrantes}`);
    console.log(`- Total transferencias salientes: ${totalSalientes}`);
    console.log(`- Total pagos: ${totalPagos}`);
    console.log(`- Importe bruto total: $${totalImporteBruto.toLocaleString('es-AR', {minimumFractionDigits: 2})}`);
    console.log(`- Comisiones totales: $${totalComisiones.toLocaleString('es-AR', {minimumFractionDigits: 2})}`);
    console.log(`- Importe neto total: $${totalImporteNeto.toLocaleString('es-AR', {minimumFractionDigits: 2})}`);
    
    console.log('\n💡 PRÓXIMOS PASOS:');
    console.log('1. Revisa los clientes encontrados arriba');
    console.log('2. Compara con los clientes que tienes en tu sistema');
    console.log('3. Ejecuta bulk_import_interactive.js cuando tengas la contraseña de Railway');
    console.log('4. El script interactivo te permitirá mapear cada cliente del CSV a tu sistema');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Ejecutar
if (require.main === module) {
  main()
    .then(() => {
      console.log('\n✅ Análisis completado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error fatal:', error);
      process.exit(1);
    });
}

module.exports = { main, analyzeCSV }; 