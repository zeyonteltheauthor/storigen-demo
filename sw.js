/* STORIGEN OS demo — offline cache.
   Relative URLs so the worker works under /storigen-demo/ as well as at the root. */
var CACHE = 'storigen-os-v1';
var ASSETS = [
  './',
  './index.html',
  './styles.css',
  './fonts.css',
  './engine.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './fonts/atkinson-400-italic.woff2',
  './fonts/atkinson-400-normal.woff2',
  './fonts/atkinson-700-normal.woff2',
  './fonts/inter-var-latin.woff2'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key !== CACHE;
      }).map(function (key) {
        return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function isWorkerScript(req) {
  if (req.destination === 'serviceworker') return true;
  try {
    return new URL(req.url).pathname.endsWith('/sw.js');
  } catch (e) {
    return false;
  }
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || isWorkerScript(req)) return;
  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { return cache.put(req, copy); });
        }
        return res;
      }).catch(function () {
        if (req.mode === 'navigate') {
          return caches.match('./index.html').then(function (page) {
            return page || caches.match('./');
          });
        }
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
