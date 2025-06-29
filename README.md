# AcreditadorBot - Sistema de Acreditaciones Bancarias

Sistema integral para el procesamiento y cotejo de transferencias bancarias contra comprobantes de WhatsApp, desarrollado para Railway con PostgreSQL.

## 🚀 Características

- **API en Tiempo Real**: Recibe notificaciones automáticas de transferencias bancarias
- **Carga de Archivos CSV**: Procesamiento masivo de transacciones diarias
- **Interfaz Web Moderna**: Dashboard con estadísticas y gestión de datos
- **Portal de Clientes**: Sistema de autenticación JWT para que los clientes vean sus datos
- **Base de Datos PostgreSQL**: Almacenamiento robusto y escalable
- **Sistema de Cotejo**: Comparación automática de acreditaciones vs comprobantes
- **Logs Detallados**: Seguimiento completo de todas las operaciones
- **Autenticación Básica**: Protección del dashboard y rutas web
- **Gestión de Usuarios**: ABM completo para usuarios del portal de clientes

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
   railway variables set JWT_SECRET=<tu-secreto-jwt>
   ```

6. **Desplegar**
   ```bash
   railway up
   ```

## 🏢 Portal de Clientes

### Características del Portal

- **Autenticación JWT**: Sistema seguro de login/logout
- **Dashboard Personalizado**: Estadísticas específicas del cliente
- **Comprobantes**: Lista de todos los comprobantes con ordenamiento
- **Movimientos**: Pagos y créditos del cliente
- **Ordenamiento**: Click en columnas para ordenar por ID, Fecha, Monto, etc.
- **Filtros**: Por estado (cotejado/pendiente) y tipo de movimiento
- **Responsive**: Diseño adaptativo para móviles y desktop

### URLs del Portal

- **Login**: `/portal-login.html`
- **Dashboard**: `/portal-dashboard.html`
- **Gestión de Usuarios**: `/portal-users.html` (solo administradores)

### API del Portal

#### Autenticación

**POST `/portal/login`**
```json
{
  "username": "cliente1",
  "password": "cliente123"
}
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "token": "jwt_token_here",
    "user": {
      "id": 1,
      "cliente_id": 1,
      "username": "cliente1",
      "nombre": "Juan",
      "apellido": "Pérez"
    }
  }
}
```

#### Datos del Cliente

**GET `/portal/profile`** (requiere token)
```bash
Authorization: Bearer <token>
```

**GET `/portal/resumen`** (requiere token)
- Estadísticas generales del cliente

**GET `/portal/comprobantes`** (requiere token)
- Lista de comprobantes con paginación y ordenamiento
- Query params: `page`, `limit`, `ordenar_por`, `orden`, `estado`

**GET `/portal/movimientos`** (requiere token)
- Lista de movimientos (pagos y créditos)
- Query params: `page`, `limit`, `ordenar_por`, `orden`, `tipo`

### Gestión de Usuarios del Portal

#### API de Administración

**GET `/api/portal-users`**
- Lista usuarios del portal con paginación

**POST `/api/portal-users`**
```json
{
  "id_cliente": 1,
  "username": "cliente1",
  "password": "cliente123",
  "email": "cliente1@test.com"
}
```

**PUT `/api/portal-users/:id`**
- Actualizar usuario existente

**DELETE `/api/portal-users/:id`**
- Desactivar usuario (soft delete)

### Crear Usuario de Prueba

Para crear un usuario de prueba para el cliente ID 1:

```bash
node create_portal_user.js
```

Esto creará:
- Usuario: `cliente1`
- Contraseña: `cliente123`
- Email: `cliente1@test.com`

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
| id_cliente | INTEGER | ID del cliente |
| nombre_remitente | VARCHAR(200) | Nombre del remitente |
| cuit | VARCHAR(20) | CUIT del remitente |
| importe | DECIMAL(15,2) | Monto del comprobante |
| fecha_envio | TIMESTAMP | Fecha de envío |
| fecha_recepcion | TIMESTAMP | Fecha de recepción |
| estado | VARCHAR(20) | Estado del comprobante |
| cotejado | BOOLEAN | Si fue cotejado |
| id_acreditacion | INTEGER | ID de la acreditación vinculada |
| fecha_cotejo | TIMESTAMP | Fecha del cotejo |

### Tabla: `clientes`
Almacena información de los clientes.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | SERIAL | ID único |
| nombre | VARCHAR(100) | Nombre del cliente |
| apellido | VARCHAR(100) | Apellido del cliente |
| estado | VARCHAR(20) | Estado: 'activo' o 'inactivo' |
| fecha_registro | TIMESTAMP | Fecha de registro |

### Tabla: `pagos`
Almacena movimientos de dinero (pagos y créditos).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | SERIAL | ID único |
| id_cliente | INTEGER | ID del cliente |
| concepto | VARCHAR(200) | Concepto del movimiento |
| importe | DECIMAL(15,2) | Monto del movimiento |
| fecha_pago | TIMESTAMP | Fecha del movimiento |
| tipo_pago | VARCHAR(50) | Tipo: 'egreso' o 'credito' |
| metodo_pago | VARCHAR(50) | Método de pago |
| referencia | VARCHAR(100) | Referencia del pago |
| observaciones | TEXT | Observaciones adicionales |
| estado | VARCHAR(20) | Estado del movimiento |
| fecha_creacion | TIMESTAMP | Fecha de creación |

### Tabla: `portal_users`
Almacena usuarios del portal de clientes.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | SERIAL | ID único |
| id_cliente | INTEGER | ID del cliente |
| username | VARCHAR(50) | Nombre de usuario |
| password_hash | VARCHAR(255) | Hash de la contraseña |
| email | VARCHAR(100) | Email del usuario |
| activo | BOOLEAN | Si el usuario está activo |
| fecha_creacion | TIMESTAMP | Fecha de creación |
| ultimo_acceso | TIMESTAMP | Último acceso |
| token_reset | VARCHAR(100) | Token para reset de contraseña |
| token_expira | TIMESTAMP | Expiración del token |

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

### POST /api/comprobantes/whatsapp

Endpoint para que el sistema de WhatsApp cargue comprobantes automáticamente.

**URL:** `POST /api/comprobantes/whatsapp`

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "nombre_remitente": "Juan Pérez",
  "cuit": "20396565154",
  "fecha": "2025-06-27T10:30:00.000Z",
  "hora": "15:30",
  "monto": 50000,
  "cliente": "cripto"
}
```

