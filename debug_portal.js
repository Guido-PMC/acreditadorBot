// ===== SCRIPT DE DEBUGGING PARA PORTAL DASHBOARD =====
// Ejecutar en la consola de Chrome (F12 -> Console)

console.log('🔍 INICIANDO DEBUGGING DEL PORTAL DASHBOARD');

// Función para obtener el token del localStorage
function getToken() {
    return localStorage.getItem('portal_token');
}

// Función para hacer requests autenticados
async function debugRequest(endpoint) {
    const token = getToken();
    if (!token) {
        console.error('❌ No hay token de autenticación');
        return null;
    }

    try {
        const response = await fetch(endpoint, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            console.error(`❌ Error ${response.status}: ${response.statusText}`);
            return null;
        }
        
        return await response.json();
    } catch (error) {
        console.error('❌ Error en request:', error);
        return null;
    }
}

// Función principal de debugging
async function debugPortal() {
    console.log('🚀 Iniciando debugging completo...');
    
    // 1. Verificar token
    const token = getToken();
    console.log('🔑 Token encontrado:', token ? 'SÍ' : 'NO');
    if (token) {
        console.log('🔑 Token (primeros 20 chars):', token.substring(0, 20) + '...');
    }
    
    // 2. Obtener perfil del usuario
    console.log('\n👤 === PERFIL DEL USUARIO ===');
    const profile = await debugRequest('/portal/profile');
    if (profile && profile.success) {
        console.log('✅ Perfil:', profile.data);
        console.log('👤 Cliente ID:', profile.data.cliente_id);
    } else {
        console.log('❌ Error obteniendo perfil:', profile);
    }
    
    // 3. Obtener resumen (saldo actual)
    console.log('\n💰 === RESUMEN Y SALDOS ===');
    const resumen = await debugRequest('/portal/resumen');
    if (resumen && resumen.success) {
        console.log('✅ Resumen completo:', resumen.data);
        
        const data = resumen.data;
        console.log('📊 Acreditaciones totales:', data.acreditaciones?.total_acreditaciones || 0);
        console.log('📊 Acreditaciones cotejadas:', data.acreditaciones?.acreditaciones_cotejadas || 0);
        console.log('📊 Acreditaciones pendientes:', data.acreditaciones?.acreditaciones_pendientes || 0);
        console.log('💰 Total importe acreditaciones:', data.acreditaciones?.total_importe_acreditaciones || 0);
        console.log('💰 Total importe cotejadas:', data.acreditaciones?.total_importe_cotejadas || 0);
        console.log('💰 Total importe pendientes:', data.acreditaciones?.total_importe_pendientes || 0);
        console.log('💸 Total comisiones:', data.acreditaciones?.total_comisiones || 0);
        console.log('💸 Comisiones cotejadas:', data.acreditaciones?.total_comisiones_cotejadas || 0);
        console.log('💸 Comisiones pendientes:', data.acreditaciones?.total_comisiones_pendientes || 0);
        console.log('💳 Saldo actual:', data.saldo_actual || 0);
        console.log('⏳ Saldo pendiente:', data.saldo_pendiente || 0);
        console.log('📈 Saldo total:', data.saldo_total || 0);
        
        // Verificar cálculos
        const saldoCalculado = (data.acreditaciones?.total_importe_cotejadas || 0) - 
                              (data.acreditaciones?.total_comisiones_cotejadas || 0) + 
                              (data.movimientos?.total_importe_creditos || 0) - 
                              (data.movimientos?.total_importe_pagos || 0);
        console.log('🧮 Saldo calculado manualmente:', saldoCalculado);
        console.log('✅ ¿Coincide con saldo actual?', saldoCalculado === data.saldo_actual);
    } else {
        console.log('❌ Error obteniendo resumen:', resumen);
    }
    
    // 4. Obtener acreditaciones específicas del cliente
    console.log('\n📋 === ACREDITACIONES DEL CLIENTE ===');
    const acreditaciones = await debugRequest('/api/acreditaciones?cliente_id=' + (profile?.data?.cliente_id || ''));
    if (acreditaciones && acreditaciones.success) {
        console.log('✅ Acreditaciones encontradas:', acreditaciones.data.length);
        
        // Mostrar detalles de cada acreditación
        acreditaciones.data.forEach((acred, index) => {
            console.log(`📄 Acreditación ${index + 1}:`, {
                id: acred.id,
                importe: acred.importe,
                comision: acred.comision + '%',
                importe_comision: acred.importe_comision,
                neto: acred.importe - acred.importe_comision,
                cotejado: acred.cotejado ? '✅' : '⏳',
                fecha: acred.fecha
            });
        });
        
        // Resumen de comisiones
        const totalComisiones = acreditaciones.data.reduce((sum, acred) => sum + (acred.importe_comision || 0), 0);
        const comisionesCotejadas = acreditaciones.data
            .filter(acred => acred.cotejado)
            .reduce((sum, acred) => sum + (acred.importe_comision || 0), 0);
        const comisionesPendientes = acreditaciones.data
            .filter(acred => !acred.cotejado)
            .reduce((sum, acred) => sum + (acred.importe_comision || 0), 0);
            
        console.log('💸 Resumen de comisiones:');
        console.log('   - Total comisiones:', totalComisiones);
        console.log('   - Comisiones cotejadas:', comisionesCotejadas);
        console.log('   - Comisiones pendientes:', comisionesPendientes);
    } else {
        console.log('❌ Error obteniendo acreditaciones:', acreditaciones);
    }
    
    // 5. Obtener movimientos (pagos y créditos)
    console.log('\n💳 === MOVIMIENTOS (PAGOS Y CRÉDITOS) ===');
    const movimientos = await debugRequest('/portal/movimientos?limit=50');
    if (movimientos && movimientos.success) {
        console.log('✅ Movimientos encontrados:', movimientos.data.length);
        
        const pagos = movimientos.data.filter(m => m.tipo_pago === 'egreso');
        const creditos = movimientos.data.filter(m => m.tipo_pago === 'credito');
        
        console.log('💸 Pagos:', pagos.length, 'Total:', pagos.reduce((sum, p) => sum + p.importe, 0));
        console.log('💰 Créditos:', creditos.length, 'Total:', creditos.reduce((sum, c) => sum + c.importe, 0));
        
        // Mostrar últimos 5 movimientos
        console.log('📋 Últimos 5 movimientos:');
        movimientos.data.slice(0, 5).forEach((mov, index) => {
            console.log(`   ${index + 1}. ${mov.tipo_pago === 'credito' ? '💰' : '💸'} ${mov.concepto} - $${mov.importe} (${mov.fecha_pago})`);
        });
    } else {
        console.log('❌ Error obteniendo movimientos:', movimientos);
    }
    
    // 6. Verificar datos del cliente
    console.log('\n👤 === DATOS DEL CLIENTE ===');
    const cliente = await debugRequest('/api/clientes/' + (profile?.data?.cliente_id || ''));
    if (cliente && cliente.success) {
        console.log('✅ Datos del cliente:', cliente.data);
        console.log('💸 Comisión del cliente:', cliente.data.comision + '%');
    } else {
        console.log('❌ Error obteniendo datos del cliente:', cliente);
    }
    
    console.log('\n🎯 === RESUMEN DEL DEBUGGING ===');
    console.log('✅ Si ves "✅" en todos los puntos, el sistema está funcionando correctamente');
    console.log('❌ Si ves "❌", hay un problema que necesita atención');
    console.log('🔍 Revisa los valores de comisiones y saldos para verificar que coincidan');
}

