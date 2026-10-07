/**
 * Simula os ESP32 enviando leituras a cada poucos segundos (POST /readings com x-api-key).
 * Uso: npm run simulate
 * Sensores "parados" (IND-003 e Câmara Fria) ficam de fora para manter o exemplo de dispositivo offline.
 */
import 'dotenv/config';

const base = process.env.SIM_API_URL ?? `http://localhost:${process.env.PORT ?? 3333}/${process.env.API_PREFIX ?? 'v1'}`;
const apiKey = process.env.DEVICE_API_KEY ?? '';
const intervalo = Number(process.env.SIM_INTERVAL_MS ?? 5000);
const ignorar = (process.env.SIM_SKIP ?? 'DHT-05,DHT-06,AQ-03,MQ-03,DHT-10').split(',');

async function http(path: string, init: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  const corpo = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(corpo)}`);
  return corpo;
}

async function main() {
  const login = await http('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@indusense.com', senha: '123456' }),
  });
  const sensores: any[] = await http('/sensors', { headers: { Authorization: `Bearer ${login.token}` } });
  const ativos = sensores.filter((s) => !ignorar.includes(s.codigo));
  const valores = new Map<string, number>(ativos.map((s) => [s.id, s.valorAtual]));
  console.log(`Simulando ${ativos.length} sensores em ${base} a cada ${intervalo / 1000}s (Ctrl+C para parar)`);

  setInterval(async () => {
    for (const s of ativos) {
      const faixa = (s.limiteMax - s.limiteMin) || 10;
      const anterior = valores.get(s.id)!;
      const novo = Math.round((anterior + (Math.random() - 0.5) * faixa * 0.03) * 10) / 10;
      valores.set(s.id, novo);
      try {
        await http('/readings', { method: 'POST', headers: { 'x-api-key': apiKey }, body: JSON.stringify({ sensorId: s.id, valor: novo }) });
      } catch (e) {
        console.error(`Falha em ${s.codigo}:`, (e as Error).message);
      }
    }
    console.log(new Date().toLocaleTimeString(), 'leituras enviadas');
  }, intervalo);
}

main().catch((e) => { console.error(e); process.exit(1); });
