# TeamMamba ⚡

**Open-source project management platform built with Next.js**

TeamMamba is a full-featured work management and collaboration platform covering 80%+ of Monday.com's feature set. Built as a modern, self-hosted alternative with real-time collaboration, AI-powered features, and deep customization.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis 7+

### Run with Docker (Recommended)

```bash
docker compose up -d
```

### Run Natively

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL, REDIS_URL, JWT_SECRET
npm install
npm run build
bash start.sh
```

The app will be available at `http://localhost:3010`.

### Environment Variables

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/teammamba` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | Secret for JWT signing | `your-secret-key` |
| `PORT` | App port | `3010` |
| `NEXT_PUBLIC_APP_URL` | Public app URL | `http://localhost:3010` |
| `NEXT_PUBLIC_SOCKET_URL` | WebSocket URL | `http://localhost:3010` |

## 🏗️ Architecture

- **Frontend:** Next.js 15 (App Router) + React + Tailwind CSS + shadcn/ui
- **Backend:** Next.js API Routes + custom Socket.IO server (`server.ts`)
- **Database:** PostgreSQL via Prisma ORM
- **Cache/Queue:** Redis
- **Auth:** JWT + TOTP 2FA
- **Realtime:** Socket.IO with room-based broadcasting

## ✨ Features

### Core
- [x] Multi-workspace & multi-board management
- [x] Groups (lanes), items, subitems with drag-and-drop
- [x] 17+ column types: Status, People, Date, Priority, Progress, Dropdown, Text, Number, Formula, Connect, Mirror, Rollup, Timeline, Checkbox, Rating, Email, Phone, File, Color, Icon
- [x] Kanban, Table, Gantt, and Dashboard views
- [x] Real-time collaboration via Socket.IO
- [x] Item version history & activity feed
- [x] Recurring items with flexible scheduling
- [x] Bulk operations (delete, move, status change)
- [x] Multi-select with keyboard shortcuts

### Views & Visualization
- [x] Kanban board (cross-lane drag)
- [x] Table view with inline editing
- [x] Gantt chart with dependencies & critical path
- [x] Dashboard with customizable widgets
- [x] Widgets: charts, summaries, activity feeds, shortcuts, notes, timer, embed, tasks, weather

### Integrations & Automation
- [x] Custom automations engine (11+ triggers, AND/OR condition logic)
- [x] Webhooks
- [x] Connect Board columns (cross-board sync)
- [x] Formula engine v3 (500+ lines, tokenizer/parser, 18+ functions)
- [x] Monday.com CSV/XLSX import & migration tool
- [x] Integrations Marketplace scaffolded

### AI
- [x] AI panel with suggest, generate, summarize, and search tabs
- [x] LLM-powered item generation and board summarization

### Auth & Security
- [x] JWT authentication
- [x] TOTP-based two-factor authentication
- [x] Board-level permissions (public/private)
- [x] Workspace roles (admin, member, guest)
- [x] Column-level permissions scaffolded

### UI/UX
- [x] PWA support with service worker & offline sync
- [x] i18n scaffolded (10 locales)
- [x] Board sharing via public token + embed
- [x] Dashboard sharing
- [x] Dark/light mode (Tailwind + shadcn/ui)
- [x] Responsive design (mobile-ready)
- [x] Command palette (Cmd+K)
- [x] Keyboard shortcuts

## 📁 Project Structure

```
teammamba/
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── (dashboard)/       # Dashboard routes (boards, settings, etc.)
│   │   ├── api/               # REST API routes
│   │   └── globals.css        # Global styles
│   ├── components/            # Reusable UI components
│   │   ├── boards/            # Board views (kanban, table, gantt)
│   │   ├── dashboard/         # Dashboard widgets
│   │   └── columns/           # Column renderers & editors
│   ├── hooks/                 # Custom React hooks
│   ├── lib/                   # Utilities, socket, Prisma, auth
│   └── styles/                # CSS module files
├── prisma/
│   ├── schema.prisma          # Database schema (30+ models)
│   └── seed.ts                # Seed data
├── public/                    # Static assets (icons, PWA manifest)
├── scripts/                   # Migration & utility scripts
├── server.ts                  # Custom Socket.IO server entry point
├── docker-compose.yml         # Docker orchestration
├── start.sh                   # Native production runner
└── .env.example               # Environment template
```

## 🔌 API Routes

70+ REST API routes covering:
- **Boards** — CRUD, columns, views, sharing, export/import
- **Items** — CRUD, move, duplicate, version history, column values
- **Groups** — CRUD, position, collapse/expand
- **Workspaces** — CRUD, members, settings, color
- **Automations** — CRUD, trigger execution
- **Integrations** — CRUD, OAuth configs
- **Users** — Auth, 2FA, profile, preferences
- **Files** — Upload, download, preview
- **Search** — Full-text, AI-powered
- **Webhooks** — CRUD, event delivery

## 🛠️ Development

```bash
# Dev mode with hot reload
npm run dev

# Run migrations
npx prisma migrate dev

# Generate Prisma client
npx prisma generate

# Seed database
npx prisma db seed

# Lint
npm run lint

# Build for production
npm run build
```

## 📊 Database

30+ Prisma models including: Board, Group, Item, Column, ColumnValue, User, Workspace, BoardMember, BoardView, Dashboard, Widget, Automation, IntegrationConfig, Webhook, ItemVersion, Comment, Notification, and more.

## 🤝 Contributing

This project is in active development. The `feature/full-parity` branch contains the latest features. See `GAP_ANALYSIS_V2.md` for remaining feature gaps and `BUGFIX_SPEC.md` for current bug tracking.

## 📄 License

Proprietary — TeamMamba by Rick Wang.

## 🔗 Related

- [GitHub Repo](https://github.com/fieryeden/TeamMamba)
- [Monday.com Reference](https://monday.com)
