/**
 * Utilidades para cálculo de liberación de fondos
 * Reglas:
 * - Corte a las 15:00 de cada día
 * - Sábados y domingos no cuentan
 * - Acreditaciones post 15:00 cuentan como día siguiente
 */

/**
 * Calcula la fecha de liberación de un fondo
 * @param {Date} fechaRecepcion - Fecha de recepción del fondo
 * @param {number} plazoHoras - Plazo en horas (24, 48, 72, 96)
 * @returns {Date} - Fecha de liberación
 */
function calcularFechaLiberacion(fechaRecepcion, plazoHoras) {
  // Convertir a objeto Date si es string
  const fecha = new Date(fechaRecepcion);
  
  // Aplicar corte de 15:00
  const fechaCorte = new Date(fecha);
  fechaCorte.setHours(15, 0, 0, 0);
  
  // Si la fecha es después de las 15:00, contar como día siguiente
  let fechaInicio = fecha;
  if (fecha > fechaCorte) {
    fechaInicio = new Date(fecha);
    fechaInicio.setDate(fechaInicio.getDate() + 1);
    fechaInicio.setHours(0, 0, 0, 0);
  } else {
    fechaInicio = new Date(fecha);
    fechaInicio.setHours(0, 0, 0, 0);
  }
  
  // Calcular fecha de liberación
  let fechaLiberacion = new Date(fechaInicio);
  let horasAgregadas = 0;
  
  while (horasAgregadas < plazoHoras) {
    fechaLiberacion.setHours(fechaLiberacion.getHours() + 1);
    horasAgregadas++;
    
    // Si es sábado (6) o domingo (0), saltar al lunes
    const diaSemana = fechaLiberacion.getDay();
    if (diaSemana === 0) { // Domingo
      fechaLiberacion.setDate(fechaLiberacion.getDate() + 1);
      fechaLiberacion.setHours(0, 0, 0, 0);
    } else if (diaSemana === 6) { // Sábado
      fechaLiberacion.setDate(fechaLiberacion.getDate() + 2);
      fechaLiberacion.setHours(0, 0, 0, 0);
    }
  }
  
  return fechaLiberacion;
}

/**
 * Verifica si un fondo ya está liberado
 * @param {Date} fechaRecepcion - Fecha de recepción
 * @param {number} plazoHoras - Plazo en horas
 * @returns {boolean} - true si está liberado, false si no
 */
function estaLiberado(fechaRecepcion, plazoHoras) {
  const fechaLiberacion = calcularFechaLiberacion(fechaRecepcion, plazoHoras);
  const ahora = new Date();
  return ahora >= fechaLiberacion;
}

/**
 * Calcula cuántas horas faltan para la liberación
 * @param {Date} fechaRecepcion - Fecha de recepción
 * @param {number} plazoHoras - Plazo en horas
 * @returns {number} - Horas restantes (0 si ya está liberado)
 */
function horasRestantes(fechaRecepcion, plazoHoras) {
  const fechaLiberacion = calcularFechaLiberacion(fechaRecepcion, plazoHoras);
  const ahora = new Date();
  
  if (ahora >= fechaLiberacion) {
    return 0;
  }
  
  const diffMs = fechaLiberacion - ahora;
  const diffHoras = Math.ceil(diffMs / (1000 * 60 * 60));
  return Math.max(0, diffHoras);
}

/**
 * Formatea la fecha de liberación para mostrar
 * @param {Date} fechaRecepcion - Fecha de recepción
 * @param {number} plazoHoras - Plazo en horas
 * @returns {string} - Fecha formateada
 */
