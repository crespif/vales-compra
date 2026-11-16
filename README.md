# Vales de compra menor digitales — CELTA

Sistema de la **etapa 1** (API + web para celular): el empleado pide productos a distancia, Compras completa el vale y lo aprueba, el empleado lo acepta (firma) y el proveedor confirma la entrega con un QR. Después Compras registra la factura que cita los números de vale y esos vales quedan conciliados.

Stack: **NestJS 10 + TypeORM** con **PostgreSQL o MariaDB/MySQL** (se elige con `DB_TYPE`) en `backend/`, con PDF (`pdfkit`) y QR (`qrcode`); **React 18 + Vite** en `frontend/`. En producción la API sirve la web en `/`, así se publica todo junto en un solo puerto.

## Puesta en marcha

### Opción A: Docker

```bash
docker compose up -d --build
docker compose exec api node dist/database/seed.js   # datos de prueba
```

### Opción B: Postgres local (Windows/Linux)

```bash
cd frontend
npm install
npm run build                 # genera frontend/dist, que la API sirve en /
cd ../backend
copy .env.example .env        # en Linux/macOS: cp .env.example .env  (ajustar DATABASE_URL)
npm install
npm run build
npm run db:seed               # crea tablas (migraciones) y datos de prueba
npm start                     # http://localhost:3000
```

Abrí http://localhost:3000 para usar la web.

**Desarrollo:** en una terminal `cd backend && npm run start:dev`, y en otra `cd frontend && npm run dev`. La web queda en http://localhost:5173 y le pasa las llamadas a la API. Las dos recargan solas al guardar.

**Usuarios de prueba que crea el seed.** Cambiar las contraseñas antes del piloto.

| Legajo | Contraseña | Rol |
| --- | --- | --- |
| `admin` | `admin1234` | ADMIN |
| `compras` | `compras1234` | COMPRAS |
| `1001` | `empleado1234` | SOLICITANTE |

El seed crea un proveedor de prueba con PIN `1234`, para probar sin GLM. Queda deshabilitado en cuanto se sincroniza con GLM, y a los proveedores reales hay que definirles el PIN desde **Proveedores y usuarios**.

## Tests

```bash
npm test            # unitarios (máquina de estados)
npm run test:e2e    # circuito completo contra Postgres (base vales_test)
# con DB_TYPE=mariadb corre el mismo circuito contra MariaDB
```

El test e2e usa `DATABASE_URL_TEST`. Si no está definida, usa `postgresql://vales:vales@localhost:5432/vales_test`, y **borra esa base** al empezar.

## Circuito y endpoints

Todas las rutas piden `Authorization: Bearer <token>`, salvo las marcadas como públicas.

| Paso | Quién | Endpoint |
| --- | --- | --- |
| Login | todos | `POST /auth/login` `{legajo, password}` (pública) |
| Pedir productos | empleado | `POST /vales` `{items:[{cantidad, unidad?, descripcion}], proveedorId?, observaciones?, enviar:true}` |
| Editar o enviar un borrador | empleado | `PATCH /vales/:id`, `POST /vales/:id/enviar` |
| Completar y aprobar (emite el número, el QR y la vigencia) | Compras | `POST /vales/:id/aprobar` `{proveedorId?, items?, observaciones?, almacenId?, ubicacionId?}` |
| Rechazar | Compras | `POST /vales/:id/rechazar` `{motivo}` |
| Aceptar el vale (firma del empleado) | empleado | `POST /vales/:id/aceptar` |
| PDF del vale y link del QR | empleado o Compras | `GET /vales/:id/pdf`, `GET /vales/:id/link` |
| Ver el vale y confirmar la entrega con PIN | proveedor | `GET /v/:token` (página HTML pública) |
| Registrar la entrega a mano | Compras | `POST /vales/:id/entrega` `{remito?}` |
| Anular | empleado (hasta SOLICITADO) o Compras (hasta EMITIDO) | `POST /vales/:id/anular` `{motivo}` |
| Registrar factura y conciliar | Compras | `POST /facturas` `{proveedorId, numero, fecha, importe, vales:[números]}` |
| Entregados sin facturar | Compras | `GET /facturas/pendientes?dias=30` |
| Proveedores (solo lectura, vienen de GLM) | todos | `GET /proveedores?buscar=texto` |
| Actualizar proveedores desde GLM | Compras | `POST /proveedores/sincronizar`, `GET /proveedores/sincronizacion` |
| PIN de entrega del proveedor | Compras | `POST /proveedores/:id/pin` `{pin}` |
| Sectores y usuarios | ADMIN | `/sectores`, `/usuarios` |

