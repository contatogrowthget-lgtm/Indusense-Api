import { Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Perfil } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { AlertsService } from './alerts.service';
import { ListAlertsDto } from './dto/alerts.dto';

@ApiTags('alerts')
@ApiBearerAuth()
@Controller('alerts')
export class AlertsController {
  constructor(private alerts: AlertsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista alertas (mais recentes primeiro). Filtros: lido, resolvido, severidade, tipo, sensorId, salaId' })
  findAll(@Query() q: ListAlertsDto) { return this.alerts.findAll(q); }

  @Get('resumo')
  @ApiOperation({ summary: 'Contadores: total, não lidos, ativos, críticos e em atenção' })
  resumo() { return this.alerts.resumo(); }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marca todos os alertas como lidos' })
  readAll() { return this.alerts.marcarTodosLidos(); }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um alerta' })
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.alerts.findOne(id); }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marca alerta como lido (Flutter)' })
  read(@Param('id', ParseUUIDPipe) id: string) { return this.alerts.marcarLido(id); }

  @Patch(':id/resolve')
  @Roles(Perfil.OPERADOR)
  @ApiOperation({ summary: 'Marca alerta como resolvido — botão "Resolver" do Next.js (ADMIN/OPERADOR)' })
  resolve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.alerts.resolver(id, u); }
}