function formatearFechaLiberacion(fechaRecepcion, plazoHoras) {
  const fechaLiberacion = calcularFechaLiberacion(fechaRecepcion, plazoHoras);
  return fechaLiberacion.toLocaleString('es-AR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Calcula el monto por acreditar (fondos no liberados)
 * @param {Array} acreditaciones - Array de acreditaciones
 * @param {number} plazoHoras - Plazo en horas del cliente
 * @returns {number} - Monto total por acreditar
 */
function calcularMontoPorAcreditar(acreditaciones, plazoHoras) {
  return acreditaciones.reduce((total, acreditacion) => {
    if (!estaLiberado(acreditacion.fecha_hora, plazoHoras)) {
      return total + parseFloat(acreditacion.importe || 0);
    }
    return total;
  }, 0);
}

/**
 * Calcula el monto disponible (fondos liberados)
 * @param {Array} acreditaciones - Array de acreditaciones
 * @param {number} plazoHoras - Plazo en horas del cliente
 * @returns {number} - Monto total disponible
 */
function calcularMontoDisponible(acreditaciones, plazoHoras) {
  return acreditaciones.reduce((total, acreditacion) => {
    if (estaLiberado(acreditacion.fecha_hora, plazoHoras)) {
      return total + parseFloat(acreditacion.importe || 0);
    }
    return total;
  }, 0);
}

/**
 * Calcula el monto por acreditar incluyendo pagos tipo depósito
 * @param {Array} acreditaciones - Array de acreditaciones
 * @param {Array} pagos - Array de pagos
 * @param {number} plazoHoras - Plazo en horas del cliente
 * @returns {number} - Monto total por acreditar
 */
function calcularMontoPorAcreditarCompleto(acreditaciones, pagos, plazoHoras) {
  let total = 0;
  
  // Acreditaciones no liberadas
  acreditaciones.forEach(acreditacion => {
    if (!estaLiberado(acreditacion.fecha_hora, plazoHoras)) {
      total += parseFloat(acreditacion.importe || 0);
    }
  });
  
  // Créditos tipo depósito no liberados
  pagos.forEach(pago => {
    if (pago.tipo_pago === 'credito' && pago.metodo_pago && pago.metodo_pago.toLowerCase() === 'deposito' && 
        !estaLiberado(pago.fecha, plazoHoras)) {
      total += parseFloat(pago.importe || 0);
    }
  });
  
  return total;
}

/**
 * Calcula el monto disponible incluyendo pagos tipo depósito
 * @param {Array} acreditaciones - Array de acreditaciones
 * @param {Array} pagos - Array de pagos
 * @param {number} plazoHoras - Plazo en horas del cliente
 * @returns {number} - Monto total disponible
 */
function calcularMontoDisponibleCompleto(acreditaciones, pagos, plazoHoras) {
  let total = 0;
  
  // Acreditaciones liberadas
  acreditaciones.forEach(acreditacion => {
    if (estaLiberado(acreditacion.fecha_hora, plazoHoras)) {
      total += parseFloat(acreditacion.importe || 0);
    }
  });
  
  // Créditos tipo depósito liberados
  pagos.forEach(pago => {
    if (pago.tipo_pago === 'credito' && pago.metodo_pago && pago.metodo_pago.toLowerCase() === 'deposito' && 
        estaLiberado(pago.fecha, plazoHoras)) {
      total += parseFloat(pago.importe || 0);
    }
  });
  
  return total;
}

/**
 * Calcula las comisiones de fondos liberados
 * @param {Array} acreditaciones - Array de acreditaciones con comisiones
 * @param {Array} pagos - Array de pagos con comisiones
 * @param {number} plazoHoras - Plazo en horas del cliente
 * @returns {number} - Total de comisiones de fondos liberados
 */
function calcularComisionesFondosLiberados(acreditaciones, pagos, plazoHoras) {
  let totalComisiones = 0;
  
  // Comisiones de acreditaciones liberadas
  acreditaciones.forEach(acreditacion => {
    if (estaLiberado(acreditacion.fecha_hora, plazoHoras)) {
      totalComisiones += parseFloat(acreditacion.importe_comision || 0);
    }
  });
  
  // Comisiones de créditos tipo depósito liberados
  pagos.forEach(pago => {
    if (pago.tipo_pago === 'credito' && pago.metodo_pago && pago.metodo_pago.toLowerCase() === 'deposito' && 
        estaLiberado(pago.fecha, plazoHoras)) {
      totalComisiones += parseFloat(pago.importe_comision || 0);
    }
  });
  
  return totalComisiones;
}

/**
 * Debug: Desglosa el cálculo del saldo disponible
 * @param {Array} acreditaciones - Array de acreditaciones
 * @param {Array} pagos - Array de pagos y créditos
 * @param {number} plazoHoras - Plazo en horas del cliente
 * @returns {Object} - Desglose detallado del saldo
 */
function debugSaldoDisponible(acreditaciones, pagos, plazoHoras) {
  let desglose = {
    acreditaciones_liberadas: 0,
    acreditaciones_no_liberadas: 0,
    creditos: 0,
    pagos_egreso: 0,
    depositos_liberados: 0,
    depositos_no_liberados: 0,
    comisiones_acreditaciones_liberadas: 0,
    comisiones_creditos: 0,
    comisiones_depositos_liberados: 0,
    saldo_bruto: 0,
    comisiones_totales: 0,
    saldo_neto: 0
  };
  
  // Acreditaciones
  acreditaciones.forEach(acreditacion => {
    const importe = parseFloat(acreditacion.importe || 0);
    const comision = parseFloat(acreditacion.importe_comision || 0);
    
    if (estaLiberado(acreditacion.fecha_hora, plazoHoras)) {
      desglose.acreditaciones_liberadas += importe;
      desglose.comisiones_acreditaciones_liberadas += comision;
    } else {
      desglose.acreditaciones_no_liberadas += importe;
    }
  });
  
  // Pagos y créditos
  pagos.forEach(pago => {
    const importe = parseFloat(pago.importe || 0);
    const comision = parseFloat(pago.importe_comision || 0);
    
    if (pago.tipo_pago === 'egreso') {
      // Los pagos son egresos, restan del saldo
      desglose.pagos_egreso += importe;
    } else if (pago.tipo_pago === 'credito' && pago.metodo_pago && pago.metodo_pago.toLowerCase() === 'deposito') {
      // Créditos tipo depósito (tienen plazos de liberación)
      if (estaLiberado(pago.fecha, plazoHoras)) {
        desglose.depositos_liberados += importe;
        desglose.comisiones_depositos_liberados += comision;
      } else {
        desglose.depositos_no_liberados += importe;
      }
    } else if (pago.tipo_pago === 'credito') {
      // Otros créditos siempre están disponibles (son ingresos)
      desglose.creditos += importe;
      desglose.comisiones_creditos += comision;
    }
  });
  
  // Calcular totales
  desglose.saldo_bruto = desglose.acreditaciones_liberadas + desglose.depositos_liberados - desglose.pagos_egreso + desglose.creditos;
  desglose.comisiones_totales = desglose.comisiones_acreditaciones_liberadas + desglose.comisiones_depositos_liberados;
  desglose.saldo_neto = desglose.saldo_bruto - desglose.comisiones_totales;
  
  return desglose;
}

/**
 * Calcula el saldo disponible incluyendo créditos, pagos y acreditaciones
 * @param {Array} acreditaciones - Array de acreditaciones
 * @param {Array} pagos - Array de pagos y créditos
 * @param {number} plazoHoras - Plazo en horas del cliente
 * @returns {number} - Saldo total disponible
 */
function calcularSaldoDisponibleCompleto(acreditaciones, pagos, plazoHoras) {
  let acreditacionesLiberadas = 0;
  let depositosLiberados = 0;
  let pagosEgreso = 0;
  let creditos = 0;
  
  // Acreditaciones liberadas
  acreditaciones.forEach(acreditacion => {
    if (estaLiberado(acreditacion.fecha_hora, plazoHoras)) {
      acreditacionesLiberadas += parseFloat(acreditacion.importe || 0);
    }
  });
  
  // Pagos y créditos
  pagos.forEach(pago => {
    if (pago.tipo_pago === 'egreso') {
      // Los pagos son egresos, restan del saldo
      pagosEgreso += parseFloat(pago.importe || 0);
    } else if (pago.tipo_pago === 'credito' && pago.metodo_pago && pago.metodo_pago.toLowerCase() === 'deposito') {
      // Créditos tipo depósito liberados suman al saldo
      if (estaLiberado(pago.fecha, plazoHoras)) {
        depositosLiberados += parseFloat(pago.importe || 0);
      }
    } else if (pago.tipo_pago === 'credito') {
      // Otros créditos siempre están disponibles (son ingresos)
      creditos += parseFloat(pago.importe || 0);
    }
  });
  
  // Fórmula correcta: Acreditaciones liberadas + Depósitos liberados - Pagos egreso + Créditos
  return acreditacionesLiberadas + depositosLiberados - pagosEgreso + creditos;
}

/**
 * Calcula las comisiones solo de fondos liberados (acreditaciones y depósitos)
 * @param {Array} acreditaciones - Array de acreditaciones con comisiones
 * @param {Array} pagos - Array de pagos con comisiones
 * @param {number} plazoHoras - Plazo en horas del cliente
 * @returns {number} - Total de comisiones de fondos liberados
 */
function calcularComisionesSaldoDisponible(acreditaciones, pagos, plazoHoras) {
  let totalComisiones = 0;
  
  // Comisiones de acreditaciones liberadas
  acreditaciones.forEach(acreditacion => {
    if (estaLiberado(acreditacion.fecha_hora, plazoHoras)) {
      totalComisiones += parseFloat(acreditacion.importe_comision || 0);
    }
  });
  
  // Comisiones solo de depósitos liberados (créditos tipo depósito)
  pagos.forEach(pago => {
    if (pago.tipo_pago === 'credito' && pago.metodo_pago && pago.metodo_pago.toLowerCase() === 'deposito' && 
        estaLiberado(pago.fecha, plazoHoras)) {
      totalComisiones += parseFloat(pago.importe_comision || 0);
    }
  });
  
  return totalComisiones;
}

module.exports = {
  calcularFechaLiberacion,
  estaLiberado,
  horasRestantes,
  formatearFechaLiberacion,
  calcularMontoPorAcreditar,
  calcularMontoDisponible,
  calcularMontoPorAcreditarCompleto,
  calcularMontoDisponibleCompleto,
  calcularComisionesFondosLiberados,
  calcularSaldoDisponibleCompleto,
  calcularComisionesSaldoDisponible,
  debugSaldoDisponible
}; 