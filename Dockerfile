# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm install --no-audit --no-fund

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY generated ./generated
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

COPY --from=build --chown=nestjs:nodejs /app/package.json /app/package-lock.json ./
COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/dist ./dist

USER nestjs
EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/src/main.js"]
