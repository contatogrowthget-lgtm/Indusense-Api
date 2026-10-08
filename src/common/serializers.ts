import { Alert, Camera, EpiOcorrencia, Reading, Sala, Sensor, SensorStatus, SensorTipo, User } from '@prisma/client';
import {
  cameraOnline, epiLabel, isOnline, juntarEpis, PERFIL_LABEL, piorStatus, relativeTime, round1, TIPO_UNIDADE,
} from './util';

export type SensorComSala = Sensor & { sala?: Sala | null };
export type SalaComSensores = Sala & { sensores?: Sensor[] };
export type AlertComSensor = Alert & { sensor: Sensor & { sala?: Sala | null } };
export type ReadingComSensor = Reading & { sensor: Sensor };

/** Status exibido: sensor sem comunicação recente vira "offline". */
export const effectiveStatus = (s: Sensor): SensorStatus => (isOnline(s) ? s.status : SensorStatus.offline);

export function serializeUser(u: User) {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    cargo: u.cargo,
    empresa: u.empresa,
    perfil: u.perfil,
    role: PERFIL_LABEL[u.perfil],
    ativo: u.ativo,
    status: u.ativo ? 'Ativo' : 'Inativo',
    ultimoAcesso: u.ultimoAcesso?.toISOString() ?? null,
    avatar: u.avatar ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

export function serializeSensor(s: SensorComSala) {
  const online = isOnline(s);
  return {
    id: s.id,
    codigo: s.codigo,
    nome: s.nome,
    localizacao: s.sala ? `${s.sala.setor} · ${s.sala.nome}` : '',
    salaId: s.salaId,
    salaCodigo: s.sala?.codigo ?? null,
    salaNome: s.sala?.nome ?? null,
    tipo: s.tipo,
    unidade: TIPO_UNIDADE[s.tipo],
    status: effectiveStatus(s),
    valorAtual: s.valorAtual,
    limiteMin: s.limiteMin,
    limiteMax: s.limiteMax,
    ultimaLeitura: (s.ultimaLeitura ?? s.createdAt).toISOString(),
    online,
    ativo: s.ativo,
  };
}

export function serializeReading(r: ReadingComSensor) {
  return {
    id: r.id,
    sensorId: r.sensorId,
    sensorNome: r.sensor.nome,
    sensorCodigo: r.sensor.codigo,
    tipo: r.sensor.tipo,
    unidade: TIPO_UNIDADE[r.sensor.tipo],
    valor: r.valor,
    dataHora: r.dataHora.toISOString(),
    status: r.status,
  };
}

export function serializeAlert(a: AlertComSensor) {
  return {
    id: a.id,
    sensorId: a.sensorId,
    sensorNome: a.sensor.nome,
    sensorCodigo: a.sensor.codigo,
    salaId: a.sensor.salaId,
    salaCodigo: a.sensor.sala?.codigo ?? null,
    salaNome: a.sensor.sala?.nome ?? null,
    tipo: a.tipo,
    unidade: TIPO_UNIDADE[a.tipo],
    valorMedido: a.valorMedido,
    limite: a.limite,
    dataHora: a.dataHora.toISOString(),
    lido: a.lido,
    severidade: a.severidade,
    mensagem: a.mensagem,
    resolvido: a.resolvido,
    resolvidoEm: a.resolvidoEm?.toISOString() ?? null,
    /** true quando a leitura voltou ao normal e o sistema resolveu sozinho */
    resolvidoAutomaticamente: a.resolvido && !a.resolvidoPorId,
    sensorValorAtual: a.sensor.valorAtual,
    limiteMin: a.sensor.limiteMin,
    limiteMax: a.sensor.limiteMax,
  };
}

/** Mesma regra do SalaComSensores.statusGeral do Flutter. */
export function statusGeral(sensores: Sensor[]): SensorStatus {
  const ativos = sensores.filter((s) => s.ativo);
  if (!ativos.length) return SensorStatus.offline;
  const st = ativos.map(effectiveStatus);
  if (st.includes(SensorStatus.critico)) return SensorStatus.critico;
  if (st.includes(SensorStatus.atencao)) return SensorStatus.atencao;
  if (ativos.every((s) => !isOnline(s))) return SensorStatus.offline;
  return SensorStatus.normal;
}

export function serializeSala(sala: SalaComSensores) {
  const base = {
    id: sala.id,
    codigo: sala.codigo,
    nome: sala.nome,
    setor: sala.setor,
    localizacao: sala.localizacao ?? sala.setor,
    nfcTagId: sala.nfcTagId,
    dispositivoModelo: sala.dispositivoModelo,
    ativo: sala.ativo,
  };
  if (!sala.sensores) return base;
  const sensores = sala.sensores.filter((s) => s.ativo);
  const datas = sensores.map((s) => s.ultimaLeitura).filter((d): d is Date => !!d);
  const ultima = datas.length ? new Date(Math.max(...datas.map((d) => d.getTime()))) : null;
  return {
    ...base,
    status: statusGeral(sensores),
    online: sensores.some(isOnline),
    totalSensores: sensores.length,
    sensoresOnline: sensores.filter(isOnline).length,
    totalAlertas: sensores.filter((s) => [SensorStatus.critico, SensorStatus.atencao].includes(effectiveStatus(s) as any)).length,
    ultimaComunicacao: ultima?.toISOString() ?? null,
  };
}

/** Resumo por tipo de sensor (média + pior status). */
export function resumoPorTipo(sensores: Sensor[], apenasOnline: boolean) {
  const out = {} as Record<SensorTipo, { valor: number; unidade: string; status: SensorStatus; sensores: number } | null>;
  for (const tipo of Object.values(SensorTipo)) {
    const lista = sensores.filter((s) => s.ativo && s.tipo === tipo && (!apenasOnline || isOnline(s)));
    out[tipo] = lista.length
      ? {
          valor: round1(lista.reduce((a, s) => a + s.valorAtual, 0) / lista.length),
          unidade: TIPO_UNIDADE[tipo],
          status: piorStatus(lista.map(effectiveStatus)),
          sensores: lista.length,
        }
      : null;
  }
  return out;
}

/** Formato "Device" usado hoje pelo painel Next.js (id, name, location, status, temp, hum, air, gas, last). */
export function toDispositivoNext(sala: Sala & { sensores: Sensor[] }) {
  const m = resumoPorTipo(sala.sensores, false);
  const datas = sala.sensores.map((s) => s.ultimaLeitura).filter((d): d is Date => !!d);
  const ultima = datas.length ? new Date(Math.max(...datas.map((d) => d.getTime()))) : null;
  return {
    id: sala.codigo,
    uuid: sala.id,
    name: sala.nome,
    location: sala.localizacao ?? sala.setor,
    status: sala.sensores.some(isOnline) ? 'online' : 'offline',
    temp: m.temperatura?.valor ?? 0,
    hum: m.umidade?.valor ?? 0,
    air: m.qualidade_ar?.valor ?? 0,
    gas: m.gas?.valor ?? 0,
    last: relativeTime(ultima),
  };
}

export type CameraComSala = Camera & { sala?: Sala | null };
export type OcorrenciaComCamera = EpiOcorrencia & { camera: CameraComSala };

export function serializeCamera(c: CameraComSala) {
  const online = cameraOnline(c);
  const ocorrencia = online
    ? c.ocorrencia
    : c.ultimoContato
      ? `Sem sinal desde ${relativeTime(c.ultimoContato).toLowerCase()}`
      : c.ocorrencia;
  const pessoas = online ? c.pessoas : 0;
  const epi = online ? c.epiConformidade : 0;
  return {
    id: c.id,
    codigo: c.codigo,
    salaId: c.salaId,
    salaCodigo: c.sala?.codigo ?? null,
    salaNome: c.sala?.nome ?? null,
    nome: c.nome,
    online,
    estado: online ? 'online' : 'offline',
    pessoas,
    epiConformidade: epi,
    ocorrencia,
    streamUrl: c.streamUrl,
    ultimoContato: c.ultimoContato?.toISOString() ?? null,
    ultimoContatoRelativo: c.ultimoContato ? relativeTime(c.ultimoContato) : null,
    // mesmos nomes usados no mock do Next.js
    name: c.nome,
    state: online ? 'online' : 'offline',
    people: pessoas,
    epi,
    issue: ocorrencia ?? 'Nenhuma ocorrência',
  };
}

export function serializeOcorrencia(o: OcorrenciaComCamera) {
  const prefixo = process.env.API_PREFIX || 'v1';
  const faltando = o.faltando ?? [];
  return {
    id: o.id,
    cameraId: o.cameraId,
    cameraCodigo: o.camera.codigo,
    cameraNome: o.camera.nome,
    salaId: o.camera.salaId,
    salaCodigo: o.camera.sala?.codigo ?? null,
    salaNome: o.camera.sala?.nome ?? null,
    pessoa: o.pessoa,
    faltando,
    faltandoRotulos: faltando.map(epiLabel),
    mensagem: faltando.length ? `Pessoa ${o.pessoa} sem ${juntarEpis(faltando)}` : `Pessoa ${o.pessoa} com EPI incompleto`,
    temFoto: !!o.foto,
    fotoUrl: o.foto ? `/${prefixo}/epi/ocorrencias/${o.id}/foto` : null,
    dataHora: o.dataHora.toISOString(),
    tempoRelativo: relativeTime(o.dataHora),
    lido: o.lido,
    resolvido: o.resolvido,
    resolvidoEm: o.resolvidoEm?.toISOString() ?? null,
  };
}
