import { Body, Controller, Get, Header, HttpCode, Ip, Module, NotFoundException, Param, Post, Res, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { GRIS, LOGO_DATA_URL, VERDE } from '../marca';
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

const MENSAJES: Record<string, [string, string, string]> = {
  VALIDO: ['Vale válido: puede entregar', VERDE, '✓'],
  PENDIENTE_FIRMA_EMPLEADO: ['El empleado todavía no aceptó el vale', '#9a6700', '!'],
  VENCIDO: ['Vale vencido: no entregar', '#b42318', '✕'],
  YA_ENTREGADO: ['Este vale ya fue entregado', '#b42318', '✕'],
  ANULADO: ['Vale anulado: no entregar', '#b42318', '✕'],
};

function pagina(p: ReturnType<typeof vistaPublica>, token: string, aviso?: string, avisoOk = false) {
  const [msg, color, icono] = MENSAJES[p.situacion];
  const filas = p.items
    .map((i) => `<tr><td class="cant">${esc(i.cantidad)} ${esc(i.unidad)}</td><td>${esc(i.descripcion)}</td></tr>`)
    .join('');
  const form =
    p.situacion === 'VALIDO'
      ? `<form method="post" action="/v/${esc(token)}" class="tarjeta" onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='Confirmando…'">
         <h2>Confirmar entrega</h2>
         <label>PIN del proveedor<input name="pin" inputmode="numeric" autocomplete="off" required maxlength="8"></label>
         <label>N° de remito (opcional)<input name="remito" maxlength="50"></label>
         <button>Confirmar entrega</button></form>`
      : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vale N° ${esc(p.numero)} — CELTA</title><meta name="robots" content="noindex"><meta name="theme-color" content="${VERDE}">
${LOGO_DATA_URL ? `<link rel="icon" href="${LOGO_DATA_URL}">` : ''}
<style>
:root{--verde:${VERDE};--gris:${GRIS};--tinta:#262b30;--suave:#5d646b;--linea:#e2e3e5}
*{box-sizing:border-box}body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;margin:0;background:#f3f4f5;color:var(--tinta)}
@keyframes entrar{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes zoom{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}
header{display:flex;align-items:center;gap:10px;padding:10px 16px;background:#fff;border-bottom:3px solid var(--verde);box-shadow:0 3px 0 -1px var(--gris)}
header img{width:36px;height:36px}header small{display:block;color:var(--verde);font-weight:700;letter-spacing:.12em;font-size:.72rem}header strong{display:block}
main{max-width:560px;margin:0 auto;padding:16px}
h1{font-size:1.4rem;margin:4px 0 12px;animation:entrar .3s both}
.estado{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:12px;color:#fff;font-weight:700;font-size:1.05rem;background:${color};animation:zoom .35s cubic-bezier(.2,.8,.2,1) both;box-shadow:0 6px 18px ${color}40}
.estado span{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#ffffff33;font-size:1.1rem}
.tarjeta{background:#fff;border:1px solid var(--linea);border-radius:12px;padding:16px;margin-top:12px;animation:entrar .35s .1s both}
dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0}dt{color:var(--suave)}dd{margin:0}
table{width:100%;border-collapse:collapse}td{border-bottom:1px solid var(--linea);padding:8px 4px}tr:last-child td{border-bottom:0}td.cant{color:var(--verde);font-weight:700;white-space:nowrap;width:90px}
h2{font-size:1.05rem;margin:0 0 8px}label{display:block;margin:10px 0;color:var(--suave);font-size:.92rem}
input{display:block;width:100%;margin-top:4px;padding:11px 12px;font-size:16px;border:1px solid var(--gris);border-radius:8px}
input:focus{outline:none;border-color:var(--verde);box-shadow:0 0 0 3px #00792c40}
button{margin-top:8px;padding:13px;width:100%;font-size:16px;font-weight:700;background:var(--verde);color:#fff;border:0;border-radius:8px;box-shadow:0 2px 8px #00792c47;cursor:pointer}
button:active{transform:scale(.98)}button:disabled{opacity:.6}
.aviso{padding:12px 14px;border-radius:10px;margin:12px 0;font-weight:600;animation:entrar .3s both}
.aviso.ok{background:#e3f1e7;color:var(--verde)}.aviso.error{background:#fde8e6;color:#b42318}
.pie{font-size:13px;color:var(--suave);text-align:center;margin-top:16px}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style></head><body>
<header>${LOGO_DATA_URL ? `<img src="${LOGO_DATA_URL}" alt="CELTA">` : ''}<div><small>CELTA</small><strong>Vale de compra</strong></div></header>
<main>
<h1>Vale N° ${esc(p.numero)}</h1>
<div class="estado" role="status"><span>${icono}</span>${esc(msg)}</div>
${aviso ? `<div class="aviso ${avisoOk ? 'ok' : 'error'}">${esc(aviso)}</div>` : ''}
<div class="tarjeta"><dl><dt>Proveedor</dt><dd>${esc(p.proveedor)}</dd><dt>Sección</dt><dd>${esc(p.sector)}</dd>
<dt>Válido hasta</dt><dd>${esc(fecha(p.validoHasta))}</dd><dt>Autorizó</dt><dd>${esc(p.autorizo)}</dd><dt>Retira</dt><dd>${esc(p.retira)}</dd></dl></div>
<div class="tarjeta"><table>${filas}</table></div>
${form}
<p class="pie">Cooperativa CELTA — Tres Arroyos · Al facturar, indique el número de vale.</p>
</main></body></html>`;
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
      return pagina(vistaPublica(await this.buscar(token)), token, 'Entrega registrada. Gracias.', true);
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
