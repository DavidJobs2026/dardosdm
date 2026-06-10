self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'DardosDM';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: data.url ? { url: data.url } : {},
    vibrate: [200, 100, 200],
    silent: false,
  };

  const work = self.registration.showNotification(title, options).then(() =>
    // Notify any open page so it can play a custom audio tone
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list =>
      list.forEach(c => c.postMessage({ type: 'push-notification' }))
    )
  );

  event.waitUntil(work);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.notification.data?.url) {
    event.waitUntil(clients.openWindow(event.notification.data.url));
  }
});
