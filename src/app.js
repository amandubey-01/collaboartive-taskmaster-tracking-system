require('dotenv').config()
const express = require('express')
const cors = require('cors')
const {initializeDatabase} = require('./config/database')

const app = express()

app.use(cors())
app.use(express.json())

app.get('/health', (req,res) => {
    res.json({status: 'ok'})
})

const PORT = process.env.PORT || 3000
initializeDatabase()
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`))

