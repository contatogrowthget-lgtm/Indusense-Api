import { Injectable, NotFoundException } from '@nestjs/common';
import { SensorStatus } from '@prisma/client';
import { findSalaOr404 } from '../common/lookup';
import {
  effectiveStatus, resumoPorTipo, serializeAlert, serializeCamera, serializeOcorrencia, serializeSala, serializeSensor,
  statusGeral, toDispositivoNext,
} from '../common/serializers';
import { cameraOnline, isOnline, juntarEpis, relativeTime, TIPO_LABEL, TIPO_UNIDADE } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { Range } from '../readings/dto/readings.dto';
import { ReadingsService } from '../readings/readings.service';
import { CreateSalaDto, ListSalasDto, UpdateSalaDto } from './dto/salas.dto';

const COM_SENSORES = { sensores: { where: { ativo: true }, orderBy: { nome: 'asc' as const } } };

@Injectable()
export class SalasService {
  constructor(private prisma: PrismaService, private readings: ReadingsService) {}

  async findAll(q: ListSalasDto) {
    const salas = await this.prisma.sala.findMany({
      where: {
        ativo: true,
        setor: q.setor,
        OR: q.busca
          ? [{ nome: { contains: q.busca, mode: 'insensitive' } }, { codigo: { contains: q.busca, mode: 'insensitive' } }]
          : undefined,
      },
      include: COM_SENSORES,
      orderBy: { codigo: 'asc' },
    });
    return salas.map((s) => serializeSala(s));
  }

  async findOne(id: string) {
    const sala = await findSalaOr404(this.prisma, id);
    return { ...serializeSala(sala), sensores: sala.sensores.map((s) => serializeSensor({ ...s, sala })) };
  }

  async findByNfc(tagId: string) {
    const sala = await this.prisma.sala.findFirst({
      where: { nfcTagId: { equals: tagId, mode: 'insensitive' }, ativo: true },
      include: COM_SENSORES,
    });
    if (!sala) throw new NotFoundException('Nenhuma sala cadastrada para esta tag NFC.');
    return serializeSala(sala);
  }

  async sensorsOf(id: string) {
    const sala = await findSalaOr404(this.prisma, id);
    return sala.sensores.map((s) => serializeSensor({ ...s, sala }));
  }

  async camerasOf(id: string) {
    const sala = await findSalaOr404(this.prisma, id);
    const cams = await this.prisma.camera.findMany({ where: { salaId: sala.id }, orderBy: { nome: 'asc' } });
    return cams.map((c) => serializeCamera({ ...c, sala }));
  }

  async historico(id: string, range: Range = '24h') {
    const sala = await findSalaOr404(this.prisma, id);
    return this.readings.series({ salaId: sala.id, range });
  }

