/* STORIGEN OS demo — offline cache.
   Relative URLs so the worker works under /storigen-demo/ as well as at the root.
   Pages (navigations and .html) are network-first so an open tab always gets the newest version;
   static assets are cache-first. Bump CACHE on every release.
   Never cache or return a redirected Response: Chrome fails navigations with
   ERR_FAILED when a service worker answers with response.redirected. */
var CACHE = 'storigen-os-v23';
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
  './grade-along/test-score.js',
  './grade-along/samples/maya-science-check.jpg',
  './grade-along/samples/nico-science-check.jpg',
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

function asCleanResponse(res) {
  // opaqueredirect cannot be used as a navigation response; treat as failure so we fall back.
  if (!res || res.type === 'opaqueredirect' || res.type === 'error') return Promise.resolve(null);
  if (!res.redirected) return Promise.resolve(res);
  return res.arrayBuffer().then(function (buf) {
    var headers = new Headers(res.headers);
    headers.delete("Location");
    return new Response(buf, { status: res.status, statusText: res.statusText, headers: headers });
  });
}

function fetchClean(req, init) {
  return fetch(req, init).then(function (res) {
    return asCleanResponse(res).then(function (clean) {
      if (!clean) throw new Error('Redirected or unusable response');
      return clean;
    });
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // cache: 'reload' skips the browser HTTP cache so a new release never precaches stale files.
      return Promise.all(ASSETS.map(function (u) {
        return fetchClean(new Request(u, { cache: 'reload' })).then(function (res) {
          if (!res || !res.ok) throw new Error('Failed to precache ' + u);
          return cache.put(u, res);
        });
      }));
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

function canCache(res) {
  return !!(res && res.ok && res.type === 'basic' && !res.redirected);
}

function putInCache(key, res) {
  if (canCache(res)) {
    var copy = res.clone();
    caches.open(CACHE).then(function (cache) { return cache.put(key, copy); });
  }
  return res;
}

function offlinePage(req) {
  return caches.match(req, { ignoreSearch: true }).then(function (hit) {
    if (hit && !hit.redirected) return hit;
    return caches.match('./index.html').then(function (page) {
      return page || caches.match('./');
    }).then(function (page) {
      if (page && !page.redirected) return page;
      return new Response('', { status: 504, statusText: 'Offline' });
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
      fetchClean(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
        if (res && res.ok) return putInCache(key, res);
        // Unusable network response: try a clean cached page, then a direct network fetch.
        return offlinePage(req).then(function (page) {
          if (page && page.status !== 504) return page;
          return fetchClean(event.request, { cache: 'reload', credentials: 'same-origin' });
        });
      }).catch(function () {
        return offlinePage(req).then(function (page) {
          if (page && page.status !== 504) return page;
          // Last resort: fall back to the network so a bad SW cache cannot stick ERR_FAILED.
          return fetchClean(event.request);
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached && !cached.redirected) return cached;
      return fetchClean(req).then(function (res) {
        return putInCache(req, res);
      }).catch(function () {
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
