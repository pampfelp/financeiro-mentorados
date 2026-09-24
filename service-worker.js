// Network-first com cache:"no-store": o navegador nunca serve uma versão
// velha de app.js ou style.css sem avisar. Já mordeu em outro projeto, com
// contrato sendo gerado a partir do modelo antigo.
const CACHE = "fin-mentorados-v1";
const ESTATICOS = ["./", "./index.html", "./style.css", "./img/bussola.png", "./img/wordmark.png"];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ESTATICOS)).catch(() => {}));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Nunca interceptar Firebase nem fontes: deixa o SDK cuidar do offline dele.
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(new Request(req, { cache: "no-store" }))
      .then(r => {
        const copia = r.clone();
        caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
        return r;
      })
      .catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
  );
});
