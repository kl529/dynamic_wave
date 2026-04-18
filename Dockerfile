FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_YAHOO_FINANCE_ENABLED=true
ENV NEXT_PUBLIC_YAHOO_FINANCE_ENABLED=$NEXT_PUBLIC_YAHOO_FINANCE_ENABLED

RUN npm run build

# ── runtime ──────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
