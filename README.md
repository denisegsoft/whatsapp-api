# whatsapp-node

Servidor Node.js que actúa como puente entre WhatsApp Web y una aplicación backend (Laravel). Usa [Baileys](https://github.com/WhiskeySockets/Baileys) para conectarse al protocolo de WhatsApp Web sin necesidad de navegador.

## Cómo funciona

```
WhatsApp ──► Node (Baileys) ──► POST webhook ──► Laravel
                 ▲
Laravel ─────────┘  (POST /send)
```

- Cada mensaje entrante se reenvía al backend vía webhook HTTP
- El backend puede enviar mensajes llamando a la API REST de este servidor

## Requisitos

- Node.js >= 18
- npm

## Instalación

```bash
git clone https://github.com/tu-usuario/whatsapp-node.git
cd whatsapp-node
npm install
cp .env.example .env
```

Editá el `.env` con tus valores:

```env
PORT=3001
API_KEY=clave_secreta_para_que_laravel_llame_a_este_servidor
LARAVEL_WEBHOOK_URL=http://localhost/api/whatsapp/webhook
WEBHOOK_SECRET=secret_compartido_con_laravel
```

> Los valores de `API_KEY` y `WEBHOOK_SECRET` deben coincidir exactamente con los del `.env` de Laravel (`WHATSAPP_API_KEY` y `WHATSAPP_WEBHOOK_SECRET`).

## Uso

```bash
# Producción
node server.js

# Desarrollo (con auto-reload)
npm run dev
```

Al iniciar por primera vez aparece un código QR en la terminal. Escanearlo con WhatsApp:
**Ajustes → Dispositivos vinculados → Vincular dispositivo**

La sesión queda guardada en la carpeta `auth_info/` — no hace falta escanear el QR en cada reinicio.

Para cerrar sesión y escanear de nuevo, eliminar la carpeta `auth_info/` y reiniciar.

## API REST

Todos los endpoints protegidos requieren el header:
```
x-api-key: <API_KEY>
```

### GET /status
Devuelve el estado de la conexión. Sin autenticación.

**Respuesta:**
```json
{ "service": "whatsapp-node", "connected": true }
```

---

### POST /send
Envía un mensaje de texto a un número.

**Body:**
```json
{
  "to": "5491112345678",
  "message": "Hola!"
}
```

**Respuesta:**
```json
{ "success": true, "to": "5491112345678", "message": "Hola!" }
```

---

### POST /send-bulk
Envía el mismo mensaje a varios números.

**Body:**
```json
{
  "numbers": ["5491112345678", "5491187654321"],
  "message": "Recordatorio de reserva"
}
```

**Respuesta:**
```json
{
  "results": [
    { "number": "5491112345678", "success": true },
    { "number": "5491187654321", "success": true }
  ]
}
```

---

## Webhook hacia el backend

Cuando llega un mensaje, este servidor hace `POST` a `LARAVEL_WEBHOOK_URL` con:

```json
{
  "from": "5491112345678",
  "message": "Hola, quiero hacer una reserva",
  "messageId": "ABCD1234...",
  "timestamp": 1746000000
}
```

Header de autenticación:
```
Authorization: Bearer <WEBHOOK_SECRET>
```

## Deploy en producción (VPS)

### 1. Instalar PM2

```bash
npm install -g pm2
```

### 2. Iniciar con PM2

```bash
pm2 start server.js --name whatsapp-node
pm2 save
pm2 startup
```

### 3. Comandos útiles de PM2

```bash
pm2 logs whatsapp-node      # ver logs en tiempo real
pm2 restart whatsapp-node   # reiniciar
pm2 stop whatsapp-node      # detener
pm2 status                  # estado de todos los procesos
```

### 4. Virtual host Apache (subdominio)

Configurar `whatsapp.reservatuespacio.com.ar` como reverse proxy al puerto 3001:

```apache
<VirtualHost *:80>
    ServerName whatsapp.reservatuespacio.com.ar

    ProxyPreserveHost On
    ProxyPass / http://localhost:3001/
    ProxyPassReverse / http://localhost:3001/
</VirtualHost>
```

Activar módulos necesarios:
```bash
a2enmod proxy proxy_http
systemctl reload apache2
```

Luego configurar HTTPS con Certbot:
```bash
certbot --apache -d whatsapp.reservatuespacio.com.ar
```

> En producción, `LARAVEL_WEBHOOK_URL` debe apuntar a `http://localhost/api/whatsapp/webhook` para que la comunicación sea interna (sin salir al exterior).
