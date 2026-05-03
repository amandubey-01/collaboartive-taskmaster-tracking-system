require('dotenv').config()
const bcrypt = require('bcryptjs')
const { v4: uuidv4 } = require('uuid')
const { db, initializeDatabase } = require('./database')

initializeDatabase()

// ─── Fixed IDs so re-runs are idempotent ─────────────────────────────────────
const IDS = {
  alice: 'seed-user-alice-0000-000000000001',
  bob:   'seed-user-bob-00000-000000000002',
  carol: 'seed-user-carol-000-000000000003',
  team1: 'seed-team-frontend-000000000001',
  team2: 'seed-team-backend-0000000000002',
  task1: 'seed-task-001',
  task2: 'seed-task-002',
  task3: 'seed-task-003',
  task4: 'seed-task-004',
}

// ─── Clean old seed data ──────────────────────────────────────────────────────
console.log('🧹 Cleaning old seed data...')

// Clean by email first (handles manually created test users)
db.prepare('DELETE FROM users WHERE email IN (?, ?, ?)').run(
  'alice@example.com', 'bob@example.com', 'carol@example.com'
)
db.prepare('DELETE FROM users WHERE id IN (?, ?, ?)').run(IDS.alice, IDS.bob, IDS.carol)
db.prepare('DELETE FROM teams WHERE id IN (?, ?)').run(IDS.team1, IDS.team2)

// ─── Users ────────────────────────────────────────────────────────────────────
console.log('👤 Seeding users...')

const password = bcrypt.hashSync('password123', 10)

db.prepare(
  'INSERT INTO users (id, username, email, password, full_name, bio) VALUES (?, ?, ?, ?, ?, ?)'
).run(IDS.alice, 'alice', 'alice@example.com', password, 'Alice Johnson', 'Frontend lead')

db.prepare(
  'INSERT INTO users (id, username, email, password, full_name, bio) VALUES (?, ?, ?, ?, ?, ?)'
).run(IDS.bob, 'bob', 'bob@example.com', password, 'Bob Martinez', 'Full-stack engineer')

db.prepare(
  'INSERT INTO users (id, username, email, password, full_name, bio) VALUES (?, ?, ?, ?, ?, ?)'
).run(IDS.carol, 'carol', 'carol@example.com', password, 'Carol Singh', 'QA engineer')

// ─── Teams ────────────────────────────────────────────────────────────────────
console.log('👥 Seeding teams...')

db.prepare(
  'INSERT INTO teams (id, name, description, owner_id) VALUES (?, ?, ?, ?)'
).run(IDS.team1, 'Frontend Squad', 'All UI/UX work', IDS.alice)

db.prepare(
  'INSERT INTO teams (id, name, description, owner_id) VALUES (?, ?, ?, ?)'
).run(IDS.team2, 'Backend Core', 'API and infrastructure', IDS.bob)

// Add members
db.prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)').run(IDS.team1, IDS.alice, 'owner')
db.prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)').run(IDS.team1, IDS.bob,   'member')
db.prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)').run(IDS.team1, IDS.carol, 'member')
db.prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)').run(IDS.team2, IDS.bob,   'owner')
db.prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)').run(IDS.team2, IDS.alice, 'admin')

// ─── Tasks ────────────────────────────────────────────────────────────────────
console.log('✅ Seeding tasks...')

db.prepare(`
  INSERT OR IGNORE INTO tasks (id, title, description, status, priority, due_date, created_by, assigned_to, team_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  IDS.task1,
  'Design landing page',
  'Create wireframes and final designs for the marketing landing page',
  'in_progress', 'high', '2025-05-15',
  IDS.alice, IDS.alice, IDS.team1
)

db.prepare(`
  INSERT OR IGNORE INTO tasks (id, title, description, status, priority, due_date, created_by, assigned_to, team_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  IDS.task2,
  'Build auth API',
  'Implement register, login, logout with JWT',
  'completed', 'urgent', '2025-04-20',
  IDS.bob, IDS.bob, IDS.team2
)

db.prepare(`
  INSERT OR IGNORE INTO tasks (id, title, description, status, priority, due_date, created_by, assigned_to, team_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  IDS.task3,
  'Fix mobile nav bug',
  'Hamburger menu overlaps logo on screens below 375px',
  'open', 'high', '2025-04-30',
  IDS.alice, IDS.bob, IDS.team1
)

db.prepare(`
  INSERT OR IGNORE INTO tasks (id, title, description, status, priority, due_date, created_by, assigned_to, team_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  IDS.task4,
  'Write API documentation',
  'Document all endpoints with request/response examples',
  'open', 'low', '2025-06-15',
  IDS.carol, IDS.carol, IDS.team1
)

// ─── Comments ─────────────────────────────────────────────────────────────────
console.log('💬 Seeding comments...')

db.prepare(
  'INSERT INTO comments (id, task_id, user_id, content) VALUES (?, ?, ?, ?)'
).run(uuidv4(), IDS.task1, IDS.bob, 'Looks great! Add a sticky CTA for mobile users.')

db.prepare(
  'INSERT INTO comments (id, task_id, user_id, content) VALUES (?, ?, ?, ?)'
).run(uuidv4(), IDS.task1, IDS.alice, 'Good call, will add that in the next iteration.')

db.prepare(
  'INSERT INTO comments (id, task_id, user_id, content) VALUES (?, ?, ?, ?)'
).run(uuidv4(), IDS.task3, IDS.carol, 'Reproduced on iPhone 13 mini, iOS 17.4 at 360px.')

db.prepare(
  'INSERT INTO comments (id, task_id, user_id, content) VALUES (?, ?, ?, ?)'
).run(uuidv4(), IDS.task3, IDS.bob, 'Likely a z-index issue with the hero section.')

// ─── Notifications ────────────────────────────────────────────────────────────
console.log('🔔 Seeding notifications...')

db.prepare(
  'INSERT INTO notifications (id, user_id, type, message, task_id, is_read) VALUES (?, ?, ?, ?, ?, ?)'
).run(uuidv4(), IDS.bob, 'task_assigned', 'You have been assigned: "Fix mobile nav bug"', IDS.task3, 0)

db.prepare(
  'INSERT INTO notifications (id, user_id, type, message, task_id, is_read) VALUES (?, ?, ?, ?, ?, ?)'
).run(uuidv4(), IDS.alice, 'task_assigned', 'You have been assigned: "Design landing page"', IDS.task1, 0)

// ─── Done ─────────────────────────────────────────────────────────────────────
console.log(`
✅ Seed complete!

Demo accounts (password: password123):
  alice@example.com  — Frontend Squad owner
  bob@example.com    — Backend Core owner  
  carol@example.com  — Frontend Squad member

Teams:  2
Tasks:  4
Comments: 4
Notifications: 2
`)

process.exit(0)
