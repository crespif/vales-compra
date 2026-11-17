import React, { useEffect, useState } from 'react';
import { api, fechaHora, Proveedor, ResultadoSync } from '../api';
import { Aviso, ErrorMsg, Esqueleto, Girando, useAccion, useCarga, useDemorado, Vacio } from '../ui';

type FiltroProv = 'activos' | 'sinpin' | 'baja' | 'todos';
const FILTROS_PROV: { valor: FiltroProv; texto: string }[] = [
  { valor: 'activos', texto: 'Activos' },
  { valor: 'sinpin', texto: 'Sin PIN' },
  { valor: 'baja', texto: 'No están en GLM' },
  { valor: 'todos', texto: 'Todos' },
];
type ProveedorListado = Proveedor & { tienePin: boolean };

export function Proveedores() {
  const ultima = useCarga(() => api.get<ResultadoSync | null>('/proveedores/sincronizacion'));
  const accion = useAccion();
  const [ok, setOk] = useState<string | null>(null);
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState<FiltroProv>('activos');
  const [pagina, setPagina] = useState(1);
  const t = useDemorado(buscar.trim());
  useEffect(() => setPagina(1), [t, filtro]);
  const lista = useCarga(
    () => api.get<{ items: ProveedorListado[]; total: number; pagina: number; paginas: number }>(
      `/proveedores/listado?${new URLSearchParams({ filtro, pagina: String(pagina), ...(t ? { buscar: t } : {}) })}`,
    ),
    [t, filtro, pagina],
  );
  const [pinDe, setPinDe] = useState<number | null>(null);
  const [pin, setPin] = useState('');

  async function sincronizar() {
    setOk(null);
    const r = await accion.ejecutar(() => api.post<ResultadoSync>('/proveedores/sincronizar'));
    if (r) {
      setOk(`Proveedores actualizados desde GLM: ${r.nuevos} nuevos, ${r.actualizados} con cambios, ${r.deshabilitados} dados de baja.`);
      lista.recargar();
    }
    ultima.recargar();
  }

  async function guardarPin() {
    if (await accion.ejecutar(() => api.post(`/proveedores/${pinDe}/pin`, { pin }))) {
      setOk('PIN guardado. Comunicáselo al proveedor por un medio seguro (en persona o por teléfono).');
      setPinDe(null);
      setPin('');
      lista.recargar();
    }
  }

  const u = ultima.datos;
  const d = lista.datos;
  return (
    <>
    <h1>Proveedores</h1>
    <p className="muted">Vienen de GLM y se actualizan solos cada hora. Acá solo se define el PIN con el que cada proveedor confirma las entregas.</p>
    <br />
    <div className="card">
      <div className="sync">
        <p className="muted">
          {!u
            ? 'Todavía no se sincronizó con GLM.'
            : u.ok
              ? `Última actualización: ${fechaHora(u.fecha)} · ${u.recibidos} proveedores recibidos.`
              : `Falló la última actualización (${fechaHora(u.fecha)}): ${u.error}`}
        </p>
        <button onClick={sincronizar} disabled={accion.ocupado}>
          {accion.ocupado ? (
            <>
              <Girando /> Actualizando…
            </>
          ) : (
            'Actualizar desde GLM'
          )}
        </button>
      </div>
      <Aviso texto={ok} />
      <ErrorMsg error={accion.error ?? lista.error} />

      <input
        type="search"
        className="buscador"
        aria-label="Buscar proveedor"
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
        placeholder="Nombre, CUIT o código GLM"
      />
      <div className="filtros" role="tablist" style={{ marginTop: 12 }}>
        {FILTROS_PROV.map((f) => (
          <button key={f.valor} className={f.valor === filtro ? 'on' : ''} onClick={() => setFiltro(f.valor)}>
            {f.texto}
          </button>
        ))}
      </div>
      <p className="muted">
        {d ? `${d.total} ${d.total === 1 ? 'proveedor' : 'proveedores'}${t ? ` para “${t}”` : ''}` : 'Cargando…'}
      </p>

      <div className="lista">
        {!d && <Esqueleto />}
        {d && !d.items.length && <Vacio>No se encontraron proveedores.</Vacio>}
        {d?.items.map((p, i) => (
          <div key={p.id} className={`fila t-${!p.habilitado ? 'gris' : p.tienePin ? 'verde' : 'ambar'}`} style={{ '--i': i } as React.CSSProperties}>
            <span className="titulo">{p.razonSocial}</span>
            <span style={{ gridRow: 'span 2', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
              {!p.habilitado && <span className="badge gris">No está en GLM</span>}
              {p.habilitado && <span className={`badge ${p.tienePin ? 'verde' : 'ambar'}`}>{p.tienePin ? 'Con PIN' : 'Sin PIN'}</span>}
            </span>
            <span className="sub">{[p.glmProveedorId && `GLM ${p.glmProveedorId}`, p.cuit, p.localidad].filter(Boolean).join(' · ')}</span>
            {pinDe !== p.id && (
              <span className="sub">
                <a href="#" onClick={(e) => { e.preventDefault(); setPinDe(p.id); setPin(''); }}>
                  {p.tienePin ? 'Cambiar PIN' : 'Definir PIN'}
                </a>
              </span>
            )}
            {pinDe === p.id && (
              <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                <label>
                  Nuevo PIN (4 a 8 números)
                  <input inputMode="numeric" autoFocus value={pin} maxLength={8} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
                </label>
                <div className="acciones">
                  <button className="primario" disabled={pin.length < 4 || accion.ocupado} onClick={guardarPin}>Guardar PIN</button>
                  <button onClick={() => setPinDe(null)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {d && d.paginas > 1 && (
        <div className="paginado">
          <button disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>← Anterior</button>
          <span className="muted">Página {d.pagina} de {d.paginas}</span>
          <button disabled={pagina >= d.paginas} onClick={() => setPagina(pagina + 1)}>Siguiente →</button>
        </div>
      )}
    </div>
    </>
  );
}

