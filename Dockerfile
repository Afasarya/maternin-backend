# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build
WORKDIR /app

ARG DATABASE_URL
ARG REDIS_URL
ARG JWT_SECRET
ARG INTERNAL_SERVICE_TOKEN
ARG FONNTE_API_KEY
ARG FONNTE_WEBHOOK_URL
ARG FONNTE_WEBHOOK_TOKEN
ARG NUTRITION_PROMPT_WINDOW_HOURS
ARG AI_SERVICE_URL
ARG NOMINATIM_BASE_URL
ARG XENDIT_SECRET_KEY
ARG XENDIT_WEBHOOK_TOKEN
ARG CONSULTATION_PLATFORM_FEE

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm install --no-audit --no-fund

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
RUN npx prisma generate --schema=prisma/schema.prisma
COPY src ./src
RUN npm run build \
    && npm prune --omit=dev \
    && npm cache clean --force

# Build a .env file from the build args. This file travels with the image,
# so prisma.config.ts (via dotenv/config) can always read DATABASE_URL
# even if the runtime container env doesn't have it set.
RUN { \
      echo "DATABASE_URL=${DATABASE_URL}"; \
      echo "REDIS_URL=${REDIS_URL}"; \
      echo "JWT_SECRET=${JWT_SECRET}"; \
      echo "INTERNAL_SERVICE_TOKEN=${INTERNAL_SERVICE_TOKEN}"; \
      echo "FONNTE_API_KEY=${FONNTE_API_KEY}"; \
      echo "FONNTE_WEBHOOK_URL=${FONNTE_WEBHOOK_URL}"; \
      echo "FONNTE_WEBHOOK_TOKEN=${FONNTE_WEBHOOK_TOKEN}"; \
      echo "NUTRITION_PROMPT_WINDOW_HOURS=${NUTRITION_PROMPT_WINDOW_HOURS}"; \
      echo "AI_SERVICE_URL=${AI_SERVICE_URL}"; \
      echo "NOMINATIM_BASE_URL=${NOMINATIM_BASE_URL}"; \
      echo "XENDIT_SECRET_KEY=${XENDIT_SECRET_KEY}"; \
      echo "XENDIT_WEBHOOK_TOKEN=${XENDIT_WEBHOOK_TOKEN}"; \
      echo "CONSULTATION_PLATFORM_FEE=${CONSULTATION_PLATFORM_FEE}"; \
    } > /app/.env

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

RUN apt-get update \
    && apt-get install --no-install-recommends --yes dumb-init openssl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nestjs

COPY --from=build --chown=nestjs:nodejs /app/package.json /app/package-lock.json ./
COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nestjs:nodejs /app/.env /app/.env

COPY --chown=nestjs:nodejs --chmod=0755 docker-entrypoint.sh /app/docker-entrypoint.sh

USER nestjs
EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]