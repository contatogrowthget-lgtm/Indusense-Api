import { PrismaClient, SensorStatus, SensorTipo } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { computeStatus } from '../src/common/util';

const prisma = new PrismaClient();
const SENHA = '123456';
const min = (n: number) => new Date(Date.now() - n * 60_000);
const h = (n: number) => min(n * 60);

// ---------------------------------------------------------------- usuários
// admin@indusense.com/123456 é o login demonstrativo do Next.js; franklin.* vem do mock do Flutter;
// carlos/ana/joao vêm da tela "Usuários" do Next.js.
const USUARIOS = [
  { nome: 'Administrador InduSense', email: 'admin@indusense.com', perfil: 'ADMIN', cargo: 'Administrador', empresa: 'InduSense' },
  { nome: 'Franklin Pereira', email: 'franklin.pereira@growthget.com', perfil: 'OPERADOR', cargo: 'Engenheiro de Processos', empresa: 'Growth Get Indústria' },
  { nome: 'Carlos Mendes', email: 'carlos@indusense.com', perfil: 'ADMIN', cargo: null, empresa: 'InduSense' },
  { nome: 'Ana Souza', email: 'ana@indusense.com', perfil: 'OPERADOR', cargo: null, empresa: 'InduSense' },
  { nome: 'João Lima', email: 'joao@indusense.com', perfil: 'VISUALIZADOR', cargo: null, empresa: 'InduSense' },
] as const;

// ------------------------------------------------------------------- salas
// IND-001..004 = "dispositivos" do Next.js; IND-005..009 = salas restantes do mock do Flutter.
const SALAS = [
  { codigo: 'IND-001', nome: 'Linha de Produção A', setor: 'Galpão 1', localizacao: 'Setor A • Galpão 01', nfcTagId: 'NFC-GALPAO1-LINHA-A' },
  { codigo: 'IND-002', nome: 'Caldeira Central', setor: 'Caldeiras', localizacao: 'Setor B • Caldeiras', nfcTagId: 'NFC-CALDEIRA-CENTRAL' },
  { codigo: 'IND-003', nome: 'Almoxarifado', setor: 'Estoque', localizacao: 'Setor C • Estoque', nfcTagId: 'NFC-ALMOXARIFADO' },
  { codigo: 'IND-004', nome: 'Sala Elétrica', setor: 'Energia', localizacao: 'Setor D • Energia', nfcTagId: 'NFC-SALA-ELETRICA' },
  { codigo: 'IND-005', nome: 'Estoque Químico', setor: 'Galpão 2', localizacao: 'Galpão 2 • Estoque Químico', nfcTagId: 'NFC-GALPAO2-ESTOQUE' },
  { codigo: 'IND-006', nome: 'Setor de Solda', setor: 'Galpão 1', localizacao: 'Galpão 1 • Setor de Solda', nfcTagId: 'NFC-GALPAO1-SOLDA' },
  { codigo: 'IND-007', nome: 'Casa de Máquinas', setor: 'Manutenção', localizacao: 'Manutenção • Casa de Máquinas', nfcTagId: 'NFC-CASA-MAQUINAS' },
  { codigo: 'IND-008', nome: 'Câmara Fria', setor: 'Galpão 3', localizacao: 'Galpão 3 • Câmara Fria', nfcTagId: 'NFC-GALPAO3-CAMARA-FRIA' },
  { codigo: 'IND-009', nome: 'Cabine de Pintura', setor: 'Galpão 2', localizacao: 'Galpão 2 • Cabine de Pintura', nfcTagId: 'NFC-GALPAO2-PINTURA' },
];