Estados: `BORRADOR → SOLICITADO → APROBADO → EMITIDO → ENTREGADO → CONCILIADO`, más `RECHAZADO` y `ANULADO`. Las transiciones están en `src/vales/estados.ts`, y cada cambio queda registrado en `vale_evento` con usuario, canal, IP y fecha.

## Proveedores (GLM)

Los proveedores salen de GLM (`GET {GLM_API_URL}/proveedores`). La app guarda una copia local de solo lectura, identificada por el `codigo` de GLM. Esa copia la necesita para relacionar los vales con su proveedor y para que el historial y la búsqueda funcionen aunque GLM no responda.

- La copia se actualiza al arrancar la app, después cada `GLM_SYNC_MINUTOS` minutos, y también con el botón **Actualizar desde GLM**.
- Los proveedores que dejan de venir de GLM quedan como "No está en GLM": no se pueden usar en vales nuevos, pero conservan sus vales.
- Si GLM no responde, o devuelve una lista vacía, no se cambia nada y el error se muestra en la pantalla de proveedores.
- Cuando el tipo de documento es CUIT (`tipo_documento` 80), el `documento` se muestra con formato de CUIT (30-65436422-9).
- La app no permite crear, editar ni borrar proveedores. Lo único que se define acá es el **PIN** con el que cada proveedor confirma las entregas.

## Numeración

El número se asigna recién al emitir el vale, desde la secuencia `vale_numero_seq`, y nunca se repite aunque se emitan varios vales a la vez. Para continuar la serie del talonario en papel:

```sql
SELECT setval('vale_numero_seq', 53051);   -- PostgreSQL: el próximo vale será el 53052
SELECT SETVAL(vale_numero_seq, 53051);     -- MariaDB
```

## Publicar en Coolify

Coolify construye la imagen con el `Dockerfile` de la raíz, que contiene la API y la web. Al arrancar, el contenedor aplica las migraciones, crea los datos iniciales y levanta la app en el puerto 3000. Docker usa `GET /salud` para saber si la app está viva.

1. **Base de datos:** en el proyecto de Coolify → *+ New* → *PostgreSQL*. Copiá su *Postgres URL (internal)*.
2. **App:** *+ New* → *Private Repository (with GitHub App)* → elegí el repositorio `vales-compra`, rama `main`, *Build Pack: Dockerfile*, puerto `3000`.
3. **Variables de entorno:**

| Variable | Valor |
| --- | --- |
| `DB_TYPE` | `postgres` |
| `DATABASE_URL` | la URL interna del PostgreSQL del paso 1 |
| `JWT_SECRET` | una clave aleatoria de al menos 32 caracteres |
| `SEED_ADMIN_PASSWORD` | la clave inicial del usuario `admin` (mínimo 8 caracteres) |
| `PUBLIC_BASE_URL` | `https://vales.celta.com.ar` |
| `GLM_API_URL` | `http://192.168.98.223:3000` (dentro de la red) |
| `GLM_SYNC_MINUTOS` | `60` |
| `VIGENCIA_DIAS` | `7` |

4. **Dominio:** en *Domains*, cargá `https://vales.celta.com.ar`. Coolify emite el certificado automáticamente cuando el DNS apunta a la IP pública que llega a este servidor.
5. **Deploy.** Después entrá con `admin` y la clave de `SEED_ADMIN_PASSWORD`, y creá los usuarios reales desde **Proveedores y usuarios**.

## Publicar en cPanel (vales.celta.com.ar)

