const express = require('express')
const { sendMessage, getStatus, getCurrentQR } = require('./whatsapp')
const { addListener, removeListener, getMessages } = require('./messageStore')

const router = express.Router()

function authMiddleware(req, res, next) {
    const key = req.headers['x-api-key']
    if (!key || key !== process.env.API_KEY) {
        return res.status(401).json({ error: 'No autorizado' })
    }
    next()
}

function uiAuth(req, res, next) {
    const key = req.query.key || req.headers['x-api-key']
    if (!key || key !== process.env.API_KEY) {
        return res.status(401).send('<h2>No autorizado</h2>')
    }
    next()
}

// GET /status
router.get('/status', (req, res) => {
    res.json({ service: 'whatsapp-node', ...getStatus() })
})

// GET /qr
router.get('/qr', uiAuth, (req, res) => {
    res.json({ connected: getStatus().connected, qr: getCurrentQR() || null })
})

// GET /events — SSE stream de mensajes entrantes
router.get('/events', uiAuth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const send = (msg) => res.write(`data: ${JSON.stringify(msg)}\n\n`)

    addListener(send)
    req.on('close', () => removeListener(send))
})

// GET /messages — historial reciente
router.get('/messages', uiAuth, (req, res) => {
    res.json(getMessages())
})

// GET /ui — interfaz completa
router.get('/ui', uiAuth, (req, res) => {
    const key = req.query.key
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp — ReservaTuEspacio</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f2f5; }

        .topbar {
            background: #075e54;
            color: white;
            padding: 14px 24px;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .topbar h1 { font-size: 18px; font-weight: 600; }
        .topbar .sub { font-size: 13px; opacity: .7; margin-left: auto; }
        .badge {
            padding: 3px 10px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
        }
        .badge.on { background: #25d366; color: white; }
        .badge.off { background: #e74c3c; color: white; }
        .badge.wait { background: #f39c12; color: white; }

        .layout { display: flex; height: calc(100vh - 50px); }

        /* Panel QR */
        .qr-panel {
            width: 260px;
            background: white;
            border-right: 1px solid #e0e0e0;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 24px 16px;
            gap: 16px;
        }
        .qr-panel h2 { font-size: 14px; color: #555; }
        .qr-panel img { width: 200px; height: 200px; border-radius: 8px; }
        .qr-placeholder {
            width: 200px; height: 200px;
            background: #f0f2f5;
            border-radius: 8px;
            display: flex; align-items: center; justify-content: center;
            color: #aaa; font-size: 13px; text-align: center; padding: 16px;
        }

        /* Panel mensajes */
        .messages-panel { flex: 1; display: flex; flex-direction: column; }
        .messages-header {
            padding: 14px 20px;
            background: white;
            border-bottom: 1px solid #e0e0e0;
            font-size: 14px;
            color: #555;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .messages-list {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .msg-card {
            background: white;
            border-radius: 12px;
            padding: 14px 16px;
            box-shadow: 0 1px 4px rgba(0,0,0,0.06);
            max-width: 680px;
        }
        .msg-card .meta {
            display: flex;
            justify-content: space-between;
            margin-bottom: 6px;
        }
        .msg-card .from {
            font-size: 13px;
            font-weight: 600;
            color: #075e54;
        }
        .msg-card .time {
            font-size: 11px;
            color: #aaa;
        }
        .msg-card .text {
            font-size: 15px;
            color: #111;
            margin-bottom: 10px;
        }
        .msg-card .laravel-response {
            background: #f0f2f5;
            border-radius: 8px;
            padding: 8px 12px;
            font-size: 12px;
            color: #555;
        }
        .msg-card .laravel-response .label {
            font-size: 11px;
            font-weight: 600;
            color: #888;
            margin-bottom: 4px;
        }
        .msg-card .laravel-response pre {
            white-space: pre-wrap;
            word-break: break-word;
            font-family: monospace;
        }
        .msg-card .error { color: #e74c3c; }
        .empty { text-align: center; color: #aaa; margin-top: 60px; font-size: 14px; }
        .new-msg { animation: slideIn .3s ease; }
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(-8px); }
            to   { opacity: 1; transform: translateY(0); }
        }
    </style>
</head>
<body>

<div class="topbar">
    <span>📱</span>
    <h1>WhatsApp — ReservaTuEspacio</h1>
    <span id="status-badge" class="badge wait">Cargando...</span>
    <span class="sub" id="msg-count">0 mensajes</span>
</div>

<div class="layout">
    <div class="qr-panel">
        <h2>Estado de conexión</h2>
        <div id="qr-container"><div class="qr-placeholder">Cargando...</div></div>
        <p id="qr-hint" style="font-size:12px;color:#999;text-align:center;"></p>
    </div>

    <div class="messages-panel">
        <div class="messages-header">
            <span>Mensajes recibidos</span>
            <span style="font-size:12px;color:#aaa;">Se actualiza en tiempo real</span>
        </div>
        <div class="messages-list" id="messages-list">
            <p class="empty">No hay mensajes aún</p>
        </div>
    </div>
</div>

<script>
const KEY = '${key}'

function renderMsg(msg, prepend = false) {
    const list = document.getElementById('messages-list')
    const empty = list.querySelector('.empty')
    if (empty) empty.remove()

    const hasError = msg.laravelResponse && msg.laravelResponse.error
    const responseHtml = msg.laravelResponse
        ? \`<div class="laravel-response">
            <div class="label">Respuesta Laravel</div>
            <pre class="\${hasError ? 'error' : ''}">\${JSON.stringify(msg.laravelResponse, null, 2)}</pre>
           </div>\`
        : ''

    const card = document.createElement('div')
    card.className = 'msg-card' + (prepend ? ' new-msg' : '')
    card.innerHTML = \`
        <div class="meta">
            <span class="from">+\${msg.from}</span>
            <span class="time">\${msg.datetime}</span>
        </div>
        <div class="text">\${msg.message}</div>
        \${responseHtml}
    \`

    if (prepend) list.prepend(card)
    else list.appendChild(card)
}

// Cargar historial
async function loadHistory() {
    const res = await fetch('/messages?key=' + KEY)
    const msgs = await res.json()
    const count = msgs.length
    document.getElementById('msg-count').textContent = count + ' mensaje' + (count !== 1 ? 's' : '')
    if (count > 0) msgs.forEach(m => renderMsg(m))
}

// Polling QR/status
async function pollStatus() {
    try {
        const res = await fetch('/qr?key=' + KEY)
        const data = await res.json()
        const badge = document.getElementById('status-badge')
        const container = document.getElementById('qr-container')
        const hint = document.getElementById('qr-hint')

        if (data.connected) {
            badge.className = 'badge on'; badge.textContent = 'Conectado'
            container.innerHTML = '<div class="qr-placeholder">✓ Conectado</div>'
            hint.textContent = 'Recibiendo mensajes'
        } else if (data.qr) {
            badge.className = 'badge wait'; badge.textContent = 'Esperando QR'
            container.innerHTML = '<img src="' + data.qr + '" alt="QR">'
            hint.textContent = 'WhatsApp → Dispositivos vinculados → Vincular dispositivo'
        } else {
            badge.className = 'badge off'; badge.textContent = 'Desconectado'
            hint.textContent = 'Iniciando...'
        }
    } catch(e) {}
}

// SSE mensajes en tiempo real
const evtSource = new EventSource('/events?key=' + KEY)
evtSource.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    renderMsg(msg, true)
    const count = document.querySelectorAll('.msg-card').length
    document.getElementById('msg-count').textContent = count + ' mensaje' + (count !== 1 ? 's' : '')
}

loadHistory()
pollStatus()
setInterval(pollStatus, 4000)
</script>
</body>
</html>`)
})

// POST /send
router.post('/send', authMiddleware, async (req, res) => {
    const { to, message } = req.body
    if (!to || !message) return res.status(400).json({ error: 'Parámetros requeridos: to, message' })
    try {
        await sendMessage(to, message)
        res.json({ success: true, to, message })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /send-bulk
router.post('/send-bulk', authMiddleware, async (req, res) => {
    const { numbers, message } = req.body
    if (!Array.isArray(numbers) || !message) return res.status(400).json({ error: 'Parámetros requeridos: numbers (array), message' })
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