// [codigo, nome, tipo, sala, valorAtual, min, max, minutosDesdeUltimaLeitura]
type S = [string, string, SensorTipo, string, number, number, number, number];
const T = SensorTipo;
const SENSORES: S[] = [
  // IND-001 (valores do painel Next.js; DHT-01 é o "Sensor Temp — Linha A" do Flutter)
  ['DHT-01', 'Sensor Temp — Linha A', T.temperatura, 'IND-001', 26.4, 18, 30, 1],
  ['DHT-02', 'Sensor Umidade — Linha A', T.umidade, 'IND-001', 57, 30, 75, 1],
  ['AQ-01', 'Qualidade do Ar — Linha A', T.qualidade_ar, 'IND-001', 43, 0, 60, 1],
  ['MQ-01', 'Sensor Gás — Linha A', T.gas, 'IND-001', 21, 0, 40, 1],
  // IND-002 (AQ-02 em atenção e MQ-02 crítico, como no Next.js)
  ['DHT-03', 'Sensor Temp — Caldeira Central', T.temperatura, 'IND-002', 29.1, 18, 30, 1],
  ['DHT-04', 'Sensor Umidade — Caldeira Central', T.umidade, 'IND-002', 61, 30, 75, 1],
  ['AQ-02', 'Qualidade do Ar — Caldeira Central', T.qualidade_ar, 'IND-002', 67, 0, 60, 1],
  ['MQ-02', 'Sensor Gás — Caldeira Central', T.gas, 'IND-002', 48, 0, 40, 1],
  // IND-003 (offline no Next.js)
  ['DHT-05', 'Sensor Temp — Almoxarifado', T.temperatura, 'IND-003', 23.8, 18, 30, 180],
  ['DHT-06', 'Sensor Umidade — Almoxarifado', T.umidade, 'IND-003', 52, 30, 75, 180],
  ['AQ-03', 'Qualidade do Ar — Almoxarifado', T.qualidade_ar, 'IND-003', 34, 0, 60, 180],
  ['MQ-03', 'Sensor Gás — Almoxarifado', T.gas, 'IND-003', 12, 0, 40, 180],
  // IND-004
  ['DHT-07', 'Sensor Temp — Sala Elétrica', T.temperatura, 'IND-004', 27.2, 18, 30, 1],
  ['DHT-08', 'Sensor Umidade — Sala Elétrica', T.umidade, 'IND-004', 55, 30, 75, 1],
  ['AQ-04', 'Qualidade do Ar — Sala Elétrica', T.qualidade_ar, 'IND-004', 39, 0, 60, 1],
  ['MQ-04', 'Sensor Gás — Sala Elétrica', T.gas, 'IND-004', 17, 0, 40, 1],
  // Flutter (mock_data_service.dart)
  ['HUM-01', 'Sensor Umidade — Estoque', T.umidade, 'IND-005', 78, 30, 70, 3],
  ['AQ-05', 'Qualidade do Ar — Solda', T.qualidade_ar, 'IND-006', 168, 0, 100, 2],
  ['MQ-05', 'Sensor Gás — Solda', T.gas, 'IND-006', 36.5, 0, 35, 2],
  ['MQ-06', 'Sensor Gás — Caldeira', T.gas, 'IND-007', 12.4, 0, 50, 1],
  ['DHT-09', 'Sensor Temp — Caldeira', T.temperatura, 'IND-007', 31.2, 10, 45, 1],
  ['DHT-10', 'Sensor Temp — Câmara Fria', T.temperatura, 'IND-008', 0, -10, 8, 300],
  ['MQ-07', 'Sensor Gás — Pintura', T.gas, 'IND-009', 41.2, 0, 40, 4],
  ['AQ-06', 'Qualidade do Ar — Pintura', T.qualidade_ar, 'IND-009', 42, 0, 100, 4],
];

const AMPLITUDE: Record<SensorTipo, number> = { temperatura: 1.5, umidade: 3, qualidade_ar: 5, gas: 2 };

