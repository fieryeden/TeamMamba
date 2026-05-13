FROM node:20-alpine
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Copy pre-built artifacts from host
COPY --chown=nextjs:nodejs .next ./.next
COPY --chown=nextjs:nodejs node_modules ./node_modules
COPY --chown=nextjs:nodejs package.json ./package.json
COPY --chown=nextjs:nodejs prisma ./prisma
COPY --chown=nextjs:nodejs public ./public
COPY --chown=nextjs:nodejs server.ts ./server.ts
COPY --chown=nextjs:nodejs next.config.ts ./next.config.ts
COPY --chown=nextjs:nodejs tailwind.config.js ./tailwind.config.js
COPY --chown=nextjs:nodejs src ./src

USER nextjs
EXPOSE 3010
ENV PORT=3010
ENV HOSTNAME="0.0.0.0"
CMD ["npx", "next", "start"]
