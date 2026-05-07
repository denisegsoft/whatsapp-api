const {
    makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeInMemoryStore,
} = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const QRCode = require('qrcode')
const pino = require('pino')
const { sendWebhookToLaravel } = require('./webhook')

let sock = null
let isConnected = false
let currentQR = null

const logger = pino({ level: 'silent' })
const store = makeInMemoryStore({ logger })

// Resuelve el número de teléfono real desde un JID (incluye @lid)
async function resolvePhoneNumber(jid) {
    // JID normal: 5491112345678@s.whatsapp.net
    if (jid.endsWith('@s.whatsapp.net')) {
        return jid.replace('@s.whatsapp.net', '')
    }

    // JID tipo @lid: número interno de WhatsApp, buscar en store
    if (jid.endsWith('@lid')) {
        const contacts = store.contacts
        for (const [contactJid, contact] of Object.entries(contacts)) {
            if (contact.lid === jid || contactJid === jid) {
                return contactJid.replace('@s.whatsapp.net', '')
            }
        }
        // Si no está en el store, devolver el lid limpio como fallback
        return jid.replace('@lid', '')
    }

    return jid.split('@')[0]
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info')
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
        version,
        auth: state,
        logger,
        printQRInTerminal: false,
        browser: ['ReservaTuEspacio', 'Chrome', '1.0.0'],
    })

    store.bind(sock.ev)

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

            const from = await resolvePhoneNumber(remoteJid)
            const pushName = msg.pushName || null

            const text =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                null

            if (!text) continue

            console.log(`Mensaje de ${pushName || from} (${from}): ${text}`)

            await sendWebhookToLaravel({
                from,
                pushName,
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
