import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TS } from './motor';

/**
 * Modelo de datos — Vales de compra menor digitales (CELTA).
 * Ver documento de diseño, sección "Modelo de datos".
 */

export enum Rol {
  SOLICITANTE = 'SOLICITANTE',
  COMPRAS = 'COMPRAS',
  ADMIN = 'ADMIN',
}

export enum EstadoVale {
  BORRADOR = 'BORRADOR',
  SOLICITADO = 'SOLICITADO',
  APROBADO = 'APROBADO',
  EMITIDO = 'EMITIDO',
  ENTREGADO = 'ENTREGADO',
  CONCILIADO = 'CONCILIADO',
  RECHAZADO = 'RECHAZADO',
  ANULADO = 'ANULADO',
}

export enum Canal {
  WEB = 'WEB',
  BOT = 'BOT',
  PROVEEDOR = 'PROVEEDOR',
  SISTEMA = 'SISTEMA',
}

/** Postgres devuelve numeric como string: lo pasamos a number. */
const decimal = {
  to: (v?: number | null) => v,
  from: (v?: string | null) => (v == null ? null : Number(v)),
};

@Entity('sector')
export class Sector {
  @PrimaryGeneratedColumn() id: number;
  @Column({ unique: true }) nombre: string;
  @Column({ default: true }) activo: boolean;
  // Integración GLM (etapa 3)
  @Column({ name: 'almacen_default_id', type: 'varchar', nullable: true }) almacenDefaultId: string | null;
  @Column({ name: 'ubicacion_default_id', type: 'varchar', nullable: true }) ubicacionDefaultId: string | null;
  @Column({ name: 'glm_sector_id', type: 'varchar', nullable: true }) glmSectorId: string | null;
}

@Entity('usuario')
export class Usuario {
  @PrimaryGeneratedColumn() id: number;
  @Column({ unique: true }) legajo: string;
  @Column() nombre: string;
  @Column({ name: 'password_hash', select: false }) passwordHash: string;
  @Column({ type: 'enum', enum: Rol, enumName: 'rol', default: Rol.SOLICITANTE }) rol: Rol;
  @Column({ default: true }) activo: boolean;
  @Column({ name: 'sector_id' }) sectorId: number;
  @ManyToOne(() => Sector) @JoinColumn({ name: 'sector_id' }) sector: Sector;
  // Vinculación con el bot (etapa 4)
  @Column({ name: 'telefono_vinculado', type: 'varchar', nullable: true }) telefonoVinculado: string | null;
  @Column({ name: 'chat_id', type: 'varchar', nullable: true, unique: true }) chatId: string | null;
  @CreateDateColumn({ name: 'creado_en', type: TS }) creadoEn: Date;
}

/**
 * Copia local, de solo lectura, de los proveedores de GLM.
 * Se actualiza con la sincronización (src/glm); la app no los crea ni los edita.
 */
@Entity('proveedor')
export class Proveedor {
  @PrimaryGeneratedColumn() id: number;
  /** "codigo" del proveedor en GLM. */
  @Column({ name: 'glm_proveedor_id', type: 'varchar', nullable: true, unique: true }) glmProveedorId: string | null;
  @Column({ name: 'razon_social' }) razonSocial: string;
  @Column({ name: 'nombre_fantasia', type: 'varchar', nullable: true }) nombreFantasia: string | null;
  @Column({ type: 'varchar', nullable: true }) cuit: string | null;
  @Column({ type: 'varchar', nullable: true }) domicilio: string | null;
  @Column({ type: 'varchar', nullable: true }) localidad: string | null;
  @Column({ type: 'varchar', nullable: true }) telefono: string | null;
  @Column({ name: 'contacto_mail', type: 'varchar', nullable: true }) contactoMail: string | null;
  @Column({ name: 'contacto_whatsapp', type: 'varchar', nullable: true }) contactoWhatsapp: string | null;
  /** false si dejó de figurar en GLM: no se puede usar en vales nuevos, pero se conserva su historial. */
  @Column({ default: true }) habilitado: boolean;
  @Column({ name: 'sincronizado_en', type: TS, nullable: true }) sincronizadoEn: Date | null;
  /** PIN que el proveedor usa para confirmar entregas (hash bcrypt). Es lo único propio de la app. */
  @Column({ name: 'pin_hash', type: 'varchar', nullable: true, select: false }) pinHash: string | null;
}

