import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, SensorStatus, SensorTipo } from '@prisma/client';
import { findSensorOr404 } from '../common/lookup';
import { serializeAlert, serializeReading } from '../common/serializers';
import { computeStatus, TIPO_LABEL, TIPO_UNIDADE, round1, whereIdOrCode } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReadingDto, Range, ReadingsQueryDto } from './dto/readings.dto';

const RANGE_CFG: Record<Range, { ms: number; bucket: number }> = {
  '6h': { ms: 6 * 3600e3, bucket: 900 },
  '24h': { ms: 24 * 3600e3, bucket: 3600 },
  '7d': { ms: 7 * 86400e3, bucket: 6 * 3600 },
  '30d': { ms: 30 * 86400e3, bucket: 86400 },
};

@Injectable()
export class ReadingsService {
  constructor(private prisma: PrismaService) {}

  /** GET /readings — lista simples (array), como o Flutter espera. */
  async findAll(q: ReadingsQueryDto) {
    let sensorId: string | undefined;
    let salaId: string | undefined;
    if (q.sensorId) sensorId = (await findSensorOr404(this.prisma, q.sensorId)).id;
    if (q.salaId) {
      const sala = await this.prisma.sala.findFirst({ where: whereIdOrCode(q.salaId), select: { id: true } });
      if (!sala) return [];
      salaId = sala.id;
    }
    const rows = await this.prisma.reading.findMany({
      where: {
        sensorId,
        dataHora: { gte: q.inicio ? new Date(q.inicio) : undefined, lte: q.fim ? new Date(q.fim) : undefined },
        sensor: { tipo: q.tipo, salaId },
      },
      include: { sensor: true },
      orderBy: { dataHora: 'desc' },
      take: q.limit ?? 500,
      skip: q.offset ?? 0,
    });
    return rows.map(serializeReading);
  }

  /** POST /readings — ingestão (ESP32 com x-api-key ou usuário ADMIN/OPERADOR). */
  async ingest(dto: CreateReadingDto) {
    const sensor = await findSensorOr404(this.prisma, dto.sensorId);
    if (!sensor.ativo) throw new BadRequestException('Sensor desativado.');

    const quando = dto.dataHora ? new Date(dto.dataHora) : new Date();
    const status = computeStatus(dto.valor, sensor.limiteMin, sensor.limiteMax);
    const maisRecente = !sensor.ultimaLeitura || quando >= sensor.ultimaLeitura;

    return this.prisma.$transaction(async (tx) => {
      const leitura = await tx.reading.create({
        data: { sensorId: sensor.id, valor: dto.valor, status, dataHora: quando },
        include: { sensor: true },
      });

      let alerta: ReturnType<typeof serializeAlert> | null = null;
      if (maisRecente) {
        await tx.sensor.update({
          where: { id: sensor.id },
          data: { valorAtual: dto.valor, status, ultimaLeitura: quando },
        });
        alerta = await this.atualizarAlertas(tx, sensor, dto.valor, status, quando);
      }
      return { reading: serializeReading(leitura), alerta };
    });
  }

  /**
   * Um alerta por "episódio" fora do limite:
   *  - voltou ao normal  -> resolve sozinho os alertas abertos do sensor
   *  - continua fora      -> atualiza o alerta aberto (valor atual; se piorou, vira crítico e volta a "não lido")
   *  - saiu agora         -> cria um alerta novo (o painel mostra o aviso grande)
   */
  private async atualizarAlertas(
    tx: Prisma.TransactionClient,
    sensor: { id: string; tipo: SensorTipo; limiteMin: number; limiteMax: number },
    valor: number,
    status: SensorStatus,
    quando: Date,
  ) {
    const include = { sensor: { include: { sala: true } } } as const;

    if (status === SensorStatus.normal || status === SensorStatus.offline) {
      if (status === SensorStatus.normal) {
        await tx.alert.updateMany({
          where: { sensorId: sensor.id, resolvido: false, severidade: { in: [SensorStatus.atencao, SensorStatus.critico] } },
          data: { resolvido: true, resolvidoEm: quando, resolvidoPorId: null },
        });
      }
      return null;
    }

    const acima = valor > sensor.limiteMax;
    const limite = acima ? sensor.limiteMax : sensor.limiteMin;
    const un = TIPO_UNIDADE[sensor.tipo];
    const mensagem = `${TIPO_LABEL[sensor.tipo]} ${acima ? 'acima' : 'abaixo'} do limite: ${valor} ${un} (limite ${limite} ${un})`;

    const aberto = await tx.alert.findFirst({
      where: { sensorId: sensor.id, resolvido: false, severidade: { in: [SensorStatus.atencao, SensorStatus.critico] } },
      orderBy: { dataHora: 'desc' },
    });

    if (aberto) {
      const piorou = aberto.severidade === SensorStatus.atencao && status === SensorStatus.critico;
      const atualizado = await tx.alert.update({
        where: { id: aberto.id },
        data: {
          valorMedido: valor,
          limite,
          mensagem,
          ...(piorou ? { severidade: status, lido: false, lidoEm: null } : {}),
        },
        include,
      });
      return piorou ? serializeAlert(atualizado) : null;
    }

    const criado = await tx.alert.create({
      data: { sensorId: sensor.id, tipo: sensor.tipo, valorMedido: valor, limite, severidade: status, mensagem, dataHora: quando },
      include,
    });
    return serializeAlert(criado);
  }