// Función para verificar una acreditación específica
async function debugAcreditacion(acreditacionId) {
    console.log(`🔍 Debugging acreditación ID: ${acreditacionId}`);
    
    const acreditacion = await debugRequest(`/api/acreditaciones/${acreditacionId}`);
    if (acreditacion && acreditacion.success) {
        console.log('✅ Acreditación:', acreditacion.data);
        console.log('💰 Importe:', acreditacion.data.importe);
        console.log('💸 Comisión:', acreditacion.data.comision + '%');
        console.log('💸 Importe comisión:', acreditacion.data.importe_comision);
        console.log('📊 Neto:', acreditacion.data.importe - acreditacion.data.importe_comision);
    } else {
        console.log('❌ Error obteniendo acreditación:', acreditacion);
    }
}

// Función para recargar el dashboard
function reloadDashboard() {
    console.log('🔄 Recargando dashboard...');
    if (typeof loadResumen === 'function') {
        loadResumen();
        console.log('✅ Dashboard recargado');
    } else {
        console.log('❌ Función loadResumen no encontrada');
    }
}

// Ejecutar debugging automáticamente
console.log('🚀 Ejecutando debugging automático...');
debugPortal();

// Comandos disponibles en la consola:
console.log('\n📝 COMANDOS DISPONIBLES:');
console.log('- debugPortal() - Ejecutar debugging completo');
console.log('- debugAcreditacion(ID) - Debuggear acreditación específica');
console.log('- reloadDashboard() - Recargar dashboard');
console.log('- getToken() - Obtener token actual'); 