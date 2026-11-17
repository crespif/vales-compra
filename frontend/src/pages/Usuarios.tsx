import React, { useMemo, useState } from 'react';
import { api, Rol, Sector, Usuario } from '../api';
import { useSesion } from '../sesion';
import { Aviso, ErrorMsg, Esqueleto, Girando, useAccion, useCarga, useDemorado, Vacio } from '../ui';

const ROLES: { valor: Rol; texto: string; detalle: string }[] = [
  { valor: 'SOLICITANTE', texto: 'Empleado', detalle: 'Pide vales y los retira' },
  { valor: 'COMPRAS', texto: 'Compras', detalle: 'Aprueba vales, registra facturas y define el PIN de los proveedores' },
  { valor: 'ADMIN', texto: 'Administrador', detalle: 'Todo lo de Compras, más la gestión de usuarios' },
];
const textoRol = (r: Rol) => ROLES.find((x) => x.valor === r)!.texto;
const iniciales = (n: string) =>
  n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

type Filtro = 'activos' | 'inactivos' | 'todos';

export function Usuarios() {
  const { usuario: yo } = useSesion();
  const lista = useCarga(() => api.get<Usuario[]>('/usuarios'));
  const { datos: sectores } = useCarga(() => api.get<Sector[]>('/sectores'));
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('activos');
  const [editando, setEditando] = useState<number | 'nuevo' | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const t = useDemorado(buscar.trim().toLowerCase());

  const visibles = useMemo(
    () =>
      (lista.datos ?? []).filter(
        (u) =>
          (filtro === 'todos' || (filtro === 'activos' ? u.activo : !u.activo)) &&
          (!t || u.nombre.toLowerCase().includes(t) || u.legajo.toLowerCase().includes(t) || (u.sector?.nombre ?? '').toLowerCase().includes(t)),
      ),
    [lista.datos, filtro, t],
  );

  const guardado = (texto: string) => {
    setOk(texto);
    setEditando(null);
    lista.recargar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Usuarios</h1>
          <p className="muted">Quién puede entrar a la app y qué puede hacer.</p>
        </div>
        <button className="primario" onClick={() => { setEditando('nuevo'); setOk(null); }}>
          + Nuevo usuario
        </button>
      </div>

      <Aviso texto={ok} />
      <ErrorMsg error={lista.error} />

      {editando === 'nuevo' && sectores && (
        <div className="card destacada">
          <h2>Nuevo usuario</h2>
          <FormUsuario sectores={sectores} yo={yo.id} onCancelar={() => setEditando(null)} onGuardado={guardado} />
        </div>
      )}

      <input
        type="search"
        className="buscador"
        aria-label="Buscar usuario"
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
        placeholder="Nombre, legajo o sector"
      />
      <div className="filtros" role="tablist" style={{ marginTop: 12 }}>
        {(['activos', 'inactivos', 'todos'] as Filtro[]).map((f) => (
          <button key={f} className={f === filtro ? 'on' : ''} onClick={() => setFiltro(f)}>
            {f === 'activos' ? 'Activos' : f === 'inactivos' ? 'Inactivos' : 'Todos'}
          </button>
        ))}
      </div>

      {!lista.datos ? (
        <Esqueleto />
      ) : !visibles.length ? (
        <Vacio>No hay usuarios en esta lista.</Vacio>
      ) : (
        <div className="lista">
          {visibles.map((u, i) => (
            <div key={u.id} className={`fila usuario-fila t-${!u.activo ? 'gris' : u.rol === 'SOLICITANTE' ? 'verde' : 'marca'}`} style={{ '--i': i } as React.CSSProperties}>
              <button
                type="button"
                className="usuario-cabeza"
                aria-expanded={editando === u.id}
                onClick={() => { setEditando(editando === u.id ? null : u.id); setOk(null); }}
              >
                <span className={`avatar${u.activo ? '' : ' apagado'}`} aria-hidden="true">{iniciales(u.nombre)}</span>
                <span className="usuario-texto">
                  <span className="titulo">
                    {u.nombre} {u.id === yo.id && <span className="badge azul">Vos</span>}
                  </span>
                  <span className="sub">
                    Legajo {u.legajo} · {u.sector?.nombre ?? 'Sin sector'} · {textoRol(u.rol)}
                  </span>
                </span>
                <span className={`badge ${u.activo ? 'verde' : 'gris'}`}>{u.activo ? 'Activo' : 'Inactivo'}</span>
              </button>
              {editando === u.id && sectores && (
                <div className="usuario-editor">
                  <FormUsuario usuario={u} sectores={sectores} yo={yo.id} onCancelar={() => setEditando(null)} onGuardado={guardado} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Contraseña aleatoria fácil de dictar: sin letras ni números que se confundan. */
function generarClave() {
  const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(r, (n) => c[n % c.length]).join('');
}

function FormUsuario({ usuario, sectores, yo, onGuardado, onCancelar }: {
  usuario?: Usuario;
  sectores: Sector[];
  yo: number;
  onGuardado: (texto: string) => void;
  onCancelar: () => void;
}) {
  const esNuevo = !usuario;
  const soyYo = usuario?.id === yo;
  const [legajo, setLegajo] = useState(usuario?.legajo ?? '');
  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [sectorId, setSectorId] = useState(usuario ? String(usuario.sectorId) : '');
  const [rol, setRol] = useState<Rol>(usuario?.rol ?? 'SOLICITANTE');
  const [activo, setActivo] = useState(usuario?.activo ?? true);
  const [clave, setClave] = useState('');
  const [verClave, setVerClave] = useState(false);
  const accion = useAccion();

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (clave && clave.length < 8) return accion.setError(new Error('La contraseña debe tener al menos 8 caracteres'));
    if (esNuevo) {
      const r = await accion.ejecutar(() =>
        api.post<Usuario>('/usuarios', { legajo, nombre, sectorId: Number(sectorId), rol, password: clave }),
      );
      if (r) onGuardado(`Usuario ${r.nombre} creado.${clave ? ' Pasale la contraseña en persona.' : ''}`);
      return;
    }
    // Solo se envía lo que cambió
    const cambios: Record<string, unknown> = {};
    if (legajo.trim() !== usuario.legajo) cambios.legajo = legajo;
    if (nombre.trim() !== usuario.nombre) cambios.nombre = nombre;
    if (Number(sectorId) !== usuario.sectorId) cambios.sectorId = Number(sectorId);
    if (rol !== usuario.rol) cambios.rol = rol;
    if (activo !== usuario.activo) cambios.activo = activo;
    if (clave) cambios.password = clave;
    if (!Object.keys(cambios).length) return onCancelar();
    const r = await accion.ejecutar(() => api.patch<Usuario>(`/usuarios/${usuario.id}`, cambios));
    if (r) onGuardado(`Cambios guardados en ${r.nombre}${clave ? ', con contraseña nueva' : ''}.`);
  }

  return (
    <form onSubmit={guardar} className="form-usuario">
      <ErrorMsg error={accion.error} />
      <div className="grilla-2">
        <label>
          Legajo
          <input value={legajo} onChange={(e) => setLegajo(e.target.value)} required maxLength={30} autoComplete="off" />
        </label>
        <label>
          Nombre y apellido
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={120} autoComplete="off" />
        </label>
        <label>
          Sector
          <select value={sectorId} onChange={(e) => setSectorId(e.target.value)} required>
            <option value="">Elegí</option>
            {sectores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rol
          <select value={rol} onChange={(e) => setRol(e.target.value as Rol)} disabled={soyYo}>
            {ROLES.map((r) => (
              <option key={r.valor} value={r.valor}>
                {r.texto}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted ayuda">{ROLES.find((r) => r.valor === rol)!.detalle}.</p>

      <label>
        {esNuevo ? 'Contraseña inicial (mínimo 8 caracteres)' : 'Nueva contraseña (dejala vacía para no cambiarla)'}
        <span className="clave">
          <input
            type={verClave ? 'text' : 'password'}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            minLength={8}
            required={esNuevo}
            autoComplete="new-password"
          />
          <button type="button" onClick={() => setVerClave(!verClave)} aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
            {verClave ? 'Ocultar' : 'Ver'}
          </button>
          <button type="button" onClick={() => { setClave(generarClave()); setVerClave(true); }}>
            Generar
          </button>
        </span>
      </label>

      {!esNuevo && (
        <label className="interruptor">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} disabled={soyYo} />
          <span>
            <strong>{activo ? 'Usuario activo' : 'Usuario inactivo'}</strong>
            <small className="muted">{activo ? 'Puede entrar a la app.' : 'No puede entrar; sus vales se conservan.'}</small>
          </span>
        </label>
      )}
      {soyYo && <p className="muted ayuda">Tu propio rol y estado los tiene que cambiar otro administrador.</p>}

      <div className="acciones">
        <button className="primario" disabled={accion.ocupado}>
          {accion.ocupado && <Girando />} {esNuevo ? 'Crear usuario' : 'Guardar cambios'}
        </button>
        <button type="button" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
