import { SensorStatus, SensorTipo } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { normalizeTipo, toBool } from '../../common/util';

export class ListAlertsDto {
  /** true = lidos, false = não lidos */
  @IsOptional() @Transform(toBool) @IsBoolean() lido?: boolean;

  /** true = resolvidos, false = não resolvidos (aba do Next.js) */
  @IsOptional() @Transform(toBool) @IsBoolean() resolvido?: boolean;

  @IsOptional() @IsEnum(SensorStatus, { message: 'Severidade inválida. Use atencao, critico ou offline.' }) severidade?: SensorStatus;

  @IsOptional() @Transform(({ value }) => normalizeTipo(value) ?? value) @IsEnum(SensorTipo) tipo?: SensorTipo;

  /** UUID ou código do sensor */
  @IsOptional() @IsString() sensorId?: string;

  /** UUID ou código da sala */
  @IsOptional() @IsString() salaId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) limit?: number;
}
