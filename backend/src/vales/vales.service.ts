import {
  Optional,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource, EntityManager, In } from 'typeorm';
import { UsuarioSesion } from '../auth/auth';
import { Canal, EstadoVale as E, Proveedor, Rol, Vale, ValeEvento, ValeItem } from '../database/entities';
import { SQL_NEXTVAL } from '../database/motor';
import { NotificacionesService } from '../notificaciones/notificaciones';
import { assertTransicion, estaVencido, hoyISO, sumarDias, TransicionInvalida } from './estados';
import { AprobarValeDto, CrearValeDto, EditarValeDto, FiltroValesDto, ItemDto } from './vales.dto';

/** Contexto de quién hace la acción, para la auditoría. */
export interface Actor {
  usuario?: UsuarioSesion;
  canal: Canal;
  ip?: string;
}

const esCompras = (u?: UsuarioSesion) => u?.rol === Rol.COMPRAS || u?.rol === Rol.ADMIN;

@Injectable()
export class ValesService {
  constructor(
    @InjectDataSource() private ds: DataSource,
    @Optional() private notif?: NotificacionesService,
  ) {}

  // ---------- Lectura ----------

  async listar(u: UsuarioSesion, f: FiltroValesDto) {
    const qb = this.ds
      .getRepository(Vale)
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.proveedor', 'p')
      .leftJoinAndSelect('v.sector', 's')
      .leftJoinAndSelect('v.solicitante', 'sol')
      .orderBy('v.creadoEn', 'DESC')
      .take(200);
    if (!esCompras(u)) qb.andWhere('v.solicitanteId = :uid', { uid: u.id });
    if (f.estado) qb.andWhere('v.estado = :estado', { estado: f.estado });
    if (f.numero) qb.andWhere('v.numero = :numero', { numero: f.numero });
    if (f.proveedorId) qb.andWhere('v.proveedorId = :pid', { pid: f.proveedorId });
    if (f.sectorId) qb.andWhere('v.sectorId = :sid', { sid: f.sectorId });
    const vales = await qb.getMany();
    return vales.map((v) => this.conVencimiento(v));
  }

  async obtener(u: UsuarioSesion, id: number) {
    const v = await this.cargarCompleto(this.ds.manager, id);
    if (!esCompras(u) && v.solicitanteId !== u.id) throw new ForbiddenException('No podés ver este vale');
    return this.conVencimiento(v);
  }

  /** Para la página pública del QR. Devuelve null si el token no existe. */
  async obtenerPorToken(token: string) {
    const v = await this.ds
      .getRepository(Vale)
      .createQueryBuilder('v')
      .where('v.tokenQr = :token', { token })
      .getOne();
    return v ? this.conVencimiento(await this.cargarCompleto(this.ds.manager, v.id)) : null;
  }

  /** Token del QR (no se expone en los listados). */
  async tokenDe(id: number): Promise<string | null> {
    const v = await this.ds
      .getRepository(Vale)
      .createQueryBuilder('v')
      .addSelect('v.tokenQr')
      .where('v.id = :id', { id })
      .getOne();
    return v?.tokenQr ?? null;
  }

  // ---------- Acciones del solicitante ----------

  async crear(actor: Actor, dto: CrearValeDto) {
    const u = actor.usuario!;
    const v = await this.ds.transaction(async (m) => {
      if (dto.proveedorId) await this.proveedorHabilitado(m, dto.proveedorId);
      const vale = await m.save(
        m.create(Vale, {
          sectorId: u.sectorId,
          solicitanteId: u.id,
          proveedorId: dto.proveedorId ?? null,
          observaciones: dto.observaciones ?? null,
          estado: E.BORRADOR,
        }),
      );
      await this.reemplazarItems(m, vale.id, dto.items);
      await this.evento(m, vale.id, null, E.BORRADOR, actor);
      if (dto.enviar) await this.cambiarEstado(m, vale, E.SOLICITADO, actor);
      return this.cargarCompleto(m, vale.id);
    });
    if (v.estado === E.SOLICITADO) this.avisarNuevoPedido(v);
    return v;
  }

  async editar(actor: Actor, id: number, dto: EditarValeDto) {
    return this.ds.transaction(async (m) => {
      const v = await this.bloquear(m, id);
      const u = actor.usuario!;
      const propioEnBorrador = v.estado === E.BORRADOR && v.solicitanteId === u.id;
      const comprasEnSolicitado = v.estado === E.SOLICITADO && esCompras(u);
      if (!propioEnBorrador && !comprasEnSolicitado) {
        throw new ConflictException('El vale no se puede editar en este estado');
      }
      await this.aplicarCambios(m, v, dto);
      await this.evento(m, v.id, v.estado, v.estado, actor, 'Vale editado');
      return this.cargarCompleto(m, id);
    });
  }