El servidor de cPanel tiene MariaDB (no PostgreSQL) y Node 16. La app funciona con los dos, pero conviene pedirle al proveedor que instale **ea-nodejs22**, porque Node 16 ya no recibe actualizaciones de seguridad.

1. **Armar el paquete** en la PC: `cd backend && npm run paquete`. Genera `deploy/vales-app.zip` con la API compilada, la web, `package.json` y `app.js`.
2. **Base de datos:** en cPanel → *Manage My Databases*, crear la base `wmeq5232_vales` y el usuario `wmeq5232_vales`, y darle todos los privilegios sobre esa base.
3. **Subdominio:** en cPanel → *Dominios*, crear `vales.celta.com.ar`.
4. **Subir la app:** en el Administrador de archivos, crear la carpeta `/home/wmeq5232/vales-app`, subir el zip y extraerlo ahí.
5. **Configurar:** dentro de esa carpeta, copiar `cpanel.env.example` como `.env` y completar la clave de la base y `JWT_SECRET`.
6. **Instalar dependencias y datos iniciales** desde la Terminal:
   ```
   cd ~/vales-app
   /opt/cpanel/ea-nodejs16/bin/npm ci --omit=dev
   /opt/cpanel/ea-nodejs16/bin/node dist/database/seed.js
   ```
   El seed crea las tablas y los usuarios iniciales. Cambiá las contraseñas apenas entres.
7. **Registrar la app:** en cPanel → *Application Manager*, registrar una app con ruta `vales-app`, dominio `vales.celta.com.ar`, URI base `/` y modo `production`. Passenger arranca `app.js`.
8. **SSL:** en *SSL/TLS Status*, ejecutar AutoSSL para que el subdominio tenga HTTPS.

**Para actualizar** después de un cambio: volver a armar el paquete, subirlo y extraerlo encima, sin pisar el `.env`, y reiniciar la app desde *Application Manager*. Las migraciones de la base se aplican solas al arrancar.

## Configuración (`.env`)

| Variable | Para qué |
| --- | --- |
| `DB_TYPE` | `postgres` (por defecto) o `mariadb` (también sirve para MySQL) |
| `DATABASE_URL` | Conexión: `postgresql://usuario:clave@host:5432/base` o `mysql://usuario:clave@host:3306/base` |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Firma y duración de las sesiones |
| `PUBLIC_BASE_URL` | URL pública que codifica el QR (por ejemplo, `https://vales.celta.com.ar`) |
| `VIGENCIA_DIAS` | Días que el vale es válido después de emitido (7 por defecto) |
| `GLM_API_URL` | Dirección de la API de GLM. Dentro de la red: `http://192.168.98.223:3000`; desde afuera: `http://200.45.235.121:3000` |
| `GLM_SYNC_MINUTOS` | Cada cuántos minutos se actualizan los proveedores (60 por defecto; 0 = solo con el botón) |

## Web

| Pantalla | Quién | Qué hace |
| --- | --- | --- |
| Mis vales / Vales | todos | Lista con filtros por estado; Compras busca por número |
| Nuevo pedido | todos | Productos (cantidad, unidad y detalle), proveedor sugerido y observaciones |
| Detalle del vale | empleado | Enviar o anular; cuando está emitido, aceptar (firma) y mostrar el QR, ver el PDF o compartir |
| Detalle del vale | Compras | Completar proveedor y productos, aprobar y emitir, rechazar con motivo, registrar entrega, anular |
| Facturas | Compras | Registrar la factura marcando los vales que cita, ver los retirados hace más de 30 días sin factura y las últimas facturas |
| Proveedores y usuarios | Compras / ADMIN | Alta de proveedores, PIN, habilitar o deshabilitar; alta de usuarios (solo ADMIN) |

La web se puede instalar en el celular ("Agregar a pantalla de inicio") y se adapta al tema claro u oscuro del teléfono.

## Pendiente (siguientes etapas)

- Envío de las órdenes a GLM: los campos ya existen (`almacen_id`, `ubicacion_id`, `glm_*` y la tabla `parametro`).
- Bot de Telegram o WhatsApp, que va a llamar a `ValesService` con `canal: BOT`.
