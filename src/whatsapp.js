const {
    makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const QRCode = require('qrcode')
const pino = require('pino')
const { sendWebhookToLaravel } = require('./webhook')

let sock = null
let isConnected = false
let currentQR = null

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info')
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['ReservaTuEspacio', 'Chrome', '1.0.0'],
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
            currentQR = await QRCode.toDataURL(qr)
            console.log('QR generado — abrí /ui para escanearlo')
        }

        if (connection === 'close') {
            isConnected = false
            const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut

            if (shouldReconnect) {
                console.log('Conexión cerrada, reconectando...')
                setTimeout(connectToWhatsApp, 3000)
            } else {
                console.log('Sesión cerrada. Eliminá auth_info/ y reiniciá el servidor.')
            }
        }

        if (connection === 'open') {
            isConnected = true
            currentQR = null
            console.log('Conectado a WhatsApp')
        }
    })

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return

        for (const msg of messages) {
            if (msg.key.fromMe) continue
            if (!msg.message) continue

            const remoteJid = msg.key.remoteJid

            if (remoteJid.endsWith('@g.us')) continue

            const from = remoteJid.replace('@s.whatsapp.net', '')
            const text =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                null

            if (!text) continue

            console.log(`Mensaje de ${from}: ${text}`)

            await sendWebhookToLaravel({
                from,
                message: text,
                messageId: msg.key.id,
                timestamp: msg.messageTimestamp,
            })
        }
    })
}

async function sendMessage(to, message) {
    if (!sock || !isConnected) {
        throw new Error('WhatsApp no está conectado')
    }

    const number = to.replace(/[^0-9]/g, '')
    const jid = `${number}@s.whatsapp.net`

    await sock.sendMessage(jid, { text: message })
}

function getStatus() {
    return { connected: isConnected }
}

function getCurrentQR() {
    return currentQR
}

module.exports = { connectToWhatsApp, sendMessage, getStatus, getCurrentQR }
