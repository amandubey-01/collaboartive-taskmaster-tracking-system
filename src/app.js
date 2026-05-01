require('dotenv').config()
const express = require('express')
const cors = require('cors')
const {initializeDatabase} = require('./config/database')
const { errorHandler } = require('./middleware/errorHandler')
const authRoutes = require('./routes/auth')
const taskRoutes = require('./routes/tasks')

const app = express()

app.use(cors())
app.use(express.json())

app.get('/health', (req,res) => {
    res.json({status: 'ok'})
})

app.use('/api/auth', authRoutes)
app.use('/api/tasks', taskRoutes)

app.use(errorHandler)

const PORT = process.env.PORT || 3000
initializeDatabase()
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`))