@Entity('vale')
export class Vale {
  @PrimaryGeneratedColumn() id: number;
  /** Se asigna recién al EMITIR, desde la secuencia vale_numero_seq. */
  @Column({ type: 'int', nullable: true, unique: true }) numero: number | null;
  @Index()
  @Column({ type: 'enum', enum: EstadoVale, enumName: 'estado_vale', default: EstadoVale.BORRADOR })
  estado: EstadoVale;
  @Column({ name: 'sector_id' }) sectorId: number;
  @ManyToOne(() => Sector) @JoinColumn({ name: 'sector_id' }) sector: Sector;
  @Column({ name: 'solicitante_id' }) solicitanteId: number;
  @ManyToOne(() => Usuario) @JoinColumn({ name: 'solicitante_id' }) solicitante: Usuario;
  @Column({ name: 'proveedor_id', type: 'int', nullable: true }) proveedorId: number | null;
  @ManyToOne(() => Proveedor) @JoinColumn({ name: 'proveedor_id' }) proveedor: Proveedor | null;
  @Column({ type: 'text', nullable: true }) observaciones: string | null;
  @Column({ name: 'motivo_rechazo', type: 'text', nullable: true }) motivoRechazo: string | null;
  @Column({ name: 'aprobado_por', type: 'int', nullable: true }) aprobadoPorId: number | null;
  @ManyToOne(() => Usuario) @JoinColumn({ name: 'aprobado_por' }) aprobadoPor: Usuario | null;
  @Column({ name: 'aprobado_en', type: TS, nullable: true }) aprobadoEn: Date | null;
  @Column({ name: 'emitido_en', type: TS, nullable: true }) emitidoEn: Date | null;
  /** "Firma" del empleado: acepta el vale con su usuario antes de retirar. */
  @Column({ name: 'aceptado_en', type: TS, nullable: true }) aceptadoEn: Date | null;
  @Column({ name: 'entregado_en', type: TS, nullable: true }) entregadoEn: Date | null;
  @Column({ name: 'fecha_vigencia', type: 'date', nullable: true }) fechaVigencia: string | null;
  @Column({ name: 'remito_proveedor', type: 'varchar', nullable: true }) remitoProveedor: string | null;
  @Column({ name: 'token_qr', type: 'varchar', nullable: true, unique: true, select: false }) tokenQr: string | null;
  // Integración GLM (etapa 3)
  @Column({ name: 'almacen_id', type: 'varchar', nullable: true }) almacenId: string | null;
  @Column({ name: 'ubicacion_id', type: 'varchar', nullable: true }) ubicacionId: string | null;
  @Column({ name: 'glm_orden_id', type: 'varchar', nullable: true }) glmOrdenId: string | null;
  @Column({ name: 'glm_sync_estado', type: 'varchar', nullable: true }) glmSyncEstado: string | null;
  @CreateDateColumn({ name: 'creado_en', type: TS }) creadoEn: Date;
  @UpdateDateColumn({ name: 'actualizado_en', type: TS }) actualizadoEn: Date;
  @OneToMany(() => ValeItem, (i) => i.vale, { cascade: true }) items: ValeItem[];
  @OneToMany(() => ValeEvento, (e) => e.vale) eventos: ValeEvento[];
}

