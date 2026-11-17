import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ESTADOS, Estado, fechaHora, Vale } from '../api';
import { esCompras, useSesion } from '../sesion';
import { ErrorMsg, Esqueleto, EstadoBadge, useCarga, Vacio } from '../ui';

type Filtro = { etiqueta: string; estado?: Estado };

const FILTROS_COMPRAS: Filtro[] = [
  { etiqueta: 'Para aprobar', estado: 'SOLICITADO' },
  { etiqueta: 'Emitidos', estado: 'EMITIDO' },
  { etiqueta: 'Retirados', estado: 'ENTREGADO' },
  { etiqueta: 'Facturados', estado: 'CONCILIADO' },
  { etiqueta: 'Todos' },
];
const FILTROS_EMPLEADO: Filtro[] = [{ etiqueta: 'Todos' }, { etiqueta: 'Para retirar', estado: 'EMITIDO' }, { etiqueta: 'En Compras', estado: 'SOLICITADO' }, { etiqueta: 'Retirados', estado: 'ENTREGADO' }];

export function ListaVales() {
  const { usuario } = useSesion();
  const compras = esCompras(usuario);
  const filtros = compras ? FILTROS_COMPRAS : FILTROS_EMPLEADO;
  const [filtro, setFiltro] = useState(filtros[0]);
  const [buscar, setBuscar] = useState('');
  const numero = /^\d+$/.test(buscar.trim()) ? buscar.trim() : '';

  const { datos, error, cargando } = useCarga(() => {
    const q = new URLSearchParams();
    if (numero) q.set('numero', numero);
    else if (filtro.estado) q.set('estado', filtro.estado);
    return api.get<Vale[]>(`/vales?${q}`);
  }, [filtro, numero]);

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>{compras ? 'Vales' : 'Mis vales'}</h1>
          <p className="muted">{compras ? 'Pedidos de todos los sectores' : 'Tus pedidos a Compras'}</p>
        </div>
        <Link to="/nuevo" className="boton primario">
          + Nuevo
        </Link>
      </div>

      {compras && (
        <label>
          Buscar por número de vale
          <input inputMode="numeric" placeholder="Ej.: 53052" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </label>
      )}

      {!numero && (
        <div className="filtros" role="tablist">
          {filtros.map((f) => (
            <button key={f.etiqueta} className={f === filtro ? 'on' : ''} onClick={() => setFiltro(f)}>
              {f.etiqueta}
            </button>
          ))}
        </div>
      )}

      <ErrorMsg error={error} />
      {cargando && !datos ? (
        <Esqueleto />
      ) : datos?.length ? (
        <div className="lista">
          {datos.map((v, i) => (
            <Link key={v.id} to={`/vales/${v.id}`} className={`fila t-${v.vencido ? 'rojo' : ESTADOS[v.estado].tono}`} style={{ '--i': i } as React.CSSProperties}>
              <span className="titulo">
                {v.numero ? `N° ${v.numero}` : 'Sin número'} · {v.proveedor?.razonSocial ?? 'Proveedor a definir'}
              </span>
              <span style={{ gridRow: 'span 2' }}>
                <EstadoBadge estado={v.estado} vencido={v.vencido} />
              </span>
              <span className="sub">
                {compras ? `${v.sector.nombre} · ${v.solicitante.nombre} · ` : ''}
                {fechaHora(v.creadoEn)}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <Vacio>{numero ? `No hay un vale N° ${numero}.` : 'No hay vales en esta lista.'}</Vacio>
      )}
    </>
  );
}