  async enviar(actor: Actor, id: number) {
    const v = await this.ds.transaction(async (m) => {
      const v = await this.bloquear(m, id);
      this.soloSolicitante(actor, v);
      await this.cambiarEstado(m, v, E.SOLICITADO, actor);
      return this.cargarCompleto(m, id);
    });
    this.avisarNuevoPedido(v);
    return v;
  }

  /** "Firma" del empleado: acepta el vale emitido antes de ir a retirar. */
  async aceptar(actor: Actor, id: number) {
    return this.ds.transaction(async (m) => {
      const v = await this.bloquear(m, id);
      this.soloSolicitante(actor, v);
      if (v.estado !== E.EMITIDO) throw new ConflictException('Solo se puede aceptar un vale emitido');
      if (estaVencido(v.estado, v.fechaVigencia)) throw new ConflictException('El vale está vencido');
      if (v.aceptadoEn) return this.cargarCompleto(m, id);
      v.aceptadoEn = new Date();
      await m.save(v);
      await this.evento(m, v.id, v.estado, v.estado, actor, 'Vale aceptado por el empleado (firma)');
      return this.cargarCompleto(m, id);
    });
  }

  // ---------- Acciones de Compras ----------

  /** Compras completa lo que falte, aprueba y el vale se emite (número + QR + vigencia). */
  async aprobar(actor: Actor, id: number, dto: AprobarValeDto, vigenciaDias: number) {
    const v = await this.ds.transaction(async (m) => {
      const v = await this.bloquear(m, id);
      await this.aplicarCambios(m, v, dto);
      if (dto.almacenId !== undefined) v.almacenId = dto.almacenId;
      if (dto.ubicacionId !== undefined) v.ubicacionId = dto.ubicacionId;
      if (!v.proveedorId) throw new BadRequestException('Falta definir el proveedor');
      await this.proveedorHabilitado(m, v.proveedorId);
      if (!(await m.countBy(ValeItem, { valeId: v.id }))) throw new BadRequestException('El vale no tiene productos');

      v.aprobadoPorId = actor.usuario!.id;
      v.aprobadoEn = new Date();
      await this.cambiarEstado(m, v, E.APROBADO, actor);

      const [{ nextval }] = await m.query(SQL_NEXTVAL);
      v.numero = Number(nextval);
      v.tokenQr = randomBytes(24).toString('base64url');
      v.emitidoEn = new Date();
      v.fechaVigencia = sumarDias(hoyISO(), vigenciaDias);
      await this.cambiarEstado(m, v, E.EMITIDO, actor, `Vale N° ${nextval}, válido hasta el ${v.fechaVigencia.split('-').reverse().join('/')}`);
      return this.cargarCompleto(m, id);
    });
    this.notif?.avisar([v.solicitanteId], {
      titulo: `Vale N° ${v.numero} aprobado`,
      cuerpo: `Ya podés retirarlo en ${v.proveedor?.razonSocial ?? 'el proveedor'}. Abrilo y aceptalo para firmarlo.`,
      url: `/#/vales/${v.id}`,
      tag: `vale-${v.id}`,
    });
    return v;
  }

  async rechazar(actor: Actor, id: number, motivo: string) {
    const v = await this.ds.transaction(async (m) => {
      const v = await this.bloquear(m, id);
      v.motivoRechazo = motivo;
      await this.cambiarEstado(m, v, E.RECHAZADO, actor, motivo);
      return this.cargarCompleto(m, id);
    });
    this.notif?.avisar([v.solicitanteId], {
      titulo: 'Pedido rechazado',
      cuerpo: `Compras rechazó tu pedido: ${motivo}`,
      url: `/#/vales/${v.id}`,
      tag: `vale-${v.id}`,
    });
    return v;
  }

  /** El solicitante anula lo suyo mientras no esté aprobado; Compras, hasta antes de la entrega. */
  async anular(actor: Actor, id: number, motivo: string) {
    const v = await this.ds.transaction(async (m) => {
      const v = await this.bloquear(m, id);
      const u = actor.usuario!;
      const propioSinAprobar = v.solicitanteId === u.id && [E.BORRADOR, E.SOLICITADO].includes(v.estado);
      if (!esCompras(u) && !propioSinAprobar) throw new ForbiddenException('No podés anular este vale');
      await this.cambiarEstado(m, v, E.ANULADO, actor, motivo);
      return this.cargarCompleto(m, id);
    });
    if (v.solicitanteId !== actor.usuario?.id) {
      this.notif?.avisar([v.solicitanteId], {
        titulo: v.numero ? `Vale N° ${v.numero} anulado` : 'Pedido anulado',
        cuerpo: `Compras lo anuló: ${motivo}`,
        url: `/#/vales/${v.id}`,
        tag: `vale-${v.id}`,
      });
    }
    return v;
  }

