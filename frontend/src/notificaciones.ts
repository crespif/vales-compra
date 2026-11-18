// Notificaciones al celular (Web Push). El navegador guarda la suscripción;
// el servidor la usa para avisar pedidos nuevos (Compras) y aprobaciones/rechazos (solicitante).
import { api } from './api';

export type EstadoPush =
  | 'no-soportado' // navegador sin Web Push
  | 'instalar-ios' // iPhone: hay que agregar la app a la pantalla de inicio
  | 'bloqueado' // el usuario negó el permiso
  | 'activo'
  | 'inactivo';

const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const instalada = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

let registro: Promise<ServiceWorkerRegistration | null> | null = null;
export function registrarSW() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  registro ??= navigator.serviceWorker.register('/sw.js').catch(() => null);
  return registro;
}

export async function estadoPush(): Promise<EstadoPush> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return esIOS() && !instalada() ? 'instalar-ios' : 'no-soportado';
  }
  if (Notification.permission === 'denied') return 'bloqueado';
  const reg = await registrarSW();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'activo' : 'inactivo';
}

function claveBytes(b64: string) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function nombreDispositivo() {
  const ua = navigator.userAgent;
  const so = /Android/.test(ua) ? 'Android' : esIOS() ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Otro';
  const nav = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Firefox/.test(ua) ? 'Firefox' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : '';
  return `${so} ${nav}`.trim();
}

/** Pide permiso (debe llamarse desde un toque del usuario) y registra el celular en el servidor. */
export async function activarPush() {
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('No diste permiso para mostrar notificaciones.');
  const reg = await registrarSW();
  if (!reg) throw new Error('Este navegador no permite notificaciones.');
  await navigator.serviceWorker.ready;
  const { clave } = await api.get<{ clave: string }>('/notificaciones/clave');
  let sub = await reg.pushManager.getSubscription();
  // Si la suscripción es de otra clave (p. ej. se regeneraron), se rehace
  if (sub && sub.options.applicationServerKey) {
    const actual = new Uint8Array(sub.options.applicationServerKey);
    const nueva = claveBytes(clave);
    if (actual.length !== nueva.length || actual.some((b, i) => b !== nueva[i])) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  try {
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveBytes(clave) });
  } catch {
    throw new Error('El navegador no permitió activar los avisos (en modo incógnito no funcionan). Probá en una ventana normal.');
  }
  const j = sub.toJSON();
  await api.enviar('POST', '/notificaciones/suscripcion', { endpoint: j.endpoint, keys: j.keys, dispositivo: nombreDispositivo() });
}

/** Deja de recibir avisos en este celular. */
export async function desactivarPush() {
  const reg = await registrarSW();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.enviar('DELETE', '/notificaciones/suscripcion', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

/** Si ya estaba activo, vuelve a informar la suscripción al servidor (por si cambió el usuario o se borró). */
export async function sincronizarPush() {
  if ((await estadoPush()) !== 'activo') return;
  const sub = await (await registrarSW())?.pushManager.getSubscription();
  if (!sub) return;
  const j = sub.toJSON();
  await api.enviar('POST', '/notificaciones/suscripcion', { endpoint: j.endpoint, keys: j.keys, dispositivo: nombreDispositivo() }).catch(() => {});
}

export const probarPush = () => api.post<{ enviados: number; fallidos: number }>('/notificaciones/prueba');
