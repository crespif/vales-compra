import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Factura, fecha, fechaHora, hoy, pesos, Proveedor, Vale } from '../api';
import { ProveedorPicker } from '../ProveedorPicker';
import { Aviso, ErrorMsg, useAccion, useCarga } from '../ui';

/** "85.000,50" o "85000,50" o "85000.50" → 85000.5 */
const aNumero = (s: string) => Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);

export function Facturas() {
  const facturas = useCarga(() => api.get<Factura[]>('/facturas'));
  const pendientes = useCarga(() => api.get<Vale[]>('/facturas/pendientes?dias=30'));

  const [proveedor, setProveedor] = useState<Proveedor | null>(null);
  const proveedorId = proveedor ? String(proveedor.id) : '';
  const [numero, setNumero] = useState('');
  const [fechaF, setFechaF] = useState(hoy());
  const [importe, setImporte] = useState('');
  const [elegidos, setElegidos] = useState<number[]>([]);
  const [otros, setOtros] = useState('');
  const [ok, setOk] = useState<string | null>(null);
  const accion = useAccion();

  const entregados = useCarga(
    () => (proveedorId ? api.get<Vale[]>(`/vales?estado=ENTREGADO&proveedorId=${proveedorId}`) : Promise.resolve([] as Vale[])),
    [proveedorId],
  );

  const alternar = (n: number) => setElegidos((e) => (e.includes(n) ? e.filter((x) => x !== n) : [...e, n]));

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    setOk(null);
    const extra = otros.split(/[\s,;]+/).filter(Boolean).map(Number);
    if (extra.some((n) => !Number.isInteger(n))) return accion.setError(new Error('Los números de vale tienen que ser enteros'));
    const vales = [...new Set([...elegidos, ...extra])];
    if (!vales.length) return accion.setError(new Error('Indicá al menos un número de vale'));
    const f = await accion.ejecutar(() =>
      api.post<Factura>('/facturas', {
        proveedorId: Number(proveedorId),
        numero: numero.trim(),
        fecha: fechaF,
        importe: aNumero(importe),
        vales,
      }),
    );
    if (f) {
      setOk(`Factura ${f.numero} registrada. Vales conciliados: ${vales.join(', ')}.`);
      setNumero('');
      setImporte('');
      setElegidos([]);
      setOtros('');
      entregados.recargar();
      facturas.recargar();
      pendientes.recargar();
    }
  }

  return (
    <>
      <h1>Facturas</h1>
      <p className="muted">Cargá la factura del proveedor con los números de vale que cita. Esos vales pasan a "Facturado".</p>
      <br />
      <Aviso texto={ok} />
      <ErrorMsg error={accion.error} />

      <form className="card" onSubmit={registrar}>
        <h2>Registrar factura</h2>
        <ProveedorPicker etiqueta="Proveedor" incluirDeshabilitados valor={proveedor} onChange={(p) => { setProveedor(p); setElegidos([]); }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0 12px' }}>
          <label>
            N° de factura
            <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="A-0001-00001234" required maxLength={30} />
          </label>
          <label>
            Fecha
            <input type="date" value={fechaF} onChange={(e) => setFechaF(e.target.value)} required />
          </label>
          <label>
            Importe total
            <input inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} placeholder="85000,50" required />
          </label>
        </div>

        {proveedorId && (
          <>
            <p className="muted">Vales retirados de este proveedor, sin facturar:</p>
            {entregados.datos?.length ? (
              entregados.datos.map((v) => (
                <label key={v.id} className="check">
                  <input type="checkbox" checked={elegidos.includes(v.numero!)} onChange={() => alternar(v.numero!)} />
                  <span>
                    <strong>N° {v.numero}</strong> · {v.sector.nombre} · retirado {fechaHora(v.entregadoEn)}
                  </span>
                </label>
              ))
            ) : (
              <p className="muted">No hay vales retirados pendientes de este proveedor.</p>
            )}
            <label style={{ marginTop: 12 }}>
              Otros números que cite la factura (separados por coma)
              <input value={otros} onChange={(e) => setOtros(e.target.value)} inputMode="numeric" placeholder="53060, 53061" />
            </label>
          </>
        )}
        <button className="primario" disabled={accion.ocupado || !proveedorId}>
          Registrar y conciliar
        </button>
      </form>

      <div className="card">
        <h2>Retirados hace más de 30 días sin factura</h2>
        {pendientes.datos?.length ? (
          <div className="lista">
            {pendientes.datos.map((v) => (
              <Link key={v.id} to={`/vales/${v.id}`} className="fila">
                <span className="titulo">
                  N° {v.numero} · {v.proveedor?.razonSocial}
                </span>
                <span className="sub">
                  {v.sector.nombre} · retirado {fechaHora(v.entregadoEn)}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="muted">No hay vales demorados.</p>
        )}
      </div>

      <div className="card">
        <h2>Últimas facturas</h2>
        {facturas.datos?.length ? (
          <table className="items">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Proveedor / N°</th>
                <th>Vales</th>
                <th style={{ textAlign: 'right' }}>Importe</th>
              </tr>
            </thead>
            <tbody>
              {facturas.datos.map((f) => (
                <tr key={f.id}>
                  <td>{fecha(f.fecha)}</td>
                  <td>
                    {f.proveedor.razonSocial}
                    <div className="muted">{f.numero}</div>
                  </td>
                  <td>{f.vales.map((x) => x.vale.numero).join(', ')}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{pesos(f.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Todavía no hay facturas registradas.</p>
        )}
      </div>
    </>
  );
}
