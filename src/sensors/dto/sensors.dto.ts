import { PartialType } from '@nestjs/swagger';
import { SensorTipo } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { normalizeTipo, toBool } from '../../common/util';

const tipo = ({ value }: { value: unknown }) => normalizeTipo(value) ?? value;

export class CreateSensorDto {
  @IsString() @IsNotEmpty({ message: 'Informe o nome do sensor.' }) nome: string;

  @Transform(tipo)
  @IsEnum(SensorTipo, { message: 'Tipo inválido. Use temperatura, umidade, qualidade_ar ou gas.' })
  tipo: SensorTipo;

  /** UUID ou código da sala (ex.: IND-001). */
  @IsString() salaId: string;

  @Type(() => Number) @IsNumber() limiteMin: number;
  @Type(() => Number) @IsNumber() limiteMax: number;

  /** Código do hardware (ex.: DHT-01). Opcional, único. */
  @IsOptional() @IsString() codigo?: string;
}

export class UpdateSensorDto extends PartialType(CreateSensorDto) {
  @IsOptional() @IsBoolean() ativo?: boolean;
}

export class ListSensorsDto {
  @IsOptional() @IsString() salaId?: string;

  @IsOptional() @Transform(tipo) @IsEnum(SensorTipo) tipo?: SensorTipo;

  @IsOptional() @IsString() busca?: string;

  @IsOptional() @Transform(toBool) @IsBoolean() online?: boolean;
}
