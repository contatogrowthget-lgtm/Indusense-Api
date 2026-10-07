# InduSense API

API central (NestJS + Prisma + PostgreSQL) usada **ao mesmo tempo** pelo app Flutter (`InduSense-GrowthGet-Flutter`) e pelo painel Next.js (`InduSense-NextJS`).

```
Flutter ──┐
          ├──> NestJS API (/v1) ──> PostgreSQL
Next.js ──┘
```

Os caminhos, campos e enums seguem o que já está no código dos dois projetos (`api_constants.dart`, `lib/models/*` e as telas do Next.js). Detalhes da compatibilidade e das mudanças mínimas nos front-ends: [`docs/INTEGRACAO.md`](docs/INTEGRACAO.md).

## Rodando

Requisitos: Node 20+ e PostgreSQL 14+ (ou `docker compose up -d` para subir um Postgres local).

```bash
cp .env.example .env        # ajuste DATABASE_URL e JWT_SECRET
npm install
npx prisma generate
npx prisma migrate dev      # aplica prisma/migrations/20260929000000_init
npx prisma db seed
npm run start:dev
```

- API: `http://localhost:3333/v1` (o Next.js usa a porta 3000, por isso a API fica na 3333)
- Swagger: `http://localhost:3333/docs` (botão **Authorize** → cole o `token` do login)
- Health: `GET /v1/health`

Login de teste (seed): `admin@indusense.com` / `123456` (ADMIN). Todos os usuários do seed usam `123456`:
`franklin.pereira@growthget.com` (OPERADOR, usuário do mock do Flutter), `carlos@`, `ana@`, `joao@indusense.com`.

Para ver os dados "vivos" (sensores só ficam online se enviarem leituras nos últimos `SENSOR_OFFLINE_MINUTES`):

```bash
npm run simulate     # simula os ESP32 enviando leituras a cada 5 s
```

## Endpoints

Todos sob `/v1`. Exceto `login`, `register` e `health`, exigem `Authorization: Bearer <token>`.

### Usados hoje pelo Flutter (mantidos exatamente)

| Método | Caminho | Observação |
|---|---|---|
| POST | `/auth/login` | `{email, senha}` → `{token, accessToken, user}` |
| POST | `/auth/register` | `{nome, email, senha, empresa?}` → perfil VISUALIZADOR |
| POST | `/auth/logout` | invalida o token (lista de tokens revogados) |
| GET | `/auth/me` | usuário atual |
| GET | `/sensors` · `/sensors/:id` | valor atual, limites, status, `online` |
| GET | `/sensors/:id/readings` | declarado no Flutter, ainda sem uso |
| GET | `/readings?sensorId&tipo&inicio&fim` | aceita `tipo=qualidadeAr` **e** `qualidade_ar` |
| GET | `/salas` · `/salas/:id` | `:id` aceita UUID ou código (`IND-001`) |
| GET | `/salas/:id/sensors` | |
| GET | `/salas/nfc/:tagId` | 404 com `message` amigável se não houver sala |
| GET | `/alerts` | |
| PATCH | `/alerts/:id/read` | |
| GET/PATCH | `/users/profile` | declarado no Flutter, ainda sem uso |

### Para o painel Next.js (novos)

| Método | Caminho | Tela |
|---|---|---|
| GET | `/dashboard/summary?range=` | Dashboard: cards com variação, dispositivos, alertas, tendência |
| GET | `/salas/:id/monitoramento` | `monitoramento/[id]`: métricas, risco, pessoas, câmeras, EPI, alertas, eventos |
| GET | `/salas/:id/historico?range=6h\|24h\|7d\|30d` | gráfico da área |
| GET | `/salas/:id/cameras` | câmeras |
| POST/PATCH/DELETE | `/salas`, `/salas/:id` | "Dispositivos IoT" (ADMIN) |
| POST/PATCH/DELETE | `/sensors`, `/sensors/:id` | "Sensores" / "Configurar parâmetros" |
| GET | `/alerts?resolvido=&severidade=&lido=&salaId=` | abas da Central de alertas |
| GET | `/alerts/resumo` | contadores |
| PATCH | `/alerts/:id/resolve` · `/alerts/read-all` | botão "Resolver" (ADMIN/OPERADOR) |
| GET/POST/PATCH/DELETE | `/users`, `/users/:id` | tela "Usuários" (ADMIN) |
| PATCH | `/users/profile`, `/users/profile/password` | Configurações |

