const MAX_MESSAGES = 100

const messages = []

function addMessage({ from, message, messageId, timestamp, laravelResponse }) {
    messages.unshift({
        from,
        message,
        messageId,
        timestamp,
        datetime: new Date(timestamp * 1000).toLocaleString('es-AR'),
        laravelResponse: laravelResponse || null,
    })

    if (messages.length > MAX_MESSAGES) messages.pop()

    emitToListeners()
}

// SSE listeners
const listeners = new Set()

function addListener(fn) {
    listeners.add(fn)
}

function removeListener(fn) {
    listeners.delete(fn)
}

function emitToListeners() {
    for (const fn of listeners) fn(messages[0])
}

function getMessages() {
    return messages
}

module.exports = { addMessage, addListener, removeListener, getMessages }
