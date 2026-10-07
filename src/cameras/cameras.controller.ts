import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Perfil } from '@prisma/client';
import { AllowDeviceKey, Roles } from '../common/decorators';
import { CamerasService } from './cameras.service';
import {
  CameraStatusDto, CreateCameraDto, CreateOcorrenciaDto, ListCamerasDto, UpdateCameraDto,
} from './dto/cameras.dto';

@ApiTags('cameras')
@ApiBearerAuth()
@Controller('cameras')
export class CamerasController {
  constructor(private cameras: CamerasService) {}

  @Get()
  @ApiOperation({ summary: 'Lista câmeras (filtro opcional: salaId)' })
  findAll(@Query() q: ListCamerasDto) { return this.cameras.findAll(q); }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha câmera (UUID ou código, ex.: CAM-01)' })
  findOne(@Param('id') id: string) { return this.cameras.findOne(id); }

  @Post()
  @Roles(Perfil.ADMIN)
  @ApiOperation({ summary: 'Cadastra câmera em uma sala (ADMIN)' })
  create(@Body() dto: CreateCameraDto) { return this.cameras.create(dto); }

  @Patch(':id')
  @Roles(Perfil.ADMIN)
  @ApiOperation({ summary: 'Edita câmera (ADMIN)' })
  update(@Param('id') id: string, @Body() dto: UpdateCameraDto) { return this.cameras.update(id, dto); }

  @Delete(':id')
  @Roles(Perfil.ADMIN)
  @ApiOperation({ summary: 'Remove câmera e suas ocorrências (ADMIN)' })
  remove(@Param('id') id: string) { return this.cameras.remove(id); }

  @Post(':id/status')
  @HttpCode(200)
  @AllowDeviceKey()
  @Roles(Perfil.OPERADOR)
  @ApiHeader({ name: 'x-api-key', required: false, description: 'DEVICE_API_KEY (sistema de câmera)' })
  @ApiOperation({ summary: 'Sistema de câmera informa pessoas, conformidade e ocorrência atual' })
  status(@Param('id') id: string, @Body() dto: CameraStatusDto) { return this.cameras.reportStatus(id, dto); }

  @Post(':id/ocorrencias')
  @HttpCode(201)
  @AllowDeviceKey()
  @Roles(Perfil.OPERADOR)
  @ApiHeader({ name: 'x-api-key', required: false, description: 'DEVICE_API_KEY (sistema de câmera)' })
  @ApiOperation({ summary: 'Sistema de câmera registra pessoa sem EPI (com foto opcional)' })
  ocorrencia(@Param('id') id: string, @Body() dto: CreateOcorrenciaDto) { return this.cameras.createOcorrencia(id, dto); }
}
