import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Perfil } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { serializeUser } from '../common/serializers';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto, CreateUserDto, UpdateProfileDto, UpdateUserDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private config: ConfigService) {}

  private hash(senha: string) {
    return bcrypt.hash(senha, Number(this.config.get('BCRYPT_ROUNDS', 10)));
  }

  async findAll(busca?: string) {
    const users = await this.prisma.user.findMany({
      where: busca
        ? { OR: [{ nome: { contains: busca, mode: 'insensitive' } }, { email: { contains: busca, mode: 'insensitive' } }] }
        : undefined,
      orderBy: { nome: 'asc' },
    });
    return users.map(serializeUser);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return serializeUser(user);
  }

  async create(dto: CreateUserDto) {
    if (await this.prisma.user.findUnique({ where: { email: dto.email } })) {
      throw new ConflictException('Este e-mail já está cadastrado.');
    }
    const senha = dto.senha ?? randomBytes(8).toString('base64url');
    const user = await this.prisma.user.create({
      data: {
        nome: dto.nome.trim(),
        email: dto.email,
        senhaHash: await this.hash(senha),
        perfil: dto.perfil ?? Perfil.OPERADOR,
        cargo: dto.cargo ?? null,
        empresa: dto.empresa ?? null,
      },
    });
    return { ...serializeUser(user), ...(dto.senha ? {} : { senhaTemporaria: senha }) };
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    await this.findOne(id);
    if (id === actorId && ((dto.perfil && dto.perfil !== Perfil.ADMIN) || dto.ativo === false)) {
      throw new BadRequestException('Você não pode remover seu próprio acesso de administrador.');
    }
    if (dto.email) await this.assertEmailLivre(dto.email, id);
    const { senha, ...resto } = dto;
    const user = await this.prisma.user.update({
      where: { id },
      data: { ...resto, ...(senha ? { senhaHash: await this.hash(senha) } : {}) },
    });
    return serializeUser(user);
  }

  async remove(id: string, actorId: string) {
    if (id === actorId) throw new BadRequestException('Você não pode excluir o próprio usuário.');
    await this.findOne(id);
    await this.prisma.user.delete({ where: { id } });
    return { message: 'Usuário removido.' };
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    if (dto.email) await this.assertEmailLivre(dto.email, id);
    const { avatar, ...resto } = dto;
    const user = await this.prisma.user.update({
      where: { id },
      data: { ...resto, ...(avatar !== undefined ? { avatar: avatar || null } : {}) },
    });
    return serializeUser(user);
  }

  // ------------------------------------------------------------ sessões

  async sessoes(userId: string, jtiAtual: string) {
    const lista = await this.prisma.sessao.findMany({
      where: { userId, revogada: false, expiraEm: { gt: new Date() } },
      orderBy: { ultimoUso: 'desc' },
      take: 50,
    });
    return lista.map((s) => ({
      id: s.jti,
      atual: s.jti === jtiAtual,
      dispositivo: s.dispositivo,
      ip: s.ip,
      criadaEm: s.criadaEm.toISOString(),
      ultimoUso: s.ultimoUso.toISOString(),
      expiraEm: s.expiraEm.toISOString(),
    }));
  }

  private async revogar(where: { userId: string; jti?: string | { not: string } }) {
    const alvos = await this.prisma.sessao.findMany({ where: { ...where, revogada: false } });
    if (!alvos.length) return 0;
    await this.prisma.sessao.updateMany({ where: { jti: { in: alvos.map((s) => s.jti) } }, data: { revogada: true } });
    await this.prisma.revokedToken.createMany({
      data: alvos.map((s) => ({ jti: s.jti, expiresAt: s.expiraEm })),
      skipDuplicates: true,
    });
    return alvos.length;
  }

  async encerrarSessao(userId: string, jti: string, jtiAtual: string) {
    if (jti === jtiAtual) throw new BadRequestException('Para encerrar esta sessão, use o botão Sair.');
    const n = await this.revogar({ userId, jti });
    if (!n) throw new NotFoundException('Sessão não encontrada.');
    return { message: 'Sessão encerrada.' };
  }

  async encerrarOutras(userId: string, jtiAtual: string) {
    const n = await this.revogar({ userId, jti: { not: jtiAtual } });
    return { message: n ? `${n} sessão(ões) encerrada(s).` : 'Não havia outras sessões abertas.', encerradas: n };
  }

  async changePassword(id: string, dto: ChangePasswordDto, jtiAtual?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    if (!(await bcrypt.compare(dto.senhaAtual, user.senhaHash))) {
      throw new BadRequestException('Senha atual incorreta.');
    }
    if (dto.novaSenha === dto.senhaAtual) throw new BadRequestException('A nova senha precisa ser diferente da atual.');
    await this.prisma.user.update({ where: { id }, data: { senhaHash: await this.hash(dto.novaSenha) } });
    // por segurança, desconecta os outros aparelhos
    const encerradas = jtiAtual ? await this.revogar({ userId: id, jti: { not: jtiAtual } }) : 0;
    return { message: 'Senha alterada com sucesso.', sessoesEncerradas: encerradas };
  }

  private async assertEmailLivre(email: string, ignorarId: string) {
    const outro = await this.prisma.user.findUnique({ where: { email } });
    if (outro && outro.id !== ignorarId) throw new ConflictException('Este e-mail já está em uso.');
  }
}
