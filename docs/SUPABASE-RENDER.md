# Colocar a InduSense API na nuvem (Supabase + Render)

```
celular (app) ─┐                           ┌─> Supabase (banco + fotos)
painel Next.js ─┼──> Render (InduSense API) ┤
câmera (Mac) ──┘    https://xxx.onrender.com
       └── vídeo ao vivo: http://IP-TAILSCALE-DO-MAC:8000  (fica no Mac)
```

O Supabase guarda o **banco** e as **fotos**. A API (NestJS) roda no **Render**.
O vídeo da câmera continua saindo do Mac e é visto pelo Tailscale.

## 1. Supabase (banco)

1. Crie um projeto em https://supabase.com (região **South America (São Paulo)**). Guarde a senha do banco.
2. Clique em **Connect** (no topo) > **Session pooler** e copie a URL. Troque `[YOUR-PASSWORD]` pela senha:
   ```
   postgresql://postgres.abcdefgh:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
   ```
   Use o **Session pooler** (porta 5432). A conexão "Direct" não funciona no Render.
3. Em **Project Settings > API**, copie a **Project URL** e a chave **service_role** (secreta, nunca coloque no app).

## 2. Criar as tabelas e os dados iniciais

No Mac, dentro de `indusense-api`, com a URL do passo 1:
```
DATABASE_URL="postgresql://postgres.abcdefgh:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres" npx prisma migrate deploy
DATABASE_URL="postgresql://postgres.abcdefgh:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres" npx prisma db seed
```
Em **Table Editor** no Supabase você já vê `users`, `salas`, `sensors`, `cameras`...

## 3. Render (API)

1. Suba a pasta `indusense-api` para um repositório no GitHub (sem o `.env`!).
2. Render > **New > Blueprint** > escolha o repositório. Ele lê o `render.yaml`.
3. Preencha:
   - `DATABASE_URL` = URL do Session pooler
   - `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` = do passo 1.3
   - `DEVICE_API_KEY` = uma senha longa (a mesma vai na câmera)
   - `CORS_ORIGINS` = `http://localhost:3000` (e o endereço do painel, se publicar)
4. Quando terminar, teste: `https://indusense-api.onrender.com/v1/health` deve responder `ok`.

## 4. Apontar tudo para a nuvem

**Sistema de câmera** (`indusense/.env` no Mac):
```
CENTRAL_API_URL=https://indusense-api.onrender.com/v1
CENTRAL_DEVICE_KEY=a-mesma-do-DEVICE_API_KEY
CENTRAL_STREAM_URL=http://100.x.x.x:8000/video_feed    # IP do Tailscale do Mac
```

**App** (tela de login > Servidor): `https://indusense-api.onrender.com/v1`
O celular precisa do Tailscale ligado só para o **vídeo**; sensores, alertas e ocorrências vêm da nuvem.

**Painel Next.js** (`indusense-dashboard/.env.local`):
```
NEXT_PUBLIC_API_URL=https://indusense-api.onrender.com/v1
```

## Limites dos planos grátis

- **Render**: o serviço dorme após 15 min sem acesso e demora ~1 min para acordar. Com a câmera ligada
  (manda dados a cada 5 s) ele fica acordado. Com a câmera desligada, o primeiro acesso demora.
- **Supabase**: 500 MB de banco e 1 GB de arquivos. O projeto pausa após 7 dias sem uso
  (com a câmera enviando dados, isso não acontece). Sem backup automático no grátis.