  /** Tela monitoramento/[id] do Next.js. */
  async monitoramento(id: string) {
    const sala = await findSalaOr404(this.prisma, id);
    const desde24h = new Date(Date.now() - 24 * 3600e3);
    const [cameras, alertas, ocorrenciasEpi] = await Promise.all([
      this.prisma.camera.findMany({ where: { salaId: sala.id }, orderBy: { nome: 'asc' } }),
      this.prisma.alert.findMany({
        where: { sensor: { salaId: sala.id }, dataHora: { gte: new Date(Date.now() - 24 * 3600e3) } },
        include: { sensor: { include: { sala: true } } },
        orderBy: { dataHora: 'desc' },
        take: 20,
      }),
      this.prisma.epiOcorrencia.findMany({
        where: { camera: { salaId: sala.id }, dataHora: { gte: desde24h } },
        include: { camera: { include: { sala: true } } },
        orderBy: { dataHora: 'desc' },
        take: 20,
      }),
    ]);

    const online = sala.sensores.some(isOnline);
    const status = statusGeral(sala.sensores);
    const risco = !online ? 'Indisponível' : status === SensorStatus.critico ? 'Alto' : status === SensorStatus.atencao ? 'Médio' : 'Baixo';
    const camerasOn = cameras.filter(cameraOnline);
    const pessoas = camerasOn.reduce((a, c) => a + c.pessoas, 0);
    const epi = camerasOn.length ? Math.round(camerasOn.reduce((a, c) => a + c.epiConformidade, 0) / camerasOn.length) : null;
    const metricas = resumoPorTipo(sala.sensores, false);
    const dispositivo = { ...toDispositivoNext(sala), people: pessoas, risk: risco };

    const ativos = alertas.filter((a) => !a.resolvido);
    return {
      sala: serializeSala(sala),
      dispositivo, // mesmo formato de `rooms[id]` no mock do Next.js
      status: online ? 'online' : 'offline',
      risco,
      riscoDescricao:
        risco === 'Alto' ? 'Atenção operacional necessária' :
        risco === 'Médio' ? 'Parâmetros em atenção' :
        risco === 'Indisponível' ? 'Área sem comunicação' : 'Ambiente dentro dos parâmetros',
      metricas,
      pessoasDetectadas: pessoas,
      epiConformidade: epi,
      cameras: cameras.map((c) => serializeCamera({ ...c, sala })),
      ocorrenciasEpi: ocorrenciasEpi.map(serializeOcorrencia),
      ocorrenciasEpiAbertas: ocorrenciasEpi.filter((o) => !o.resolvido).length,
      sensores: sala.sensores.map((s) => serializeSensor({ ...s, sala })),
      alertasAtivos: ativos.map(serializeAlert),
      eventosRecentes: [
        ...alertas.map((a) => ({
          id: a.id,
          origem: 'sensor',
          severidade: a.severidade as string,
          titulo:
            a.severidade === SensorStatus.offline
              ? `${a.sensor.nome} sem comunicação`
              : `${TIPO_LABEL[a.tipo]} ${a.valorMedido > a.limite ? 'acima' : 'abaixo'} do limite`,
          detalhe: `${a.sensor.codigo ?? a.sensor.nome} • ${a.valorMedido} ${TIPO_UNIDADE[a.tipo]} • limite ${a.limite} ${TIPO_UNIDADE[a.tipo]}`,
          data: a.dataHora,
        })),
        ...ocorrenciasEpi.map((o) => ({
          id: o.id,
          origem: 'epi',
          severidade: 'atencao',
          titulo: o.faltando.length ? `Pessoa sem ${juntarEpis(o.faltando)}` : 'EPI incompleto',
          detalhe: `${o.camera.codigo ?? o.camera.nome} • Pessoa ${o.pessoa}`,
          data: o.dataHora,
        })),
      ]
        .sort((x, y) => y.data.getTime() - x.data.getTime())
        .slice(0, 10)
        .map(({ data, ...e }) => ({ ...e, dataHora: data.toISOString(), tempoRelativo: relativeTime(data) })),
    };
  }

  async create(dto: CreateSalaDto) {
    const codigo = dto.codigo?.trim() || (await this.proximoCodigo());
    const setor = dto.setor?.trim() || dto.localizacao?.split('•')[0]?.trim() || 'Geral';
    const sala = await this.prisma.sala.create({
      data: {
        codigo,
        nome: dto.nome.trim(),
        setor,
        localizacao: dto.localizacao?.trim() || null,
        nfcTagId: dto.nfcTagId?.trim() || `NFC-${codigo}`,
        ...(dto.dispositivoModelo ? { dispositivoModelo: dto.dispositivoModelo } : {}),
      },
      include: COM_SENSORES,
    });
    return serializeSala(sala);
  }

  async update(id: string, dto: UpdateSalaDto) {
    const sala = await findSalaOr404(this.prisma, id);
    const atualizada = await this.prisma.sala.update({
      where: { id: sala.id },
      data: { ...dto, nome: dto.nome?.trim() },
      include: COM_SENSORES,
    });
    return serializeSala(atualizada);
  }

  async remove(id: string) {
    const sala = await findSalaOr404(this.prisma, id);
    await this.prisma.sala.delete({ where: { id: sala.id } });
    return { message: 'Sala removida.' };
  }

  private async proximoCodigo() {
    let n = (await this.prisma.sala.count()) + 1;
    // evita colisão caso alguma sala tenha sido excluída
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const codigo = `IND-${String(n).padStart(3, '0')}`;
      if (!(await this.prisma.sala.findUnique({ where: { codigo } }))) return codigo;
      n++;
    }
  }
}
