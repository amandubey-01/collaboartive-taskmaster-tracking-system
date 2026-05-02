const express = require('express')
const { body } = require('express-validator')
const { v4: uuidv4 } = require('uuid')
const { db } = require('../config/database')
const { authenticate } = require('../middleware/auth')
const { validate } = require('../middleware/errorHandler')

const router = express.Router()
router.use(authenticate)


// CREATE TEAM
// CREATE TEAM
router.post('/',
  [
    body('name').trim().notEmpty().withMessage('Team name is required'),
    body('description').optional().trim()
  ],
  validate,
  (req, res, next) => {
    try {
      const { name, description } = req.body
      const id = uuidv4()

      // Use a transaction — both inserts must succeed or neither does
      db.transaction(() => {
        db.prepare(
          'INSERT INTO teams (id, name, description, owner_id) VALUES (?, ?, ?, ?)'
        ).run(id, name, description || null, req.user.id)

        // Creator automatically becomes owner
        db.prepare(
          'INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)'
        ).run(id, req.user.id, 'owner')
      })()

      const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id)
      res.status(201).json({ message: 'Team created', team })
    } catch (err) {
      next(err)
    }
  }
)

// GET MY TEAMS
router.get('/', (req,res) => {
    const teams = db.prepare(`
        SELECT  t.*,
                tm.role AS my_role,
                (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) AS member_count
        FROM teams t
        JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = ?
        ORDER BY t.created_at DESC  
    `).all(req.user.id)

    res.json({ teams })
})

// GET ONE TEAM
router.get('/:teamId', (req, res) => {
  // Check user is a member
  const membership = db.prepare(
    'SELECT * FROM team_members WHERE team_id = ? AND user_id = ?'
  ).get(req.params.teamId, req.user.id)

  if (!membership) return res.status(403).json({ error: 'Not a member of this team' })

  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.teamId)
  if (!team) return res.status(404).json({ error: 'Team not found' })

  const members = db.prepare(`
    SELECT u.id, u.username, u.full_name, tm.role, tm.joined_at
    FROM team_members tm
    JOIN users u ON u.id = tm.user_id
    WHERE tm.team_id = ?
    ORDER BY tm.joined_at ASC
  `).all(req.params.teamId)

  res.json({ team, members })
})


// INVITE MEMBER
router.post('/:teamId/invite',
  [body('user_id').notEmpty().withMessage('user_id is required')],
  validate,
  (req, res, next) => {
    try {
      const { teamId } = req.params
      const { user_id, role = 'member' } = req.body

      // Only owner/admin can invite
      const myMembership = db.prepare(
        'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
      ).get(teamId, req.user.id)

      if (!myMembership || !['owner', 'admin'].includes(myMembership.role)) {
        return res.status(403).json({ error: 'Only admins can invite members' })
      }

      // Check invitee exists
      const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(user_id)
      if (!user) return res.status(404).json({ error: 'User not found' })

      // Check not already a member
      const existing = db.prepare(
        'SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?'
      ).get(teamId, user_id)
      if (existing) return res.status(409).json({ error: 'Already a member' })

      db.prepare(
        'INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)'
      ).run(teamId, user_id, role)

      res.status(201).json({ message: `${user.username} added to team` })
    } catch (err) {
      next(err)
    }
  }
)

// REMOVE MEMBER / LEAVE TEAM
router.delete('/:teamId/members/:userId', (req, res, next) => {
  try {
    const { teamId, userId } = req.params
    const isSelf = userId === req.user.id

    const myMembership = db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?'
    ).get(teamId, req.user.id)

    const isAdmin = myMembership && ['owner', 'admin'].includes(myMembership.role)

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: 'Cannot remove other members' })
    }

    // Owner cannot leave
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId)
    if (team.owner_id === userId) {
      return res.status(400).json({ error: 'Owner cannot leave. Transfer ownership first.' })
    }

    db.prepare(
      'DELETE FROM team_members WHERE team_id = ? AND user_id = ?'
    ).run(teamId, userId)

    res.json({ message: isSelf ? 'Left team' : 'Member removed' })
  } catch (err) {
    next(err)
  }
})

// DELETE TEAM (owner only)
router.delete('/:teamId', (req, res, next) => {
  try {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.teamId)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    if (team.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only owner can delete team' })
    }

    db.prepare('DELETE FROM teams WHERE id = ?').run(req.params.teamId)
    res.json({ message: 'Team deleted' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
