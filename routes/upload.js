const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const db = require('../config/database');
const router = express.Router();

// Configuración de multer para subida de archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
    const originalName = file.originalname.replace(/\.[^/.]+$/, '');
    cb(null, `${originalName}_${timestamp}.csv`);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos CSV'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB máximo
  }
});

// POST /upload/csv - Subir y procesar archivo CSV
router.post('/csv', upload.single('file'), async (req, res) => {
  const client = await db.getClient();
  
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Archivo requerido',
        message: 'Debe seleccionar un archivo CSV para subir'
      });
    }

    const filePath = req.file.path;
    const results = [];
    const errors = [];
    let processedCount = 0;
    let skippedCount = 0;

    // Procesar el archivo CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          results.push(row);
        })
        .on('end', () => {
          resolve();
        })
        .on('error', (error) => {
          reject(error);
        });
    });

    // Procesar cada fila del CSV
    for (let i = 0; i < results.length; i++) {
      const row = results[i];
      
      try {
        // Validar campos requeridos
        if (!row.Id || !row.Importe || !row.FechaHora) {
          errors.push({
            row: i + 2, // +2 porque CSV empieza en 1 y la primera fila es header
            error: 'Campos requeridos faltantes (Id, Importe, FechaHora)',
            data: row
          });
          skippedCount++;
          continue;
        }

        // Validar que sea una transferencia entrante
        if (row.Tipo !== 'Transferencia entrante') {
          skippedCount++;
          continue; // Saltar transferencias salientes y otros tipos
        }

        // Verificar si la transacción ya existe
        const existingTransaction = await client.query(
          'SELECT id FROM acreditaciones WHERE id_transaccion = $1',
          [row.Id]
        );

        if (existingTransaction.rows.length > 0) {
          skippedCount++;
          continue; // Saltar transacciones duplicadas
        }

        // Parsear fecha
        let fechaHora;
        try {
          fechaHora = moment(row.FechaHora, 'YYYY-MM-DD HH:mm:ss').toDate();
          if (!fechaHora || isNaN(fechaHora.getTime())) {
            throw new Error('Formato de fecha inválido');
          }
        } catch (dateError) {
          errors.push({
            row: i + 2,
            error: 'Formato de fecha inválido',
            data: row
          });
          skippedCount++;
          continue;
        }

        // Parsear importe
        let importe;
        try {
          importe = parseFloat(row.Importe.replace(/[^\d.-]/g, ''));
          if (isNaN(importe)) {
            throw new Error('Importe inválido');
          }
        } catch (amountError) {
          errors.push({
            row: i + 2,
            error: 'Importe inválido',
            data: row
          });
          skippedCount++;
          continue;
        }

        // Insertar acreditación
        await client.query(`
          INSERT INTO acreditaciones (
            id_transaccion,
            tipo,
            concepto,
            aplica_a,
            importe,
            estado,
            id_en_red,
            titular,
            cuit,
            origen,
            nota,
            fecha_hora,
            fuente,
            procesado
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `, [
          row.Id,
          row.Tipo || 'Transferencia entrante',
          row.Concepto || null,
          row.Aplica_a || null,
          importe,
          row.Estado || 'Completed',
          row.IdEnRed || null,
          row.Titular || null,
          row.CUIT ? row.CUIT.replace(/"/g, '') : null,
          row.Origen ? row.Origen.replace(/"/g, '') : null,
          row.Nota || null,
          fechaHora,
          'csv',
          true
        ]);

        processedCount++;

      } catch (error) {
        errors.push({
          row: i + 2,
          error: error.message,
          data: row
        });
        skippedCount++;
      }
    }

    // Registrar log del procesamiento
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado)
      VALUES ($1, $2, $3, $4)
    `, [
      'carga_csv',
      `Archivo CSV procesado: ${req.file.originalname}`,
      JSON.stringify({
        archivo: req.file.originalname,
        total_filas: results.length,
        procesadas: processedCount,
        omitidas: skippedCount,
        errores: errors.length
      }),
      errors.length === 0 ? 'exitoso' : 'parcial'
    ]);

    // Limpiar archivo temporal
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      message: 'Archivo CSV procesado exitosamente',
      data: {
        archivo: req.file.originalname,
        total_filas: results.length,
        procesadas: processedCount,
        omitidas: skippedCount,
        errores: errors.length,
        errores_detalle: errors
      }
    });

  } catch (error) {
    console.error('Error procesando archivo CSV:', error);
    
    // Limpiar archivo temporal en caso de error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    // Registrar error en logs
    await client.query(`
      INSERT INTO logs_procesamiento (tipo, descripcion, datos, estado, error)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      'carga_csv',
      'Error procesando archivo CSV',
      JSON.stringify({
        archivo: req.file ? req.file.originalname : 'desconocido'
      }),
      'error',
      error.message
    ]);

    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo procesar el archivo CSV',
      details: error.message
    });
  } finally {
    client.release();
  }
});

// GET /upload/logs - Obtener logs de procesamiento
router.get('/logs', async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { 
      page = 1, 
      limit = 50, 
      tipo,
      estado 
    } = req.query;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (tipo) {
      whereConditions.push(`tipo = $${paramIndex}`);
      params.push(tipo);
      paramIndex++;
    }

    if (estado) {
      whereConditions.push(`estado = $${paramIndex}`);
      params.push(estado);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    // Query para contar total
    const countQuery = `SELECT COUNT(*) FROM logs_procesamiento ${whereClause}`;
    const countResult = await client.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Query para obtener datos
    const dataQuery = `
      SELECT 
        id,
        fecha,
        tipo,
        descripcion,
        datos,
        estado,
        error
      FROM logs_procesamiento 
      ${whereClause}
      ORDER BY fecha DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(parseInt(limit), offset);
    const dataResult = await client.query(dataQuery, params);

    res.json({
      success: true,
      data: dataResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error obteniendo logs:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudieron obtener los logs'
    });
  } finally {
    client.release();
  }
});

// Middleware para manejar errores de multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'Archivo demasiado grande',
        message: 'El archivo no puede superar los 10MB'
      });
    }
  }
  
  if (error.message === 'Solo se permiten archivos CSV') {
    return res.status(400).json({
      error: 'Tipo de archivo no válido',
      message: 'Solo se permiten archivos CSV'
    });
  }

  next(error);
});

module.exports = router; 