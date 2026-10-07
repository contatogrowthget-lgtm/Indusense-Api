import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Perfil } from '@prisma/client';
import { Roles } from '../common/decorators';
import { SensorReadingsQueryDto } from '../readings/dto/readings.dto';
import { CreateSensorDto, ListSensorsDto, UpdateSensorDto } from './dto/sensors.dto';
import { SensorsService } from './sensors.service';

@ApiTags('sensors')
@ApiBearerAuth()
@Controller('sensors')
export class SensorsController {
  constructor(private sensors: SensorsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista sensores com valor atual e status (filtros opcionais: salaId, tipo, busca, online)' })
  findAll(@Query() q: ListSensorsDto) { return this.sensors.findAll(q); }

  @Get(':id/readings')
  @ApiOperation({ summary: 'Leituras de um sensor (id ou código)' })
  readings(@Param('id') id: string, @Query() q: SensorReadingsQueryDto) { return this.sensors.readingsOf(id, q); }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um sensor (id ou código, ex.: DHT-01)' })
  findOne(@Param('id') id: string) { return this.sensors.findOne(id); }

  @Post()
  @Roles(Perfil.ADMIN)
  @ApiOperation({ summary: 'Cadastra sensor (ADMIN)' })
  create(@Body() dto: CreateSensorDto) { return this.sensors.create(dto); }

  @Patch(':id')
  @Roles(Perfil.OPERADOR)
  @ApiOperation({ summary: 'Edita sensor e limites — "Configurar parâmetros" (ADMIN/OPERADOR)' })
  update(@Param('id') id: string, @Body() dto: UpdateSensorDto) { return this.sensors.update(id, dto); }

  @Delete(':id')
  @Roles(Perfil.ADMIN)
  @ApiOperation({ summary: 'Remove sensor (ADMIN)' })
  remove(@Param('id') id: string) { return this.sensors.remove(id); }
}
