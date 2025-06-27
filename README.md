# AcreditadorBot - Sistema de Acreditaciones Bancarias

Sistema integral para el procesamiento y cotejo de transferencias bancarias contra comprobantes de WhatsApp, desarrollado para Railway con PostgreSQL.

## 🚀 Características

- **API en Tiempo Real**: Recibe notificaciones automáticas de transferencias bancarias
- **Carga de Archivos CSV**: Procesamiento masivo de transacciones diarias
- **Interfaz Web Moderna**: Dashboard con estadísticas y gestión de datos
- **Base de Datos PostgreSQL**: Almacenamiento robusto y escalable
- **Sistema de Cotejo**: Comparación automática de acreditaciones vs comprobantes
- **Logs Detallados**: Seguimiento completo de todas las operaciones

## 📋 Requisitos

- Node.js 18.0.0 o superior
- PostgreSQL 12.0 o superior
- Railway CLI (para despliegue)

## 🛠️ Instalación

### Desarrollo Local

1. **Clonar el repositorio**
   ```bash
   git clone <repository-url>
   cd acreditadorBot
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno**
   ```bash
   cp env.example .env
   # Editar .env con tus configuraciones
   ```

4. **Configurar base de datos PostgreSQL**
   - Crear base de datos: `acreditadorbot`
   - Las tablas se crean automáticamente al iniciar

5. **Ejecutar en desarrollo**
   ```bash
   npm run dev
   ```

### Despliegue en Railway

1. **Instalar Railway CLI**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login en Railway**
   ```bash
   railway login
   ```

3. **Inicializar proyecto**
   ```bash
   railway init
   ```

4. **Configurar base de datos PostgreSQL**
   ```bash
   railway add
   # Seleccionar PostgreSQL
   ```

5. **Configurar variables de entorno**
   ```bash
   railway variables set DATABASE_URL=<tu-url-postgresql>
   railway variables set NODE_ENV=production
   ```

6. **Desplegar**
   ```bash
   railway up
   ```

## 📊 Estructura de la Base de Datos

### Tabla: `acreditaciones`
Almacena todas las acreditaciones bancarias recibidas.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | SERIAL | ID único |
| id_transaccion | VARCHAR(50) | ID de transacción bancaria |
| tipo | VARCHAR(50) | Tipo de transacción |
| importe | DECIMAL(15,2) | Monto de la transacción |
| estado | VARCHAR(20) | Estado de la transacción |
| titular | VARCHAR(200) | Nombre del titular |
| cuit | VARCHAR(20) | CUIT del titular |
| fecha_hora | TIMESTAMP | Fecha y hora de la transacción |
| fuente | VARCHAR(20) | Origen: 'api' o 'csv' |
| cotejado | BOOLEAN | Si fue cotejado contra WhatsApp |
| id_comprobante_whatsapp | VARCHAR(50) | ID del comprobante de WhatsApp |

### Tabla: `comprobantes_whatsapp`
Almacena comprobantes recibidos por WhatsApp.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | SERIAL | ID único |
| id_comprobante | VARCHAR(50) | ID del comprobante |
| numero_telefono | VARCHAR(20) | Número de teléfono |
| nombre_remitente | VARCHAR(200) | Nombre del remitente |
| importe | DECIMAL(15,2) | Monto del comprobante |
| fecha_envio | TIMESTAMP | Fecha de envío |
| archivo_url | TEXT | URL del archivo adjunto |
| cotejado | BOOLEAN | Si fue cotejado |

### Tabla: `logs_procesamiento`
Registra todas las operaciones del sistema.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | SERIAL | ID único |
| fecha | TIMESTAMP | Fecha de la operación |
| tipo | VARCHAR(50) | Tipo de operación |
| descripcion | TEXT | Descripción detallada |
| datos | JSONB | Datos adicionales |
| estado | VARCHAR(20) | Estado: 'exitoso' o 'error' |

## 🔌 API Endpoints

### Notificaciones de Transferencias

#### POST `/api/notification`
Recibe notificaciones en tiempo real de transferencias bancarias.

**Body:**
```json
{
  "cvu": {
    "id": 1068,
    "cvu": "0000156006309819363747"
  },
  "origin": {
    "name": "Amancio Higinio Pidre",
    "taxId": "20186259107",
    "account": "0000003100119194948789"
  },
  "coelsa_id": "WY7ZEPN6QWP4M3L4NQ0M51",
  "status": "Pending",
  "amount": "500000",
  "type": "PI",
  "id": 20486078
}
```

### Gestión de Acreditaciones

#### GET `/api/acreditaciones`
Obtiene lista de acreditaciones con filtros.

**Query Parameters:**
- `page`: Número de página (default: 1)
- `limit`: Elementos por página (default: 50)
- `fecha_desde`: Fecha desde (YYYY-MM-DD)
- `fecha_hasta`: Fecha hasta (YYYY-MM-DD)
- `cuit`: CUIT específico
- `estado`: Estado de la transacción
- `fuente`: Origen: 'api' o 'csv'

#### GET `/api/acreditaciones/:id`
Obtiene una acreditación específica.

#### GET `/api/stats`
Obtiene estadísticas generales del sistema.

### Carga de Archivos

#### POST `/upload/csv`
Sube y procesa archivos CSV.

**Form Data:**
- `file`: Archivo CSV

#### GET `/upload/logs`
Obtiene logs de procesamiento de archivos.

### Dashboard

#### GET `/api/dashboard-stats`
Obtiene estadísticas para el dashboard.

#### GET `/api/acreditaciones-pendientes`
Obtiene acreditaciones pendientes de cotejo.

#### POST `/api/cotejar`
Marca una acreditación como cotejada.

#### GET `/api/buscar-acreditacion`
Busca acreditaciones por criterios específicos.

## 📁 Estructura del Proyecto

```
acreditadorBot/
├── config/
│   └── database.js          # Configuración de PostgreSQL
├── routes/
│   ├── api.js              # Endpoints de la API
│   ├── upload.js           # Rutas de carga de archivos
│   └── web.js              # Rutas web
├── public/
│   ├── index.html          # Página principal
│   ├── dashboard.html      # Dashboard
│   ├── upload.html         # Subida de archivos
│   ├── acreditaciones.html # Gestión de acreditaciones
│   └── logs.html           # Visualización de logs
├── uploads/                # Directorio temporal para archivos
├── server.js               # Servidor principal
├── package.json            # Dependencias y scripts
├── railway.json            # Configuración de Railway
├── env.example             # Variables de entorno de ejemplo
└── README.md               # Documentación
```

## 🔧 Configuración

### Variables de Entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `DATABASE_URL` | URL de conexión PostgreSQL | - |
| `PORT` | Puerto del servidor | 3000 |
| `NODE_ENV` | Ambiente (development/production) | development |
| `RATE_LIMIT_WINDOW_MS` | Ventana de rate limiting | 900000 |
| `RATE_LIMIT_MAX_REQUESTS` | Máximo de requests por ventana | 100 |
| `MAX_FILE_SIZE` | Tamaño máximo de archivo | 10485760 |

### Configuración de Railway

El archivo `railway.json` incluye:
- Builder: NIXPACKS
- Health check en `/health`
- Restart policy en caso de fallos
- Timeout de health check: 100ms

## 📈 Uso

### 1. Configurar Webhooks
Para recibir notificaciones automáticas, configurar la URL de webhook:
```
https://tu-app.railway.app/api/notification
```

### 2. Subir Archivos CSV
- Acceder a `/upload`
- Arrastrar archivo CSV o seleccionar desde el explorador
- El sistema procesará automáticamente las transacciones

### 3. Monitorear Dashboard
- Acceder a `/dashboard` para ver estadísticas en tiempo real
- Revisar acreditaciones pendientes de cotejo
- Ver logs de procesamiento

### 4. Cotejar Acreditaciones
- Buscar acreditaciones por CUIT, importe o fecha
- Marcar como cotejadas contra comprobantes de WhatsApp
- Registrar observaciones y referencias

## 🔒 Seguridad

- **Rate Limiting**: Protección contra spam de requests
- **Helmet**: Headers de seguridad HTTP
- **CORS**: Configuración de origen cruzado
- **Validación**: Validación de datos de entrada
- **Logs**: Registro de todas las operaciones

## 🐛 Troubleshooting

### Problemas Comunes

1. **Error de conexión a PostgreSQL**
   - Verificar `DATABASE_URL` en Railway
   - Asegurar que la base de datos esté activa

2. **Archivos CSV no se procesan**
   - Verificar formato: UTF-8, separador coma
   - Campos requeridos: Id, Importe, FechaHora
   - Tamaño máximo: 10MB

3. **Webhooks no funcionan**
   - Verificar URL pública de Railway
   - Revisar logs en `/logs`
   - Confirmar formato JSON del webhook

### Logs y Debugging

- **Logs de aplicación**: Revisar `/logs` en la interfaz web
- **Logs de Railway**: `railway logs`
- **Health check**: `https://tu-app.railway.app/health`

## 🤝 Contribución

1. Fork el proyecto
2. Crear rama feature (`git checkout -b feature/AmazingFeature`)
3. Commit cambios (`git commit -m 'Add AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abrir Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver `LICENSE` para más detalles.

## 📞 Soporte

Para soporte técnico o consultas:
- Crear issue en GitHub
- Revisar documentación en `/docs`
- Contactar al equipo de desarrollo

---

**AcreditadorBot** - Sistema de Acreditaciones Bancarias para Railway 