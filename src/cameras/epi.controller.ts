import { Controller, Get, Header, Param, ParseUUIDPipe, Patch, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Perfil } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { CamerasService } from './cameras.service';
import { ListOcorrenciasDto } from './dto/cameras.dto';

@ApiTags('epi')
@ApiBearerAuth()
@Controller('epi/ocorrencias')
export class EpiController {
  constructor(private cameras: CamerasService) {}

  @Get()
  @ApiOperation({ summary: 'Ocorrências de EPI (filtros: salaId, cameraId, resolvido, lido, inicio, fim, limit)' })
  findAll(@Query() q: ListOcorrenciasDto) { return this.cameras.listOcorrencias(q); }

  @Get('resumo')
  @ApiOperation({ summary: 'Contadores de EPI: hoje, abertas, não lidas, câmeras online, conformidade média' })
  resumo() { return this.cameras.resumo(); }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marca todas as ocorrências como lidas' })
  readAll() { return this.cameras.marcarTodasLidas(); }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha uma ocorrência' })
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.cameras.findOcorrencia(id); }

  @Get(':id/foto')
  @Header('Content-Type', 'image/jpeg')
  @Header('Cache-Control', 'private, max-age=86400')
  @ApiOperation({ summary: 'Foto JPEG da ocorrência (exige o mesmo Bearer token)' })
  async foto(@Param('id', ParseUUIDPipe) id: string) {
    return new StreamableFile(await this.cameras.foto(id));
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marca ocorrência como lida' })
  read(@Param('id', ParseUUIDPipe) id: string) { return this.cameras.marcarLida(id); }

  @Patch(':id/resolve')
  @Roles(Perfil.OPERADOR)
  @ApiOperation({ summary: 'Marca ocorrência como resolvida (ADMIN/OPERADOR)' })
  resolve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.cameras.resolver(id, u); }
}
