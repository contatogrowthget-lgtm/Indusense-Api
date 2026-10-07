@echo off
title INDUSENSE API
cd /d "%~dp0"
if not exist ".env" copy ".env.example" ".env" >nul
if not exist "node_modules" (
  echo Instalando dependencias da API...
  call npm install || goto erro
)
call npx prisma migrate deploy || goto erro
call npx prisma generate || goto erro
call npm run start:dev
goto fim
:erro
echo.
echo A API nao subiu. Veja a mensagem acima.
echo Causa mais comum: PostgreSQL desligado ou DATABASE_URL errado no .env
:fim
pause
