import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SensorStatus } from '@prisma/client';
import { findSalaOr404, findSensorOr404 } from '../common/lookup';
import { serializeSensor } from '../common/serializers';
import { computeStatus, isOnline, offlineMinutes } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { ReadingsService } from '../readings/readings.service';
import { SensorReadingsQueryDto } from '../readings/dto/readings.dto';
import { CreateSensorDto, ListSensorsDto, UpdateSensorDto } from './dto/sensors.dto';

@Injectable()
export class SensorsService {
  private readonly logger = new Logger(SensorsService.name);

  constructor(private prisma: PrismaService, private readings: ReadingsService) {}

  async findAll(q: ListSensorsDto) {
    let salaId: string | undefined;
    if (q.salaId) salaId = (await findSalaOr404(this.prisma, q.salaId)).id;
    const sensores = await this.prisma.sensor.findMany({
      where: {
        ativo: true,
        salaId,
        tipo: q.tipo,
        OR: q.busca
          ? [{ nome: { contains: q.busca, mode: 'insensitive' } }, { codigo: { contains: q.busca, mode: 'insensitive' } }]
          : undefined,
      },
      include: { sala: true },
      orderBy: [{ sala: { codigo: 'asc' } }, { nome: 'asc' }],
    });
    const lista = q.online === undefined ? sensores : sensores.filter((s) => isOnline(s) === q.online);
    return lista.map(serializeSensor);
  }

  async findOne(id: string) {
    return serializeSensor(await findSensorOr404(this.prisma, id));
  }

  async readingsOf(id: string, q: SensorReadingsQueryDto) {
    const sensor = await findSensorOr404(this.prisma, id);
    return this.readings.findAll({ ...q, sensorId: sensor.id });
  }

  async create(dto: CreateSensorDto) {
    this.validaLimites(dto.limiteMin, dto.limiteMax);
    const sala = await findSalaOr404(this.prisma, dto.salaId);
    const criado = await this.prisma.sensor.create({
      data: {
        nome: dto.nome.trim(),
        tipo: dto.tipo,
        codigo: dto.codigo?.trim() || null,
        salaId: sala.id,
        limiteMin: dto.limiteMin,
        limiteMax: dto.limiteMax,
      },
      include: { sala: true },
    });
    return serializeSensor(criado);
  }

  async update(id: string, dto: UpdateSensorDto) {
    const atual = await findSensorOr404(this.prisma, id);
    const min = dto.limiteMin ?? atual.limiteMin;
    const max = dto.limiteMax ?? atual.limiteMax;
    this.validaLimites(min, max);

    const { salaId, ...resto } = dto;
    const sala = salaId ? await findSalaOr404(this.prisma, salaId) : null;
    const limitesMudaram = dto.limiteMin !== undefined || dto.limiteMax !== undefined;

    const atualizado = await this.prisma.sensor.update({
      where: { id: atual.id },
      data: {
        ...resto,
        ...(sala ? { salaId: sala.id } : {}),
        ...(limitesMudaram && atual.ultimaLeitura ? { status: computeStatus(atual.valorAtual, min, max) } : {}),
      },
      include: { sala: true },
    });
    return serializeSensor(atualizado);
  }

  async remove(id: string) {
    const s = await findSensorOr404(this.prisma, id);
    await this.prisma.sensor.delete({ where: { id: s.id } });
    return { message: 'Sensor removido.' };
  }

  private validaLimites(min: number, max: number) {
    if (min > max) throw new BadRequestException('O limite mínimo não pode ser maior que o máximo.');
  }

  /** Marca sensores sem comunicação como offline e gera o alerta correspondente. */
  @Cron(CronExpression.EVERY_MINUTE)
  async marcarOffline() {
    try {
      const corte = new Date(Date.now() - offlineMinutes() * 60_000);
      const parados = await this.prisma.sensor.findMany({
        where: { ativo: true, ultimaLeitura: { lt: corte }, status: { not: SensorStatus.offline } },
      });
      for (const s of parados) {
        await this.prisma.$transaction([
          this.prisma.sensor.update({ where: { id: s.id }, data: { status: SensorStatus.offline } }),
          this.prisma.alert.create({
            data: {
              sensorId: s.id,
              tipo: s.tipo,
              valorMedido: s.valorAtual,
              limite: s.limiteMax,
              severidade: SensorStatus.offline,
              mensagem: `${s.nome} sem comunicação há mais de ${offlineMinutes()} minutos`,
            },
          }),
        ]);
      }
      if (parados.length) this.logger.warn(`${parados.length} sensor(es) marcados como offline.`);
    } catch (e) {
      this.logger.error('Falha ao verificar sensores offline', (e as Error).stack);
    }
  }
}