**Campos requeridos:**
- `nombre_remitente`: Nombre del remitente
- `cuit`: CUIT del remitente
- `fecha`: Fecha del comprobante (ISO 8601 o DD/MM/YYYY)
- `monto`: Monto del comprobante (numérico)
- `cliente`: Cliente al que pertenece el comprobante

**Campos opcionales:**
- `hora`: Hora del comprobante (formato HH:MM)

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Comprobante procesado exitosamente",
  "data": {
    "comprobante_id": 123,
    "id_comprobante": "WH_1234567890_abc123",
    "cliente": {
      "id": 5,
      "creado": true,
      "nombre": "Juan Pérez"
    },
    "acreditacion": {
      "id": 45,
      "encontrada": true,
      "cotejado": true
    },
    "estado": "cotejado"
  }
}
```

**Funcionalidades automáticas:**

1. **Creación automática de cliente**: Si el cliente no existe, se crea automáticamente
2. **Búsqueda de acreditación**: Busca acreditaciones que coincidan por:
   - Monto exacto
   - Fecha (±1 día)
   - Nombre del titular o CUIT
3. **Cotejo automático**: Si encuentra coincidencia, vincula automáticamente
4. **Logging**: Registra todas las operaciones

**Criterios de búsqueda de acreditación:**
- Importe exacto
- Fecha dentro de ±24 horas
- Nombre del titular (búsqueda parcial) O CUIT exacto
- Acreditación no cotejada y sin comprobante asignado

**Estados de respuesta:**
- `"cotejado"`: Se encontró y vinculó acreditación
- `"pendiente"`: No se encontró acreditación coincidente

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

## 🔐 Autenticación

El sistema utiliza autenticación básica HTTP para proteger el dashboard y todas las rutas web. Las APIs permanecen sin autenticación para permitir integraciones externas.

### Configuración de Credenciales

Configura las variables de entorno para las credenciales:

```bash
# Variables de entorno para autenticación
AUTH_USERNAME=admin
AUTH_PASSWORD=acreditador2024
```

### Rutas Protegidas

- ✅ **Protegidas**: Dashboard, páginas web, archivos estáticos
- ❌ **Sin protección**: Todas las rutas `/api/*`

### Acceso al Sistema

Al acceder al dashboard, el navegador solicitará las credenciales configuradas. Una vez autenticado, la sesión se mantiene durante toda la navegación.

---

**AcreditadorBot** - Sistema de Acreditaciones Bancarias para Railway 