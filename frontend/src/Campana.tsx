import { useEffect, useRef, useState } from 'react';
import { activarPush, desactivarPush, EstadoPush, estadoPush, probarPush } from './notificaciones';
import { Girando } from './ui';

function IconoCampana({ tachada }: { tachada?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      {tachada && <path d="M3 3l18 18" />}
    </svg>
  );
}

/** Botón del encabezado para activar las notificaciones en este celular. */
export function Campana({ compras }: { compras: boolean }) {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    estadoPush().then(setEstado, () => setEstado('no-soportado'));
  }, []);
  // Cierra el panel al tocar fuera
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false);
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierto]);

  async function hacer(fn: () => Promise<string>) {
    setOcupado(true);
    setMsg(null);
    try {
      setMsg({ ok: true, texto: await fn() });
    } catch (e) {
      setMsg({ ok: false, texto: (e as Error).message });
    } finally {
      setEstado(await estadoPush().catch(() => 'no-soportado' as const));
      setOcupado(false);
    }
  }
  const activar = () =>
    hacer(async () => {
      await activarPush();
      const r = await probarPush();
      return r.enviados ? 'Listo. Te mandamos una notificación de prueba.' : 'Activadas.';
    });
  const desactivar = () =>
    hacer(async () => {
      await desactivarPush();
      return 'Ya no vas a recibir avisos en este dispositivo.';
    });
  const probar = () =>
    hacer(async () => {
      const r = await probarPush();
      if (!r.enviados) throw new Error('No se pudo enviar. Probá desactivar y volver a activar.');
      return 'Enviada. Debería llegarte en unos segundos.';
    });

  if (!estado) return null;
  const activo = estado === 'activo';
  const que = compras ? 'cuando alguien haga un pedido nuevo' : 'cuando Compras apruebe o rechace tus pedidos';

  return (
    <div className="campana" ref={caja}>
      <button
        className={`icono campana-btn${activo ? ' activa' : ''}`}
        aria-label={activo ? 'Notificaciones activadas' : 'Activar notificaciones'}
        aria-expanded={abierto}
        onClick={() => {
          setAbierto(!abierto);
          setMsg(null);
        }}
      >
        <IconoCampana tachada={estado === 'bloqueado'} />
        {estado === 'inactivo' && <span className="punto" aria-hidden="true" />}
      </button>
      {abierto && (
        <div className="panel-campana" role="dialog" aria-label="Notificaciones">
          <strong>Notificaciones en este dispositivo</strong>
          {estado === 'activo' && (
            <>
              <p className="muted">Activadas. Te avisamos {que}.</p>
              <div className="acciones">
                <button onClick={probar} disabled={ocupado}>
                  {ocupado ? <Girando /> : null} Probar
                </button>
                <button onClick={desactivar} disabled={ocupado}>
                  Desactivar
                </button>
              </div>
            </>
          )}
          {estado === 'inactivo' && (
            <>
              <p className="muted">Recibí un aviso en el celular {que}, aunque la app esté cerrada.</p>
              <button className="primario" onClick={activar} disabled={ocupado} style={{ width: '100%' }}>
                {ocupado ? (
                  <>
                    <Girando /> Activando…
                  </>
                ) : (
                  'Activar notificaciones'
                )}
              </button>
            </>
          )}
          {estado === 'bloqueado' && (
            <p className="muted">
              Bloqueaste las notificaciones para este sitio. Para habilitarlas, tocá el candado junto a la dirección (o Ajustes del
              navegador → Sitios → Notificaciones) y permitilas para <b>{location.host}</b>.
            </p>
          )}
          {estado === 'instalar-ios' && (
            <ol className="muted pasos">
              <li>
                Abrí esta página en <b>Safari</b> (iOS 16.4 o más nuevo).
              </li>
              <li>
                Tocá <b>Compartir</b> <span aria-hidden="true">⬆︎</span> → <b>Agregar a pantalla de inicio</b>.
              </li>
              <li>Abrí “Vales CELTA” desde el ícono nuevo, ingresá y tocá esta campana.</li>
            </ol>
          )}
          {estado === 'no-soportado' && <p className="muted">Este navegador no permite notificaciones. Probá con Chrome o Safari actualizados.</p>}
          {msg && <p className={`msg-campana ${msg.ok ? 'ok' : 'error'}`}>{msg.texto}</p>}
        </div>
      )}
    </div>
  );
}
