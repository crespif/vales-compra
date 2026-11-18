import { Body, Controller, Delete, Get, HttpCode, Injectable, Logger, Module, Post, Global } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { IsOptional, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';
import { createHash } from 'crypto';
import { DataSource, In } from 'typeorm';
import * as webpush from 'web-push';
import { Publico, UsuarioActual, UsuarioSesion } from '../auth/auth';
import { Parametro, PushSuscripcion, Rol, Usuario } from '../database/entities';

/** Lo que muestra el celular. `url` es la pantalla de la app que abre al tocarla. */
export interface Aviso {
  titulo: string;
  cuerpo: string;
  url: string;
  /** Avisos con el mismo tag se reemplazan en vez de apilarse (p. ej. un mismo vale). */
  tag?: string;
}

const CLAVE_VAPID = 'push.vapid';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Notificaciones al celular con Web Push (estándar del navegador, sin servicios pagos).
 * Las claves VAPID se toman de VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY si están en el entorno;
 * si no, se generan una vez y se guardan en la base, así no hay nada que configurar.
 */
@Injectable()
export class NotificacionesService {
  private log = new Logger('Notificaciones');
  private claves?: Promise<{ publicKey: string; privateKey: string }>;

  constructor(@InjectDataSource() private ds: DataSource) {}

  clavePublica() {
    return this.vapid().then((c) => c.publicKey);
  }

  private vapid() {
    this.claves ??= (async () => {
      if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
      }
      const repo = this.ds.getRepository(Parametro);
      const guardada = await repo.findOneBy({ clave: CLAVE_VAPID });
      if (guardada) return JSON.parse(guardada.valor);
      const nuevas = webpush.generateVAPIDKeys();
      await repo.save({ clave: CLAVE_VAPID, valor: JSON.stringify(nuevas) });
      this.log.log('Se generaron las claves VAPID para las notificaciones');
      return nuevas;
    })();
    return this.claves;
  }

  async suscribir(usuarioId: number, s: { endpoint: string; p256dh: string; auth: string; dispositivo?: string }) {
    const repo = this.ds.getRepository(PushSuscripcion);
    const endpointHash = hash(s.endpoint);
    // Si el mismo celular estaba a nombre de otro usuario (cambió quién inició sesión), pasa al actual.
    await repo.delete({ endpointHash });
    await repo.insert({ usuarioId, endpointHash, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, dispositivo: s.dispositivo?.slice(0, 250) ?? null });
  }

  async desuscribir(usuarioId: number, endpoint: string) {
    await this.ds.getRepository(PushSuscripcion).delete({ usuarioId, endpointHash: hash(endpoint) });
  }

  /** Usuarios de Compras y administradores activos (los que aprueban pedidos). */
  async idsDeCompras(excepto?: number) {
    const us = await this.ds.getRepository(Usuario).find({ where: { rol: In([Rol.COMPRAS, Rol.ADMIN]), activo: true }, select: { id: true } });
    return us.map((u) => u.id).filter((id) => id !== excepto);
  }

  /**
   * Envía el aviso a todos los celulares de esos usuarios. Nunca lanza error: una falla
   * de notificación no puede romper la operación del vale. Los celulares que ya no
   * existen (el navegador responde 404/410) se borran.
   */
  async enviar(usuarioIds: number[], aviso: Aviso): Promise<{ enviados: number; fallidos: number }> {
    if (!usuarioIds.length) return { enviados: 0, fallidos: 0 };
    try {
      const subs = await this.ds.getRepository(PushSuscripcion).find({ where: { usuarioId: In(usuarioIds) } });
      if (!subs.length) return { enviados: 0, fallidos: 0 };
      const { publicKey, privateKey } = await this.vapid();
      const opciones = {
        vapidDetails: { subject: process.env.VAPID_SUBJECT ?? 'mailto:sistemas@celta.com.ar', publicKey, privateKey },
        TTL: 60 * 60 * 24, // si el celular está apagado, el aviso espera hasta un día
        urgency: 'high' as const,
        timeout: 10_000,
      };
      const cuerpo = JSON.stringify(aviso);
      let enviados = 0;
      let fallidos = 0;
      await Promise.all(
        subs.map(async (s) => {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpo, opciones);
            enviados++;
          } catch (e) {
            fallidos++;
            const codigo = (e as { statusCode?: number }).statusCode;
            if (codigo === 404 || codigo === 410) {
              await this.ds.getRepository(PushSuscripcion).delete({ id: s.id });
            } else {
              this.log.warn(`No se pudo notificar al usuario ${s.usuarioId}: ${(e as Error).message}`);
            }
          }
        }),
      );
      return { enviados, fallidos };
    } catch (e) {
      this.log.error(`Error enviando notificaciones: ${(e as Error).message}`);
      return { enviados: 0, fallidos: usuarioIds.length };
    }
  }

  /** Para disparar sin esperar (después de confirmar la operación). */
  avisar(usuarioIds: number[] | Promise<number[]>, aviso: Aviso) {
    Promise.resolve(usuarioIds)
      .then((ids) => this.enviar(ids, aviso))
      .catch(() => {});
  }
}

class ClavesDto {
  @IsString() @MaxLength(200) p256dh: string;
  @IsString() @MaxLength(100) auth: string;
}

class SuscripcionDto {
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true, require_tld: false }) @MaxLength(2000) endpoint: string;
  @ValidateNested() @Type(() => ClavesDto) keys: ClavesDto;
  @IsOptional() @IsString() @MaxLength(250) dispositivo?: string;
}

class BajaDto {
  @IsString() @MaxLength(2000) endpoint: string;
}

@Controller('notificaciones')
export class NotificacionesController {
  constructor(private n: NotificacionesService) {}

  /** Clave pública que el navegador necesita para suscribirse. */
  @Publico()
  @Get('clave')
  async clave() {
    return { clave: await this.n.clavePublica() };
  }

  @Post('suscripcion')
  @HttpCode(204)
  async suscribir(@UsuarioActual() u: UsuarioSesion, @Body() dto: SuscripcionDto) {
    await this.n.suscribir(u.id, { endpoint: dto.endpoint, p256dh: dto.keys.p256dh, auth: dto.keys.auth, dispositivo: dto.dispositivo });
  }

  @Delete('suscripcion')
  @HttpCode(204)
  async desuscribir(@UsuarioActual() u: UsuarioSesion, @Body() dto: BajaDto) {
    await this.n.desuscribir(u.id, dto.endpoint);
  }

  /** Botón "Probar": manda un aviso a los celulares del propio usuario. */
  @Post('prueba')
  @HttpCode(200)
  prueba(@UsuarioActual() u: UsuarioSesion) {
    return this.n.enviar([u.id], {
      titulo: 'Notificaciones activadas',
      cuerpo: 'Así te vamos a avisar de los vales de compra.',
      url: '/#/vales',
      tag: 'prueba',
    });
  }
}

@Global()
@Module({
  controllers: [NotificacionesController],
  providers: [NotificacionesService],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
