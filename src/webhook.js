const axios = require('axios')

async function sendWebhookToLaravel(data) {
    const url = process.env.LARAVEL_WEBHOOK_URL

    if (!url) {
        console.error('LARAVEL_WEBHOOK_URL no configurada en .env')
        return
    }

    try {
        await axios.post(url, data, {
            headers: {
                'Authorization': `Bearer ${process.env.WEBHOOK_SECRET}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            timeout: 8000,
        })
        console.log(`Webhook enviado a Laravel: ${data.from}`)
    } catch (err) {
        console.error(`Error enviando webhook a Laravel: ${err.message}`)
    }
}

module.exports = { sendWebhookToLaravel }
