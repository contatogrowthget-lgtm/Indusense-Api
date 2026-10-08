import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Perfil } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { ChangePasswordDto, CreateUserDto, UpdateProfileDto, UpdateUserDto } from './dto/users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  // ---- perfil do próprio usuário (declarado em api_constants.dart do Flutter) ----
  @Get('profile')
  @ApiOperation({ summary: 'Perfil do usuário autenticado' })
  profile(@CurrentUser() u: AuthUser) { return this.users.findOne(u.id); }

  @Patch('profile')
  @ApiOperation({ summary: 'Atualiza nome, e-mail, cargo e empresa do próprio usuário' })
  updateProfile(@CurrentUser() u: AuthUser, @Body() dto: UpdateProfileDto) { return this.users.updateProfile(u.id, dto); }

  @Patch('profile/password')
  @ApiOperation({ summary: 'Altera a própria senha' })
  changePassword(@CurrentUser() u: AuthUser, @Body() dto: ChangePasswordDto) { return this.users.changePassword(u.id, dto, u.jti); }

  @Get('profile/sessions')
  @ApiOperation({ summary: 'Sessões abertas do próprio usuário (navegadores e celulares conectados)' })
  sessions(@CurrentUser() u: AuthUser) { return this.users.sessoes(u.id, u.jti); }

  @Post('profile/sessions/revoke-others')
  @HttpCode(200)
  @ApiOperation({ summary: 'Encerra todas as outras sessões, mantendo a atual' })
  revokeOthers(@CurrentUser() u: AuthUser) { return this.users.encerrarOutras(u.id, u.jti); }

  @Delete('profile/sessions/:jti')
  @ApiOperation({ summary: 'Encerra uma sessão específica' })
  revokeOne(@CurrentUser() u: AuthUser, @Param('jti') jti: string) { return this.users.encerrarSessao(u.id, jti, u.jti); }

  // ---- gestão de usuários (tela "Usuários" do Next.js) ----
  @Get()
  @Roles(Perfil.ADMIN)
  @ApiOperation({ summary: 'Lista usuários (ADMIN)' })
  findAll(@Query('busca') busca?: string) { return this.users.findAll(busca); }

  @Post()
  @Roles(Perfil.ADMIN)
  @ApiOperation({ summary: 'Cria usuário (ADMIN). Sem `senha`, devolve `senhaTemporaria`' })
  create(@Body() dto: CreateUserDto) { return this.users.create(dto); }

  @Get(':id')
  @Roles(Perfil.ADMIN)
  @ApiOperation({ summary: 'Detalha usuário (ADMIN)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.users.findOne(id); }

  @Patch(':id')
  @Roles(Perfil.ADMIN)
  @ApiOperation({ summary: 'Edita perfil, status, dados ou senha (ADMIN)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @CurrentUser() u: AuthUser) {
    return this.users.update(id, dto, u.id);
  }

  @Delete(':id')
  @Roles(Perfil.ADMIN)
  @ApiOperation({ summary: 'Remove usuário (ADMIN)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.users.remove(id, u.id); }
}
