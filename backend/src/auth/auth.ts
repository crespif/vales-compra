import {
  Body,
  CanActivate,
  Controller,
  createParamDecorator,
  ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  Module,
  Post,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { IsNotEmpty, IsString } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { Rol, Usuario } from '../database/entities';

/** Lo que viaja en el JWT y llega a los controladores como @UsuarioActual(). */
export interface UsuarioSesion {
  id: number;
  legajo: string;
  nombre: string;
  rol: Rol;
  sectorId: number;
}

// ---------- Decoradores ----------

const PUBLICO = 'esPublico';
const ROLES = 'roles';

/** Ruta sin login (p. ej. validación del QR por el proveedor). */
export const Publico = () => SetMetadata(PUBLICO, true);

/** Restringe la ruta a ciertos roles. ADMIN siempre pasa. */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES, roles);

export const UsuarioActual = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): UsuarioSesion => ctx.switchToHttp().getRequest().usuario,
);

// ---------- Guard global: JWT + roles ----------

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLICO, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const [tipo, token] = (req.headers.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) throw new UnauthorizedException('Falta iniciar sesión');
    try {
      req.usuario = (await this.jwt.verifyAsync(token)) as UsuarioSesion;
    } catch {
      throw new UnauthorizedException('Sesión inválida o vencida');
    }

    const roles = this.reflector.getAllAndOverride<Rol[]>(ROLES, targets);
    if (roles?.length && req.usuario.rol !== Rol.ADMIN && !roles.includes(req.usuario.rol)) {
      throw new ForbiddenException('No tenés permiso para esta acción');
    }
    return true;
  }
}

// ---------- Login ----------

class LoginDto {
  @IsString() @IsNotEmpty() legajo: string;
  @IsString() @IsNotEmpty() password: string;
}

@Injectable()
export class AuthService {
  constructor(@InjectRepository(Usuario) private usuarios: Repository<Usuario>, private jwt: JwtService) {}

  async login(legajo: string, password: string) {
    const u = await this.usuarios
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.legajo = :legajo AND u.activo = true', { legajo })
      .getOne();
    if (!u || !(await bcrypt.compare(password, u.passwordHash))) {
      throw new UnauthorizedException('Legajo o contraseña incorrectos');
    }
    const sesion: UsuarioSesion = { id: u.id, legajo: u.legajo, nombre: u.nombre, rol: u.rol, sectorId: u.sectorId };
    return { accessToken: await this.jwt.signAsync(sesion), usuario: sesion };
  }

  static hash(password: string) {
    return bcrypt.hash(password, 10);
  }
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Publico()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.legajo, dto.password);
  }

  @Get('yo')
  yo(@UsuarioActual() u: UsuarioSesion) {
    return u;
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Usuario]),
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: process.env.JWT_SECRET ?? 'cambiar-en-produccion',
        signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '8h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService],
})
export class AuthModule {}
