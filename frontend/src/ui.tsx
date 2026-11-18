import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError, ESTADOS, Estado } from './api';

export function EstadoBadge({ estado, vencido }: { estado: Estado; vencido?: boolean }) {
  if (vencido) return <span className="badge rojo">Vencido</span>;
  const e = ESTADOS[estado];
  return <span className={`badge ${e.tono}`}>{e.texto}</span>;
}

const IconoError = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 7v6M12 17h.01" />
  </svg>
);

/** Tilde que se dibuja sola: confirma visualmente que algo salió bien. */
const IconoOk = () => (
  <svg className="tilde" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" opacity="0.35" />
    <path d="M7 12.5l3.2 3.2L17 9" />
  </svg>
);

export function ErrorMsg({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error instanceof ApiError ? error : null;
  return (
    <div className="alerta error" role="alert">
      <IconoError />
      <div>
        {error instanceof Error ? error.message : 'Ocurrió un error inesperado'}
        {e?.detalles.length ? (
          <ul>
            {e.detalles.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export function Aviso({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <div className="alerta ok" role="status" key={texto}>
      <IconoOk />
      <div>{texto}</div>
    </div>
  );
}

/** Filas grises que "brillan" mientras se carga una lista. */
export function Esqueleto({ filas = 4 }: { filas?: number }) {
  return (
    <div className="esqueleto" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} style={{ opacity: 1 - i * 0.18 }} />
      ))}
    </div>
  );
}

export function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <div className="vacio">
      <img src="/logo-64.png" alt="" />
      <div>{children}</div>
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="cargando" aria-busy="true">
      <img src="/logo-64.png" alt="" />
      <span>{texto}</span>
    </div>
  );
}

/** Rueda chica para botones mientras se envía algo. */
export const Girando = () => <span className="girando" aria-hidden="true" />;

const PASOS = ['Pedido', 'En Compras', 'Listo', 'Retirado', 'Facturado'];
const POSICION: Partial<Record<Estado, number>> = {
  BORRADOR: 0,
  SOLICITADO: 1,
  APROBADO: 2,
  EMITIDO: 2,
  ENTREGADO: 3,
  CONCILIADO: 5,
};

/** Barra de progreso del vale: muestra en qué paso está, de un vistazo. */
export function ProgresoVale({ estado }: { estado: Estado }) {
  const actual = POSICION[estado];
  if (actual === undefined) return null; // rechazado o anulado: se ve en el estado
  return (
    <div className="progreso" role="list" aria-label="Avance del vale">
      {PASOS.map((p, i) => {
        const clase = i < actual ? 'hecho' : i === actual ? 'actual' : '';
        return (
          <div key={p} role="listitem" className={`paso ${clase}`} style={{ '--i': i } as React.CSSProperties} aria-current={i === actual ? 'step' : undefined}>
            <span className="punto">{i < actual ? '✓' : ''}</span>
            <span className="etiqueta">{p}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Carga datos y expone { datos, error, cargando, recargar }. */
export function useCarga<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [cargando, setCargando] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      setDatos(await fn());
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setCargando(false);
    }
  }, deps);
  useEffect(() => {
    recargar();
  }, [recargar]);
  return { datos, setDatos, error, cargando, recargar };
}

/** Evento que dispara la app cuando llega una notificación (ver main.tsx y sw.js). */
export const EVENTO_ACTUALIZAR = 'vales:actualizar';

/**
 * Vuelve a traer los datos sola cuando llega una notificación o cuando la app
 * vuelve a primer plano (p. ej. al volver de otra pestaña o desbloquear el celular).
 */
export function useAutoRefresco(recargar: () => unknown) {
  useEffect(() => {
    const visible = () => document.visibilityState === 'visible' && recargar();
    window.addEventListener(EVENTO_ACTUALIZAR, recargar);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener(EVENTO_ACTUALIZAR, recargar);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [recargar]);
}

/** Botón redondo para volver a traer los datos; gira mientras carga. */
export function BotonActualizar({ onClick, cargando }: { onClick: () => unknown; cargando: boolean }) {
  return (
    <button type="button" className={`icono actualizar${cargando ? ' girando' : ''}`} onClick={() => onClick()} disabled={cargando} aria-label="Actualizar" title="Actualizar">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
    </button>
  );
}

/** Ejecuta una acción con estado de "ocupado" y error. */
export function useAccion() {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function ejecutar<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setOcupado(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return undefined;
    } finally {
      setOcupado(false);
    }
  }
  return { ocupado, error, setError, ejecutar };
}

export const fmtCant = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString('es-AR'));

/** Devuelve el valor recién cuando el usuario deja de escribir. */
export function useDemorado<T>(valor: T, ms = 250) {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const h = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(h);
  }, [valor, ms]);
  return v;
}

/**
 * Barra de botones fija al pie de la pantalla. Se dibuja directamente en <body>:
 * si quedara dentro de un contenedor animado (con transform), dejaría de estar fija
 * y taparía el final del formulario.
 */
export function BarraFija({ children }: { children: React.ReactNode }) {
  return createPortal(<div className="acciones fija">{children}</div>, document.body);
}
