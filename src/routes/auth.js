const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
const { body } = require('express-validator')
const { db } = require('../config/database')
const { validate } = require('../middleware/errorHandler')
const { authenticate } = require('../middleware/auth')

const router = express.Router()

function signToken(userId) {
    return jwt.sign({ userId}, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    })
}

// Register
router.post('/register',
    [
        body('username').trim().isLength({ min: 3 }).withMessage('Username min 3 chars'),
        body('email').isEmail().normalizeEmail(),
        body('password').isLength({ min: 8 }).withMessage('Password min 8 chars'),
    ],
    validate,
    async (req, res, next) => {
        try {
            const { username, email, password, full_name } = req.body

            const existing = db
                .prepare('SELECT id FROM users WHERE email = ? OR id = ?')
                .get(email, username)

            if(existing) {
                return res.status(409).json({ error: 'Email or username alrealy in use '})
            }

            const id = uuidv4()
            const hash = await bcrypt.hash(password, 12)

            db.prepare(
                'INSERT INTO users(id, username, email, password, full_name) VALUES (?, ?, ?, ?, ?)'
            ).run(id, username, email, hash, full_name || null)

            const token = signToken(id)

            res.status(201).json({
                message: 'Account created',
                token,
                user: { id, username, email }
            })
        } catch (err){
            next(err)
        }
    }
)

// Login
router.post('/login',
    [
        body('email').isEmail().normalizeEmail(),
        body('password').notEmpty()
    ],
    validate,
    async (req, res, next) => {
        try{
            const { email, password } = req.body

            const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
            if (!user) return res.status(401).json({ error: 'Invalid credentials' })
            
            const match = await bcrypt.compare(password, user.password)
            if (!match) return res.status(401).json({ error: 'Invalid credentials '})
            
            const token = signToken(user.id)

            res.json({
                message: 'Login Successful',
                token,
                user: { id: user.id, username: user.username, email: user.email}
            })
        }catch (err) {
            next(err)
        }
    }
)

// Get current user
router.get('/me', authenticate, (req,res) =>{
    res.json({ user: req.user })
})

module.exports = router