### Ingestão dos dispositivos

`POST /v1/readings` com `{ "sensorId": "<uuid ou código, ex. DHT-01>", "valor": 26.4, "dataHora": "opcional" }`.
Autentica com o header `x-api-key: <DEVICE_API_KEY>` (ESP32) **ou** com JWT de ADMIN/OPERADOR.
A API calcula o status (`normal`/`atencao`/`critico`), atualiza o sensor e cria o alerta quando necessário
(sem duplicar o mesmo alerta aberto por 15 min). Um job a cada minuto marca sensores sem comunicação como `offline` e gera o alerta.

### Câmeras e EPI (sistema de visão `indusense`)

| Método | Caminho | Quem usa |
|---|---|---|
| POST | `/cameras/:id/status` | sistema de câmera, a cada 5 s (`x-api-key`) |
| POST | `/cameras/:id/ocorrencias` | sistema de câmera, quando alguém fica sem EPI (`x-api-key`, foto em base64) |
| GET | `/cameras` · `/cameras/:id` | lista e detalhe (`:id` aceita UUID ou `CAM-01`) |
| POST/PATCH/DELETE | `/cameras`, `/cameras/:id` | cadastro (ADMIN) |
| GET | `/epi/ocorrencias?salaId&cameraId&resolvido&lido&inicio&fim&limit` | lista de ocorrências |
| GET | `/epi/ocorrencias/resumo` | hoje, abertas, não lidas, câmeras online, conformidade média |
| GET | `/epi/ocorrencias/:id/foto` | foto JPEG (exige o Bearer token) |
| PATCH | `/epi/ocorrencias/:id/read` · `/epi/ocorrencias/:id/resolve` · `/epi/ocorrencias/read-all` | tratar ocorrência |

Também passaram a trazer dados reais da câmera: `GET /salas/:id/monitoramento` (`cameras`, `pessoasDetectadas`, `epiConformidade`, `ocorrenciasEpi` e as ocorrências misturadas em `eventosRecentes`) e `GET /dashboard/summary` (campo `epi`).

Uma câmera que para de enviar por `CAMERA_OFFLINE_SECONDS` (60 s) aparece offline. Se o sistema de câmera mandar um código que ainda não existe, a câmera é criada na sala informada em `salaId`.

## Modelo de dados

```
Sala 1───N Sensor 1───N Reading
             └────1───N Alert N───1 User (resolvidoPor)
Sala 1───N Camera 1───N EpiOcorrencia N───1 User (resolvidoPor)
                           User    RevokedToken(jti)
```

UUID em todas as chaves, FKs em cascata, índices em `readings(sensorId, dataHora desc)`, `alerts(lido, dataHora desc)`, `alerts(resolvido)`, `sensors(salaId|tipo|status)`.

## Permissões

| Perfil | Pode |
|---|---|
| ADMIN | tudo |
| OPERADOR | leitura, marcar alerta como lido/resolvido, editar limites de sensores, enviar leituras |
| VISUALIZADOR | leitura e marcar alerta como lido (o Flutter precisa disso) |

## Regras de status

`normal` dentro de `[limiteMin, limiteMax]`. Fora dele: `atencao`, e `critico` quando o excesso é ≥ `ALERT_CRITICAL_MARGIN` (15%) do limite violado. Os dados dos dois mocks (Flutter e Next.js) resultam exatamente nos mesmos status com essa regra.

## Erros

`{ "statusCode": 400, "message": "texto único em português", "errors": ["..."], "path": "...", "timestamp": "..." }`
`message` é sempre string (o `ApiClient` do Flutter faz `toString()` nele).

## Scripts

`npm run start:dev` · `npm run build` · `npm run start:prod` · `npm run prisma:migrate` · `npm run prisma:seed` · `npm run simulate`

## Produção

`npx prisma migrate deploy`, `JWT_SECRET` longo e aleatório, `CORS_ORIGINS` só com os domínios reais, `ALLOW_PUBLIC_REGISTER=false` se o app não deve criar contas, HTTPS na frente da API.
