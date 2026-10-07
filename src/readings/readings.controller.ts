import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Perfil } from '@prisma/client';
import { AllowDeviceKey, Roles } from '../common/decorators';
import { CreateReadingDto, ReadingsQueryDto } from './dto/readings.dto';
import { ReadingsService } from './readings.service';

@ApiTags('readings')
@ApiBearerAuth()
@Controller('readings')
export class ReadingsController {
  constructor(private readings: ReadingsService) {}

  @Get()
  @ApiOperation({ summary: 'Histórico de leituras (filtros: sensorId, salaId, tipo, inicio, fim, limit, offset)' })
  findAll(@Query() q: ReadingsQueryDto) { return this.readings.findAll(q); }

  @Post()
  @HttpCode(201)
  @AllowDeviceKey()
  @Roles(Perfil.OPERADOR)
  @ApiHeader({ name: 'x-api-key', required: false, description: 'Chave dos dispositivos (DEVICE_API_KEY) — alternativa ao JWT' })
  @ApiOperation({ summary: 'Recebe leitura de um sensor (ESP32). Atualiza valor atual/status e gera alerta se necessário' })
  ingest(@Body() dto: CreateReadingDto) { return this.readings.ingest(dto); }
}
