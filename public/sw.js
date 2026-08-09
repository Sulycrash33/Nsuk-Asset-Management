/*
 * Keeps the system usable where the network is not.
 *
 * Deliberately conservative: this caches the shell so the app opens at all
 * without a signal, and never caches anything from Supabase. Asset data must
 * always be live, because a stale register is worse than no register — someone
 * would verify a room against yesterday's list and report the wrong findings.
 * Work done offline is queued in IndexedDB by the page itself, not here.
 */

const VERSION = "v1";
const SHELL = `nsuk-shell-${VERSION}`;

// Enough to open the app and reach the verification screen.
const PRECACHE = ["/", "/dashboard", "/verify", "/offline", "/nsuk-crest.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never touch anything that is not this site: Supabase calls in particular
  // must fail honestly when offline so the page can queue the work instead.
  if (url.origin !== self.location.origin) return;

  // Pages: try the network, fall back to whatever was cached, then to a page
  // that explains the situation.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached ?? caches.match("/offline"))
            .then((cached) => cached ?? Response.error()),
        ),
    );
    return;
  }

  // Build output and images: cache first, they are content-hashed or static.
  if (url.pathname.startsWith("/_next/static") || /\.(png|svg|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
  }
});
