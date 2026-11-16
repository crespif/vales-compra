import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { api, ApiError, guardarSesion, onSesionVencida, Sesion, sesionGuardada } from './api';
import { Admin } from './pages/Admin';
import { DetalleVale } from './pages/DetalleVale';
import { Facturas } from './pages/Facturas';
import { ListaVales } from './pages/ListaVales';
import { NuevoVale } from './pages/NuevoVale';
import { esCompras, SesionCtx } from './sesion';
import './styles.css';


function Login({ onLogin }: { onLogin: (s: { token: string; usuario: Sesion }) => void }) {
  const [legajo, setLegajo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError('');
    try {
      const r = await api.post<{ accessToken: string; usuario: Sesion }>('/auth/login', { legajo, password });
      onLogin({ token: r.accessToken, usuario: r.usuario });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={entrar}>
        <h1>Vales de compra</h1>
        <p className="muted">Cooperativa CELTA — Tres Arroyos</p>
        <br />
        {error && <div className="alerta error">{error}</div>}
        <label>
          Legajo
          <input value={legajo} onChange={(e) => setLegajo(e.target.value)} autoComplete="username" required autoFocus />
        </label>
        <label>
          Contraseña
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        <button className="primario" style={{ width: '100%' }} disabled={enviando}>
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
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
          <span className="marca">Vales CELTA</span>
          <span className="quien">
            {u.nombre}
            <br />
            <small>{u.rol === 'SOLICITANTE' ? `Legajo ${u.legajo}` : u.rol === 'ADMIN' ? 'Administrador' : 'Compras'}</small>
          </span>
          <button onClick={salir}>Salir</button>
        </header>
        <nav className="tabs">
          <NavLink to="/vales">{esCompras(u) ? 'Vales' : 'Mis vales'}</NavLink>
          <NavLink to="/nuevo">Nuevo pedido</NavLink>
          {esCompras(u) && <NavLink to="/facturas">Facturas</NavLink>}
          {esCompras(u) && <NavLink to="/admin">Proveedores y usuarios</NavLink>}
        </nav>
        <main>
          <Routes>
            <Route path="/vales" element={<ListaVales />} />
            <Route path="/vales/:id" element={<DetalleVale />} />
            <Route path="/nuevo" element={<NuevoVale />} />
            {esCompras(u) && <Route path="/facturas" element={<Facturas />} />}
            {esCompras(u) && <Route path="/admin" element={<Admin />} />}
            <Route path="*" element={<Navigate to="/vales" replace />} />
          </Routes>
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
