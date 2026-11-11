// Service worker: guarda os arquivos do app no aparelho para ele abrir sem internet.
// Ao publicar uma versão nova, aumente o número do CACHE para os aparelhos descartarem a antiga.
const CACHE = 'gastos-v1';
const ARQUIVOS = [
  './',
  'index.html',
  'style.css',
  'dados.js',
  'app.js',
  'vendor/chart.js',
  'manifest.webmanifest',
  'icone.svg',
  'icone-180.png',
  'icone-192.png',
  'icone-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ARQUIVOS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Responde do cache na hora (funciona offline) e, se houver internet, atualiza o cache por trás.
self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  evento.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const guardado = await cache.match(req, { ignoreSearch: true });
      const daRede = fetch(req)
        .then((resposta) => {
          if (resposta.ok) cache.put(req, resposta.clone());
          return resposta;
        })
        .catch(() => null);
      if (guardado) {
        evento.waitUntil(daRede);
        return guardado;
      }
      return (await daRede) ?? (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
    })
  );
});
