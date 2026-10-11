// Service worker RADICAL: la app (shell) funciona al abrirse sin red; los datos siempre vienen del servidor.
const VERSION = 'radical-v1';
const SHELL = ['/', '/css/app.css', '/js/main.js', '/js/core.js', '/js/feed.js', '/js/game.js', '/js/profile.js', '/js/compose.js', '/js/inbox.js', '/js/admin.js',
  '/manifest.webmanifest', '/icons/icon-192.png', '/fonts/Inter-Medium.woff2', '/fonts/Inter-SemiBold.woff2', '/fonts/Inter-ExtraBold.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // datos: nunca desde caché
  if (url.pathname.startsWith('/uploads/')) { // fotos/videos: caché a medida que se ven (los videos con rango no se cachean)
    if (req.headers.get('range')) return;
    e.respondWith(caches.open('radical-media').then(async (c) => {
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req); if (res.ok && res.status === 200) c.put(req, res.clone()); return res;
    }).catch(() => fetch(req)));
    return;
  }
  // Código y estilos: red primero, caché de respaldo (así las actualizaciones llegan siempre)
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((r) => r || caches.match('/'))));
});
