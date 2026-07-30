# Bookify - Backend

## Descripción del Proyecto
Bookify es una plataforma de gestión de reservas que permite a empresas administrar los turnos solicitados por los usuarios. Este repositorio contiene el backend de la aplicación, desarrollado con Node.js y Express, y conectado a una base de datos MongoDB.

## Tecnologías Utilizadas
- **Node.js** - Entorno de ejecución de JavaScript.
- **Express** - Framework web para Node.js.
- **MongoDB** - Base de datos NoSQL para almacenar información de usuarios, turnos y empresas.
- **Mongoose** - ODM para modelar los datos en MongoDB.
- **JSON Web Token (JWT)** - Autenticación basada en tokens.
- **bcryptjs** - Cifrado de contraseñas.
- **dotenv** - Gestión de variables de entorno.

## Entornos (desarrollo vs producción)

| | Desarrollo (local) | Producción |
|--|-------------------|------------|
| Archivo | `.env` | Variables en el servidor (referencia: `.env.production`) |
| Database | `bookifydb-dev` | `bookifydb` |
| Frontend | `http://localhost:5173` | `https://bookify.aedestec.com` |
| Emails | Redirigidos a `DEV_EMAIL_REDIRECT` | Destinatarios reales |

### Setup local

1. Copiá `.env.example` → `.env` y completá los valores.
2. Asegurate de que `MONGODB_URL_CONNECTION` apunte a **`bookifydb-dev`** (nunca a `bookifydb`).
3. Definí `NODE_ENV=development` y `DEV_EMAIL_REDIRECT` con tu correo personal.
4. (Opcional, una vez) Cloná datos de producción a la DB de desarrollo:

```bash
npm run clone:dev-db
```

Esto copia `bookifydb` → `bookifydb-dev` **sin modificar** producción. Podés repetirlo para refrescar datos de prueba.

5. Arrancá API y worker:

```bash
npm run dev
npm run worker
```

### Checklist anti-producción

- [ ] `MONGODB_URL_CONNECTION` contiene `bookifydb-dev`, no `bookifydb`
- [ ] `NODE_ENV=development`
- [ ] `DEV_EMAIL_REDIRECT` está definido
- [ ] `FRONTEND_URL` y `BACK_URL_AEDES` apuntan a `http://localhost:5173`
- [ ] `REDIRECT_URL_MP` apunta a **tu** backend local (p. ej. ngrok → `…/mercadopago/oauth/callback`), no a `apibookify.aedestec.com`. Esa URI debe coincidir exactamente con la Redirect URI de la app en Mercado Pago.
- [ ] `NOTIFICATION_URL_MP` apunta a `…/mercadopago/webhooks` en el mismo host público (ngrok en local). Va en cada preferencia de seña y tiene prioridad sobre la URL del panel de MP.

En development, todos los emails salen por Brevo pero llegan solo a `DEV_EMAIL_REDIRECT`, con subject `[DEV → destinatario-original] ...`.

### Importante en el servidor de producción

Asegurate de que el host tenga:

```
NODE_ENV=production
MONGODB_URL_CONNECTION=.../bookifydb?...
```

Sin `NODE_ENV=production`, el schema asume `development` y exigirá `DEV_EMAIL_REDIRECT`.

## Características principales

### Autenticación
Registro y logueo de usuarios utilizando JWT.

### Implementación con Mercado Pago
Implementación con Mercado Pago para poder cobrar y generar reembolsos automáticos dentro de la aplicación.

### Notificaciones automáticas
Notificaciones automáticas de recordatorios, confirmaciones, cancelaciones, etc. con Nodemailer

## Contribución
Si deseas contribuir a *Bookify*, puedes enviar un pull request con tus mejoras o reportar issues en el repositorio.

---

🔥 **Bookify** - Facilitando la gestión de turnos de manera eficiente.
