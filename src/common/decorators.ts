import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Perfil } from '@prisma/client';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Permite também autenticar com o header x-api-key (dispositivos ESP32). */
export const ALLOW_DEVICE_KEY = 'allowDeviceKey';
export const AllowDeviceKey = () => SetMetadata(ALLOW_DEVICE_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Perfil[]) => SetMetadata(ROLES_KEY, roles);

export interface AuthUser {
  id: string;
  email: string;
  nome: string;
  perfil: Perfil;
  jti: string;
  exp: number;
}

export const CurrentUser = createParamDecorator(
  (_d: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
