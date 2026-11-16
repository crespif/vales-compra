import {
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Param,
  ParseIntPipe,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import * as http from 'http';
import * as https from 'https';
import { DataSource, IsNull, Not } from 'typeorm';
import { Roles } from '../auth/auth';
import { Parametro, Proveedor, Rol } from '../database/entities';
import { ILIKE } from '../database/motor';

/** Un proveedor tal como lo devuelve GET {GLM_API_URL}/proveedores. */
export interface ProveedorGlm {
  codigo: number | string;
  razon_social: string;
  nombre_fantasia?: string | null;
  email?: string | null;
  domicilio?: string | null;
  codigo_postal?: string | null;
  localidad?: string | null;
  tipo_documento?: number | null;
  documento?: number | string | null;
  telefono?: string | null;
}

export interface ResultadoSync {
  fecha: string;
  ok: boolean;
  recibidos?: number;
  nuevos?: number;
  actualizados?: number;
  deshabilitados?: number;
  error?: string;
}

const BUSQUEDA = `(p.razon_social ${ILIKE} :t OR p.nombre_fantasia ${ILIKE} :t OR p.cuit ${ILIKE} :t OR replace(p.cuit, '-', '') ${ILIKE} :t OR p.glm_proveedor_id = :exacto)`;
/** GET con http/https de Node (sin fetch, para que funcione también con Node 16). */
function obtener(url: string, timeoutMs: number): Promise<{ status: number; statusText: string; cuerpo: string }> {
  return new Promise((ok, mal) => {
    const cliente = url.startsWith('https:') ? https : http;
    const req = cliente.get(url, { headers: { Accept: 'application/json' } }, (res) => {
      const partes: Buffer[] = [];
      res.on('data', (c: Buffer) => partes.push(c));
      res.on('end', () => ok({ status: res.statusCode ?? 0, statusText: res.statusMessage ?? '', cuerpo: Buffer.concat(partes).toString('utf8') }));
      res.on('error', mal);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`sin respuesta en ${timeoutMs / 1000} s`)));
    req.on('error', mal);
  });
}

const CLAVE_ULTIMA = 'glm.proveedores.ultima_sincronizacion';
const TIPO_CUIT = 80; // código AFIP del tipo de documento CUIT

const limpio = (s?: string | null) => {
  const t = (s ?? '').trim().replace(/\s+/g, ' ');
  return t || null;
};

/** 30654364229 → "30-65436422-9" cuando el documento es un CUIT; si no, el número tal cual. */
export function formatearDocumento(tipo?: number | null, doc?: number | string | null): string | null {
  const d = String(doc ?? '').replace(/\D/g, '');
  if (!d || /^0+$/.test(d)) return null;
  if (tipo === TIPO_CUIT && d.length === 11) return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
  return d;
}

/** Convierte y valida un registro de GLM. Devuelve null si no sirve (sin código o sin razón social). */
export function mapear(p: ProveedorGlm) {
  const codigo = p?.codigo != null ? String(p.codigo).trim() : '';
  const razonSocial = limpio(p?.razon_social);
  if (!codigo || !razonSocial) return null;
  const fantasia = limpio(p.nombre_fantasia);
  const localidad = limpio(p.localidad);
  return {
    glmProveedorId: codigo,
    razonSocial,
    nombreFantasia: fantasia && fantasia !== razonSocial ? fantasia : null,
    cuit: formatearDocumento(p.tipo_documento, p.documento),
    domicilio: limpio(p.domicilio),
    localidad: localidad && p.codigo_postal ? `${localidad} (${String(p.codigo_postal).trim()})` : localidad,
    telefono: limpio(p.telefono),
    contactoMail: limpio(p.email),
  };
}

@Injectable()
export class GlmProveedoresService implements OnApplicationBootstrap, OnApplicationShutdown {
  private log = new Logger('GLM');
  private timer?: NodeJS.Timeout;
  private enCurso?: Promise<ResultadoSync>;

  constructor(@InjectDataSource() private ds: DataSource) {}

  private get url() {
    const base = (process.env.GLM_API_URL ?? '').replace(/\/+$/, '');
    return base ? `${base}/proveedores` : '';
  }

