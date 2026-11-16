// Cliente de la API de vales y tipos compartidos.

export type Rol = 'SOLICITANTE' | 'COMPRAS' | 'ADMIN';
export type Estado =
  | 'BORRADOR'
  | 'SOLICITADO'
  | 'APROBADO'
  | 'EMITIDO'
  | 'ENTREGADO'
  | 'CONCILIADO'
  | 'RECHAZADO'
  | 'ANULADO';

export interface Sesion {
  id: number;
  legajo: string;
  nombre: string;
  rol: Rol;
  sectorId: number;
}
export interface Sector {
  id: number;
  nombre: string;
}
export interface Proveedor {
  id: number;
  glmProveedorId: string | null;
  razonSocial: string;
  nombreFantasia: string | null;
  cuit: string | null;
  domicilio: string | null;
  localidad: string | null;
  telefono: string | null;
  habilitado: boolean;
  contactoMail: string | null;
  contactoWhatsapp: string | null;
  sincronizadoEn: string | null;
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
export interface Usuario {
  id: number;
  legajo: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  sectorId: number;
  sector?: Sector;
}
export interface Item {
  cantidad: number;
  unidad?: string | null;
  descripcion: string;
}
export interface Evento {
  id: number;
  estadoAnterior: Estado | null;
  estadoNuevo: Estado;
  canal: 'WEB' | 'BOT' | 'PROVEEDOR' | 'SISTEMA';
  detalle: string | null;
  fechaHora: string;
  usuario: { nombre: string } | null;
}
export interface Vale {
  id: number;
  numero: number | null;
  estado: Estado;
  vencido: boolean;
  sector: Sector;
  solicitanteId: number;
  solicitante: { id: number; nombre: string; legajo: string };
  proveedorId: number | null;
  proveedor: Proveedor | null;
  observaciones: string | null;
  motivoRechazo: string | null;
  aprobadoPor: { nombre: string } | null;
  aprobadoEn: string | null;
  emitidoEn: string | null;
  aceptadoEn: string | null;
  entregadoEn: string | null;
  fechaVigencia: string | null;
  remitoProveedor: string | null;
  creadoEn: string;
  items?: Item[];
  eventos?: Evento[];
}
export interface Factura {
  id: number;
  numero: string;
  fecha: string;
  importe: number;
  proveedor: Proveedor;
  vales: { vale: Vale }[];
}

// ---------- Sesión ----------

const CLAVE = 'vales.sesion';

export function sesionGuardada(): { token: string; usuario: Sesion } | null {
  try {
    const s = localStorage.getItem(CLAVE);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
export function guardarSesion(s: { token: string; usuario: Sesion } | null) {
  try {
    if (s) localStorage.setItem(CLAVE, JSON.stringify(s));
    else localStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento: la sesión dura lo que la pestaña */
  }
  memoria = s;
}
let memoria = sesionGuardada();
let alExpirar: () => void = () => {};
export const onSesionVencida = (fn: () => void) => (alExpirar = fn);

// ---------- Llamadas ----------

export class ApiError extends Error {
  constructor(message: string, public status: number, public detalles: string[] = []) {
    super(message);
  }
}

async function llamar(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (memoria?.token) headers.set('Authorization', `Bearer ${memoria.token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  let r: Response;
  try {
    r = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError('No hay conexión con el servidor', 0);
  }
  if (r.status === 401 && memoria?.token && !path.startsWith('/auth/login')) {
    guardarSesion(null);
    alExpirar();
  }
  if (!r.ok) {
    let msg = `Error ${r.status}`;
    let detalles: string[] = [];
    try {
      const b = await r.json();
      if (Array.isArray(b.message)) {
        msg = 'Revisá los datos';
        detalles = b.message;
      } else if (b.message) msg = b.message;
      if (Array.isArray(b.problemas)) detalles = b.problemas;
    } catch {
      /* respuesta sin JSON */
    }
    throw new ApiError(msg, r.status, detalles);
  }
  return r;
}

export const api = {
  get: async <T>(path: string) => (await llamar(path)).json() as Promise<T>,
  post: async <T>(path: string, body: unknown = {}) =>
    (await llamar(path, { method: 'POST', body: JSON.stringify(body) })).json() as Promise<T>,
  patch: async <T>(path: string, body: unknown) =>
    (await llamar(path, { method: 'PATCH', body: JSON.stringify(body) })).json() as Promise<T>,
  /** Descarga con sesión (p. ej. el PDF) y devuelve un blob. */
  blob: async (path: string) => (await llamar(path)).blob(),
};

// ---------- Formato ----------

export const ESTADOS: Record<Estado, { texto: string; tono: string }> = {
  BORRADOR: { texto: 'Borrador', tono: 'gris' },
  SOLICITADO: { texto: 'En Compras', tono: 'ambar' },
  APROBADO: { texto: 'Aprobado', tono: 'azul' },
  EMITIDO: { texto: 'Listo para retirar', tono: 'azul' },
  ENTREGADO: { texto: 'Retirado', tono: 'verde' },
  CONCILIADO: { texto: 'Facturado', tono: 'verde' },
  RECHAZADO: { texto: 'Rechazado', tono: 'rojo' },
  ANULADO: { texto: 'Anulado', tono: 'rojo' },
};

export const fechaHora = (s?: string | null) =>
  s ? new Date(s).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '';
export const fecha = (s?: string | null) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '');
export const pesos = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
export const hoy = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
