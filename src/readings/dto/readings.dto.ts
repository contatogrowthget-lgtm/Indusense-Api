import { SensorTipo } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { normalizeTipo } from '../../common/util';

const tipo = ({ value }: { value: unknown }) => normalizeTipo(value) ?? value;

export class ReadingsQueryDto {
  /** UUID ou código do sensor (ex.: DHT-01). */
  @IsOptional() @IsString() sensorId?: string;

  /** UUID ou código da sala (ex.: IND-001). */
  @IsOptional() @IsString() salaId?: string;

  /** temperatura | umidade | qualidade_ar (ou qualidadeAr) | gas */
  @IsOptional()
  @Transform(tipo)
  @IsEnum(SensorTipo, { message: 'Tipo inválido. Use temperatura, umidade, qualidade_ar ou gas.' })
  tipo?: SensorTipo;

  @IsOptional() @IsDateString({}, { message: 'Data inicial inválida (use ISO 8601).' }) inicio?: string;
  @IsOptional() @IsDateString({}, { message: 'Data final inválida (use ISO 8601).' }) fim?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5000) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

export class SensorReadingsQueryDto {
  @IsOptional()
  @Transform(tipo)
  @IsEnum(SensorTipo)
  tipo?: SensorTipo;

  @IsOptional() @IsDateString() inicio?: string;
  @IsOptional() @IsDateString() fim?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5000) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

export class CreateReadingDto {
  /** UUID ou código do sensor. */
  @IsString() sensorId: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'O valor da leitura deve ser numérico.' })
  valor: number;

  /** ISO 8601. Padrão: agora. */
  @IsOptional() @IsDateString() dataHora?: string;
}

export const RANGES = ['6h', '24h', '7d', '30d'] as const;
export type Range = (typeof RANGES)[number];

export class RangeQueryDto {
  @IsOptional()
  @IsIn(RANGES as unknown as string[], { message: 'range deve ser 6h, 24h, 7d ou 30d.' })
  range?: Range;
}
