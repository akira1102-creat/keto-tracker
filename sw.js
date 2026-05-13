const CACHE_VERSION = 'v2.3.7';
const CACHE_NAME = `keto-tracker-${CACHE_VERSION}`;
const STATIC_ASSETS = [
  '/keto-tracker/',
  '/keto-tracker/index.html',
  '/keto-tracker/css/style.css',
  '/keto-tracker/js/app.js',
  '/keto-tracker/js/store.js',
  '/keto-tracker/js/camera.js',
  '/keto-tracker/js/claude.js',
  '/keto-tracker/js/dashboard.js',
  '/keto-tracker/js/history.js',
  '/keto-tracker/js/settings.js',
  '/keto-tracker/js/router.js',
  '/keto-tracker/js/firebase.js',
  '/keto-tracker/manifest.json',
];
const BYPASS_ORIGINS = [
  'accounts.google.com','oauth2.googleapis.com','www.googleapis.com',
  'apis.google.com','www.gstatic.com','firebaseapp.com','googleapis.com',
  'firestore.googleapis.com','identitytoolkit.googleapis.com',
  'securetoken.googleapis.com','api.fontshare.com',
  'fonts.googleapis.com','fonts.gstatic.com',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (BYPASS_ORIGINS.some(d => url.hostname === d || url.hostname.endsWith('.' + d))) return;
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return res;
      }).catch(() => {
        if (e.request.mode === 'navigate') return caches.match('/keto-tracker/index.html');
      });
    })
  );
});
