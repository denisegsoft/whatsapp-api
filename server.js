require('dotenv').config()
const express = require('express')
const cookieParser = require('cookie-parser')
const { connectToWhatsApp } = require('./src/whatsapp')
const routes = require('./src/routes')

const app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

app.use('/', routes)

const PORT = process.env.PORT || 3001

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`)
    connectToWhatsApp()
})
