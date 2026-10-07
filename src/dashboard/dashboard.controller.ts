import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RangeQueryDto } from '../readings/dto/readings.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Resumo da tela Dashboard do Next.js (cards, dispositivos, alertas, tendência)' })
  summary(@Query() q: RangeQueryDto) { return this.dashboard.summary(q.range); }
}
