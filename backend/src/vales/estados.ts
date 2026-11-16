import { EstadoVale as E } from '../database/entities';

/**
 * Transiciones permitidas (ver diagrama "Estados del vale" del documento de diseño).
 * Cualquier cambio de estado pasa por `assertTransicion`, así no hay atajos.
 */
export const TRANSICIONES: Record<E, E[]> = {
  [E.BORRADOR]: [E.SOLICITADO, E.ANULADO],
  [E.SOLICITADO]: [E.APROBADO, E.RECHAZADO, E.ANULADO, E.BORRADOR],
  [E.APROBADO]: [E.EMITIDO, E.ANULADO],
  [E.EMITIDO]: [E.ENTREGADO, E.ANULADO],
  [E.ENTREGADO]: [E.CONCILIADO],
  [E.CONCILIADO]: [],
  [E.RECHAZADO]: [],
  [E.ANULADO]: [],
};

export class TransicionInvalida extends Error {
  constructor(public desde: E, public hacia: E) {
    super(`No se puede pasar un vale de ${desde} a ${hacia}`);
  }
}

export function puedeTransicionar(desde: E, hacia: E): boolean {
  return TRANSICIONES[desde].includes(hacia);
}

export function assertTransicion(desde: E, hacia: E): void {
  if (!puedeTransicionar(desde, hacia)) throw new TransicionInvalida(desde, hacia);
}

/** Un vale emitido vence si nadie lo retiró antes de su fecha de vigencia (inclusive). */
export function estaVencido(estado: E, fechaVigencia: string | null, hoy = hoyISO()): boolean {
  return estado === E.EMITIDO && !!fechaVigencia && fechaVigencia < hoy;
}

/** Fecha de hoy en Argentina (UTC-3) como YYYY-MM-DD. */
export function hoyISO(ahora = new Date()): string {
  return new Date(ahora.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

export function sumarDias(fechaISO: string, dias: number): string {
  const d = new Date(fechaISO + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
