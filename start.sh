#!/bin/bash
# TeamMamba native runner (Docker build OOM on this host)
cd /home/rick/.openclaw/workspace/projects/teammamba
# NODE_ENV=production breaks secure cookies over http
# export NODE_ENV=production
export DATABASE_URL="postgresql://teammamba:teammamba@localhost:5437/teammamba"
export REDIS_URL="redis://localhost:6385"
export JWT_SECRET="dev-secret-change-in-production"
export PORT=3010
export NEXT_PUBLIC_APP_URL=http://localhost:3010
export NEXT_PUBLIC_SOCKET_URL=http://localhost:3010
exec npx tsx server.ts