  /**
   * Entrega confirmada: por el proveedor (página del QR, con PIN) o por Compras a mano.
   * Exige que el empleado haya aceptado el vale y que no esté vencido.
   */
  async registrarEntrega(actor: Actor, id: number, remito?: string) {
    return this.ds.transaction(async (m) => {
      const v = await this.bloquear(m, id);
      if (v.estado === E.EMITIDO && !v.aceptadoEn) {
        throw new ConflictException('El empleado todavía no aceptó (firmó) el vale');
      }
      if (estaVencido(v.estado, v.fechaVigencia)) throw new ConflictException('El vale está vencido');
      v.entregadoEn = new Date();
      v.remitoProveedor = remito ?? null;
      await this.cambiarEstado(m, v, E.ENTREGADO, actor, remito ? `Remito ${remito}` : undefined);
      return this.cargarCompleto(m, id);
    });
  }

  /** Usado por el módulo de facturas, dentro de su transacción. */
  async conciliar(m: EntityManager, ids: number[], actor: Actor, detalle: string) {
    const vales = await m.find(Vale, { where: { id: In(ids) }, lock: { mode: 'pessimistic_write' } });
    for (const v of vales) await this.cambiarEstado(m, v, E.CONCILIADO, actor, detalle);
  }

  // ---------- Avisos al celular ----------

  /** "Nuevo pedido" a Compras (sin avisarle a quien lo hizo, si también es de Compras). */
  private avisarNuevoPedido(v: Vale) {
    if (!this.notif) return;
    const items = v.items ?? [];
    const detalle = items.slice(0, 2).map((i) => i.descripcion).join(', ') + (items.length > 2 ? ` y ${items.length - 2} más` : '');
    this.notif.avisar(this.notif.idsDeCompras(v.solicitanteId), {
      titulo: 'Nuevo pedido de compra',
      cuerpo: `${v.solicitante?.nombre ?? 'Un empleado'} (${v.sector?.nombre ?? 'sin sector'}): ${detalle}`,
      url: `/#/vales/${v.id}`,
      tag: `vale-${v.id}`,
    });
  }

  // ---------- Internos ----------

  private async cambiarEstado(m: EntityManager, v: Vale, hacia: E, actor: Actor, detalle?: string) {
    const desde = v.estado;
    try {
      assertTransicion(desde, hacia);
    } catch (e) {
      if (e instanceof TransicionInvalida) throw new ConflictException(e.message);
      throw e;
    }
    v.estado = hacia;
    await m.save(Vale, v);
    await this.evento(m, v.id, desde, hacia, actor, detalle);
  }

  private evento(m: EntityManager, valeId: number, desde: E | null, hacia: E, a: Actor, detalle?: string) {
    return m.insert(ValeEvento, {
      valeId,
      estadoAnterior: desde,
      estadoNuevo: hacia,
      usuarioId: a.usuario?.id ?? null,
      canal: a.canal,
      detalle: detalle ?? null,
      ip: a.ip ?? null,
    });
  }

  private async bloquear(m: EntityManager, id: number): Promise<Vale> {
    const v = await m.findOne(Vale, { where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!v) throw new NotFoundException('Vale inexistente');
    return v;
  }

  private async cargarCompleto(m: EntityManager, id: number): Promise<Vale> {
    const v = await m.findOne(Vale, {
      where: { id },
      relations: { items: true, proveedor: true, sector: true, solicitante: true, aprobadoPor: true, eventos: { usuario: true } },
      order: { items: { orden: 'ASC' }, eventos: { id: 'ASC' } },
    });
    if (!v) throw new NotFoundException('Vale inexistente');
    return v;
  }

  private async aplicarCambios(m: EntityManager, v: Vale, dto: EditarValeDto) {
    if (dto.proveedorId !== undefined) {
      await this.proveedorHabilitado(m, dto.proveedorId);
      v.proveedorId = dto.proveedorId;
    }
    if (dto.observaciones !== undefined) v.observaciones = dto.observaciones;
    await m.save(Vale, v);
    if (dto.items) await this.reemplazarItems(m, v.id, dto.items);
  }

  private async reemplazarItems(m: EntityManager, valeId: number, items: ItemDto[]) {
    await m.delete(ValeItem, { valeId });
    await m.insert(
      ValeItem,
      items.map((i, orden) => ({
        valeId,
        orden,
        cantidad: i.cantidad,
        unidad: i.unidad ?? null,
        descripcion: i.descripcion.trim(),
        codigoArticulo: i.codigoArticulo ?? null,
      })),
    );
  }

  private async proveedorHabilitado(m: EntityManager, id: number) {
    const p = await m.findOneBy(Proveedor, { id });
    if (!p) throw new BadRequestException('Proveedor inexistente');
    if (!p.habilitado) throw new BadRequestException('El proveedor no está habilitado para vales');
    return p;
  }

  private soloSolicitante(actor: Actor, v: Vale) {
    if (v.solicitanteId !== actor.usuario?.id) throw new ForbiddenException('Solo el solicitante puede hacer esto');
  }

  private conVencimiento(v: Vale) {
    return Object.assign(v, { vencido: estaVencido(v.estado, v.fechaVigencia) });
  }
}
