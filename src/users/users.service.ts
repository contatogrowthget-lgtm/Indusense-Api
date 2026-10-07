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
    const user = await this.prisma.user.update({ where: { id }, data: dto });
    return serializeUser(user);
  }

  async changePassword(id: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    if (!(await bcrypt.compare(dto.senhaAtual, user.senhaHash))) {
      throw new BadRequestException('Senha atual incorreta.');
    }
    await this.prisma.user.update({ where: { id }, data: { senhaHash: await this.hash(dto.novaSenha) } });
    return { message: 'Senha alterada com sucesso.' };
  }

  private async assertEmailLivre(email: string, ignorarId: string) {
    const outro = await this.prisma.user.findUnique({ where: { email } });
    if (outro && outro.id !== ignorarId) throw new ConflictException('Este e-mail já está em uso.');
  }
}
