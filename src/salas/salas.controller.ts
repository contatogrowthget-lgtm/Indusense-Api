import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Perfil } from '@prisma/client';
import { Roles } from '../common/decorators';
import { RangeQueryDto } from '../readings/dto/readings.dto';
import { CreateSalaDto, ListSalasDto, UpdateSalaDto } from './dto/salas.dto';
import { SalasService } from './salas.service';

@ApiTags('salas')
@ApiBearerAuth()
@Controller('salas')
export class SalasController {
  constructor(private salas: SalasService) {}

  @Get()
  @ApiOperation({ summary: 'Lista salas (= "dispositivos" do Next.js) com status geral e totais' })
  findAll(@Query() q: ListSalasDto) { return this.salas.findAll(q); }

  // precisa vir antes de :id
  @Get('nfc/:tagId')
  @ApiOperation({ summary: 'Resolve a sala a partir da tag NFC da porta (Flutter)' })
  findByNfc(@Param('tagId') tagId: string) { return this.salas.findByNfc(tagId); }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha sala (UUID ou código IND-001) com seus sensores' })
  findOne(@Param('id') id: string) { return this.salas.findOne(id); }

  @Get(':id/sensors')
  @ApiOperation({ summary: 'Sensores da sala' })
  sensors(@Param('id') id: string) { return this.salas.sensorsOf(id); }

  @Get(':id/monitoramento')
  @ApiOperation({ summary: 'Tudo da tela monitoramento/[id]: métricas, risco, câmeras, EPI, alertas e eventos' })
  monitoramento(@Param('id') id: string) { return this.salas.monitoramento(id); }

  @Get(':id/historico')
  @ApiOperation({ summary: 'Série histórica agregada da sala (range: 6h, 24h, 7d, 30d)' })
  historico(@Param('id') id: string, @Query() q: RangeQueryDto) { return this.salas.historico(id, q.range); }

  @Get(':id/cameras')
  @ApiOperation({ summary: 'Câmeras da sala (pessoas detectadas e conformidade de EPI)' })
  cameras(@Param('id') id: string) { return this.salas.camerasOf(id); }

  @Post()
  @Roles(Perfil.ADMIN)
  @ApiOperation({ summary: 'Cadastra sala/dispositivo (ADMIN)' })
  create(@Body() dto: CreateSalaDto) { return this.salas.create(dto); }

  @Patch(':id')
  @Roles(Perfil.ADMIN)
  @ApiOperation({ summary: 'Edita sala (ADMIN)' })
  update(@Param('id') id: string, @Body() dto: UpdateSalaDto) { return this.salas.update(id, dto); }

  @Delete(':id')
  @Roles(Perfil.ADMIN)
  @ApiOperation({ summary: 'Remove sala e seus sensores (ADMIN)' })
  remove(@Param('id') id: string) { return this.salas.remove(id); }
}
