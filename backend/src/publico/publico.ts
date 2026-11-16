import { Body, Controller, Get, Header, HttpCode, Ip, Module, NotFoundException, Param, Post, Res, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { Publico } from '../auth/auth';
import { Canal, EstadoVale as E, Proveedor, Vale } from '../database/entities';
import { ValesModule } from '../vales/vales.module';
import { ValesService } from '../vales/vales.service';

class ConfirmarEntregaDto {
  @IsString() @MaxLength(8) pin: string;
  @IsOptional() @IsString() @MaxLength(50) remito?: string;
}

/** Límite simple de intentos de PIN por vale: 5 cada 15 minutos. */
const intentos = new Map<string, { n: number; desde: number }>();
function controlarIntentos(token: string) {
  const ahora = Date.now();
  const r = intentos.get(token);
  if (!r || ahora - r.desde > 15 * 60_000) return void intentos.set(token, { n: 1, desde: ahora });
  if (++r.n > 5) throw new HttpException('Demasiados intentos. Probá de nuevo en 15 minutos.', HttpStatus.TOO_MANY_REQUESTS);
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fecha = (iso?: string | null) => (iso ? iso.split('-').reverse().join('/') : '');

/** Lo mínimo que ve el proveedor: sin datos internos ni IDs. */
function vistaPublica(v: Vale & { vencido: boolean }) {
  let situacion: string;
  if (v.estado === E.EMITIDO && v.vencido) situacion = 'VENCIDO';
  else if (v.estado === E.EMITIDO && !v.aceptadoEn) situacion = 'PENDIENTE_FIRMA_EMPLEADO';
  else if (v.estado === E.EMITIDO) situacion = 'VALIDO';
  else if (v.estado === E.ENTREGADO || v.estado === E.CONCILIADO) situacion = 'YA_ENTREGADO';
  else situacion = 'ANULADO';
  return {
    numero: v.numero,
    situacion,
    sector: v.sector?.nombre,
    proveedor: v.proveedor?.razonSocial,
    emitido: v.emitidoEn,
    validoHasta: v.fechaVigencia,
    autorizo: v.aprobadoPor?.nombre,
    retira: v.solicitante?.nombre,
    items: (v.items ?? []).map((i) => ({ cantidad: i.cantidad, unidad: i.unidad, descripcion: i.descripcion })),
  };
}

const MENSAJES: Record<string, [string, string]> = {
  VALIDO: ['Vale válido', '#1a7f37'],
  PENDIENTE_FIRMA_EMPLEADO: ['El empleado todavía no aceptó el vale', '#9a6700'],
  VENCIDO: ['Vale vencido: no entregar', '#cf222e'],
  YA_ENTREGADO: ['Este vale ya fue entregado', '#cf222e'],
  ANULADO: ['Vale anulado: no entregar', '#cf222e'],
};

function pagina(p: ReturnType<typeof vistaPublica>, token: string, aviso?: string) {
  const [msg, color] = MENSAJES[p.situacion];
  const filas = p.items.map((i) => `<tr><td>${esc(i.cantidad)} ${esc(i.unidad)}</td><td>${esc(i.descripcion)}</td></tr>`).join('');
  const form =
    p.situacion === 'VALIDO'
      ? `<form method="post" action="/v/${esc(token)}"><h2>Confirmar entrega</h2>
         <label>PIN del proveedor<input name="pin" inputmode="numeric" autocomplete="off" required maxlength="8"></label>
         <label>N° de remito (opcional)<input name="remito" maxlength="50"></label>
         <button>Confirmar entrega</button></form>`
      : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vale N° ${esc(p.numero)} — CELTA</title><meta name="robots" content="noindex">
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:16px;color:#1f2328}
.estado{padding:12px 16px;border-radius:8px;color:#fff;font-weight:600;background:${color}}
table{width:100%;border-collapse:collapse;margin:12px 0}td{border-bottom:1px solid #ddd;padding:6px 4px}
dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px}dt{color:#656d76}label{display:block;margin:10px 0}
input{display:block;width:100%;padding:10px;font-size:16px;box-sizing:border-box}button{margin-top:8px;padding:12px;width:100%;font-size:16px;background:#0969da;color:#fff;border:0;border-radius:6px}
.aviso{padding:10px;background:#fff8c5;border-radius:6px;margin:12px 0}</style></head><body>
<p>Cooperativa CELTA — Tres Arroyos</p><h1>Vale de compra N° ${esc(p.numero)}</h1>
<div class="estado">${esc(msg)}</div>${aviso ? `<div class="aviso">${esc(aviso)}</div>` : ''}
<dl><dt>Proveedor</dt><dd>${esc(p.proveedor)}</dd><dt>Sección</dt><dd>${esc(p.sector)}</dd>
<dt>Válido hasta</dt><dd>${esc(fecha(p.validoHasta))}</dd><dt>Autorizó</dt><dd>${esc(p.autorizo)}</dd><dt>Retira</dt><dd>${esc(p.retira)}</dd></dl>
<table>${filas}</table>${form}
<p style="font-size:13px;color:#656d76">Al facturar, indique el número de vale.</p></body></html>`;
}

@Publico()
@Controller()
export class PublicoController {
  constructor(private vales: ValesService, @InjectDataSource() private ds: DataSource) {}

  /** Para el chequeo de salud del contenedor (Coolify/Docker). */
  @Get('salud')
  salud() {
    return { ok: true };
  }

  /** Página que abre el QR. */
  @Get('v/:token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async ver(@Param('token') token: string) {
    return pagina(vistaPublica(await this.buscar(token)), token);
  }

  /** Envío del formulario de la página (form urlencoded). */
  @Post('v/:token')
  @HttpCode(200)
  @Header('Content-Type', 'text/html; charset=utf-8')
  async confirmarDesdePagina(@Param('token') token: string, @Ip() ip: string, @Body() dto: ConfirmarEntregaDto, @Res({ passthrough: true }) res: Response) {
    try {
      await this.confirmar(token, ip, dto);
      return pagina(vistaPublica(await this.buscar(token)), token, 'Entrega registrada. Gracias.');
    } catch (e) {
      if (!(e instanceof HttpException)) throw e;
      res.status(e.getStatus());
      return pagina(vistaPublica(await this.buscar(token)), token, e.message);
    }
  }

  /** Variante JSON (para una futura app o el bot). */
  @Get('publico/vales/:token')
  async json(@Param('token') token: string) {
    return vistaPublica(await this.buscar(token));
  }

  @Post('publico/vales/:token/entrega')
  @HttpCode(200)
  async confirmarJson(@Param('token') token: string, @Ip() ip: string, @Body() dto: ConfirmarEntregaDto) {
    await this.confirmar(token, ip, dto);
    return vistaPublica(await this.buscar(token));
  }

  private async buscar(token: string) {
    const v = token.length <= 64 ? await this.vales.obtenerPorToken(token) : null;
    if (!v) throw new NotFoundException('Vale inexistente');
    return v;
  }

  private async confirmar(token: string, ip: string, dto: ConfirmarEntregaDto) {
    controlarIntentos(token);
    const v = await this.buscar(token);
    const prov = await this.ds
      .getRepository(Proveedor)
      .createQueryBuilder('p')
      .addSelect('p.pinHash')
      .where('p.id = :id', { id: v.proveedorId })
      .getOne();
    if (!prov?.pinHash || !(await bcrypt.compare(dto.pin, prov.pinHash))) {
      throw new UnauthorizedException('PIN incorrecto');
    }
    await this.vales.registrarEntrega({ canal: Canal.PROVEEDOR, ip }, v.id, dto.remito);
  }
}

@Module({ imports: [ValesModule], controllers: [PublicoController] })
export class PublicoModule {}
