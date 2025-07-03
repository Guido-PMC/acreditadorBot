// Utilidades para manejo de fechas con timezone GMT-3 (Argentina) - Formato 24h
const ARGENTINA_TIMEZONE = 'America/Argentina/Buenos_Aires';

// Función para formatear fecha en formato argentino (24h)
function formatDate(date, options = {}) {
    if (!date) return '';
    
    const defaultOptions = {
        timeZone: ARGENTINA_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false // Formato 24 horas
    };
    
    const finalOptions = { ...defaultOptions, ...options };
    
    try {
        return new Date(date).toLocaleString('es-AR', finalOptions);
    } catch (error) {
        console.error('Error formateando fecha:', error);
        return new Date(date).toLocaleString('es-AR', { hour12: false });
    }
}

// Función para formatear fecha preservando la hora original (sin conversión de zona horaria)
function formatDatePreserveTime(date) {
    if (!date) return '';
    
    try {
        const dateObj = new Date(date);
        
        // Extraer componentes UTC (hora original)
        const year = dateObj.getUTCFullYear();
        const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getUTCDate()).padStart(2, '0');
        const hours = String(dateObj.getUTCHours()).padStart(2, '0');
        const minutes = String(dateObj.getUTCMinutes()).padStart(2, '0');
        const seconds = String(dateObj.getUTCSeconds()).padStart(2, '0');
        
        return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
    } catch (error) {
        console.error('Error formateando fecha con hora preservada:', error);
        return formatDate(date);
    }
}

// Función para formatear solo fecha (sin hora)
function formatDateOnly(date) {
    return formatDate(date, { 
        hour: undefined, 
        minute: undefined, 
        second: undefined 
    });
}

// Función para formatear solo hora (24h)
function formatTimeOnly(date) {
    return formatDate(date, { 
        year: undefined, 
        month: undefined, 
        day: undefined 
    });
}

// Función para obtener fecha actual en timezone argentino (24h)
function getCurrentDateArgentina() {
    return new Date().toLocaleString('es-AR', {
        timeZone: ARGENTINA_TIMEZONE,
        hour12: false
    });
}

// Función para convertir fecha a timezone argentino (24h)
function toArgentinaTimezone(date) {
    return new Date(date).toLocaleString('es-AR', {
        timeZone: ARGENTINA_TIMEZONE,
        hour12: false
    });
}

// Función para formatear moneda argentina
function formatCurrency(amount, options = {}) {
    const defaultOptions = {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2
    };
    
    const finalOptions = { ...defaultOptions, ...options };
    
    return parseFloat(amount || 0).toLocaleString('es-AR', finalOptions);
}

// Función para obtener timestamp en timezone argentino (24h)
function getTimestampArgentina() {
    return new Date().toLocaleString('es-AR', {
        timeZone: ARGENTINA_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

// Función para formatear fecha y hora separadas (24h)
function formatDateTime(date) {
    if (!date) return '';
    
    const dateStr = formatDateOnly(date);
    const timeStr = formatTimeOnly(date);
    
    return `${dateStr} ${timeStr}`;
}

// Exportar funciones para uso global
window.formatDate = formatDate;
window.formatDatePreserveTime = formatDatePreserveTime;
window.formatDateOnly = formatDateOnly;
window.formatTimeOnly = formatTimeOnly;
window.getCurrentDateArgentina = getCurrentDateArgentina;
window.toArgentinaTimezone = toArgentinaTimezone;
window.formatCurrency = formatCurrency;
window.getTimestampArgentina = getTimestampArgentina;
window.formatDateTime = formatDateTime; 