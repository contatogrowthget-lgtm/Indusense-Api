import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

const normalizaEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class LoginDto {
  @Transform(normalizaEmail)
  @IsEmail({}, { message: 'E-mail inválido.' })
  email: string;

  /** Campo usado pelo Flutter. */
  @IsOptional()
  @IsString()
  senha?: string;

  /** Alias aceito para o painel Next.js. */
  @IsOptional()
  @IsString()
  password?: string;
}

export class RegisterDto {
  @IsString({ message: 'Informe o nome.' })
  @IsNotEmpty({ message: 'Informe o nome.' })
  nome: string;

  @Transform(normalizaEmail)
  @IsEmail({}, { message: 'E-mail inválido.' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'A senha deve ter pelo menos 6 caracteres.' })
  senha: string;

  @IsOptional() @IsString() empresa?: string;
  @IsOptional() @IsString() cargo?: string;
}

export class GoogleLoginDto {
  /** idToken devolvido pelo google_sign_in */
  @IsString() @IsNotEmpty({ message: 'Envie o idToken do Google.' }) idToken: string;
}

export class AppleLoginDto {
  /** identityToken devolvido pelo sign_in_with_apple */
  @IsString() @IsNotEmpty({ message: 'Envie o identityToken da Apple.' }) identityToken: string;

  /** A Apple só envia o nome na primeira vez; o app repassa aqui. */
  @IsOptional() @IsString() nome?: string;
}
