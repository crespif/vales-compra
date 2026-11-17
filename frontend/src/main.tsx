import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { api, ApiError, guardarSesion, onSesionVencida, Sesion, sesionGuardada } from './api';
import { Admin } from './pages/Admin';
import { DetalleVale } from './pages/DetalleVale';
import { Facturas } from './pages/Facturas';
import { ListaVales } from './pages/ListaVales';
import { NuevoVale } from './pages/NuevoVale';
import { esCompras, SesionCtx } from './sesion';
import { ErrorMsg, Girando } from './ui';
import './styles.css';


function Login({ onLogin }: { onLogin: (s: { token: string; usuario: Sesion }) => void }) {
  const [legajo, setLegajo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const r = await api.post<{ accessToken: string; usuario: Sesion }>('/auth/login', { legajo, password });
      onLogin({ token: r.accessToken, usuario: r.usuario });
    } catch (err) {
      setError(err instanceof ApiError ? err : new Error('No se pudo iniciar sesión'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <img className="marca-agua" src="/logo.png" alt="" />
      <form className="card" onSubmit={entrar}>
        <img className="logo" src="/logo.png" alt="CELTA" />
        <h1>Vales de compra</h1>
        <p className="bajada">Cooperativa CELTA — Tres Arroyos</p>
        <ErrorMsg error={error} />
        <label>
          Legajo
          <input value={legajo} onChange={(e) => setLegajo(e.target.value)} autoComplete="username" required autoFocus />
        </label>
        <label>
          Contraseña
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        <button className="primario" style={{ width: '100%' }} disabled={enviando}>
          {enviando ? (
            <>
              <Girando /> Ingresando…
            </>
          ) : (
            'Ingresar'
          )}
        </button>
      </form>
    </div>
  );
}

const iniciales = (n: string) =>
  n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

/** Cada pantalla entra con una transición suave al cambiar de ruta. */
function Pantallas({ compras }: { compras: boolean }) {
  const loc = useLocation();
  return (
    <div className="vista" key={loc.pathname}>
      <Routes location={loc}>
        <Route path="/vales" element={<ListaVales />} />
        <Route path="/vales/:id" element={<DetalleVale />} />
        <Route path="/nuevo" element={<NuevoVale />} />
        {compras && <Route path="/facturas" element={<Facturas />} />}
        {compras && <Route path="/admin" element={<Admin />} />}
        <Route path="*" element={<Navigate to="/vales" replace />} />
      </Routes>
    </div>
  );
}

function App() {
  const [sesion, setSesion] = useState(sesionGuardada);
  useEffect(() => onSesionVencida(() => setSesion(null)), []);

  const login = (s: { token: string; usuario: Sesion }) => {
    guardarSesion(s);
    setSesion(s);
  };
  const salir = () => {
    guardarSesion(null);
    setSesion(null);
  };

  if (!sesion) return <Login onLogin={login} />;
  const u = sesion.usuario;

  return (
    <SesionCtx.Provider value={{ usuario: u, salir }}>
      <HashRouter>
        <header className="top">
          <Link to="/vales" className="marca" aria-label="Inicio">
            <img src="/logo-64.png" alt="" />
            <span>
              <small>CELTA</small>
              <strong>Vales de compra</strong>
            </span>
          </Link>
          <span className="usuario">
            <span className="nombre">
              {u.nombre}
              <small>{u.rol === 'SOLICITANTE' ? `Legajo ${u.legajo}` : u.rol === 'ADMIN' ? 'Administrador' : 'Compras'}</small>
            </span>
            <span className="avatar" aria-hidden="true">{iniciales(u.nombre)}</span>
          </span>
          <button className="salir" onClick={salir}>
            Salir
          </button>
        </header>
        <nav className="tabs">
          <NavLink to="/vales">{esCompras(u) ? 'Vales' : 'Mis vales'}</NavLink>
          <NavLink to="/nuevo">Nuevo pedido</NavLink>
          {esCompras(u) && <NavLink to="/facturas">Facturas</NavLink>}
          {esCompras(u) && <NavLink to="/admin">Proveedores y usuarios</NavLink>}
        </nav>
        <main>
          <Pantallas compras={esCompras(u)} />
        </main>
      </HashRouter>
    </SesionCtx.Provider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
