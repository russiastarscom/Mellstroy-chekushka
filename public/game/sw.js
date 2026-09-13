// Service Worker — Мелстрой: Мировая Чекушка
// Стратегия: сначала сеть (чтобы заменённые спрайты в image/ подхватывались
// сразу), при офлайне — из кэша.
const CACHE = 'chekushka-v4';
const CORE = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/audio.js',
  './js/sprites.js',
  './js/levels.js',
  './js/entities.js',
  './js/ui.js',
  './js/main.js',
  './manifest.json',
  './image/icon-192.png',
  './image/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
