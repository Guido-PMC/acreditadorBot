const moment = require('moment-timezone');

/**
 * Utilidades para cálculo de liberación de fondos
 * Reglas:
 * - Corte a las 15:00 de cada día (hora argentina)
 * - Sábados y domingos no cuentan
 * - Acreditaciones post 15:00 cuentan como día siguiente
 * - Todas las fechas se manejan en zona horaria argentina (America/Argentina/Buenos_Aires)
 */

/**
 * Calcula la fecha de liberación de un fondo
 * @param {Date|string} fechaRecepcion - Fecha de recepción del fondo
 * @param {number} plazoHoras - Plazo en horas (24, 48, 72, 96)
 * @returns {Date} - Fecha de liberación
 */
function calcularFechaLiberacion(fechaRecepcion, plazoHoras) {
  // Convertir a moment en zona horaria argentina
  const fecha = moment.tz(fechaRecepcion, 'America/Argentina/Buenos_Aires');
  
  // Aplicar corte de 15:00 hora argentina
  const fechaCorte = fecha.clone().hour(15).minute(0).second(0).millisecond(0);
  
  // Si la fecha es después de las 15:00, contar como día siguiente
  let fechaInicio = fecha;
  if (fecha.isAfter(fechaCorte)) {
    fechaInicio = fecha.clone().add(1, 'day').startOf('day');
  } else {
    fechaInicio = fecha.clone().startOf('day');
  }
  
  // Calcular fecha de liberación
  let fechaLiberacion = fechaInicio.clone();
  let diasAgregados = 0;
  
  // Calcular cuántos días hábiles necesitamos
  const diasNecesarios = Math.ceil(plazoHoras / 24);
  
  while (diasAgregados < diasNecesarios) {
    fechaLiberacion.add(1, 'day');
    diasAgregados++;
    
    // Si es sábado (6) o domingo (0), saltar al lunes
    const diaSemana = fechaLiberacion.day();
    if (diaSemana === 0) { // Domingo
      fechaLiberacion.add(1, 'day');
    } else if (diaSemana === 6) { // Sábado
      fechaLiberacion.add(2, 'day');
    }
  }
  
  // Establecer la hora exacta a 23:59 (final del día)
  fechaLiberacion.hour(23).minute(59).second(0).millisecond(0);
  
  return fechaLiberacion.toDate();
}

/**
 * Verifica si un fondo ya está liberado
 * @param {Date|string} fechaRecepcion - Fecha de recepción
 * @param {number} plazoHoras - Plazo en horas
 * @returns {boolean} - true si está liberado, false si no
 */
function estaLiberado(fechaRecepcion, plazoHoras) {
  const fechaLiberacion = calcularFechaLiberacion(fechaRecepcion, plazoHoras);
  const ahora = moment.tz('America/Argentina/Buenos_Aires');
  return ahora.isSameOrAfter(fechaLiberacion);
}

/**
 * Calcula cuántas horas faltan para la liberación
 * @param {Date|string} fechaRecepcion - Fecha de recepción
 * @param {number} plazoHoras - Plazo en horas
 * @returns {number} - Horas restantes (0 si ya está liberado)
 */
function horasRestantes(fechaRecepcion, plazoHoras) {
  const fechaLiberacion = calcularFechaLiberacion(fechaRecepcion, plazoHoras);
  const ahora = moment.tz('America/Argentina/Buenos_Aires');
  
  if (ahora.isSameOrAfter(fechaLiberacion)) {
    return 0;
  }
  
  const diffHoras = fechaLiberacion.diff(ahora, 'hours', true);
  return Math.max(0, Math.ceil(diffHoras));
}

/**
 * Formatea la fecha de liberación para mostrar
 * @param {Date|string} fechaRecepcion - Fecha de recepción
 * @param {number} plazoHoras - Plazo en horas
 * @returns {string} - Fecha formateada en zona horaria argentina
 */
function formatearFechaLiberacion(fechaRecepcion, plazoHoras) {
  const fechaLiberacion = calcularFechaLiberacion(fechaRecepcion, plazoHoras);
  return moment.tz(fechaLiberacion, 'America/Argentina/Buenos_Aires').toISOString();
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
 * Calcula el monto por acreditar incluyendo pagos tipo depósito (BRUTO - sin restar comisiones)
 * @param {Array} acreditaciones - Array de acreditaciones
 * @param {Array} pagos - Array de pagos
 * @param {number} plazoHoras - Plazo en horas del cliente
 * @returns {number} - Monto total por acreditar (bruto)
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
 * Calcula el monto por acreditar NETO (después de comisiones)
 * @param {Array} acreditaciones - Array de acreditaciones
 * @param {Array} pagos - Array de pagos
 * @param {number} plazoHoras - Plazo en horas del cliente
 * @returns {number} - Monto total por acreditar (neto)
 */
function calcularMontoPorAcreditarNeto(acreditaciones, pagos, plazoHoras) {
  let totalBruto = 0;
  let totalComisiones = 0;
  
  // Acreditaciones no liberadas
  acreditaciones.forEach(acreditacion => {
    if (!estaLiberado(acreditacion.fecha_hora, plazoHoras)) {
      totalBruto += parseFloat(acreditacion.importe || 0);
      totalComisiones += parseFloat(acreditacion.importe_comision || 0);
    }
  });
  
  // Créditos tipo depósito no liberados
  pagos.forEach(pago => {
    if (pago.tipo_pago === 'credito' && pago.metodo_pago && pago.metodo_pago.toLowerCase() === 'deposito' && 
        !estaLiberado(pago.fecha, plazoHoras)) {
      totalBruto += parseFloat(pago.importe || 0);
      totalComisiones += parseFloat(pago.importe_comision || 0);
    }
  });
  
  return totalBruto - totalComisiones;
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
    saldo_neto: 0,
    // Debug detallado
    debug_depositos: []
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
      const estaLib = estaLiberado(pago.fecha, plazoHoras);
      const fechaLib = calcularFechaLiberacion(pago.fecha, plazoHoras);
      const ahora = new Date();
      
      // Debug detallado para depósitos
      desglose.debug_depositos.push({
        id: pago.id,
        concepto: pago.concepto,
        importe: importe,
        fecha_pago: pago.fecha,
        fecha_liberacion: fechaLib,
        esta_liberado: estaLib,
        tiempo_restante: estaLib ? 0 : horasRestantes(pago.fecha, plazoHoras),
        ahora: ahora.toISOString(),
        plazo_horas: plazoHoras
      });
      
      if (estaLib) {
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
  calcularMontoPorAcreditarNeto,
  calcularMontoDisponibleCompleto,
  calcularComisionesFondosLiberados,
  calcularSaldoDisponibleCompleto,
  calcularComisionesSaldoDisponible,
  debugSaldoDisponible
}; 