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

// Mapa lid -> número real, se va completando con cada mensaje
const lidToNumber = {}

function resolveNumber(jid) {
    if (jid.endsWith('@s.whatsapp.net')) {
        return jid.replace('@s.whatsapp.net', '')
    }
    if (jid.endsWith('@lid')) {
        const lid = jid.replace('@lid', '')
        return lidToNumber[lid] || lid
    }
    return jid.split('@')[0]
}

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

    const mapContacts = (contacts) => {
        for (const contact of contacts) {
            if (contact.id?.endsWith('@s.whatsapp.net') && contact.lid) {
                const lid = contact.lid.replace('@lid', '')
                const number = contact.id.replace('@s.whatsapp.net', '')
                lidToNumber[lid] = number
            }
        }
    }

    sock.ev.on('contacts.upsert', mapContacts)
    sock.ev.on('contacts.update', mapContacts)

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

            const from = resolveNumber(remoteJid)
            const pushName = msg.pushName || null

            if (remoteJid.endsWith('@lid')) {
                console.log('LID debug:', JSON.stringify({
                    remoteJid,
                    from,
                    pushName,
                    participant: msg.key.participant,
                    lidMap: lidToNumber,
                }))
            }

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
