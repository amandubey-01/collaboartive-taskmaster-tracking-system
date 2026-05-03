# TaskMaster API

> A collaborative task tracking and management backend built with Node.js, Express, and SQLite.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
  - [Auth](#auth)
  - [Users](#users)
  - [Tasks](#tasks)
  - [Teams](#teams)
  - [Comments](#comments)
  - [Attachments](#attachments)
  - [Notifications](#notifications)
  - [Real-time SSE](#real-time-sse)
  - [AI](#ai)
- [User Stories Coverage](#user-stories-coverage)
- [License](#license)

---

## Overview

TaskMaster is a RESTful backend API for a collaborative task management platform. It allows users to create and manage tasks, collaborate within teams, communicate via comments, upload attachments, receive real-time notifications, and generate AI-powered task descriptions.

---

## Features

- **User Authentication** — Register, login, logout with JWT; bcrypt password hashing
- **Task Management** — Full CRUD with status, priority, due dates; filtering, sorting, and full-text search
- **Team Collaboration** — Create teams, invite members, manage roles (owner / admin / member)
- **Task Assignment** — Assign tasks to team members with automatic notifications
- **Comments** — Thread comments on any task
- **File Attachments** — Upload and download files per task (10MB limit)
- **Notifications** — In-app notification feed with read/unread tracking
- **Real-time SSE** — Live notification push via Server-Sent Events
- **AI Integration** — Generate task descriptions and summaries using OpenAI GPT

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js >= 18 |
| Framework | Express.js 4 |
| Database | SQLite (`better-sqlite3`) |
| Auth | JWT (`jsonwebtoken`) + bcryptjs |
| Validation | express-validator |
| File Uploads | multer |
| Real-time | Server-Sent Events (SSE) |
| AI | OpenAI GPT-3.5 |

---

## Getting Started

### Prerequisites

- Node.js >= 18
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/taskmaster.git
cd taskmaster

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your values

# Start development server
npm run dev

# Optional: Load demo data
npm run seed
```

The server starts at `http://localhost:3000`.

---

## Environment Variables

Create a `.env` file in the root directory:

```env
PORT=3000
JWT_SECRET=your_long_random_secret_here
JWT_EXPIRES_IN=7d
DB_PATH=./taskmaster.db
UPLOAD_DIR=./src/uploads
MAX_FILE_SIZE_MB=10

# Optional — enables AI endpoints
OPENAI_API_KEY=sk-your-openai-key-here
```

---

## Project Structure

```
taskmaster/
├── src/
│   ├── app.js                  # Express entry point
│   ├── config/
│   │   ├── database.js         # SQLite schema and init
│   │   ├── sse.js              # Server-Sent Events + notifyUser
│   │   └── seed.js             # Demo data seeder
│   ├── middleware/
│   │   ├── auth.js             # JWT verify middleware
│   │   └── errorHandler.js     # Validation + global error handler
│   ├── routes/
│   │   ├── auth.js             # Register / Login / Logout
│   │   ├── users.js            # Profile + Notifications
│   │   ├── tasks.js            # Task CRUD + filtering
│   │   ├── teams.js            # Teams + membership
│   │   ├── comments.js         # Comments + Attachments
│   │   └── ai.js               # AI generation (optional)
│   └── uploads/                # Uploaded files (git-ignored)
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## API Reference

All protected routes require:
```
Authorization: Bearer <token>
```

---

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | No | Register a new user |
| POST | `/api/auth/login` | No | Login and receive JWT |
| GET | `/api/auth/me` | Yes | Get current user |

#### Register
```json
POST /api/auth/register
{
  "username": "aman",
  "email": "aman@example.com",
  "password": "password123",
  "full_name": "Aman Singh"
}
```

#### Login
```json
POST /api/auth/login
{
  "email": "aman@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Login Successful",
  "token": "eyJhbGci...",
  "user": { "id": "...", "username": "aman", "email": "aman@example.com" }
}
```

---

### Users

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/users/me` | Get own profile |
| PUT | `/api/users/me` | Update profile |
| PUT | `/api/users/me/password` | Change password |
| GET | `/api/users/search?q=` | Search users by name |

#### Update Profile
```json
PUT /api/users/me
{
  "full_name": "Aman Singh",
  "bio": "Building cool stuff"
}
```

---

### Tasks

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/tasks` | List tasks (with filters) |
| POST | `/api/tasks` | Create a task |
| GET | `/api/tasks/:id` | Get task details |
| PUT | `/api/tasks/:id` | Update task |
| PATCH | `/api/tasks/:id/status` | Update status only |
| DELETE | `/api/tasks/:id` | Delete task |

#### Create Task
```json
POST /api/tasks
{
  "title": "Design landing page",
  "description": "Create wireframes for the marketing site",
  "status": "open",
  "priority": "high",
  "due_date": "2025-06-01",
  "assigned_to": "<user-id>",
  "team_id": "<team-id>"
}
```

#### Filter and Search Tasks

```
GET /api/tasks?status=open&priority=high&search=landing&sort_by=due_date&order=asc&page=1&limit=20
GET /api/tasks?my_tasks=true
GET /api/tasks?team_id=<id>
```

| Query Param | Values |
|---|---|
| `status` | `open`, `in_progress`, `completed`, `archived` |
| `priority` | `low`, `medium`, `high`, `urgent` |
| `sort_by` | `created_at`, `updated_at`, `due_date`, `priority`, `title` |
| `order` | `asc`, `desc` |
| `my_tasks` | `true` — only tasks assigned to me |
| `search` | matches title and description |
| `page` / `limit` | pagination |

#### Mark as Completed
```json
PATCH /api/tasks/:id/status
{ "status": "completed" }
```

---

### Teams

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/teams` | Create a team |
| GET | `/api/teams` | Get your teams |
| GET | `/api/teams/:id` | Team details + members |
| POST | `/api/teams/:id/invite` | Add a member |
| DELETE | `/api/teams/:id/members/:userId` | Remove member / leave |
| DELETE | `/api/teams/:id` | Delete team (owner only) |

#### Create Team
```json
POST /api/teams
{
  "name": "D2C Growth Team",
  "description": "Performance marketing team"
}
```

#### Invite Member
```json
POST /api/teams/:teamId/invite
{
  "user_id": "<user-id>",
  "role": "member"
}
```

Roles: `owner`, `admin`, `member`

---

### Comments

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/tasks/:taskId/comments` | List comments |
| POST | `/api/tasks/:taskId/comments` | Add comment |
| DELETE | `/api/tasks/:taskId/comments/:id` | Delete comment |

#### Add Comment
```json
POST /api/tasks/:taskId/comments
{ "content": "This looks great!" }
```

---

### Attachments

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/tasks/:taskId/attachments` | List attachments |
| POST | `/api/tasks/:taskId/attachments` | Upload file |
| GET | `/api/tasks/:taskId/attachments/:id/download` | Download file |
| DELETE | `/api/tasks/:taskId/attachments/:id` | Delete attachment |

#### Upload File
```bash
curl -X POST /api/tasks/:taskId/attachments \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/file.pdf"
```

---

### Notifications

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/users/me/notifications` | Get all notifications |
| GET | `/api/users/me/notifications?unread_only=true` | Get unread only |
| PUT | `/api/users/me/notifications/:id/read` | Mark one as read |
| PUT | `/api/users/me/notifications/read-all` | Mark all as read |

---

### Real-time SSE

Connect to receive live notifications:

```
GET /api/sse?token=<jwt>
```

**Browser usage:**
```js
const es = new EventSource(`http://localhost:3000/api/sse?token=${token}`)

es.addEventListener('connected', e => {
  console.log('Connected!', JSON.parse(e.data))
})

es.addEventListener('notification', e => {
  console.log('New notification:', JSON.parse(e.data))
})
```

**Events received:**
```json
{
  "type": "task_assigned",
  "message": "You have been assigned: \"Fix mobile nav bug\"",
  "task_id": "...",
  "timestamp": "2026-05-03T15:26:41.000Z"
}
```

---

### AI

> Requires `OPENAI_API_KEY` in `.env`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/ai/generate-description` | Generate task description |
| POST | `/api/ai/generate-summary` | Summarise task + comments |

#### Generate Description
```json
POST /api/ai/generate-description
{
  "title": "Set up CI/CD pipeline",
  "prompt": "Automate deployment to AWS using GitHub Actions"
}
```

**Response:**
```json
{
  "description": "Implement a CI/CD pipeline to automate deployment..."
}
```

#### Generate Summary
```json
POST /api/ai/generate-summary
{ "task_id": "<task-id>" }
```

---

## User Stories Coverage

| # | Story | Endpoint |
|---|---|---|
| 1 | Create account | `POST /api/auth/register` |
| 2 | Secure login | `POST /api/auth/login` |
| 3 | View/update profile | `GET/PUT /api/users/me` |
| 4 | Create task | `POST /api/tasks` |
| 5 | View tasks assigned to me | `GET /api/tasks?my_tasks=true` |
| 6 | Mark task completed | `PATCH /api/tasks/:id/status` |
| 7 | Assign task to member | `PUT /api/tasks/:id` with `assigned_to` |
| 8 | Filter by status | `GET /api/tasks?status=completed` |
| 9 | Search tasks | `GET /api/tasks?search=keyword` |
| 10 | Comments & attachments | `/api/tasks/:id/comments` & `/attachments` |
| 11 | Create team / invite | `POST /api/teams`, `POST /api/teams/:id/invite` |
| 12 | Logout | `POST /api/auth/logout` |
| 13 | Real-time notifications | `GET /api/sse?token=<jwt>` |
| 14 | AI description generation | `POST /api/ai/generate-description` |

---

## Demo Accounts

After running `npm run seed`:

| Email | Password | Role |
|---|---|---|
| alice@example.com | password123 | Frontend Squad owner |
| bob@example.com | password123 | Backend Core owner |
| carol@example.com | password123 | Member |

---

## License

MIT

> Built by Aman Dubey