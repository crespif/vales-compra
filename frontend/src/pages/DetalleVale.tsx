import QRCode from 'qrcode';
import React, { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, ESTADOS, Evento, fecha, fechaHora, Proveedor, Vale } from '../api';
import { ProveedorPicker } from '../ProveedorPicker';
import { esCompras, useSesion } from '../sesion';
import { Aviso, Cargando, ErrorMsg, EstadoBadge, fmtCant, Girando, ProgresoVale, useAccion, useCarga, BotonActualizar, useAutoRefresco } from '../ui';
import { aForm, aItems, ItemForm, ItemsEditor } from './NuevoVale';

const textoEvento = (e: Evento) => {
  if (e.estadoAnterior === e.estadoNuevo) return e.detalle ?? 'Actualizado';
  if (!e.estadoAnterior) return 'Pedido creado';
  const base: Record<string, string> = {
    SOLICITADO: 'Enviado a Compras',
    APROBADO: 'Aprobado por Compras',
    EMITIDO: 'Vale emitido',
    ENTREGADO: e.canal === 'PROVEEDOR' ? 'Entrega confirmada por el proveedor' : 'Entrega registrada por Compras',
    CONCILIADO: 'Facturado',
    RECHAZADO: 'Rechazado',
    ANULADO: 'Anulado',
    BORRADOR: 'Vuelto a borrador',
  };
  return base[e.estadoNuevo] ?? ESTADOS[e.estadoNuevo].texto;
};

