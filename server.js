// Forzar deploy Railway
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const db = require('./config/database');
const apiRoutes = require('./routes/api');
const webRoutes = require('./routes/web');
const uploadRoutes = require('./routes/upload');

const app = express();
const PORT = process.env.PORT;

if (!PORT) {
  console.error('❌ Error: PORT no está definido en las variables de entorno');
  process.exit(1);
}

console.log(`🚀 Puerto asignado por Railway: ${PORT}`);

// Middleware de logging para debug
app.use((req, res, next) => {
  console.log(`📨 ${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log(`🌐 IP: ${req.ip}, User-Agent: ${req.get('User-Agent')}`);
  next();
});

// Configuración de seguridad con CSP personalizado
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  }
}));
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // máximo 100 requests por ventana
});
app.use(limiter);

// Middleware para parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Rutas
console.log('Configurando rutas...');
app.use('/api', apiRoutes);
console.log('Rutas API configuradas');
app.use('/upload', uploadRoutes);
console.log('Rutas de upload configuradas');
app.use('/', webRoutes);
console.log('Rutas web configuradas');

// Ruta de health check para Railway
app.get('/health', (req, res) => {
  console.log('🏥 Healthcheck solicitado');
  console.log('📊 Timestamp del request:', new Date().toISOString());
  console.log('🌐 IP del cliente:', req.ip);
  console.log('👤 User-Agent:', req.get('User-Agent'));
  
  try {
    const healthData = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      database: db.isConnected ? 'Connected' : 'Disconnected',
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };
    console.log('✅ Healthcheck exitoso:', healthData);
    res.status(200).json(healthData);
  } catch (error) {
    console.error('❌ Error en healthcheck:', error);
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Algo salió mal'
  });
});

// Ruta 404
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Inicializar base de datos y servidor
async function startServer() {
  try {
    console.log('=== INICIO DEL DEPLOY ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Iniciando servidor...');
    console.log(`Puerto configurado: ${PORT}`);
    console.log(`Variables de entorno:`, {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      DATABASE_URL: process.env.DATABASE_URL ? 'Configurado' : 'No configurado'
    });
    
    console.log('Conectando a la base de datos...');
    await db.connect();
    console.log('✅ Base de datos conectada exitosamente');
    
    console.log('Iniciando servidor HTTP...');
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('✅ Servidor HTTP iniciado exitosamente');
      console.log(`📡 Servidor corriendo en puerto ${PORT}`);
      console.log(`🌍 Escuchando en 0.0.0.0:${PORT}`);
      console.log(`🔧 Ambiente: ${process.env.NODE_ENV || 'development'}`);
      console.log('🚀 Servidor listo para recibir requests');
      console.log('=== DEPLOY COMPLETADO ===');
    });

    // Agregar manejo de errores del servidor
    server.on('error', (error) => {
      console.error('❌ Error en el servidor:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Puerto ${PORT} ya está en uso`);
      }
      process.exit(1);
    });

    // Log cuando el servidor se cierra
    server.on('close', () => {
      console.log('🔌 Servidor cerrado');
    });

  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

startServer();

// Manejo graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM recibido, cerrando servidor...');
  await db.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT recibido, cerrando servidor...');
  await db.disconnect();
  process.exit(0);
}); 