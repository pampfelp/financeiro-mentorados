// Network-first com fallback pro cache, cacheando só o esqueleto estático.
// Nunca intercepta Firebase nem fontes: o SDK cuida do offline dele.
//
// Vários apps dele dividem a origem pampfelp.github.io, cada um numa subpasta.
// O Cache Storage é POR ORIGEM, não por app, então:
//  - o cache deste app tem prefixo próprio (fmj-), e o activate só apaga
//    caches com esse prefixo. Apagar "tudo que não é o meu" derrubaria o cache
//    offline dos outros apps;
//  - caches.match() sem abrir o próprio cache procuraria nos de todos.
// Suba o número de CACHE a cada mudança relevante de asset estático.
const CACHE = "fmj-v4";
const PREFIXO = "fmj-";
const SHELL = ["./", "./index.html", "./style.css", "./manifest.json",
  "./img/bussola.png", "./img/wordmark.png"];

self.addEventListener("install", e => {
  // cache:"reload" em cada fetch. caches.addAll() puro pode ser respondido
  // pelo cache HTTP comum do navegador e servir JS/CSS desatualizado mesmo
  // com o service worker novo já instalado.
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all(SHELL.map(url =>
        fetch(url, { cache: "reload" }).then(r => r.ok && c.put(url, r)).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(
      ks.filter(k => k.startsWith(PREFIXO) && k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== location.origin) return;   // Firebase, fontes

  e.respondWith(
    fetch(new Request(req, { cache: "no-store" }))
      .then(r => {
        const copia = r.clone();
        caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
        return r;
      })
      .catch(() => caches.open(CACHE).then(c => c.match(req))
        .then(r => r || caches.open(CACHE).then(c => c.match("./index.html"))))
  );
});
