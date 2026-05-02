const express = require('express')
const { body } = require('express-validator')
const { v4: uuidv4 } = require('uuid')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { db } = require('../config/database')
const { authenticate } = require('../middleware/auth')
const { validate } = require('../middleware/errorHandler')

const router = express.Router({ mergeParams: true }) // ← important! inherits :taskId
router.use(authenticate)

// File upload config
const UPLOAD_DIR = process.env.UPLOAD_DIR || './src/uploads'
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = `${uuidv4()}${path.extname(file.originalname)}`
    cb(null, unique)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const blocked = ['.exe', '.sh', '.bat', '.cmd']
    const ext = path.extname(file.originalname).toLowerCase()
    if (blocked.includes(ext)) {
      return cb(new Error('File type not allowed'), false)
    }
    cb(null, true)
  }
})

function canAccessTask(task, userId) {
  if (!task) return false
  if (task.created_by === userId || task.assigned_to === userId) return true
  if (task.team_id) {
    return !!db
      .prepare('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?')
      .get(task.team_id, userId)
  }
  return false
}

// GET COMMENTS
router.get('/comments', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.taskId)
  if (!task) return res.status(404).json({ error: 'Task not found' })
  if (!canAccessTask(task, req.user.id)) return res.status(403).json({ error: 'Access denied' })

  const comments = db.prepare(`
    SELECT c.*, u.username, u.full_name
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.task_id = ?
    ORDER BY c.created_at ASC
  `).all(req.params.taskId)

  res.json({ comments })
})

// ADD COMMENT
router.post('/comments',
  [body('content').trim().notEmpty().withMessage('Content is required')],
  validate,
  (req, res, next) => {
    try {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.taskId)
      if (!task) return res.status(404).json({ error: 'Task not found' })
      if (!canAccessTask(task, req.user.id)) return res.status(403).json({ error: 'Access denied' })

      const id = uuidv4()
      db.prepare(
        'INSERT INTO comments (id, task_id, user_id, content) VALUES (?, ?, ?, ?)'
      ).run(id, task.id, req.user.id, req.body.content)

      const comment = db.prepare(`
        SELECT c.*, u.username, u.full_name
        FROM comments c JOIN users u ON u.id = c.user_id
        WHERE c.id = ?
      `).get(id)

      res.status(201).json({ message: 'Comment added', comment })
    } catch (err) {
      next(err)
    }
  }
)

// DELETE COMMENT
router.delete('/comments/:commentId', (req, res, next) => {
  try {
    const comment = db.prepare(
      'SELECT * FROM comments WHERE id = ? AND task_id = ?'
    ).get(req.params.commentId, req.params.taskId)

    if (!comment) return res.status(404).json({ error: 'Comment not found' })

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.taskId)

    // Only comment author or task creator can delete
    if (comment.user_id !== req.user.id && task.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    db.prepare('DELETE FROM comments WHERE id = ?').run(comment.id)
    res.json({ message: 'Comment deleted' })
  } catch (err) {
    next(err)
  }
})

// GET ATTACHMENTS
router.get('/attachments', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.taskId)
  if (!task) return res.status(404).json({ error: 'Task not found' })
  if (!canAccessTask(task, req.user.id)) return res.status(403).json({ error: 'Access denied' })

  const attachments = db.prepare(`
    SELECT a.*, u.username
    FROM attachments a JOIN users u ON u.id = a.user_id
    WHERE a.task_id = ?
    ORDER BY a.created_at DESC
  `).all(task.id)

  res.json({ attachments })
})

// UPLOAD ATTACHMENT
router.post('/attachments', (req, res, next) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.taskId)
  if (!task) return res.status(404).json({ error: 'Task not found' })
  if (!canAccessTask(task, req.user.id)) return res.status(403).json({ error: 'Access denied' })

  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Upload error: ${err.message}` })
    }
    if (err) return res.status(400).json({ error: err.message })
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    try {
      const id = uuidv4()
      db.prepare(`
        INSERT INTO attachments (id, task_id, user_id, filename, original_name, mime_type, size)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, task.id, req.user.id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size)

      const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id)
      res.status(201).json({ message: 'File uploaded', attachment })
    } catch (dbErr) {
      next(dbErr)
    }
  })
})

// DOWNLOAD ATTACHMENT
router.get('/attachments/:attachmentId/download', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.taskId)
  if (!task) return res.status(404).json({ error: 'Task not found' })
  if (!canAccessTask(task, req.user.id)) return res.status(403).json({ error: 'Access denied' })

  const attachment = db.prepare(
    'SELECT * FROM attachments WHERE id = ? AND task_id = ?'
  ).get(req.params.attachmentId, task.id)

  if (!attachment) return res.status(404).json({ error: 'Attachment not found' })

  const filePath = path.resolve(UPLOAD_DIR, attachment.filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' })

  res.download(filePath, attachment.original_name)
})

// DELETE ATTACHMENT
router.delete('/attachments/:attachmentId', (req, res, next) => {
  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.taskId)
    if (!task) return res.status(404).json({ error: 'Task not found' })

    const attachment = db.prepare(
      'SELECT * FROM attachments WHERE id = ? AND task_id = ?'
    ).get(req.params.attachmentId, task.id)

    if (!attachment) return res.status(404).json({ error: 'Attachment not found' })

    if (attachment.user_id !== req.user.id && task.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    // Delete from disk
    const filePath = path.resolve(UPLOAD_DIR, attachment.filename)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)

    db.prepare('DELETE FROM attachments WHERE id = ?').run(attachment.id)
    res.json({ message: 'Attachment deleted' })
  } catch (err) {
    next(err)
  }
})

module.exports = router

