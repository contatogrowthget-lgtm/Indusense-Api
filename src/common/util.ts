import { Perfil, Sensor, SensorStatus, SensorTipo } from '@prisma/client';
import { isUUID } from 'class-validator';

export const TIPO_UNIDADE: Record<SensorTipo, string> = {
  temperatura: '°C',
  umidade: '%',
  qualidade_ar: 'IQA',
  gas: 'ppm',
};

export const TIPO_LABEL: Record<SensorTipo, string> = {
  temperatura: 'Temperatura',
  umidade: 'Umidade',
  qualidade_ar: 'Qualidade do ar',
  gas: 'Gases',
};

export const PERFIL_LABEL: Record<Perfil, string> = {
  ADMIN: 'Administrador',
  OPERADOR: 'Operador',
  VISUALIZADOR: 'Visualizador',
};

const limpar = (v: string) =>
  v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');

/** Aceita as grafias usadas pelo Flutter (qualidadeAr, qualidade_ar, gases...) e pelo Next. */
export function normalizeTipo(v: unknown): SensorTipo | undefined {
  if (typeof v !== 'string') return undefined;
  switch (limpar(v)) {
    case 'temperatura': return SensorTipo.temperatura;
    case 'umidade': return SensorTipo.umidade;
    case 'qualidadear':
    case 'qualidadedoar': return SensorTipo.qualidade_ar;
    case 'gas':
    case 'gases': return SensorTipo.gas;
    default: return undefined;
  }
}

/** Aceita ADMIN ou o rótulo usado no Next ("Administrador"). */
export function normalizePerfil(v: unknown): Perfil | undefined {
  if (typeof v !== 'string') return undefined;
  switch (limpar(v)) {
    case 'admin':
    case 'administrador': return Perfil.ADMIN;
    case 'operador': return Perfil.OPERADOR;
    case 'visualizador': return Perfil.VISUALIZADOR;
    default: return undefined;
  }
}

export const toBool = ({ value }: { value: unknown }) =>
  value === 'true' || value === true ? true : value === 'false' || value === false ? false : undefined;

/** Rótulos dos EPIs enviados pelo sistema de câmera. */
export const EPI_LABEL: Record<string, string> = {
  capacete: 'Capacete',
  oculos: 'Óculos',
  colete: 'Colete',
  luvas: 'Luvas',
  botas: 'Botas',
  mascara: 'Máscara',
  protetor_auricular: 'Protetor auricular',
};

export const epiLabel = (k: string) => EPI_LABEL[k] ?? k;

/** "capacete e luvas" / "capacete, óculos e luvas" */
export function juntarEpis(lista: string[]): string {
  const nomes = lista.map((k) => epiLabel(k).toLowerCase());
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

export const cameraOfflineSeconds = () => Number(process.env.CAMERA_OFFLINE_SECONDS) || 60;

/**
 * Câmera que nunca enviou dados (cadastro manual/seed) usa o campo `online`.
 * Câmera ligada ao sistema de visão fica offline se parar de enviar.
 */
export function cameraOnline(c: { online: boolean; ultimoContato: Date | null }): boolean {
  if (!c.ultimoContato) return c.online;
  return c.online && Date.now() - c.ultimoContato.getTime() <= cameraOfflineSeconds() * 1000;
}

export const offlineMinutes = () => Number(process.env.SENSOR_OFFLINE_MINUTES) || 30;
export const criticalMargin = () => Number(process.env.ALERT_CRITICAL_MARGIN) || 0.15;

export function isOnline(s: Pick<Sensor, 'ativo' | 'ultimaLeitura'>): boolean {
  if (!s.ativo || !s.ultimaLeitura) return false;
  return Date.now() - s.ultimaLeitura.getTime() <= offlineMinutes() * 60_000;
}

/** normal dentro dos limites; atencao até a margem; critico acima dela. */
export function computeStatus(valor: number, min: number, max: number): SensorStatus {
  if (valor <= max && valor >= min) return SensorStatus.normal;
  const limite = valor > max ? max : min;
  const base = Math.abs(limite) || Math.abs(max - min) || 1;
  const excesso = Math.abs(valor - limite) / base;
  return excesso >= criticalMargin() ? SensorStatus.critico : SensorStatus.atencao;
}

const PRIORIDADE: Record<SensorStatus, number> = { critico: 3, atencao: 2, normal: 1, offline: 0 };
export const piorStatus = (lista: SensorStatus[]): SensorStatus =>
  lista.length ? lista.reduce((a, b) => (PRIORIDADE[b] > PRIORIDADE[a] ? b : a)) : SensorStatus.offline;

/** Recebe UUID ou código (IND-001, DHT-01) — o Next usa o código na URL. */
export const whereIdOrCode = (v: string): { id: string } | { codigo: string } =>
  isUUID(v) ? { id: v } : { codigo: v };

export const round1 = (n: number) => Math.round(n * 10) / 10;

export function relativeTime(d: Date | null | undefined): string {
  if (!d) return 'Sem comunicação';
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 10) return 'Agora';
  if (s < 60) return `Há ${s} s`;
  if (s < 3600) return `Há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `Há ${Math.floor(s / 3600)} h`;
  return `Há ${Math.floor(s / 86400)} d`;
}
