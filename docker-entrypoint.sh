#!/bin/sh
# Container entrypoint: validate env, run migrations, then start the app.
# Designed to give clear, line-by-line feedback so deploy issues are easy to spot.

set -eu

echo "============================================================"
echo "[entrypoint] Maternin Backend starting"
echo "============================================================"
echo "[entrypoint] NODE_ENV=${NODE_ENV:-<unset>}"
echo "[entrypoint] PORT=${PORT:-<unset>}"

# Show presence (not value) of every required env var so secrets stay hidden in logs.
for v in DATABASE_URL REDIS_URL JWT_SECRET INTERNAL_SERVICE_TOKEN FONNTE_API_KEY FONNTE_WEBHOOK_URL FONNTE_WEBHOOK_TOKEN AI_SERVICE_URL NOMINATIM_BASE_URL XENDIT_SECRET_KEY XENDIT_WEBHOOK_TOKEN; do
  eval val=\${$v:-}
  if [ -n "$val" ]; then
    echo "[entrypoint] $v=<set>"
  else
    echo "[entrypoint] $v=<MISSING>"
  fi
done

if [ -z "${DATABASE_URL:-}" ]; then
  echo ""
  echo "[entrypoint] FATAL: DATABASE_URL is not set in container environment."
  echo "[entrypoint] Build args from EasyPanel must be baked into runtime env,"
  echo "[entrypoint] or env vars must be set in the container runtime config."
  exit 1
fi

echo "[entrypoint] Running prisma migrate deploy..."
npx prisma migrate deploy
echo "[entrypoint] Migrations applied successfully"

echo "[entrypoint] Starting NestJS app..."
exec node dist/src/main.js