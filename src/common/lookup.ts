import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { whereIdOrCode } from './util';

export async function findSalaOr404(prisma: PrismaService, idOrCode: string) {
  const sala = await prisma.sala.findFirst({
    where: whereIdOrCode(idOrCode),
    include: { sensores: { where: { ativo: true }, orderBy: { nome: 'asc' } } },
  });
  if (!sala) throw new NotFoundException('Sala não encontrada.');
  return sala;
}

export async function findSensorOr404(prisma: PrismaService, idOrCode: string) {
  const sensor = await prisma.sensor.findFirst({ where: whereIdOrCode(idOrCode), include: { sala: true } });
  if (!sensor) throw new NotFoundException('Sensor não encontrado.');
  return sensor;
}
