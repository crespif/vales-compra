import { useCallback, useEffect, useState } from 'react';
import { ApiError, ESTADOS, Estado } from './api';

export function EstadoBadge({ estado, vencido }: { estado: Estado; vencido?: boolean }) {
  if (vencido) return <span className="badge rojo">Vencido</span>;
  const e = ESTADOS[estado];
  return <span className={`badge ${e.tono}`}>{e.texto}</span>;
}

export function ErrorMsg({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error instanceof ApiError ? error : null;
  return (
    <div className="alerta error" role="alert">
      {error instanceof Error ? error.message : 'Ocurrió un error inesperado'}
      {e?.detalles.length ? (
        <ul>
          {e.detalles.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      ) : null}
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
