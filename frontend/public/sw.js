// Service worker de Vales CELTA: muestra las notificaciones y abre el vale al tocarlas.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let a = {};
  try {
    a = e.data ? e.data.json() : {};
  } catch {
    a = { cuerpo: e.data && e.data.text() };
  }
  e.waitUntil(
    self.registration.showNotification(a.titulo || 'Vales de compra', {
      body: a.cuerpo || '',
      icon: '/icono-192.png',
      badge: '/favicon-32.png',
      tag: a.tag,
      renotify: !!a.tag,
      data: { url: a.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = new URL(e.notification.data && e.notification.data.url || '/', self.location.origin).href;
  e.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const v of ventanas) {
        if (new URL(v.url).origin === self.location.origin) {
          await v.focus();
          return v.navigate(destino).catch(() => v.postMessage({ abrir: destino }));
        }
      }
      return self.clients.openWindow(destino);
    })(),
  );
});
