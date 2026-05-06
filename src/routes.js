const express = require('express')
const { sendMessage, getStatus, getCurrentQR } = require('./whatsapp')

const router = express.Router()

function authMiddleware(req, res, next) {
    const key = req.headers['x-api-key']
    if (!key || key !== process.env.API_KEY) {
        return res.status(401).json({ error: 'No autorizado' })
    }
    next()
}

function uiAuthMiddleware(req, res, next) {
    const key = req.query.key
    if (!key || key !== process.env.API_KEY) {
        return res.status(401).send('<h2>No autorizado</h2>')
    }
    next()
}

// GET /status
router.get('/status', (req, res) => {
    res.json({ service: 'whatsapp-node', ...getStatus() })
})

// GET /qr — devuelve el QR actual como base64 o null si ya está conectado
router.get('/qr', uiAuthMiddleware, (req, res) => {
    const qr = getCurrentQR()
    const { connected } = getStatus()
    res.json({ connected, qr: qr || null })
})

// GET /ui — interfaz web para escanear el QR
router.get('/ui', uiAuthMiddleware, (req, res) => {
    const key = req.query.key
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp — ReservaTuEspacio</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #f0f2f5;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }
        .card {
            background: white;
            border-radius: 16px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 4px 24px rgba(0,0,0,0.08);
            max-width: 400px;
            width: 100%;
        }
        .logo { font-size: 32px; margin-bottom: 8px; }
        h1 { font-size: 20px; color: #111; margin-bottom: 4px; }
        .subtitle { color: #888; font-size: 14px; margin-bottom: 32px; }
        #qr-container img { width: 240px; height: 240px; border-radius: 8px; }
        #qr-container .placeholder {
            width: 240px;
            height: 240px;
            background: #f0f2f5;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto;
            color: #aaa;
            font-size: 14px;
        }
        .status {
            margin-top: 24px;
            padding: 10px 20px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 500;
            display: inline-block;
        }
        .status.connected { background: #dcfce7; color: #16a34a; }
        .status.waiting { background: #fef9c3; color: #ca8a04; }
        .status.disconnected { background: #fee2e2; color: #dc2626; }
        .hint { margin-top: 16px; font-size: 13px; color: #999; }
    </style>
</head>
<body>
<div class="card">
    <div class="logo">📱</div>
    <h1>WhatsApp Web</h1>
    <p class="subtitle">ReservaTuEspacio</p>

    <div id="qr-container">
        <div class="placeholder">Cargando...</div>
    </div>

    <div id="status-badge" class="status waiting">Esperando QR...</div>
    <p id="hint" class="hint">Abrí WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
</div>

<script>
    const KEY = '${key}'

    async function poll() {
        try {
            const res = await fetch('/qr?key=' + KEY)
            const data = await res.json()
            const container = document.getElementById('qr-container')
            const badge = document.getElementById('status-badge')
            const hint = document.getElementById('hint')

            if (data.connected) {
                container.innerHTML = '<div class="placeholder">✓ Conectado</div>'
                badge.className = 'status connected'
                badge.textContent = 'Conectado'
                hint.textContent = 'El servidor está recibiendo mensajes.'
            } else if (data.qr) {
                container.innerHTML = '<img src="' + data.qr + '" alt="QR Code">'
                badge.className = 'status waiting'
                badge.textContent = 'Esperando escaneo...'
                hint.textContent = 'Abrí WhatsApp → Dispositivos vinculados → Vincular dispositivo'
            } else {
                badge.className = 'status disconnected'
                badge.textContent = 'Iniciando...'
            }
        } catch (e) {
            console.error(e)
        }
    }

    poll()
    setInterval(poll, 3000)
</script>
</body>
</html>`)
})

// POST /send
router.post('/send', authMiddleware, async (req, res) => {
    const { to, message } = req.body

    if (!to || !message) {
        return res.status(400).json({ error: 'Parámetros requeridos: to, message' })
    }

    try {
        await sendMessage(to, message)
        res.json({ success: true, to, message })
    } catch (err) {
        console.error('Error al enviar mensaje:', err.message)
        res.status(500).json({ error: err.message })
    }
})

// POST /send-bulk
router.post('/send-bulk', authMiddleware, async (req, res) => {
    const { numbers, message } = req.body

    if (!Array.isArray(numbers) || !message) {
        return res.status(400).json({ error: 'Parámetros requeridos: numbers (array), message' })
    }

    const results = []

    for (const number of numbers) {
        try {
            await sendMessage(number, message)
            results.push({ number, success: true })
            await new Promise(r => setTimeout(r, 500))
        } catch (err) {
            results.push({ number, success: false, error: err.message })
        }
    }

    res.json({ results })
})

module.exports = router
