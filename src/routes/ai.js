const express = require('express')
const OpenAI = require('openai')
const { authenticate } = require('../middleware/auth')
const { db } = require('../config/database')

const router = express.Router()
router.use(authenticate)

// Initialize OpenAI — will be null if no key configured
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null


function aiNotConfigured(res) {
  return res.status(503).json({
    error: 'AI feature not configured. Add OPENAI_API_KEY to .env'
  })
}

// GENERATE TASK DESCRIPTION
router.post('/generate-description', async (req, res, next) => {
  try {
    if (!openai) return aiNotConfigured(res)

    const { title, prompt } = req.body
    if (!prompt) return res.status(422).json({ error: 'prompt is required' })

    const userMessage = title
      ? `Task title: "${title}"\n\nUser input: ${prompt}\n\nGenerate a task description.`
      : `User input: ${prompt}\n\nGenerate a task description.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful project management assistant. ' +
            'Generate clear, concise task descriptions. ' +
            'Keep them professional, actionable, and under 150 words. ' +
            'Return only the description — no headings or preamble.'
        },
        {
          role: 'user',
          content: userMessage
        }
      ],
      max_tokens: 300,
      temperature: 0.7
    })

    const description = completion.choices[0].message.content.trim()
    res.json({ description })
  } catch (err) {
    next(err)
  }
})

// GENERATE TASK SUMMARY (from existing task + comments)
router.post('/generate-summary', async (req, res, next) => {
  try {
    if (!openai) return aiNotConfigured(res)

    const { task_id } = req.body
    if (!task_id) return res.status(422).json({ error: 'task_id is required' })

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task_id)
    if (!task) return res.status(404).json({ error: 'Task not found' })

    // Get comments for context
    const comments = db.prepare(`
      SELECT c.content, u.username
      FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.task_id = ?
      ORDER BY c.created_at ASC
      LIMIT 20
    `).all(task_id).map(c => `${c.username}: ${c.content}`).join('\n')

    const userMessage =
      `Task: ${task.title}\n` +
      `Status: ${task.status} | Priority: ${task.priority}\n` +
      (task.description ? `Description: ${task.description}\n` : '') +
      (comments ? `\nComments:\n${comments}` : '')

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content:
            'You are a project management assistant. ' +
            'Summarise the task and discussion in 3-5 sentences. ' +
            'Focus on current status, blockers, and next steps. Be concise.'
        },
        {
          role: 'user',
          content: userMessage
        }
      ],
      max_tokens: 200,
      temperature: 0.5
    })

    const summary = completion.choices[0].message.content.trim()
    res.json({ summary })
  } catch (err) {
    next(err)
  }
})

module.exports = router
