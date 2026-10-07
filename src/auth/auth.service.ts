import {
  BadRequestException, ConflictException, ForbiddenException, Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Perfil, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { AuthUser } from '../common/decorators';
import { serializeUser } from '../common/serializers';
import { PrismaService } from '../prisma/prisma.service';
import { SocialProfile, verifyApple, verifyGoogle } from './social-verify';
import { LoginDto, RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private config: ConfigService) {}

  async login(dto: LoginDto) {
    const senha = dto.senha ?? dto.password;
    if (!senha) throw new BadRequestException('Informe a senha.');

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // 400 (e não 401) de propósito: o ApiClient do Flutter troca qualquer 401 por "Sessão expirada".
    const invalido = new BadRequestException('E-mail ou senha inválidos.');
    if (!user || !(await bcrypt.compare(senha, user.senhaHash))) throw invalido;
    if (!user.ativo) throw new ForbiddenException('Usuário inativo. Contate o administrador.');

    const atualizado = await this.prisma.user.update({ where: { id: user.id }, data: { ultimoAcesso: new Date() } });
    return this.buildAuth(atualizado);
  }

  async register(dto: RegisterDto) {
    if (this.config.get('ALLOW_PUBLIC_REGISTER', 'true') === 'false') {
      throw new ForbiddenException('Cadastro público desativado. Solicite acesso ao administrador.');
    }
    const existe = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existe) throw new ConflictException('Este e-mail já está cadastrado.');

    const rounds = Number(this.config.get('BCRYPT_ROUNDS', 10));
    const user = await this.prisma.user.create({
      data: {
        nome: dto.nome.trim(),
        email: dto.email,
        senhaHash: await bcrypt.hash(dto.senha, rounds),
        empresa: dto.empresa?.trim() || null,
        cargo: dto.cargo?.trim() || null,
        perfil: Perfil.VISUALIZADOR,
        ultimoAcesso: new Date(),
      },
    });
    return this.buildAuth(user);
  }

  /** Login com Google/Apple: entra se o e-mail já existe, senão cria a conta. */
  async socialLogin(perfil: SocialProfile, nomeInformado?: string) {
    let user = await this.prisma.user.findUnique({ where: { email: perfil.email } });
    if (user && !user.ativo) throw new ForbiddenException('Usuário desativado. Fale com o administrador.');
    if (!user) {
      if (this.config.get('ALLOW_PUBLIC_REGISTER', 'true') === 'false') {
        throw new ForbiddenException('Cadastro público desativado. Peça para o administrador criar seu acesso.');
      }
      const rounds = Number(this.config.get('BCRYPT_ROUNDS', 10));
      user = await this.prisma.user.create({
        data: {
          nome: (nomeInformado || perfil.nome || perfil.email.split('@')[0]).trim(),
          email: perfil.email,
          // conta social não tem senha: guarda um valor aleatório que ninguém conhece
          senhaHash: await bcrypt.hash(randomUUID() + randomUUID(), rounds),
          perfil: Perfil.VISUALIZADOR,
          ultimoAcesso: new Date(),
        },
      });
    } else {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { ultimoAcesso: new Date() } });
    }
    return this.buildAuth(user);
  }

  loginGoogle(idToken: string) {
    return verifyGoogle(idToken, this.config.get<string>('GOOGLE_CLIENT_IDS')).then((p) => this.socialLogin(p));
  }

  loginApple(identityToken: string, nome?: string) {
    return verifyApple(identityToken, this.config.get<string>('APPLE_CLIENT_IDS')).then((p) => this.socialLogin(p, nome));
  }

  async logout(user: AuthUser) {
    await this.prisma.revokedToken.upsert({
      where: { jti: user.jti },
      create: { jti: user.jti, expiresAt: new Date(user.exp * 1000) },
      update: {},
    });
    await this.prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return { message: 'Sessão encerrada.' };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return serializeUser(user);
  }

  private async buildAuth(user: User) {
    const token = await this.jwt.signAsync(
      { sub: user.id, email: user.email, perfil: user.perfil },
      { jwtid: randomUUID() },
    );
    return {
      token,
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN', '7d'),
      user: serializeUser(user),
    };
  }
}
