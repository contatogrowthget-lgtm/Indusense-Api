import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSalaDto {
  @IsString() @IsNotEmpty({ message: 'Informe o nome da sala.' }) nome: string;

  /** Ex.: "Galpão 1". Se omitido, é derivado de `localizacao` (texto antes do "•") ou fica "Geral". */
  @IsOptional() @IsString() setor?: string;

  /** Texto livre exibido no Next.js, ex.: "Setor A • Galpão 01". */
  @IsOptional() @IsString() localizacao?: string;

  /** Id gravado na tag NFC da porta. Se omitido, vira NFC-<codigo>. */
  @IsOptional() @IsString() nfcTagId?: string;

  /** Código do dispositivo (IND-005). Se omitido, é gerado em sequência. */
  @IsOptional() @IsString() codigo?: string;

  @IsOptional() @IsString() dispositivoModelo?: string;
}

export class UpdateSalaDto extends PartialType(CreateSalaDto) {
  @IsOptional() @IsBoolean() ativo?: boolean;
}

export class ListSalasDto {
  @IsOptional() @IsString() setor?: string;
  @IsOptional() @IsString() busca?: string;
}
