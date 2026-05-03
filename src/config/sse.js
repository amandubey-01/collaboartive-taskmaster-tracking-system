const jwt = require('jsonwebtoken')
const { db } = require('./database')
const { v4: uuidv4 } = require('uuid')

// Stores all open SSE connections
// Map<userId, Set<Response>>
const clients = new Map()

/**
 * Call this from any route to:
 * 1. Save notification to DB
 * 2. Push live event to user if they're connected
 */

function notifyUser(userId, type, message, taskId = null, teamId = null ) {

    console.log('notifyUser called for:', userId, type)  // ← add this
    if(!userId) return

    // Save to DB
    try {
    db.prepare(
      'INSERT INTO notifications (id, user_id, type, message, task_id, is_read) VALUES (?, ?, ?, ?, ?, 0)'
    ).run(uuidv4(), userId, type, message, taskId)
    } catch (err) {
        console.error('Notification DB error:', err.message)
    }

    // Push live if user is connected
    const connections = clients.get(userId)
    if (!connections || connections.size ===  0 ) return

    const data = JSON.stringify({
        type,
        message,
        task_id: taskId,
        team_id: teamId,
        timestamp: new Date().toISOString()
    })

    for (const res of connections) {
        try {
        res.write(`event: notification\ndata: ${data}\n\n`)
        } catch {
        connections.delete(res)
        }
    }
}

/**
 * SSE endpoint handler
 * Mount on GET /api/sse
 * Client connects with: /api/sse?token=JWT
*/

function sseHandler(req, res) {
  // Get token from query param (EventSource doesn't support headers)
  const token = req.query.token || 
    (req.headers.authorization?.startsWith('Bearer ') 
      ? req.headers.authorization.split(' ')[1] 
      : null)

  if (!token) return res.status(401).json({ error: 'No token provided' })

  // Verify token
  let userId
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    userId = decoded.userId
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }

  // Set SSE headers
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  })
  res.flushHeaders()

  // Register this connection
  if (!clients.has(userId)) clients.set(userId, new Set())
  clients.get(userId).add(res)

  // Send connected confirmation
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Connected', userId })}\n\n`)

  // Heartbeat every 25s to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`)
    } catch {
      clearInterval(heartbeat)
    }
  }, 25000)

  // Cleanup when client disconnects
  req.on('close', () => {
    clearInterval(heartbeat)
    const connections = clients.get(userId)
    if (connections) {
      connections.delete(res)
      if (connections.size === 0) clients.delete(userId)
    }
  })
}

module.exports = { notifyUser, sseHandler }
