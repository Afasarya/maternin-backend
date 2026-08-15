# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm install --no-audit --no-fund

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
RUN npx prisma generate --schema=prisma/schema.prisma
COPY src ./src
RUN npm run build \
    && npm prune --omit=dev \
    && npm cache clean --force

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

RUN apt-get update \
    && apt-get install --no-install-recommends --yes dumb-init openssl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nestjs

# Bake build args into runtime env so CMD has access to secrets.
# This works around platforms that pass env vars only as build args.
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL
ARG REDIS_URL
ENV REDIS_URL=$REDIS_URL
ARG JWT_SECRET
ENV JWT_SECRET=$JWT_SECRET
ARG INTERNAL_SERVICE_TOKEN
ENV INTERNAL_SERVICE_TOKEN=$INTERNAL_SERVICE_TOKEN
ARG FONNTE_API_KEY
ENV FONNTE_API_KEY=$FONNTE_API_KEY
ARG FONNTE_WEBHOOK_URL
ENV FONNTE_WEBHOOK_URL=$FONNTE_WEBHOOK_URL
ARG FONNTE_WEBHOOK_TOKEN
ENV FONNTE_WEBHOOK_TOKEN=$FONNTE_WEBHOOK_TOKEN
ARG NUTRITION_PROMPT_WINDOW_HOURS
ENV NUTRITION_PROMPT_WINDOW_HOURS=$NUTRITION_PROMPT_WINDOW_HOURS
ARG AI_SERVICE_URL
ENV AI_SERVICE_URL=$AI_SERVICE_URL
ARG NOMINATIM_BASE_URL
ENV NOMINATIM_BASE_URL=$NOMINATIM_BASE_URL
ARG XENDIT_SECRET_KEY
ENV XENDIT_SECRET_KEY=$XENDIT_SECRET_KEY
ARG XENDIT_WEBHOOK_TOKEN
ENV XENDIT_WEBHOOK_TOKEN=$XENDIT_WEBHOOK_TOKEN
ARG CONSULTATION_PLATFORM_FEE
ENV CONSULTATION_PLATFORM_FEE=$CONSULTATION_PLATFORM_FEE

COPY --from=build --chown=nestjs:nodejs /app/package.json /app/package-lock.json ./
COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/prisma ./prisma

USER nestjs
EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "echo '=== ENV DEBUG ===' && printenv | grep -iE 'database|redis|jwt' && echo '=== END DEBUG ===' && npx prisma migrate deploy && node dist/src/main.js"]