export function DetalleVale() {
  const { id } = useParams();
  const { usuario } = useSesion();
  const compras = esCompras(usuario);
  const loc = useLocation();
  const [aviso, setAviso] = useState<string | null>((loc.state as { aviso?: string } | null)?.aviso ?? null);
  const { datos: v, setDatos, error: errorCarga, cargando, recargar } = useCarga(() => api.get<Vale>(`/vales/${id}`), [id]);
  useAutoRefresco(recargar);
  const accion = useAccion();
  const esMio = v?.solicitanteId === usuario.id;

  // Link y QR, una vez emitido
  const [link, setLink] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const emitido = !!v?.numero;
  useEffect(() => {
    if (!emitido) return;
    api.get<{ url: string }>(`/vales/${id}/link`).then(async ({ url }) => {
      setLink(url);
      setQr(await QRCode.toDataURL(url, { margin: 1, width: 440, errorCorrectionLevel: 'H', color: { dark: '#1f2a24', light: '#ffffff' } }));
    }, () => {});
  }, [id, emitido]);

  async function hacer(path: string, body: unknown, ok: string) {
    const r = await accion.ejecutar(() => api.post<Vale>(`/vales/${id}/${path}`, body));
    if (r) {
      setDatos(r);
      setAviso(ok);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return r;
  }

  async function verPdf() {
    const w = window.open('', '_blank');
    const blob = await accion.ejecutar(() => api.blob(`/vales/${id}/pdf`));
    if (!blob) return w?.close();
    const url = URL.createObjectURL(blob);
    if (w) w.location.href = url;
    else location.href = url;
  }

  async function compartir() {
    if (!link || !v) return;
    const texto = `Vale de compra CELTA N° ${v.numero} — ${v.proveedor?.razonSocial ?? ''}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: texto, text: texto, url: link });
      } catch {
        /* cancelado */
      }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${texto}\n${link}`)}`, '_blank');
    }
  }

  if (cargando && !v) return <Cargando texto="Cargando el vale…" />;
  if (!v) return <ErrorMsg error={errorCarga} />;

  const items = v.items ?? [];

  return (
    <>
      <p>
        <Link to="/vales">← Volver</Link>
      </p>
      <div className="cabecera">
        <div>
          <h1>{v.numero ? `Vale N° ${v.numero}` : 'Pedido sin número'}</h1>
          <p className="muted">
            {v.sector.nombre} · pedido por {v.solicitante.nombre} el {fechaHora(v.creadoEn)}
          </p>
        </div>
        <div className="cabecera-acciones">
          <EstadoBadge estado={v.estado} vencido={v.vencido} />
          <BotonActualizar onClick={recargar} cargando={cargando} />
        </div>
      </div>

      {!v.vencido && <ProgresoVale estado={v.estado} />}
      <Aviso texto={aviso} />
      <ErrorMsg error={accion.error} />

      {/* ---------- Lo que tiene que hacer quien mira ---------- */}
      {esMio && <PasoEmpleado v={v} qr={qr} accion={accion} hacer={hacer} verPdf={verPdf} compartir={compartir} />}
      {compras && v.estado === 'SOLICITADO' && <Aprobacion v={v} ocupado={accion.ocupado} hacer={hacer} />}
      {compras && v.estado === 'EMITIDO' && <GestionEmitido v={v} ocupado={accion.ocupado} hacer={hacer} />}
      {compras && !esMio && emitido && (
        <div className="acciones" style={{ marginBottom: 12 }}>
          <button onClick={verPdf}>Ver PDF</button>
          {link && (
            <button onClick={() => navigator.clipboard?.writeText(link).then(() => setAviso('Link de validación copiado.'))}>Copiar link del QR</button>
          )}
        </div>
      )}

      {/* ---------- Detalle ---------- */}
      {!(compras && v.estado === 'SOLICITADO') && (
        <div className="card">
          <h2>Productos</h2>
          <table className="items">
            <thead>
              <tr>
                <th>Cant.</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i, n) => (
                <tr key={n}>
                  <td className="cant">
                    {fmtCant(i.cantidad)} {i.unidad}
                  </td>
                  <td>{i.descripcion}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {v.observaciones && <p className="muted" style={{ marginTop: 8 }}>Obs.: {v.observaciones}</p>}
        </div>
      )}

      <div className="card">
        <h2>Datos</h2>
        <dl className="datos">
          <dt>Proveedor</dt>
          <dd>{v.proveedor?.razonSocial ?? 'A definir por Compras'}</dd>
          {v.aprobadoPor && (
            <>
              <dt>Autorizó</dt>
              <dd>
                {v.aprobadoPor.nombre} · {fechaHora(v.aprobadoEn)}
              </dd>
            </>
          )}
          {v.fechaVigencia && (
            <>
              <dt>Válido hasta</dt>
              <dd>{fecha(v.fechaVigencia)}</dd>
            </>
          )}
          {v.emitidoEn && (
            <>
              <dt>Firma del empleado</dt>
              <dd>{v.aceptadoEn ? fechaHora(v.aceptadoEn) : 'Pendiente'}</dd>
            </>
          )}
          {v.entregadoEn && (
            <>
              <dt>Retirado</dt>
              <dd>
                {fechaHora(v.entregadoEn)}
                {v.remitoProveedor ? ` · remito ${v.remitoProveedor}` : ''}
              </dd>
            </>
          )}
          {v.motivoRechazo && (
            <>
              <dt>Motivo de rechazo</dt>
              <dd>{v.motivoRechazo}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="card">
        <h2>Historial</h2>
        <ol className="historial">
          {(v.eventos ?? []).map((e, i) => (
            <li key={e.id} style={{ '--i': i } as React.CSSProperties}>
              <strong>{textoEvento(e)}</strong>
              <div className="muted">
                {fechaHora(e.fechaHora)} · {e.usuario?.nombre ?? (e.canal === 'PROVEEDOR' ? 'Proveedor (QR)' : 'Sistema')}
                {e.detalle && e.estadoAnterior !== e.estadoNuevo ? ` · ${e.detalle}` : ''}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

type Hacer = (path: string, body: unknown, ok: string) => Promise<Vale | undefined>;

function PasoEmpleado({ v, qr, accion, hacer, verPdf, compartir }: {
  v: Vale;
  qr: string | null;
  accion: ReturnType<typeof useAccion>;
  hacer: Hacer;
  verPdf: () => void;
  compartir: () => void;
}) {
  const [anulando, setAnulando] = useState(false);
  if (v.estado === 'BORRADOR' || v.estado === 'SOLICITADO') {
    return (
      <div className="card">
        {v.estado === 'BORRADOR' ? (
          <p>Este pedido todavía no se envió a Compras.</p>
        ) : (
          <p>Compras está revisando tu pedido. Cuando lo apruebe, vas a ver acá el vale para retirar.</p>
        )}
        {anulando ? (
          <Motivo etiqueta="¿Por qué lo anulás?" boton="Anular pedido" ocupado={accion.ocupado} onCancelar={() => setAnulando(false)}
            onEnviar={(motivo) => hacer('anular', { motivo }, 'Pedido anulado.')} />
        ) : (
          <div className="acciones">
            {v.estado === 'BORRADOR' && (
              <button className="primario" disabled={accion.ocupado} onClick={() => hacer('enviar', {}, 'Pedido enviado a Compras.')}>
                Enviar a Compras
              </button>
            )}
            <button className="peligro" onClick={() => setAnulando(true)}>
              Anular pedido
            </button>
          </div>
        )}
      </div>
    );
  }
  if (v.estado !== 'EMITIDO') return null;
  if (v.vencido) return <div className="alerta error">Este vale venció sin retirarse. Si todavía lo necesitás, hacé un pedido nuevo.</div>;
  if (!v.aceptadoEn) {
    return (
      <div className="card destacada">
        <h2>Tu vale está listo</h2>
        <p>
          Compras lo aprobó para retirar en <strong>{v.proveedor?.razonSocial}</strong>. Aceptalo para firmarlo y habilitar el retiro.
        </p>
        <button className="primario" style={{ width: '100%' }} disabled={accion.ocupado}
          onClick={() => hacer('aceptar', {}, 'Vale aceptado. Mostrale el QR al proveedor cuando retires.')}>
          {accion.ocupado && <Girando />} Aceptar y firmar el vale
        </button>
      </div>
    );
  }
  return (
    <div className="card destacada">
      <div className="qr">
        <h2 style={{ margin: 0 }}>Mostrale este QR al proveedor</h2>
        {qr ? (
          <div className="marco">
            <img className="codigo" src={qr} alt={`QR del vale ${v.numero}`} />
            <img className="sello" src="/logo-64.png" alt="" />
          </div>
        ) : (
          <Cargando texto="Generando QR…" />
        )}
        <p className="muted">
          {v.proveedor?.razonSocial} · válido hasta el {fecha(v.fechaVigencia)}
        </p>
        <div className="acciones">
          <button onClick={verPdf}>Ver PDF</button>
          <button onClick={compartir}>Compartir</button>
        </div>
      </div>
    </div>
  );
}

function Aprobacion({ v, ocupado, hacer }: { v: Vale; ocupado: boolean; hacer: Hacer }) {
  const [proveedor, setProveedor] = useState<Proveedor | null>(v.proveedor?.habilitado ? v.proveedor : null);
  const [items, setItems] = useState<ItemForm[]>((v.items ?? []).map(aForm));
  const [observaciones, setObservaciones] = useState(v.observaciones ?? '');
  const [rechazando, setRechazando] = useState(false);

  return (
    <div className="card destacada">
      <h2>Completar y aprobar</h2>
      {v.proveedor && !v.proveedor.habilitado && (
        <div className="alerta info">El proveedor sugerido ({v.proveedor.razonSocial}) ya no está disponible en GLM. Elegí otro.</div>
      )}
      <ProveedorPicker etiqueta="Proveedor" valor={proveedor} onChange={setProveedor} />
      <ItemsEditor items={items} onChange={setItems} />
      <label style={{ marginTop: 12 }}>
        Observaciones
        <textarea maxLength={500} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
      </label>
      {rechazando ? (
        <Motivo etiqueta="Motivo del rechazo (lo ve el empleado)" boton="Rechazar pedido" ocupado={ocupado} onCancelar={() => setRechazando(false)}
          onEnviar={(motivo) => hacer('rechazar', { motivo }, 'Pedido rechazado.')} />
      ) : (
        <div className="acciones">
          <button className="primario" disabled={ocupado || !proveedor}
            onClick={() =>
              hacer('aprobar', { proveedorId: proveedor!.id, items: aItems(items), observaciones: observaciones.trim() || undefined },
                'Vale aprobado y emitido. El empleado ya lo puede aceptar y retirar.')
            }>
            {ocupado && <Girando />} Aprobar y emitir vale
          </button>
          <button className="peligro" onClick={() => setRechazando(true)}>
            Rechazar
          </button>
        </div>
      )}
    </div>
  );
}

function GestionEmitido({ v, ocupado, hacer }: { v: Vale; ocupado: boolean; hacer: Hacer }) {
  const [modo, setModo] = useState<'entrega' | 'anular' | null>(null);
  const [remito, setRemito] = useState('');
  return (
    <div className="card">
      <h2>Gestión del vale</h2>
      <p className="muted">
        {v.aceptadoEn ? 'El empleado ya lo aceptó.' : 'El empleado todavía no lo aceptó.'} Si el proveedor no confirmó con el QR, podés registrar la entrega acá.
      </p>
      {modo === 'entrega' ? (
        <>
          <label>
            N° de remito (opcional)
            <input value={remito} maxLength={50} onChange={(e) => setRemito(e.target.value)} />
          </label>
          <div className="acciones">
            <button className="primario" disabled={ocupado} onClick={() => hacer('entrega', { remito: remito.trim() || undefined }, 'Entrega registrada.')}>
              Confirmar entrega
            </button>
            <button onClick={() => setModo(null)}>Cancelar</button>
          </div>
        </>
      ) : modo === 'anular' ? (
        <Motivo etiqueta="Motivo de la anulación" boton="Anular vale" ocupado={ocupado} onCancelar={() => setModo(null)}
          onEnviar={(motivo) => hacer('anular', { motivo }, 'Vale anulado.')} />
      ) : (
        <div className="acciones">
          <button disabled={!v.aceptadoEn} onClick={() => setModo('entrega')} title={v.aceptadoEn ? '' : 'Falta que el empleado acepte el vale'}>
            Registrar entrega
          </button>
          <button className="peligro" onClick={() => setModo('anular')}>
            Anular
          </button>
        </div>
      )}
    </div>
  );
}

function Motivo({ etiqueta, boton, ocupado, onEnviar, onCancelar }: {
  etiqueta: string;
  boton: string;
  ocupado: boolean;
  onEnviar: (motivo: string) => void;
  onCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  return (
    <div>
      <label>
        {etiqueta}
        <textarea autoFocus maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </label>
      <div className="acciones">
        <button className="peligro" disabled={ocupado || !motivo.trim()} onClick={() => onEnviar(motivo.trim())}>
          {boton}
        </button>
        <button onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}
