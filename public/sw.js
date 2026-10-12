/*
 * Cache only public resources. Signed-in HTML contains the current user's
 * register and permissions; it must never become an offline page for the next
 * person using this device. Verification already open in a tab can still queue
 * scans in IndexedDB. Reloading offline shows a public connection notice.
 */
const SHELL = "nsuk-shell-v2";
const PUBLIC_ASSETS = ["/nsuk-crest.png", "/manifest.webmanifest"];
const PRECACHE = ["/offline", ...PUBLIC_ASSETS];

async function cachedPublic(request) {
  try {
    const cache = await caches.open(SHELL);
    return await cache.match(request);
  } catch {
    return undefined;
  }
}

async function cachePublic(request, response) {
  // In particular, never save a redirected login page or an error response.
  if (!response.ok || response.redirected || response.type === "opaque") return;
  try {
    const cache = await caches.open(SHELL);
    await cache.put(request, response.clone());
  } catch {
    // Storage restrictions must not prevent an online response being used.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.allSettled(
      PRECACHE.map(async (path) => {
        const request = new Request(new URL(path, self.location.origin), {
          credentials: "omit",
          cache: "reload",
          redirect: "error",
        });
        await cachePublic(request, await fetch(request));
      }),
    ).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith("nsuk-shell-") && key !== SHELL)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        // Never look up the requested page, including in an old shell cache.
        return (await cachedPublic("/offline")) ?? Response.error();
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || PUBLIC_ASSETS.includes(url.pathname)) {
    event.respondWith((async () => {
      const cached = await cachedPublic(request);
      if (cached) return cached;
      const response = await fetch(request);
      event.waitUntil(cachePublic(request, response));
      return response;
    })());
  }
});
