#!/bin/sh
set -e

echo "==> Aplicando schema no banco (drizzle-kit push)"
npx drizzle-kit push --force

echo "==> Garantindo usuario de teste (dev@docobra.com / 123456)"
node scripts/seed-usuario.mjs || true

echo "==> Iniciando o servidor Next.js na porta ${PORT:-3000}"
exec npm run start -- -p "${PORT:-3000}"
