import { useState } from 'react';
import { api, fechaHora, Proveedor, ResultadoSync, Rol, Sector, Usuario } from '../api';
import { useSesion } from '../sesion';
import { ErrorMsg, useAccion, useCarga } from '../ui';

export function Admin() {
  const { usuario } = useSesion();
  return (
    <>
      <h1>Proveedores y usuarios</h1>
      <br />
      <Proveedores />
      {usuario.rol === 'ADMIN' ? <Usuarios /> : <p className="muted">La gestión de usuarios la hace un administrador.</p>}
    </>
  );
}

function Proveedores() {
  const ultima = useCarga(() => api.get<ResultadoSync | null>('/proveedores/sincronizacion'));
  const accion = useAccion();
  const [ok, setOk] = useState<string | null>(null);
  const [buscar, setBuscar] = useState('');
  const t = buscar.trim();
  const lista = useCarga(
    () => (t.length >= 2 ? api.get<Proveedor[]>(`/proveedores?todos=true&buscar=${encodeURIComponent(t)}`) : Promise.resolve([] as Proveedor[])),
    [t],
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
      setOk('PIN actualizado. Comunicáselo al proveedor por un medio seguro.');
      setPinDe(null);
      setPin('');
    }
  }

  const u = ultima.datos;
  return (
    <div className="card">
      <h2>Proveedores</h2>
      <p className="muted">Vienen de GLM y se actualizan solos cada hora. Acá solo se define el PIN con el que cada proveedor confirma las entregas.</p>
      <div className="sync">
        <p className="muted">
          {!u
            ? 'Todavía no se sincronizó con GLM.'
            : u.ok
              ? `Última actualización: ${fechaHora(u.fecha)} · ${u.recibidos} proveedores recibidos.`
              : `Falló la última actualización (${fechaHora(u.fecha)}): ${u.error}`}
        </p>
        <button onClick={sincronizar} disabled={accion.ocupado}>
          {accion.ocupado ? 'Actualizando…' : 'Actualizar desde GLM'}
        </button>
      </div>
      {ok && <div className="alerta ok">{ok}</div>}
      <ErrorMsg error={accion.error} />
      <label>
        Buscar proveedor
        <input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Nombre, CUIT o código de GLM" />
      </label>
      <div className="lista">
        {t.length >= 2 && !lista.cargando && !lista.datos?.length && <p className="muted">No se encontraron proveedores.</p>}
        {lista.datos?.map((p) => (
          <div key={p.id} className="fila">
            <span className="titulo">{p.razonSocial}</span>
            <span className={`badge ${p.habilitado ? 'verde' : 'gris'}`} style={{ gridRow: 'span 2' }}>
              {p.habilitado ? 'Activo' : 'No está en GLM'}
            </span>
            <span className="sub">
              {[p.glmProveedorId && `GLM ${p.glmProveedorId}`, p.cuit, p.localidad].filter(Boolean).join(' · ')}
              {' · '}
              <a href="#" onClick={(e) => { e.preventDefault(); setPinDe(p.id); setPin(''); }}>Definir PIN</a>
            </span>
            {pinDe === p.id && (
              <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                <label>
                  Nuevo PIN (4 a 8 números)
                  <input inputMode="numeric" value={pin} maxLength={8} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
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
    </div>
  );
}

const ROLES: { valor: Rol; texto: string }[] = [
  { valor: 'SOLICITANTE', texto: 'Empleado (pide vales)' },
  { valor: 'COMPRAS', texto: 'Compras (aprueba y factura)' },
  { valor: 'ADMIN', texto: 'Administrador' },
];

function Usuarios() {
  const lista = useCarga(() => api.get<Usuario[]>('/usuarios'));
  const { datos: sectores } = useCarga(() => api.get<Sector[]>('/sectores'));
  const accion = useAccion();
  const [ok, setOk] = useState<string | null>(null);
  const vacio = { legajo: '', nombre: '', password: '', rol: 'SOLICITANTE' as Rol, sectorId: '' };
  const [f, setF] = useState(vacio);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    const u = await accion.ejecutar(() => api.post<Usuario>('/usuarios', { ...f, sectorId: Number(f.sectorId) }));
    if (u) {
      setOk(`Usuario ${u.nombre} creado.`);
      setF(vacio);
      lista.recargar();
    }
  }

  async function alternar(u: Usuario) {
    if (await accion.ejecutar(() => api.patch(`/usuarios/${u.id}`, { activo: !u.activo }))) lista.recargar();
  }

  return (
    <div className="card">
      <h2>Usuarios</h2>
      {ok && <div className="alerta ok">{ok}</div>}
      <ErrorMsg error={accion.error} />
      <div className="lista" style={{ marginBottom: 16 }}>
        {lista.datos?.map((u) => (
          <div key={u.id} className="fila">
            <span className="titulo">{u.nombre}</span>
            <span className={`badge ${u.activo ? 'azul' : 'gris'}`} style={{ gridRow: 'span 2' }}>
              {ROLES.find((r) => r.valor === u.rol)?.texto.split(' ')[0]}
            </span>
            <span className="sub">
              Legajo {u.legajo} · {u.sector?.nombre} ·{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); alternar(u); }}>{u.activo ? 'Desactivar' : 'Activar'}</a>
            </span>
          </div>
        ))}
      </div>
      <form onSubmit={crear}>
        <h2>Nuevo usuario</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0 12px' }}>
          <label>
            Legajo
            <input value={f.legajo} onChange={set('legajo')} required />
          </label>
          <label>
            Nombre y apellido
            <input value={f.nombre} onChange={set('nombre')} required />
          </label>
          <label>
            Sector
            <select value={f.sectorId} onChange={set('sectorId')} required>
              <option value="">Elegí</option>
              {sectores?.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </label>
          <label>
            Rol
            <select value={f.rol} onChange={set('rol')}>
              {ROLES.map((r) => (
                <option key={r.valor} value={r.valor}>{r.texto}</option>
              ))}
            </select>
          </label>
          <label>
            Contraseña inicial (mín. 8)
            <input type="password" value={f.password} onChange={set('password')} minLength={8} required autoComplete="new-password" />
          </label>
        </div>
        <button className="primario" disabled={accion.ocupado}>Crear usuario</button>
      </form>
    </div>
  );
}
