import { PartialType } from '@nestjs/swagger';
import { Perfil } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength,
} from 'class-validator';
import { normalizePerfil } from '../../common/util';

const email = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
const perfil = ({ value }: { value: unknown }) => normalizePerfil(value) ?? value;

export class CreateUserDto {
  @IsString() @IsNotEmpty({ message: 'Informe o nome.' }) nome: string;

  @Transform(email)
  @IsEmail({}, { message: 'E-mail inválido.' })
  email: string;

  /** Aceita ADMIN | OPERADOR | VISUALIZADOR ou "Administrador" | "Operador" | "Visualizador". Padrão: OPERADOR. */
  @IsOptional()
  @Transform(perfil)
  @IsEnum(Perfil, { message: 'Perfil inválido. Use ADMIN, OPERADOR ou VISUALIZADOR.' })
  perfil?: Perfil;

  /** Se omitida, o servidor gera uma senha temporária e devolve em `senhaTemporaria`. */
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'A senha deve ter pelo menos 6 caracteres.' })
  senha?: string;

  @IsOptional() @IsString() cargo?: string;
  @IsOptional() @IsString() empresa?: string;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional() @IsBoolean() ativo?: boolean;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() @IsNotEmpty() nome?: string;

  /** Foto: data URL (data:image/jpeg;base64,...) de até ~300 KB. "" remove a foto. */
  @IsOptional()
  @IsString()
  @MaxLength(400_000, { message: 'Foto muito grande. Use uma imagem menor.' })
  @Matches(/^$|^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/, { message: 'Formato de foto inválido. Use PNG, JPG ou WEBP.' })
  avatar?: string;

  @IsOptional()
  @Transform(email)
  @IsEmail({}, { message: 'E-mail inválido.' })
  email?: string;

  @IsOptional() @IsString() cargo?: string;
  @IsOptional() @IsString() empresa?: string;
}

export class ChangePasswordDto {
  @IsString() senhaAtual: string;

  @IsString()
  @MinLength(6, { message: 'A nova senha deve ter pelo menos 6 caracteres.' })
  novaSenha: string;
}
