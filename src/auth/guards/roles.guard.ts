import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    
    if (!user) {
      throw new ForbiddenException('Authentification requise');
    }

    // Comparaison robuste du rôle (gère les strings et les enums)
    const hasRole = requiredRoles.some((role) => {
      const userRole = user.role?.toString();
      const requiredRole = role?.toString();
      return userRole === requiredRole;
    });
    
    if (!hasRole) {
      throw new ForbiddenException(`Vous n'avez pas les permissions nécessaires. Rôle requis: ${requiredRoles.join(', ')}, Rôle actuel: ${user.role}`);
    }

    return true;
  }
}

