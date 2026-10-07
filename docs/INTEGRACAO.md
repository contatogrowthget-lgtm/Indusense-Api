# Integração com Flutter e Next.js

Nenhum dos dois projetos foi alterado. Abaixo, só o **mínimo** para apontá-los para esta API.

## Flutter — `lib/core/constants/api_constants.dart`

```dart
static const String baseUrl = 'http://10.0.2.2:3333/v1'; // emulador Android; use o IP da máquina em aparelho real
static const bool useMock = false;
```

- **HTTP em Android**: como a URL é `http://`, adicione `android:usesCleartextTraffic="true"` no `<application>` de `android/app/src/main/AndroidManifest.xml` durante o desenvolvimento. Em produção use HTTPS.
- **Flutter Web**: coloque a origem em `CORS_ORIGINS` (ou `*` em desenvolvimento, pois a porta muda a cada execução).
- **Datas no filtro do histórico**: `inicio.toIso8601String()` de uma data local sai sem fuso. O servidor interpreta pelo fuso dele; se ele não estiver em UTC, prefira `inicio.toUtc().toIso8601String()` em `sensor_service.dart`.

Pontos em que a API se adapta ao Flutter (nada a mudar no app):
- prefixo `/v1` já é o `baseUrl`;
- login inválido responde **400** (e não 401), porque `ApiClient._handle` troca todo 401 por "Sessão expirada";
- `message` do erro é sempre string;
- `tipo` aceita `qualidadeAr` (o `.name` do enum que o app envia) e `qualidade_ar`;
- o JSON traz `token` **e** `accessToken`, `user.nome/cargo/empresa`;
- `ultimaLeitura` nunca é nula (o `DateTime.parse` do app quebraria).

## Next.js

O projeto hoje **não faz nenhuma chamada HTTP**: dados e login são mock, e o login grava `indusense_session` no `localStorage`. Para consumir a API:

`.env.local`
```
NEXT_PUBLIC_API_URL=http://localhost:3333/v1
```

`app/lib/api.ts` (novo arquivo, exemplo)
```ts
const BASE = process.env.NEXT_PUBLIC_API_URL!;
const KEY = "indusense_token";

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  if (res.status === 401 && typeof window !== "undefined") {
    localStorage.removeItem(KEY);
    window.location.href = "/login";
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message ?? "Erro ao comunicar com o servidor.");
  return body as T;
}

export async function login(email: string, password: string) {
  const r = await api<{ token: string; user: any }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  localStorage.setItem(KEY, r.token);
  localStorage.setItem("indusense_session", JSON.stringify({ email: r.user.email, role: r.user.role }));
  return r.user;
}
```

Onde cada tela do Next.js passa a buscar dados:

| Tela / trecho do código | Endpoint |
|---|---|
| `login/page.tsx` → `submit()` | `POST /auth/login` (`{email, password}`) |
| `dashboard/page.tsx` → `logout()` | `POST /auth/logout` |
| `DashboardHome` (`MetricCard`, `devices`, `trend`) | `GET /dashboard/summary` → `metricas.*.valor/variacaoPercentual`, `dispositivos.lista`, `tendencia.pontos` |
| `Monitoring` e `Devices` (`initialDevices`) | `GET /salas` ou `dispositivos.lista` do summary; cadastro: `POST /salas {nome, localizacao}` |
| `monitoramento/[id]/page.tsx` (`rooms[params.id]`, `history`, `cameras`) | `GET /salas/:id/monitoramento` (`dispositivo` tem o mesmo formato de `rooms[id]`, `cameras` traz `name/state/people/epi/issue`) e `GET /salas/:id/historico?range=24h` (pontos com `time/temp/hum/air/gas`) |
| `Sensors` | `GET /sensors`; "Configurar parâmetros": `PATCH /sensors/:id {limiteMin, limiteMax}` |
| `Alerts` (`alerts`, botão Resolver) | `GET /alerts`, `PATCH /alerts/:id/resolve` |
| `History` | `GET /readings?inicio=&fim=&limit=` |
| `UsersPage` (`initialUsers`) | `GET /users`, `POST /users {nome, email, perfil}` — o `perfil` aceita `"Administrador"`, `"Operador"`, `"Visualizador"`; sem `senha`, a resposta traz `senhaTemporaria` |
| `SettingsPage` | `GET/PATCH /users/profile`, `PATCH /users/profile/password` |

O código na URL (`/dashboard/monitoramento/IND-002`) continua funcionando: `GET /salas/IND-002/...` aceita UUID ou código.

## Câmera e EPI nas telas

O sistema de câmera (pasta `indusense`) envia os dados sozinho; os front-ends só leem.

**Vídeo ao vivo:** cada câmera traz `streamUrl` (ex.: `http://192.168.1.50:8000/video_feed`). É um MJPEG, então basta uma imagem:

```tsx
<img src={camera.streamUrl} alt={camera.nome} />          // Next.js
Image.network(camera.streamUrl)                            // Flutter (mostra só o 1º quadro; para vídeo use o pacote flutter_mjpeg)
```

**Foto da ocorrência:** `fotoUrl` exige o token, então busque como blob:

```ts
const res = await fetch(BASE.replace(/\/v1$/, "") + o.fotoUrl, { headers: { Authorization: `Bearer ${token}` } });
const src = URL.createObjectURL(await res.blob());
```

No Flutter: `Image.network(baseHost + o.fotoUrl, headers: {'Authorization': 'Bearer $token'})`.

| Tela | Endpoint |
|---|---|
| `monitoramento/[id]` → câmeras, pessoas, EPI | já vem em `GET /salas/:id/monitoramento` (`cameras`, `pessoasDetectadas`, `epiConformidade`, `ocorrenciasEpi`) |
| Central de alertas → aba EPI | `GET /epi/ocorrencias?resolvido=false`, botão Resolver: `PATCH /epi/ocorrencias/:id/resolve` |
| Dashboard → card de EPI | `GET /dashboard/summary` → `epi.conformidadeMedia`, `epi.ocorrenciasHoje` |

## Diferenças entre os dois mundos (resolvidas na API)

| Conceito | Flutter | Next.js | API |
|---|---|---|---|
| Local físico | `Sala` (`nfcTagId`) | "Dispositivo" `IND-001` | mesma tabela `salas`, com `codigo` e `nfcTagId` |
| Alerta tratado | `lido` | `Resolvido / Não resolvido` | dois campos: `lido` e `resolvido` |
| Perfis | — | Administrador / Operador / Visualizador | enum `Perfil` (+ rótulo em `role`) |
| Cadastro | tela de cadastro | "não há cadastro público" | `/auth/register` existe (VISUALIZADOR); `ALLOW_PUBLIC_REGISTER=false` fecha |
| Câmeras / EPI | — | painel por área | tabelas `cameras` e `epi_ocorrencias`, alimentadas pelo sistema de câmera |