  /** Médias por bucket de tempo, pivotadas por tipo — alimenta os gráficos do Next.js. */
  async series(opts: { salaId?: string; range: Range }) {
    const cfg = RANGE_CFG[opts.range];
    const fim = new Date();
    const inicio = new Date(fim.getTime() - cfg.ms);
    const filtroSala = opts.salaId ? Prisma.sql`AND s."salaId" = ${opts.salaId}::uuid` : Prisma.empty;

    const rows = await this.prisma.$queryRaw<{ bucket: Date; tipo: SensorTipo; media: number }[]>(Prisma.sql`
      SELECT to_timestamp(floor(extract(epoch FROM r."dataHora") / ${cfg.bucket}::float8) * ${cfg.bucket}::float8) AS bucket,
             s."tipo"::text AS tipo,
             AVG(r."valor")::float8 AS media
      FROM "readings" r
      JOIN "sensors" s ON s."id" = r."sensorId"
      WHERE r."dataHora" >= ${inicio.toISOString()}::timestamp
        AND r."dataHora" <= ${fim.toISOString()}::timestamp
        ${filtroSala}
      GROUP BY 1, 2
      ORDER BY 1 ASC`);

    const tz = process.env.APP_TIMEZONE || 'America/Sao_Paulo';
    const fmt = new Intl.DateTimeFormat(
      'pt-BR',
      opts.range === '7d' || opts.range === '30d'
        ? { timeZone: tz, day: '2-digit', month: '2-digit' }
        : { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false },
    );

    const mapa = new Map<number, Record<string, any>>();
    for (const r of rows) {
      const t = new Date(r.bucket).getTime();
      const p = mapa.get(t) ?? { time: fmt.format(t), timestamp: new Date(t).toISOString() };
      p[r.tipo] = round1(r.media);
      mapa.set(t, p);
    }
    const pontos = [...mapa.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, p]) => ({
        ...p,
        // nomes curtos usados como dataKey nos gráficos do Next.js
        temp: p.temperatura ?? null,
        hum: p.umidade ?? null,
        air: p.qualidade_ar ?? null,
        gas: p.gas ?? null,
      }));

    return { range: opts.range, inicio: inicio.toISOString(), fim: fim.toISOString(), bucketSegundos: cfg.bucket, pontos };
  }

  /** Variação percentual da última hora vs. hora anterior, por tipo. */
  async variacaoPorTipo() {
    const agora = Date.now();
    const t1 = new Date(agora - 3600e3).toISOString();
    const t2 = new Date(agora - 2 * 3600e3).toISOString();
    const rows = await this.prisma.$queryRaw<{ tipo: SensorTipo; atual: number | null; anterior: number | null }[]>(Prisma.sql`
      SELECT s."tipo"::text AS tipo,
             AVG(r."valor") FILTER (WHERE r."dataHora" >= ${t1}::timestamp)::float8 AS atual,
             AVG(r."valor") FILTER (WHERE r."dataHora" <  ${t1}::timestamp)::float8 AS anterior
      FROM "readings" r
      JOIN "sensors" s ON s."id" = r."sensorId"
      WHERE r."dataHora" >= ${t2}::timestamp
      GROUP BY 1`);
    const out: Partial<Record<SensorTipo, number | null>> = {};
    for (const r of rows) {
      out[r.tipo] = r.atual != null && r.anterior ? round1(((r.atual - r.anterior) / Math.abs(r.anterior)) * 100) : null;
    }
    return out;
  }
}
