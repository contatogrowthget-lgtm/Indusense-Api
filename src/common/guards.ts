import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Perfil } from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ALLOW_DEVICE_KEY, IS_PUBLIC_KEY, ROLES_KEY } from './decorators';

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwt: JwtService,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const alvos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, alvos)) return true;

    const req = ctx.switchToHttp().getRequest();

    if (this.reflector.getAllAndOverride<boolean>(ALLOW_DEVICE_KEY, alvos)) {
      const esperada = this.config.get<string>('DEVICE_API_KEY');
      const enviada = req.headers['x-api-key'];
      if (esperada && typeof enviada === 'string' && safeEqual(enviada, esperada)) {
        req.deviceAuth = true;
        return true;
      }
    }

    const [tipo, token] = String(req.headers.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) throw new UnauthorizedException('Token não informado.');

    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    const revogado = await this.prisma.revokedToken.findUnique({ where: { jti: payload.jti } });
    if (revogado) throw new UnauthorizedException('Sessão encerrada. Faça login novamente.');

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.ativo) throw new UnauthorizedException('Usuário inválido ou inativo.');

    await this.registrarSessao(req, user.id, payload);

    req.user = { id: user.id, email: user.email, nome: user.nome, perfil: user.perfil, jti: payload.jti, exp: payload.exp };
    return true;
  }

  /** Cria a sessão no primeiro uso do token, barra sessões encerradas e marca o último uso. */
  private async registrarSessao(req: any, userId: string, payload: any) {
    if (!payload.jti) return;
    const agora = new Date();
    const sessao = await this.prisma.sessao.findUnique({ where: { jti: payload.jti } });
    if (sessao?.revogada) throw new UnauthorizedException('Sessão encerrada. Faça login novamente.');

    const ua = String(req.headers['user-agent'] ?? '').slice(0, 300) || null;
    const ip = String(req.headers['x-forwarded-for'] ?? req.ip ?? '').split(',')[0].trim().slice(0, 64) || null;
    if (!sessao) {
      await this.prisma.sessao
        .create({
          data: {
            jti: payload.jti,
            userId,
            dispositivo: ua,
            ip,
            criadaEm: payload.iat ? new Date(payload.iat * 1000) : agora,
            ultimoUso: agora,
            expiraEm: new Date((payload.exp ?? agora.getTime() / 1000 + 7 * 86400) * 1000),
          },
        })
        .catch(() => undefined); // duas requisições simultâneas: a outra já criou
    } else if (agora.getTime() - sessao.ultimoUso.getTime() > 60_000) {
      await this.prisma.sessao.update({ where: { jti: payload.jti }, data: { ultimoUso: agora, ip } }).catch(() => undefined);
    }
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Perfil[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!roles?.length) return true;
    const req = ctx.switchToHttp().getRequest();
    if (req.deviceAuth) return true;
    const perfil: Perfil | undefined = req.user?.perfil;
    if (perfil === Perfil.ADMIN || (perfil && roles.includes(perfil))) return true;
    throw new ForbiddenException('Você não tem permissão para esta ação.');
  }
}
