const axios = require('axios')
const { addMessage } = require('./messageStore')

async function sendWebhookToLaravel(data) {
    const url = process.env.LARAVEL_WEBHOOK_URL

    if (!url) {
        console.error('LARAVEL_WEBHOOK_URL no configurada en .env')
        addMessage({ ...data, laravelResponse: { error: 'LARAVEL_WEBHOOK_URL no configurada' } })
        return
    }

    let laravelResponse = null

    try {
        const res = await axios.post(url, data, {
            headers: {
                'Authorization': `Bearer ${process.env.WEBHOOK_SECRET}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            timeout: 35000,  // Claude puede tardar hasta ~15-20s, más margen
        })
        laravelResponse = res.data
        console.log(`Webhook enviado a Laravel: ${data.from}`)
    } catch (err) {
        laravelResponse = { error: err.message }
        console.error(`Error enviando webhook a Laravel: ${err.message}`)
    }

    addMessage({ ...data, laravelResponse })
}

module.exports = { sendWebhookToLaravel }