async function main() {
  const senhaHash = await bcrypt.hash(SENHA, 10);

  for (const u of USUARIOS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { nome: u.nome, perfil: u.perfil, cargo: u.cargo, empresa: u.empresa, senhaHash, ativo: true },
      create: { ...u, senhaHash, ultimoAcesso: null },
    });
  }
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@indusense.com' } });

  const salaId: Record<string, string> = {};
  for (const s of SALAS) {
    const r = await prisma.sala.upsert({ where: { codigo: s.codigo }, update: s, create: s });
    salaId[s.codigo] = r.id;
  }

  // dados dependentes do tempo são recriados a cada seed
  await prisma.alert.deleteMany();
  await prisma.reading.deleteMany();

  const sensorId: Record<string, string> = {};
  const sensorInfo: Record<string, { nome: string; tipo: SensorTipo; min: number; max: number; valor: number; status: SensorStatus }> = {};
  for (const [codigo, nome, tipo, sala, valor, lmin, lmax, atras] of SENSORES) {
    const status = atras > 30 ? SensorStatus.offline : computeStatus(valor, lmin, lmax);
    const dados = { nome, tipo, salaId: salaId[sala], limiteMin: lmin, limiteMax: lmax, valorAtual: valor, status, ultimaLeitura: min(atras), ativo: true };
    const r = await prisma.sensor.upsert({ where: { codigo }, update: dados, create: { codigo, ...dados } });
    sensorId[codigo] = r.id;
    sensorInfo[codigo] = { nome, tipo, min: lmin, max: lmax, valor, status };
  }

  // histórico: 7 dias, uma leitura a cada 30 min, terminando na última leitura do sensor
  const leituras: { sensorId: string; valor: number; status: SensorStatus; dataHora: Date }[] = [];
  for (const [codigo, , tipo, , valor, lmin, lmax, atras] of SENSORES) {
    const fim = min(atras).getTime();
    const pontos = 7 * 48;
    for (let i = 0; i < pontos; i++) {
      const t = new Date(fim - i * 30 * 60_000);
      const v = i === 0 ? valor : valor + Math.sin(i / 5 + codigo.length) * AMPLITUDE[tipo] + ((i * 7919) % 10) / 10 - 0.5;
      const valorFinal = Math.round(v * 10) / 10;
      leituras.push({ sensorId: sensorId[codigo], valor: valorFinal, status: computeStatus(valorFinal, lmin, lmax), dataHora: t });
    }
  }
  for (let i = 0; i < leituras.length; i += 5000) {
    await prisma.reading.createMany({ data: leituras.slice(i, i + 5000) });
  }

  // alertas: mocks do Flutter (a1–a4) + tabela do Next.js
  const alerta = (cod: string, sev: SensorStatus, limite: number, atras: number, o: { lido?: boolean; resolvido?: boolean } = {}) => ({
    sensorId: sensorId[cod],
    tipo: sensorInfo[cod].tipo,
    valorMedido: sensorInfo[cod].valor,
    limite,
    severidade: sev,
    mensagem: `${sensorInfo[cod].nome}: ${sensorInfo[cod].valor} (limite ${limite})`,
    lido: o.lido ?? false,
    lidoEm: o.lido ? min(atras - 1) : null,
    resolvido: o.resolvido ?? false,
    resolvidoEm: o.resolvido ? min(atras - 5) : null,
    resolvidoPorId: o.resolvido ? admin.id : null,
    dataHora: min(atras),
  });
  await prisma.alert.createMany({
    data: [
      alerta('AQ-05', SensorStatus.critico, 100, 2),
      alerta('HUM-01', SensorStatus.atencao, 70, 30),
      alerta('MQ-07', SensorStatus.atencao, 40, 70, { lido: true }),
      alerta('DHT-10', SensorStatus.offline, 8, 300, { lido: true }),
      alerta('MQ-05', SensorStatus.atencao, 35, 2),
      alerta('AQ-02', SensorStatus.atencao, 60, 15),
      alerta('MQ-02', SensorStatus.critico, 40, 25),
      alerta('MQ-01', SensorStatus.atencao, 40, 240, { lido: true, resolvido: true }),
    ],
  });

  // câmeras (tela monitoramento/[id] do Next.js)
  await prisma.camera.deleteMany();
  await prisma.camera.createMany({
    data: [
      // CAM-01 é a câmera real: o sistema de visão (pasta indusense) envia os dados para ela.
      { salaId: salaId['IND-001'], codigo: 'CAM-01', nome: 'CAM-01 • Entrada', online: false, pessoas: 0, epiConformidade: 0, ocorrencia: 'Aguardando sistema de câmera', streamUrl: 'http://localhost:8000/video_feed' },
      { salaId: salaId['IND-001'], codigo: 'CAM-02', nome: 'CAM-02 • Linha A', online: true, pessoas: 8, epiConformidade: 88, ocorrencia: '1 pessoa sem capacete' },
      { salaId: salaId['IND-001'], codigo: 'CAM-03', nome: 'CAM-03 • Saída', online: true, pessoas: 3, epiConformidade: 100, ocorrencia: null },
      { salaId: salaId['IND-001'], codigo: 'CAM-04', nome: 'CAM-04 • Corredor', online: false, pessoas: 0, epiConformidade: 0, ocorrencia: 'Sem sinal há 6 min' },
      { salaId: salaId['IND-002'], codigo: 'CAM-05', nome: 'CAM-05 • Caldeira', online: true, pessoas: 11, epiConformidade: 94, ocorrencia: null },
      { salaId: salaId['IND-004'], codigo: 'CAM-06', nome: 'CAM-06 • Painéis', online: true, pessoas: 6, epiConformidade: 100, ocorrencia: null },
    ],
  });

  console.log(`Seed concluído: ${USUARIOS.length} usuários, ${SALAS.length} salas, ${SENSORES.length} sensores, ${leituras.length} leituras.`);
  console.log(`Login de teste: admin@indusense.com / ${SENHA}  (todos os usuários do seed usam a mesma senha)`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
