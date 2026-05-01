const express = require('express')
const { body, query } = require('express-validator')
const { v4: uuidv4 } = require('uuid')
const { db } = require('../config/database')
const { authenticate } = require('../middleware/auth')
const { validate } = require('../middleware/errorHandler')

const router = express.Router()
router.use(authenticate)

const VALID_STATUSES   = ['open', 'in_progress', 'completed', 'archived']
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent']
const VALID_SORT_COLS  = ['created_at', 'updated_at', 'due_date', 'priority', 'title']

// Enriches a raw task row with creator/assignee info
function enrichTask(task) {
  if (!task) return null

  const creator = db
    .prepare('SELECT id, username, full_name FROM users WHERE id = ?')
    .get(task.created_by)

  const assignee = task.assigned_to
    ? db.prepare('SELECT id, username, full_name FROM users WHERE id = ?').get(task.assigned_to)
    : null

  const commentCount = db
    .prepare('SELECT COUNT(*) AS cnt FROM comments WHERE task_id = ?')
    .get(task.id).cnt

  return { ...task, creator, assignee, comment_count: commentCount }
}

// CREATE TASK
router.post('/',
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('status').optional().isIn(VALID_STATUSES),
    body('priority').optional().isIn(VALID_PRIORITIES),
    body('due_date').optional().isISO8601().withMessage('Invalid date format'),
    body('assigned_to').optional().isUUID(),
  ],
  validate,
  (req, res, next) => {
    try {
      const { title, description, status, priority, due_date, assigned_to, team_id } = req.body

      const id = uuidv4()

      db.prepare(`
        INSERT INTO tasks (id, title, description, status, priority, due_date, created_by, assigned_to, team_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        title,
        description || null,
        status || 'open',
        priority || 'medium',
        due_date || null,
        req.user.id,
        assigned_to || null,
        team_id || null
      )

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
      res.status(201).json({ message: 'Task created', task: enrichTask(task) })
    } catch (err) {
      next(err)
    }
  }
)

// GET ALL TASK
router.get('/',
  [
    query('status').optional().isIn(VALID_STATUSES),
    query('priority').optional().isIn(VALID_PRIORITIES),
    query('sort_by').optional().isIn(VALID_SORT_COLS),
    query('order').optional().isIn(['asc', 'desc']),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  validate,
  (req, res) => {
    const {
      status, priority, assigned_to,
      search, sort_by = 'created_at',
      order = 'desc', page = 1, limit = 20,
      my_tasks
    } = req.query

    const conditions = []
    const params = []

    // only show tasks the user created or is assigned to
    conditions.push('(t.created_by = ? OR t.assigned_to = ?)')
    params.push(req.user.id, req.user.id)

    if (my_tasks === 'true') {
      conditions.push('t.assigned_to = ?')
      params.push(req.user.id)
    }
    if (status)      { conditions.push('t.status = ?');      params.push(status) }
    if (priority)    { conditions.push('t.priority = ?');    params.push(priority) }
    if (assigned_to) { conditions.push('t.assigned_to = ?'); params.push(assigned_to) }

    // search by title OR description
    if (search) {
      conditions.push('(t.title LIKE ? OR t.description LIKE ?)')
      params.push(`%${search}%`, `%${search}%`)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const offset = (page - 1) * limit
    const safeSort  = VALID_SORT_COLS.includes(sort_by) ? sort_by : 'created_at'
    const safeOrder = order === 'asc' ? 'ASC' : 'DESC'

    const total = db
      .prepare(`SELECT COUNT(*) AS cnt FROM tasks t ${where}`)
      .get(...params).cnt

    const tasks = db
      .prepare(`
        SELECT t.* FROM tasks t
        ${where}
        ORDER BY t.${safeSort} ${safeOrder}
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset)

    res.json({
      tasks: tasks.map(enrichTask),
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    })
  }
)

// GET ONE
router.get('/:taskId', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.taskId)
  if (!task) return res.status(404).json({ error: 'Task not found' })

  const canAccess = task.created_by === req.user.id || task.assigned_to === req.user.id
  if (!canAccess) return res.status(403).json({ error: 'Access denied' })

  res.json({ task: enrichTask(task) })
})

// UPDATE
router.put('/:taskId',
  [
    body('title').optional().trim().notEmpty(),
    body('status').optional().isIn(VALID_STATUSES),
    body('priority').optional().isIn(VALID_PRIORITIES),
    body('due_date').optional().isISO8601(),
  ],
  validate,
  (req, res, next) => {
    try {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.taskId)
      if (!task) return res.status(404).json({ error: 'Task not found' })
      if (task.created_by !== req.user.id) return res.status(403).json({ error: 'Permission denied' })

      const { title, description, status, priority, due_date, assigned_to } = req.body

      db.prepare(`
        UPDATE tasks
        SET title       = COALESCE(?, title),
            description = COALESCE(?, description),
            status      = COALESCE(?, status),
            priority    = COALESCE(?, priority),
            due_date    = COALESCE(?, due_date),
            assigned_to = COALESCE(?, assigned_to),
            updated_at  = datetime('now')
        WHERE id = ?
      `).run(
        title || null,
        description || null,
        status || null,
        priority || null,
        due_date || null,
        assigned_to || null,
        task.id
      )

      const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id)
      res.json({ message: 'Task updated', task: enrichTask(updated) })
    } catch (err) {
      next(err)
    }
  }
)

// PATCH STATUS (quick update - mark complete etc)
router.patch('/:taskId/status',
  [body('status').isIn(VALID_STATUSES)],
  validate,
  (req, res, next) => {
    try {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.taskId)
      if (!task) return res.status(404).json({ error: 'Task not found' })

      const canEdit = task.created_by === req.user.id || task.assigned_to === req.user.id
      if (!canEdit) return res.status(403).json({ error: 'Access denied' })

      db.prepare(`
        UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?
      `).run(req.body.status, task.id)

      const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id)
      res.json({ message: 'Status updated', task: enrichTask(updated) })
    } catch (err) {
      next(err)
    }
  }
)

// DELETE
router.delete('/:taskId', (req, res, next) => {
  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.taskId)
    if (!task) return res.status(404).json({ error: 'Task not found' })
    if (task.created_by !== req.user.id) return res.status(403).json({ error: 'Permission denied' })

    db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id)
    res.json({ message: 'Task deleted' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
