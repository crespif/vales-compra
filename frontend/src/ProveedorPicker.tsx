import { useEffect, useId, useState } from 'react';
import { api, Proveedor } from './api';

/**
 * Buscador de proveedores (vienen de GLM y pueden ser cientos): se escribe parte del nombre,
 * del CUIT o el código de GLM y se elige de la lista.
 */
export function ProveedorPicker({ etiqueta, valor, onChange, incluirDeshabilitados = false, opcional = false }: {
  etiqueta: string;
  valor: Proveedor | null;
  onChange: (p: Proveedor | null) => void;
  incluirDeshabilitados?: boolean;
  opcional?: boolean;
}) {
  const id = useId();
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<Proveedor[]>([]);
  const [buscando, setBuscando] = useState(false);
  const t = texto.trim();

  useEffect(() => {
    if (t.length < 2) return setResultados([]);
    let vigente = true;
    setBuscando(true);
    const h = setTimeout(async () => {
      try {
        const q = new URLSearchParams({ buscar: t, ...(incluirDeshabilitados ? { todos: 'true' } : {}) });
        const r = await api.get<Proveedor[]>(`/proveedores?${q}`);
        if (vigente) setResultados(r);
      } catch {
        if (vigente) setResultados([]);
      } finally {
        if (vigente) setBuscando(false);
      }
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(h);
    };
  }, [t, incluirDeshabilitados]);

  if (valor) {
    return (
      <div className="picker-elegido">
        <span className="muted">{etiqueta}</span>
        <div>
          <strong>{valor.razonSocial}</strong>
          <div className="muted">
            {[valor.cuit && `CUIT ${valor.cuit}`, valor.glmProveedorId && `GLM ${valor.glmProveedorId}`, !valor.habilitado && 'No disponible en GLM']
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <button type="button" onClick={() => { onChange(null); setTexto(''); }}>
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="picker">
      <label htmlFor={id}>
        {etiqueta}
        {opcional && ' (opcional)'}
      </label>
      <input id={id} type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre, CUIT o código de GLM" autoComplete="off" />
      {t.length >= 2 && (
        <div className="picker-lista" role="listbox" aria-label="Proveedores encontrados">
          {resultados.map((p) => (
            <button type="button" role="option" aria-selected="false" key={p.id} onClick={() => onChange(p)}>
              <strong>{p.razonSocial}</strong>
              <span className="muted">
                {[p.nombreFantasia, p.cuit, p.localidad].filter(Boolean).join(' · ')}
                {!p.habilitado && ' · no disponible'}
              </span>
            </button>
          ))}
          {!buscando && !resultados.length && <p className="muted" style={{ padding: '8px 12px', margin: 0 }}>No se encontraron proveedores.</p>}
          {resultados.length === 50 && <p className="muted" style={{ padding: '8px 12px', margin: 0 }}>Hay más resultados: escribí algo más específico.</p>}
        </div>
      )}
    </div>
  );
}
