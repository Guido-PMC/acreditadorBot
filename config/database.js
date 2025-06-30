const { Pool } = require('pg');

class Database {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      console.log('Conectando a la base de datos...');
      
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) {
        throw new Error('DATABASE_URL no está definida en las variables de entorno');
      }
      
      console.log('🔗 URL de conexión configurada:', connectionString ? 'Sí' : 'No');
      
      this.pool = new Pool({
        connectionString: connectionString,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });

      // Probar la conexión
      const client = await this.pool.connect();
      console.log('✅ Conexión a PostgreSQL establecida');
      
      // Verificar si las tablas existen
      const tablesResult = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('acreditaciones', 'comprobantes_whatsapp', 'clientes', 'logs_procesamiento', 'pagos', 'portal_users')
      `);
      
      if (tablesResult.rows.length < 6) {
        console.log('Creando tablas...');
        await this.createTables();
      } else {
        console.log('Tablas existentes, ejecutando migraciones...');
        await this.migrateTables(client);
      }
      
      client.release();
      this.isConnected = true;
      console.log('✅ Base de datos lista');
      
    } catch (error) {
      console.error('❌ Error conectando a la base de datos:', error);
      this.isConnected = false;
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
      // Tabla de clientes
      await client.query(`
        CREATE TABLE IF NOT EXISTS clientes (
          id SERIAL PRIMARY KEY,
          nombre VARCHAR(200) NOT NULL,
          apellido VARCHAR(200),
          fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          estado VARCHAR(20) DEFAULT 'activo',
          observaciones TEXT,
          comision DECIMAL(5,2) DEFAULT 0.00
        )
      `);

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
          observaciones TEXT,
          id_cliente INTEGER REFERENCES clientes(id),
          comision DECIMAL(5,2) DEFAULT 0.00,
          importe_comision DECIMAL(15,2) DEFAULT 0.00
        )
      `);

      // Tabla de comprobantes de WhatsApp
      await client.query(`
        CREATE TABLE IF NOT EXISTS comprobantes_whatsapp (
          id SERIAL PRIMARY KEY,
          id_comprobante VARCHAR(50) UNIQUE NOT NULL,
          nombre_remitente VARCHAR(200),
          cuit VARCHAR(20),
          importe DECIMAL(15,2),
          fecha_envio TIMESTAMP,
          fecha_recepcion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          estado VARCHAR(20) DEFAULT 'pendiente',
          procesado BOOLEAN DEFAULT FALSE,
          cotejado BOOLEAN DEFAULT FALSE,
          id_acreditacion VARCHAR(50),
          fecha_cotejo TIMESTAMP,
          id_cliente INTEGER REFERENCES clientes(id)
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

      // Tabla de pagos/salidas de dinero
      await client.query(`
        CREATE TABLE IF NOT EXISTS pagos (
          id SERIAL PRIMARY KEY,
          id_cliente INTEGER REFERENCES clientes(id) NOT NULL,
          concepto VARCHAR(200) NOT NULL,
          importe DECIMAL(15,2) NOT NULL,
          fecha_pago TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          tipo_pago VARCHAR(50) DEFAULT 'egreso',
          metodo_pago VARCHAR(50),
          referencia VARCHAR(100),
          observaciones TEXT,
          estado VARCHAR(20) DEFAULT 'confirmado',
          fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Tabla de usuarios del portal de clientes
      await client.query(`
        CREATE TABLE IF NOT EXISTS portal_users (
          id SERIAL PRIMARY KEY,
          id_cliente INTEGER REFERENCES clientes(id) NOT NULL,
          username VARCHAR(50) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          email VARCHAR(100),
          activo BOOLEAN DEFAULT TRUE,
          fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          ultimo_acceso TIMESTAMP,
          token_reset VARCHAR(100),
          token_expira TIMESTAMP
        )
      `);

      // Migración: agregar columnas faltantes si no existen
      await this.migrateTables(client);

      // Índices para mejorar performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_acreditaciones_fecha ON acreditaciones(fecha_hora);
        CREATE INDEX IF NOT EXISTS idx_acreditaciones_cuit ON acreditaciones(cuit);
        CREATE INDEX IF NOT EXISTS idx_acreditaciones_importe ON acreditaciones(importe);
        CREATE INDEX IF NOT EXISTS idx_acreditaciones_estado ON acreditaciones(estado);
        CREATE INDEX IF NOT EXISTS idx_acreditaciones_fuente ON acreditaciones(fuente);
        CREATE INDEX IF NOT EXISTS idx_acreditaciones_cliente ON acreditaciones(id_cliente);
        CREATE INDEX IF NOT EXISTS idx_comprobantes_fecha ON comprobantes_whatsapp(fecha_envio);
        CREATE INDEX IF NOT EXISTS idx_comprobantes_cuit ON comprobantes_whatsapp(cuit);
        CREATE INDEX IF NOT EXISTS idx_comprobantes_cliente ON comprobantes_whatsapp(id_cliente);
        CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes(nombre);
        CREATE INDEX IF NOT EXISTS idx_logs_fecha ON logs_procesamiento(fecha);
        CREATE INDEX IF NOT EXISTS idx_pagos_cliente ON pagos(id_cliente);
        CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON pagos(fecha_pago);
      `);

      console.log('Tablas creadas/verificadas exitosamente');
      
    } catch (error) {
      console.error('Error creando tablas:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async migrateTables(client) {
    try {
      console.log('Ejecutando migraciones...');
      
      // Verificar si la columna id_cliente existe en acreditaciones
      const acreditacionesColumns = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'acreditaciones' AND column_name = 'id_cliente'
      `);
      
      if (acreditacionesColumns.rows.length === 0) {
        console.log('Agregando columna id_cliente a tabla acreditaciones...');
        await client.query(`
          ALTER TABLE acreditaciones 
          ADD COLUMN id_cliente INTEGER REFERENCES clientes(id)
        `);
      }

      // Verificar si la columna id_cliente existe en comprobantes_whatsapp
      const comprobantesColumns = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'comprobantes_whatsapp' AND column_name = 'id_cliente'
      `);
      
      if (comprobantesColumns.rows.length === 0) {
        console.log('Agregando columna id_cliente a tabla comprobantes_whatsapp...');
        await client.query(`
          ALTER TABLE comprobantes_whatsapp 
          ADD COLUMN id_cliente INTEGER REFERENCES clientes(id)
        `);
      } else {
        // Verificar el tipo de datos de id_cliente en comprobantes_whatsapp
        const columnType = await client.query(`
          SELECT data_type 
          FROM information_schema.columns 
          WHERE table_name = 'comprobantes_whatsapp' AND column_name = 'id_cliente'
        `);
        
        if (columnType.rows.length > 0 && columnType.rows[0].data_type === 'character varying') {
          console.log('Corrigiendo tipo de datos de id_cliente en comprobantes_whatsapp...');
          
          // Crear una columna temporal
          await client.query(`
            ALTER TABLE comprobantes_whatsapp 
            ADD COLUMN id_cliente_temp INTEGER
          `);
          
          // Convertir datos existentes
          await client.query(`
            UPDATE comprobantes_whatsapp 
            SET id_cliente_temp = CASE 
              WHEN id_cliente ~ '^[0-9]+$' THEN CAST(id_cliente AS INTEGER)
              ELSE NULL 
            END
          `);
          
          // Eliminar columna antigua y renombrar la nueva
          await client.query(`
            ALTER TABLE comprobantes_whatsapp 
            DROP COLUMN id_cliente
          `);
          
          await client.query(`
            ALTER TABLE comprobantes_whatsapp 
            RENAME COLUMN id_cliente_temp TO id_cliente
          `);
          
          await client.query(`
            ALTER TABLE comprobantes_whatsapp 
            ADD CONSTRAINT fk_comprobantes_cliente 
            FOREIGN KEY (id_cliente) REFERENCES clientes(id)
          `);
        }
      }

      // Verificar si la columna cuit existe en comprobantes_whatsapp
      const comprobantesCUITColumns = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'comprobantes_whatsapp' AND column_name = 'cuit'
      `);
      
      if (comprobantesCUITColumns.rows.length === 0) {
        console.log('Agregando columna cuit a tabla comprobantes_whatsapp...');
        await client.query(`
          ALTER TABLE comprobantes_whatsapp 
          ADD COLUMN cuit VARCHAR(20)
        `);
      }

      // Verificar si la columna numero_telefono existe en clientes
      const clientesTelefonoColumns = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'clientes' AND column_name = 'numero_telefono'
      `);
      
      if (clientesTelefonoColumns.rows.length === 0) {
        console.log('Agregando columna numero_telefono a tabla clientes...');
        await client.query(`
          ALTER TABLE clientes 
          ADD COLUMN numero_telefono VARCHAR(20)
        `);
      }

      // Verificar si la columna comision existe en clientes
      const clientesComisionColumns = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'clientes' AND column_name = 'comision'
      `);
      
      if (clientesComisionColumns.rows.length === 0) {
        console.log('Agregando columna comision a tabla clientes...');
        await client.query(`
          ALTER TABLE clientes 
          ADD COLUMN comision DECIMAL(5,2) DEFAULT 0.00
        `);
      }

      // Verificar si las columnas de comisión existen en acreditaciones
      const acreditacionesComisionColumns = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'acreditaciones' AND column_name IN ('comision', 'importe_comision')
      `);
      
      if (acreditacionesComisionColumns.rows.length === 0) {
        console.log('Agregando columnas de comisión a tabla acreditaciones...');
        await client.query(`
          ALTER TABLE acreditaciones 
          ADD COLUMN comision DECIMAL(5,2) DEFAULT 0.00,
          ADD COLUMN importe_comision DECIMAL(15,2) DEFAULT 0.00
        `);
      }

      console.log('Migraciones completadas exitosamente');
      
    } catch (error) {
      console.error('Error en migraciones:', error);
      throw error;
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