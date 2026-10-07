import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SensorStatus } from '@prisma/client';
import { AuthUser } from '../common/decorators';
import { serializeAlert } from '../common/serializers';
import { whereIdOrCode } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { ListAlertsDto } from './dto/alerts.dto';

const INCLUDE = { sensor: { include: { sala: true } } } satisfies Prisma.AlertInclude;

@Injectable()
export class AlertsService {
  constructor(private prisma: PrismaService) {}

  async findAll(q: ListAlertsDto) {
    const sensor = q.sensorId ? await this.prisma.sensor.findFirst({ where: whereIdOrCode(q.sensorId), select: { id: true } }) : null;
    const sala = q.salaId ? await this.prisma.sala.findFirst({ where: whereIdOrCode(q.salaId), select: { id: true } }) : null;
    if ((q.sensorId && !sensor) || (q.salaId && !sala)) return [];

    const alertas = await this.prisma.alert.findMany({
      where: {
        lido: q.lido,
        resolvido: q.resolvido,
        severidade: q.severidade,
        tipo: q.tipo,
        sensorId: sensor?.id,
        sensor: sala ? { salaId: sala.id } : undefined,
      },
      include: INCLUDE,
      orderBy: { dataHora: 'desc' },
      take: q.limit ?? 200,
    });
    return alertas.map(serializeAlert);
  }

  async resumo() {
    const [total, naoLidos, ativos, criticos, atencao] = await Promise.all([
      this.prisma.alert.count(),
      this.prisma.alert.count({ where: { lido: false } }),
      this.prisma.alert.count({ where: { resolvido: false } }),
      this.prisma.alert.count({ where: { resolvido: false, severidade: SensorStatus.critico } }),
      this.prisma.alert.count({ where: { resolvido: false, severidade: SensorStatus.atencao } }),
    ]);
    return { total, naoLidos, ativos, criticos, atencao };
  }

  async findOne(id: string) {
    const a = await this.prisma.alert.findUnique({ where: { id }, include: INCLUDE });
    if (!a) throw new NotFoundException('Alerta não encontrado.');
    return serializeAlert(a);
  }

  async marcarLido(id: string) {
    await this.findOne(id);
    const a = await this.prisma.alert.update({ where: { id }, data: { lido: true, lidoEm: new Date() }, include: INCLUDE });
    return serializeAlert(a);
  }

  async marcarTodosLidos() {
    const r = await this.prisma.alert.updateMany({ where: { lido: false }, data: { lido: true, lidoEm: new Date() } });
    return { atualizados: r.count };
  }

  async resolver(id: string, user: AuthUser) {
    await this.findOne(id);
    const a = await this.prisma.alert.update({
      where: { id },
      data: { resolvido: true, resolvidoEm: new Date(), resolvidoPorId: user.id, lido: true, lidoEm: new Date() },
      include: INCLUDE,
    });
    return serializeAlert(a);
  }
}
