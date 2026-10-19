/* Офлайн для «4 Кухни».
   Страница: сначала сеть (чтобы новая версия меню подхватывалась сама),
   если сети нет или она тормозит дольше TIMEOUT — сохранённая копия.
   Чтобы сбросить кэш у всех, увеличь номер в VERSION. */
const VERSION = 'v1';
const CACHE = '4kuhni-' + VERSION;
const PAGE = './index.html';
const TIMEOUT = 4000;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.add(new Request(PAGE, { cache: 'reload' })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('4kuhni-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fromNetwork(req, key) {
  return fetch(req, { cache: 'no-cache' }).then(res => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(key, copy));
    }
    return res;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Сама страница (в т.ч. «/4-kuhni/» без index.html)
  if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')) {
    const net = fromNetwork(req, PAGE);
    e.waitUntil(net.catch(() => {}));
    e.respondWith(new Promise(resolve => {
      let done = false;
      const fallback = () => caches.match(PAGE).then(hit => {
        if (hit && !done) { done = true; resolve(hit); }
        return hit;
      });
      const timer = setTimeout(fallback, TIMEOUT);
      net.then(res => {
        clearTimeout(timer);
        if (done) return;
        if (res.ok) { done = true; resolve(res); }
        else fallback().then(hit => { if (!hit && !done) { done = true; resolve(res); } });
      }).catch(() => {
        clearTimeout(timer);
        fallback().then(hit => { if (!hit && !done) { done = true; resolve(Response.error()); } });
      });
    }));
    return;
  }

  // Остальное со своего сайта: из кэша, иначе из сети с сохранением
  e.respondWith(caches.match(req).then(hit => hit || fromNetwork(req, req)));
});
