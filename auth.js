const basicAuth = require('basic-auth');

// Configuración de credenciales (en producción deberían estar en variables de entorno)
const USERNAME = process.env.AUTH_USERNAME || 'admin';
const PASSWORD = process.env.AUTH_PASSWORD || 'acreditador2024';

// Middleware de autenticación básica
function requireAuth(req, res, next) {
  // Obtener credenciales del header Authorization
  const credentials = basicAuth(req);
  
  // Verificar si se proporcionaron credenciales
  if (!credentials) {
    res.setHeader('WWW-Authenticate', 'Basic realm="AcreditadorBot Dashboard"');
    return res.status(401).send('Acceso requerido');
  }
  
  // Verificar credenciales
  if (credentials.name === USERNAME && credentials.pass === PASSWORD) {
    next(); // Autenticación exitosa, continuar
  } else {
    res.setHeader('WWW-Authenticate', 'Basic realm="AcreditadorBot Dashboard"');
    res.status(401).send('Credenciales inválidas');
  }
}

// Middleware para excluir rutas de API
function authMiddleware(req, res, next) {
  // Excluir rutas de API
  if (req.path.startsWith('/api/')) {
    return next(); // No requerir autenticación para APIs
  }
  
  // Excluir archivos estáticos específicos si es necesario
  if (req.path.startsWith('/favicon.ico') || req.path.startsWith('/robots.txt')) {
    return next();
  }
  
  // Aplicar autenticación para todas las demás rutas
  requireAuth(req, res, next);
}

module.exports = {
  requireAuth,
  authMiddleware
}; 