@Entity('vale_item')
export class ValeItem {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'vale_id' }) valeId: number;
  @ManyToOne(() => Vale, (v) => v.items, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'vale_id' }) vale: Vale;
  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: decimal }) cantidad: number;
  @Column({ type: 'varchar', nullable: true }) unidad: string | null;
  @Column() descripcion: string;
  @Column({ name: 'codigo_articulo', type: 'varchar', nullable: true }) codigoArticulo: string | null;
  @Column({ default: 0 }) orden: number;
}

@Entity('vale_evento')
export class ValeEvento {
  @PrimaryGeneratedColumn() id: number;
  @Index()
  @Column({ name: 'vale_id' }) valeId: number;
  @ManyToOne(() => Vale, (v) => v.eventos, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'vale_id' }) vale: Vale;
  @Column({ name: 'estado_anterior', type: 'enum', enum: EstadoVale, enumName: 'estado_vale', nullable: true })
  estadoAnterior: EstadoVale | null;
  @Column({ name: 'estado_nuevo', type: 'enum', enum: EstadoVale, enumName: 'estado_vale' }) estadoNuevo: EstadoVale;
  @Column({ name: 'usuario_id', type: 'int', nullable: true }) usuarioId: number | null;
  @ManyToOne(() => Usuario) @JoinColumn({ name: 'usuario_id' }) usuario: Usuario | null;
  @Column({ type: 'enum', enum: Canal, enumName: 'canal' }) canal: Canal;
  @Column({ type: 'text', nullable: true }) detalle: string | null;
  @Column({ type: 'varchar', nullable: true }) ip: string | null;
  @CreateDateColumn({ name: 'fecha_hora', type: TS }) fechaHora: Date;
}

@Entity('factura')
export class Factura {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'proveedor_id' }) proveedorId: number;
  @ManyToOne(() => Proveedor) @JoinColumn({ name: 'proveedor_id' }) proveedor: Proveedor;
  @Column() numero: string;
  @Column({ type: 'date' }) fecha: string;
  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: decimal }) importe: number;
  @Column({ name: 'cargado_por', type: 'int', nullable: true }) cargadoPorId: number | null;
  @CreateDateColumn({ name: 'creado_en', type: TS }) creadoEn: Date;
  @OneToMany(() => FacturaVale, (fv) => fv.factura, { cascade: true }) vales: FacturaVale[];
}

@Entity('factura_vale')
export class FacturaVale {
  @PrimaryColumn({ name: 'factura_id' }) facturaId: number;
  @PrimaryColumn({ name: 'vale_id' }) valeId: number;
  @ManyToOne(() => Factura, (f) => f.vales, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'factura_id' }) factura: Factura;
  @ManyToOne(() => Vale) @JoinColumn({ name: 'vale_id' }) vale: Vale;
}

@Entity('parametro')
export class Parametro {
  @PrimaryColumn() clave: string;
  @Column({ type: 'text' }) valor: string;
}

/**
 * Un celular/navegador donde el usuario activó las notificaciones (Web Push).
 * Un usuario puede tener varios; si el navegador la da de baja, se borra sola.
 */
@Entity('push_suscripcion')
export class PushSuscripcion {
  @PrimaryGeneratedColumn() id: number;
  @Index()
  @Column({ name: 'usuario_id' }) usuarioId: number;
  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'usuario_id' }) usuario: Usuario;
  /** sha256 del endpoint: el endpoint puede ser muy largo para un índice único. */
  @Column({ name: 'endpoint_hash', type: 'varchar', length: 64, unique: true }) endpointHash: string;
  @Column({ type: 'text' }) endpoint: string;
  @Column({ type: 'varchar', length: 200 }) p256dh: string;
  @Column({ type: 'varchar', length: 100 }) auth: string;
  @Column({ type: 'varchar', length: 250, nullable: true }) dispositivo: string | null;
  @CreateDateColumn({ name: 'creado_en', type: TS }) creadoEn: Date;
}

export const ENTITIES = [Sector, Usuario, Proveedor, Vale, ValeItem, ValeEvento, Factura, FacturaVale, Parametro, PushSuscripcion];
