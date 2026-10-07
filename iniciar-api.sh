#!/bin/bash
cd "$(dirname "$0")"
[ -f .env ] || cp .env.example .env

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale com:  brew install node@20   (ou pelo site nodejs.org)"
  exit 1
fi

if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
  echo "Instalando dependências da API..."
  npm install || exit 1
fi

npx prisma migrate deploy || {
  echo
  echo "A API não subiu: não conectou no banco."
  echo "Confira se o PostgreSQL está ligado e o DATABASE_URL no indusense-api/.env"
  exit 1
}
npx prisma generate || exit 1
npm run start:dev
