FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json ./
RUN npm install --legacy-peer-deps

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Production
FROM base AS runner
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tailwind.config.js ./tailwind.config.js
COPY --from=builder /app/src ./src

USER nextjs
EXPOSE 3010
ENV PORT=3010
ENV HOSTNAME="0.0.0.0"

CMD ["npx", "next", "start"]
