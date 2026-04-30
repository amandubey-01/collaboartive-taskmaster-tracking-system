const jwt = require('jsonwebtoken')
const { db } = require('../config/database')

function authenticate(req, res, next) {
    const authHeader = req.headers.authorization

    if(!authHeader || !authHeader.startsWith('Bearer')) {
        return res.status(401).json({ error: 'No token provided' })
    }
    
    const token = authHeader.split(' ')[1]

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)

        const user = db
            .prepare('SELECT id, username, email, full_name, bio FROM users WHERE id = ?')
            .get(decoded.userId)
        
        if(!user) return res.status(401).json({ error: 'User not found' })

        req.user = user
        next()
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired '})
        }
        return res.status(401).json({ error: 'Invalid token' })
    }
}

module.exports = { authenticate }