  /** Al arrancar sincroniza una vez y después cada GLM_SYNC_MINUTOS (0 = solo manual). */
  onApplicationBootstrap() {
    if (!this.url) return this.log.warn('GLM_API_URL no está configurada: no se sincronizan proveedores');
    const minutos = Number(process.env.GLM_SYNC_MINUTOS ?? 60);
    if (minutos > 0) {
      setTimeout(() => this.sincronizar().catch(() => {}), 2_000).unref();
      this.timer = setInterval(() => this.sincronizar().catch(() => {}), minutos * 60_000);
      this.timer.unref();
    }
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Si ya hay una sincronización corriendo, devuelve esa misma. */
  sincronizar(): Promise<ResultadoSync> {
    this.enCurso ??= this.ejecutar().finally(() => (this.enCurso = undefined));
    return this.enCurso;
  }

  async ultima(): Promise<ResultadoSync | null> {
    const p = await this.ds.getRepository(Parametro).findOneBy({ clave: CLAVE_ULTIMA });
    return p ? JSON.parse(p.valor) : null;
  }

  private async ejecutar(): Promise<ResultadoSync> {
    const fecha = new Date().toISOString();
    try {
      if (!this.url) throw new Error('GLM_API_URL no está configurada');
      const datos = await this.descargar();
      const res = await this.aplicar(datos);
      const r: ResultadoSync = { fecha, ok: true, ...res };
      this.log.log(`Proveedores sincronizados: ${JSON.stringify(res)}`);
      await this.guardar(r);
      return r;
    } catch (e) {
      const r: ResultadoSync = { fecha, ok: false, error: (e as Error).message };
      this.log.error(`Falló la sincronización de proveedores: ${r.error}`);
      await this.guardar(r).catch(() => {});
      return r;
    }
  }

  private async descargar(): Promise<ProveedorGlm[]> {
    let r: { status: number; statusText: string; cuerpo: string };
    try {
      r = await obtener(this.url, Number(process.env.GLM_TIMEOUT_MS ?? 20_000));
    } catch (e) {
      throw new Error(`No se pudo conectar con GLM (${this.url}): ${(e as Error).message}`);
    }
    if (r.status < 200 || r.status >= 300) throw new Error(`GLM respondió ${r.status} ${r.statusText}`);
    let datos: unknown;
    try {
      datos = JSON.parse(r.cuerpo);
    } catch {
      throw new Error('GLM no devolvió un JSON válido');
    }
    if (!Array.isArray(datos)) throw new Error('GLM no devolvió una lista de proveedores');
    return datos;
  }

  /** Actualiza la copia local en una sola transacción. */
  private async aplicar(datos: ProveedorGlm[]) {
    const validos = new Map<string, NonNullable<ReturnType<typeof mapear>>>();
    for (const d of datos) {
      const m = mapear(d);
      if (m) validos.set(m.glmProveedorId, m);
    }
    // Resguardo: una respuesta vacía o rota no debe dejar a todos los proveedores deshabilitados.
    if (!validos.size) throw new Error('GLM devolvió 0 proveedores válidos; no se modificó nada');

    return this.ds.transaction(async (m) => {
      const repo = m.getRepository(Proveedor);
      const existentes = await repo.find({ where: { glmProveedorId: Not(IsNull()) } });
      const porCodigo = new Map(existentes.map((p) => [p.glmProveedorId!, p]));
      const ahora = new Date();
      let nuevos = 0;
      let actualizados = 0;

      for (const v of validos.values()) {
        const actual = porCodigo.get(v.glmProveedorId);
        if (!actual) {
          await repo.insert({ ...v, habilitado: true, sincronizadoEn: ahora });
          nuevos++;
          continue;
        }
        const cambio =
          !actual.habilitado || (Object.keys(v) as (keyof typeof v)[]).some((k) => (actual[k] ?? null) !== (v[k] ?? null));
        if (cambio) actualizados++;
        await repo.update(actual.id, { ...v, habilitado: true, sincronizadoEn: ahora });
      }

      // Los que ya no vienen de GLM (o nunca vinieron) quedan deshabilitados, sin borrarse.
      const { affected } = await repo
        .createQueryBuilder()
        .update()
        .set({ habilitado: false })
        .where('habilitado = true AND (glm_proveedor_id IS NULL OR glm_proveedor_id NOT IN (:...codigos))', {
          codigos: [...validos.keys()],
        })
        .execute();

      return { recibidos: datos.length, nuevos, actualizados, deshabilitados: affected ?? 0 };
    });
  }

  private guardar(r: ResultadoSync) {
    return this.ds.getRepository(Parametro).save({ clave: CLAVE_ULTIMA, valor: JSON.stringify(r) });
  }
}

class ListadoProveedoresDto {
  @IsOptional() @IsString() buscar?: string;
  @IsOptional() @IsIn(['activos', 'baja', 'sinpin', 'todos']) filtro?: 'activos' | 'baja' | 'sinpin' | 'todos';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pagina?: number;
}

class PinDto {
  @IsString() @Length(4, 8) @Matches(/^\d+$/, { message: 'El PIN debe ser numérico' }) pin: string;
}

/**
 * Proveedores: solo lectura (vienen de GLM). Lo único que se define acá es el PIN de entrega.
 */
@Controller('proveedores')
export class ProveedoresController {
  constructor(@InjectDataSource() private ds: DataSource, private glm: GlmProveedoresService) {}

