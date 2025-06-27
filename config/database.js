const { Pool } = require('pg');

class Database {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      // Configuración para Railway
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 20, // máximo de conexiones en el pool
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Verificar conexión
      const client = await this.pool.connect();
      client.release();
      
      this.isConnected = true;
      console.log('Conexión a PostgreSQL establecida');
      
      // Crear tablas si no existen
      await this.createTables();
      
    } catch (error) {
      console.error('Error conectando a la base de datos:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      console.log('Conexión a PostgreSQL cerrada');
    }
  }

  async createTables() {
    const client = await this.pool.connect();
    
    try {
      // Tabla de acreditaciones bancarias
      await client.query(`
        CREATE TABLE IF NOT EXISTS acreditaciones (
          id SERIAL PRIMARY KEY,
          id_transaccion VARCHAR(50) UNIQUE NOT NULL,
          tipo VARCHAR(50) NOT NULL,
          concepto VARCHAR(100),
          aplica_a VARCHAR(50),
          importe DECIMAL(15,2) NOT NULL,
          estado VARCHAR(20) NOT NULL,
          id_en_red VARCHAR(100),
          titular VARCHAR(200),
          cuit VARCHAR(20),
          origen VARCHAR(100),
          nota TEXT,
          fecha_hora TIMESTAMP NOT NULL,
          cvu VARCHAR(50),
          coelsa_id VARCHAR(100),
          origen_nombre VARCHAR(200),
          origen_tax_id VARCHAR(20),
          origen_cuenta VARCHAR(50),
          tipo_notificacion VARCHAR(10),
          fuente VARCHAR(20) DEFAULT 'csv', -- 'api' o 'csv'
          fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          procesado BOOLEAN DEFAULT FALSE,
          cotejado BOOLEAN DEFAULT FALSE,
          id_comprobante_whatsapp VARCHAR(50),
          fecha_cotejo TIMESTAMP,
          observaciones TEXT
        )
      `);

      // Tabla de comprobantes de WhatsApp
      await client.query(`
        CREATE TABLE IF NOT EXISTS comprobantes_whatsapp (
          id SERIAL PRIMARY KEY,
          id_comprobante VARCHAR(50) UNIQUE NOT NULL,
          numero_telefono VARCHAR(20),
          nombre_remitente VARCHAR(200),
          importe DECIMAL(15,2),
          fecha_envio TIMESTAMP,
          fecha_recepcion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          estado VARCHAR(20) DEFAULT 'pendiente',
          archivo_url TEXT,
          texto_mensaje TEXT,
          procesado BOOLEAN DEFAULT FALSE,
          cotejado BOOLEAN DEFAULT FALSE,
          id_acreditacion VARCHAR(50),
          fecha_cotejo TIMESTAMP,
          observaciones TEXT
        )
      `);

      // Tabla de logs de procesamiento
      await client.query(`
        CREATE TABLE IF NOT EXISTS logs_procesamiento (
          id SERIAL PRIMARY KEY,
          fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          tipo VARCHAR(50) NOT NULL,
          descripcion TEXT,
          datos JSONB,
          estado VARCHAR(20) DEFAULT 'exitoso',
          error TEXT
        )
      `);

      // Índices para mejorar performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_acreditaciones_fecha ON acreditaciones(fecha_hora);
        CREATE INDEX IF NOT EXISTS idx_acreditaciones_cuit ON acreditaciones(cuit);
        CREATE INDEX IF NOT EXISTS idx_acreditaciones_importe ON acreditaciones(importe);
        CREATE INDEX IF NOT EXISTS idx_acreditaciones_estado ON acreditaciones(estado);
        CREATE INDEX IF NOT EXISTS idx_acreditaciones_fuente ON acreditaciones(fuente);
        CREATE INDEX IF NOT EXISTS idx_comprobantes_fecha ON comprobantes_whatsapp(fecha_envio);
        CREATE INDEX IF NOT EXISTS idx_comprobantes_telefono ON comprobantes_whatsapp(numero_telefono);
        CREATE INDEX IF NOT EXISTS idx_logs_fecha ON logs_procesamiento(fecha);
      `);

      console.log('Tablas creadas/verificadas exitosamente');
      
    } catch (error) {
      console.error('Error creando tablas:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async query(text, params) {
    if (!this.pool) {
      throw new Error('Base de datos no conectada');
    }
    return this.pool.query(text, params);
  }

  async getClient() {
    if (!this.pool) {
      throw new Error('Base de datos no conectada');
    }
    return this.pool.connect();
  }
}

module.exports = new Database(); 