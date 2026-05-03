const express = require('express')
const bcrypt = require('bcryptjs')
const { body } = require('express-validator')
const { db } = require('../config/database')
const { authenticate } = require('../middleware/auth')
const { validate } = require('../middleware/errorHandler')

const router = express.Router()
router.use(authenticate)

// GET MY PROFILE
router.get('/me', (req, res) => {
  res.json({ user: req.user })
})

// UPDATE PROFILE
router.put('/me',
  [
    body('full_name').optional().trim(),
    body('bio').optional().trim()
  ],
  validate,
  (req, res, next) => {
    try {
      const { full_name, bio } = req.body

      db.prepare(`
        UPDATE users
        SET full_name = COALESCE(?, full_name),
            bio       = COALESCE(?, bio)
        WHERE id = ?
      `).run(full_name || null, bio || null, req.user.id)

      const updated = db.prepare(
        'SELECT id, username, email, full_name, bio, created_at FROM users WHERE id = ?'
      ).get(req.user.id)

      res.json({ message: 'Profile updated', user: updated })
    } catch (err) {
      next(err)
    }
  }
)

// CHANGE PASSWORD
router.put('/me/password',
  [
    body('current_password').notEmpty(),
    body('new_password').isLength({ min: 8 })
  ],
  validate,
  async (req, res, next) => {
    try {
      const { current_password, new_password } = req.body
      const bcrypt = require('bcryptjs')

      const userRow = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id)
      const match = await bcrypt.compare(current_password, userRow.password)
      if (!match) return res.status(400).json({ error: 'Current password is incorrect' })

      const hash = await bcrypt.hash(new_password, 12)
      db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.user.id)

      res.json({ message: 'Password updated' })
    } catch (err) {
      next(err)
    }
  }
)

// SEARCH USERS
router.get('/search', (req, res) => {
  const search = `%${req.query.q || ''}%`
  const users = db.prepare(`
    SELECT id, username, full_name
    FROM users
    WHERE username LIKE ? OR full_name LIKE ?
    LIMIT 20
  `).all(search, search)

  res.json({ users })
})

// GET NOTIFICATIONS
router.get('/me/notifications', (req, res) => {
  const { unread_only } = req.query

  let query = 'SELECT * FROM notifications WHERE user_id = ?'
  if (unread_only === 'true') query += ' AND is_read = 0'
  query += ' ORDER BY created_at DESC LIMIT 50'

  const notifications = db.prepare(query).all(req.user.id)
  res.json({ notifications })
})

// MARK NOTIFICATION AS READ
router.put('/me/notifications/:id/read', (req, res) => {
  db.prepare(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?'
  ).run(req.params.id, req.user.id)

  res.json({ message: 'Notification marked as read' })
})

// MARK ALL AS READ
router.put('/me/notifications/read-all', (req, res) => {
  db.prepare(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ?'
  ).run(req.user.id)

  res.json({ message: 'All notifications marked as read' })
})

module.exports = router
