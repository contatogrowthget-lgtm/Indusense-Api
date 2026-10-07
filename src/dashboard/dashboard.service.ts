import { Injectable } from '@nestjs/common';
import { SensorStatus, SensorTipo } from '@prisma/client';
import { resumoPorTipo, serializeSala, toDispositivoNext } from '../common/serializers';
import { isOnline } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { Range } from '../readings/dto/readings.dto';
import { ReadingsService } from '../readings/readings.service';
import { CamerasService } from '../cameras/cameras.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService, private readings: ReadingsService, private cameras: CamerasService) {}

  /** Visão geral do Next.js: métricas, dispositivos, alertas e tendência. */
  async summary(range: Range = '24h') {
    const [salas, alertas, variacao, tendencia, epi] = await Promise.all([
      this.prisma.sala.findMany({
        where: { ativo: true },
        include: { sensores: { where: { ativo: true }, orderBy: { nome: 'asc' } } },
        orderBy: { codigo: 'asc' },
      }),
      this.prisma.alert.groupBy({ by: ['severidade', 'lido', 'resolvido'], _count: true }),
      this.readings.variacaoPorTipo(),
      this.readings.series({ range }),
      this.cameras.resumo(),
    ]);

    const sensores = salas.flatMap((s) => s.sensores);
    const porTipo = resumoPorTipo(sensores, true);
    const metricas = Object.fromEntries(
      Object.values(SensorTipo).map((t) => [t, porTipo[t] ? { ...porTipo[t], variacaoPercentual: variacao[t] ?? null } : null]),
    );

    const soma = (f: (a: (typeof alertas)[number]) => boolean) => alertas.filter(f).reduce((n, a) => n + a._count, 0);
    const online = salas.filter((s) => s.sensores.some(isOnline)).length;

    return {
      atualizadoEm: new Date().toISOString(),
      metricas,
      dispositivos: {
        total: salas.length,
        online,
        offline: salas.length - online,
        lista: salas.map(toDispositivoNext), // mesmo formato de `devices` no Next.js
      },
      alertas: {
        ativos: soma((a) => !a.resolvido),
        criticos: soma((a) => !a.resolvido && a.severidade === SensorStatus.critico),
        atencao: soma((a) => !a.resolvido && a.severidade === SensorStatus.atencao),
        naoLidos: soma((a) => !a.lido),
      },
      epi, // ocorrências e câmeras do sistema de visão
      salas: salas.map((s) => serializeSala(s)),
      tendencia,
    };
  }
}
