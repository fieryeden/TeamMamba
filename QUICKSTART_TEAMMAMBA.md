# TeamMamba — Quick Start Guide

## One-Line Start

```bash
cp .env.example .env && docker compose up -d
```

Then open `http://localhost:3010`.

## Full Setup (Native)

### 1. Clone & Install

```bash
git clone https://github.com/fieryeden/TeamMamba.git
cd TeamMamba
npm install
```

### 2. Database

```bash
# Start PostgreSQL and Redis (or use Docker for just these)
docker compose up -d postgres redis

# Copy and edit env
cp .env.example .env
# Set DATABASE_URL, REDIS_URL, JWT_SECRET

# Run migrations and seed
npx prisma migrate dev
npx prisma db seed
```

### 3. Build & Run

```bash
npm run build
bash start.sh   # Custom server.ts with Socket.IO
```

### 4. Create Account

Navigate to `http://localhost:3010/register` and create your first user. You'll be prompted to set up a workspace and board.

## Docker Compose Services

| Service | Port | Purpose |
|---|---|---|
| `teammamba` | 3010 | Main app (Next.js + Socket.IO) |
| `postgres` | 5432 | Database |
| `redis` | 6379 | Cache & pub/sub |

## Troubleshooting

- **Port 3010 in use:** Change `PORT` in `.env` and restart
- **DB connection failed:** Verify PostgreSQL is running and `DATABASE_URL` is correct
- **Socket.IO not connecting:** Ensure `NEXT_PUBLIC_SOCKET_URL` matches the app URL
- **Build OOM:** Run natively with `bash start.sh` instead of Docker build
