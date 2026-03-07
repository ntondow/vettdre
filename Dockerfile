# ---- Builder ----
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl openssl-dev
WORKDIR /app

# 1. Install dependencies first (cached unless package.json changes)
COPY package.json package-lock.json* ./
RUN npm ci

# 2. Copy and generate Prisma client (cached unless schema changes)
COPY prisma ./prisma
RUN npx prisma generate

# 3. Copy source code last (invalidates cache on every code change, but deps are cached)
COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY

# Write .env.production so Next.js definitely inlines these into edge bundles
RUN echo "NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL" > .env.production && \
    echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY" >> .env.production && \
    echo "NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN" >> .env.production && \
    echo "NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL" >> .env.production && \
    echo "NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY" >> .env.production

RUN npm run build

# ---- Production ----
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma schema + generated client
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy runtime data (Zillow)
COPY --from=builder /app/data ./data

USER nextjs
EXPOSE 8080

CMD ["node", "server.js"]
