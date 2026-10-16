// Service worker: deixa o jogo funcionando offline depois da primeira visita.
// Estratégia: o index.html busca primeiro na rede (para pegar versões novas) e cai
// no cache sem internet; o resto (artes, sons, música, ícones) vem do cache e só
// vai à rede na primeira vez.
const CACHE = 'gwent-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const url = new URL(req.url);

  // página: rede primeiro, cache sem internet
  if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  // demais arquivos: cache primeiro. Áudio pede pedaços (Range); guardamos o arquivo
  // inteiro e devolvemos ele completo, o que os navegadores aceitam.
  const key = new Request(url.href);
  event.respondWith(
    caches.match(key).then((hit) => {
      if (hit) return hit;
      return fetch(key).then((res) => {
        if (res.ok && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(key, copy));
        }
        return res;
      });
    }),
  );
});
