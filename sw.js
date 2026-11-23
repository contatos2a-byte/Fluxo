// Fluxo: guarda a "casca" do app para abrir rápido e funcionar sem internet.
// Os dados sempre vêm do Supabase quando houver conexão.
const CACHE = "fluxo-v5";
const SHELL = ["./", "./index.html", "./config.js?v=5", "./fluxo-runtime.js?v=5", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return; // Supabase e fontes vão direto para a rede
  e.respondWith(fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" }).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});

// Notificações (lembretes divertidos e contas vencendo)
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Fluxo", {
    body: d.body || "Tem novidade no Fluxo.",
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: d.tag || "fluxo",
    data: { url: d.url || "./" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ("focus" in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