  /** ?buscar=texto filtra por razón social, nombre de fantasía, CUIT o código. ?todos=true incluye deshabilitados. */
  @Get()
  listar(@Query('todos') todos?: string, @Query('buscar') buscar?: string) {
    const qb = this.ds.getRepository(Proveedor).createQueryBuilder('p').orderBy('p.razonSocial', 'ASC');
    if (todos !== 'true') qb.andWhere('p.habilitado = true');
    const t = buscar?.trim();
    if (t) {
      qb.andWhere(
        BUSQUEDA,
        { t: `%${t}%`, exacto: t },
      );
      qb.take(50);
    }
    return qb.getMany();
  }

  /**
   * Listado paginado para la pantalla de proveedores de Compras.
   * filtro: activos | baja | sinpin | todos.  Incluye si el proveedor ya tiene PIN.
   */
  @Roles(Rol.COMPRAS)
  @Get('listado')
  async listado(@Query() q: ListadoProveedoresDto) {
    const qb = this.ds.getRepository(Proveedor).createQueryBuilder('p').orderBy('p.razonSocial', 'ASC').addOrderBy('p.id', 'ASC');
    const filtro = q.filtro ?? 'activos';
    if (filtro === 'activos') qb.andWhere('p.habilitado = true');
    if (filtro === 'baja') qb.andWhere('p.habilitado = false');
    if (filtro === 'sinpin') qb.andWhere('p.habilitado = true AND p.pin_hash IS NULL');
    const t = q.buscar?.trim();
    if (t) {
      qb.andWhere(
        BUSQUEDA,
        { t: `%${t}%`, exacto: t },
      );
    }
    const total = await qb.getCount();
    const tamanio = 50;
    const pagina = Math.max(1, q.pagina ?? 1);
    const { entities, raw } = await qb
      .addSelect('p.pin_hash IS NOT NULL', 'tiene_pin')
      .offset((pagina - 1) * tamanio)
      .limit(tamanio)
      .getRawAndEntities();
    const items = entities.map((e, i) => ({ ...e, tienePin: raw[i].tiene_pin === true || Number(raw[i].tiene_pin) === 1 }));
    return { items, total, pagina, paginas: Math.max(1, Math.ceil(total / tamanio)) };
  }

  @Roles(Rol.COMPRAS)
  @Get('sincronizacion')
  ultima() {
    return this.glm.ultima();
  }

  /** Botón "Actualizar desde GLM". */
  @Roles(Rol.COMPRAS)
  @Post('sincronizar')
  @HttpCode(200)
  async sincronizar() {
    const r = await this.glm.sincronizar();
    if (!r.ok) throw new ServiceUnavailableException(r.error);
    return r;
  }

  /** PIN con el que el proveedor confirma entregas desde la página del QR. */
  @Roles(Rol.COMPRAS)
  @Post(':id/pin')
  async definirPin(@Param('id', ParseIntPipe) id: number, @Body() dto: PinDto) {
    const repo = this.ds.getRepository(Proveedor);
    if (!(await repo.existsBy({ id }))) throw new NotFoundException('Proveedor inexistente');
    await repo.update(id, { pinHash: await bcrypt.hash(dto.pin, 10) });
    return { ok: true };
  }
}

@Module({
  controllers: [ProveedoresController],
  providers: [GlmProveedoresService],
  exports: [GlmProveedoresService],
})
export class GlmModule {}

