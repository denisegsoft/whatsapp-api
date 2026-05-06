const express = require('express')
const { sendMessage, getStatus } = require('./whatsapp')

const router = express.Router()

function authMiddleware(req, res, next) {
    const key = req.headers['x-api-key']
    if (!key || key !== process.env.API_KEY) {
        return res.status(401).json({ error: 'No autorizado' })
    }
    next()
}

// GET /status — para chequear si está conectado (sin auth, útil para monitoreo)
router.get('/status', (req, res) => {
    res.json({ service: 'whatsapp-node', ...getStatus() })
})

// POST /send — envía un mensaje
// Body: { to: "5491112345678", message: "Hola!" }
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

// POST /send-bulk — envía el mismo mensaje a varios números
// Body: { numbers: ["549...", "549..."], message: "Hola!" }
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
            // Pequeña pausa para no spamear
            await new Promise(r => setTimeout(r, 500))
        } catch (err) {
            results.push({ number, success: false, error: err.message })
        }
    }

    res.json({ results })
})

module.exports = router
