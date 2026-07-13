FROM node:22-slim AS deps

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV WRANGLER_LOG_PATH=/tmp/wrangler.log

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM builder AS test

RUN node --test tests/rendered-html.test.mjs

FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV WRANGLER_LOG_PATH=/tmp/wrangler.log

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/.openai ./.openai
COPY --from=builder /app/vite.config.ts ./vite.config.ts
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/worker ./worker
COPY --from=builder /app/build ./build

EXPOSE 3000

CMD ["npm", "run", "start", "--", "--host", "0.0.0.0"]
