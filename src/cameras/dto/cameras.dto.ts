import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';
import { toBool } from '../../common/util';

export class CreateCameraDto {
  /** UUID ou código da sala (ex.: IND-001). */
  @IsString() @IsNotEmpty({ message: 'Informe a sala da câmera.' }) salaId: string;

  @IsString() @IsNotEmpty({ message: 'Informe o nome da câmera.' }) nome: string;

  /** Código usado pelo sistema de câmera (ex.: CAM-07). Se omitido, é gerado. */
  @IsOptional() @IsString() @MaxLength(40) codigo?: string;

  /** Endereço do vídeo ao vivo, ex.: http://192.168.1.50:8000/video_feed */
  @IsOptional() @IsString() @MaxLength(500) streamUrl?: string;
}

export class UpdateCameraDto extends PartialType(CreateCameraDto) {
  @IsOptional() @IsBoolean() online?: boolean;
}

export class ListCamerasDto {
  /** UUID ou código da sala */
  @IsOptional() @IsString() salaId?: string;
}

/** Enviado pelo sistema de câmera a cada poucos segundos. */
export class CameraStatusDto {
  @IsBoolean() online: boolean;

  @Type(() => Number) @IsInt() @Min(0) @Max(1000) pessoas: number;

  /** % de pessoas conformes (0 a 100). */
  @Type(() => Number) @IsInt() @Min(0) @Max(100) epiConformidade: number;

  /** Ex.: "1 pessoa sem capacete". null = nenhuma ocorrência. */
  @IsOptional() @IsString() @MaxLength(200) ocorrencia?: string | null;

  @IsOptional() @IsString() @MaxLength(500) streamUrl?: string;

  /** Se a câmera ainda não existir, ela é criada nesta sala (UUID ou código). */
  @IsOptional() @IsString() salaId?: string;

  /** Nome usado na criação automática. */
  @IsOptional() @IsString() @MaxLength(120) nome?: string;
}

export class CreateOcorrenciaDto {
  /** Número da pessoa na cena. */
  @Type(() => Number) @IsInt() @Min(0) pessoa: number;

  /** capacete, oculos, colete, luvas, botas, mascara, protetor_auricular */
  @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) faltando: string[];

  /** ISO 8601. Padrão: agora. */
  @IsOptional() @IsDateString() dataHora?: string;

  /** Id da ocorrência no sistema de câmera. Reenvio com o mesmo id não duplica. */
  @IsOptional() @IsString() @MaxLength(80) origemId?: string;

  /** Foto JPEG em base64 (com ou sem o prefixo data:image/jpeg;base64,). */
  @IsOptional() @IsString() @MaxLength(6_000_000) foto?: string;
}

export class ListOcorrenciasDto {
  /** UUID ou código da sala */
  @IsOptional() @IsString() salaId?: string;

  /** UUID ou código da câmera */
  @IsOptional() @IsString() cameraId?: string;

  @IsOptional() @Transform(toBool) @IsBoolean() resolvido?: boolean;

  @IsOptional() @Transform(toBool) @IsBoolean() lido?: boolean;

  @IsOptional() @IsDateString() inicio?: string;
  @IsOptional() @IsDateString() fim?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) limit?: number;
}
