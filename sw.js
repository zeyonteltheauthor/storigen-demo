/* STORIGEN OS demo — offline cache.
   Relative URLs so the worker works under /storigen-demo/ as well as at the root.
   Pages (navigations and .html) are network-first so an open tab always gets the newest version;
   static assets are cache-first. Bump CACHE on every release. */
var CACHE = 'storigen-os-v14';
var ASSETS = [
  './',
  './index.html',
  './styles.css',
  './fonts.css',
  './engine.js',
  './app.js',
  './manifest.webmanifest',
  './grade-along/',
  './grade-along/index.html',
  './grade-along/vendor/pdfjs/pdf.min.mjs',
  './grade-along/vendor/pdfjs/pdf.worker.min.mjs',
  './grade-along/vendor/pdfjs/wasm/jbig2.wasm',
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
      // cache: 'reload' skips the browser HTTP cache so a new release never precaches stale files.
      return cache.addAll(ASSETS.map(function (u) { return new Request(u, { cache: 'reload' }); }));
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

function isPage(req, url) {
  return req.mode === 'navigate' || req.destination === 'document' ||
    url.pathname.endsWith('/') || url.pathname.endsWith('.html');
}

function putInCache(key, res) {
  if (res && res.ok && res.type === 'basic') {
    var copy = res.clone();
    caches.open(CACHE).then(function (cache) { return cache.put(key, copy); });
  }
  return res;
}

function offlinePage(req) {
  return caches.match(req, { ignoreSearch: true }).then(function (hit) {
    if (hit) return hit;
    return caches.match('./index.html').then(function (page) {
      return page || caches.match('./');
    }).then(function (page) {
      return page || new Response('', { status: 504, statusText: 'Offline' });
    });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || isWorkerScript(req)) return;
  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  if (isPage(req, url)) {
    // Network-first: newest page when online, cached copy when offline.
    var key = url.origin + url.pathname;   // one cached copy per page, whatever the ?query
    event.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
        return putInCache(key, res);
      }).catch(function () { return offlinePage(req); })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        return putInCache(req, res);
      }).catch(function () {
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
