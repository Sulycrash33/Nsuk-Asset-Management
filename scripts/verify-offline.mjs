import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const origin = "https://nsuk.test";
const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const require = createRequire(import.meta.url);

function worker() {
  const handlers = new Map();
  const stores = new Map();
  const requests = [];
  let network = async () => new Response("public content");
  let storageFailed = false;
  const key = (request) => new URL(typeof request === "string" ? request : request.url, origin).href;
  const open = async (name) => {
    if (storageFailed) throw new Error("Storage unavailable");
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      match: async (request) => entries.get(key(request))?.clone(),
      put: async (request, response) => entries.set(key(request), response.clone()),
    };
  };
  vm.runInNewContext(source, {
    URL, Request, Response,
    self: {
      location: { origin },
      addEventListener: (name, handler) => handlers.set(name, handler),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: { open, keys: async () => [...stores.keys()], delete: async (name) => stores.delete(name) },
    fetch: async (request) => { requests.push(request); return network(request); },
  });
  return {
    stores, requests, open,
    network: (fn) => { network = fn; },
    failStorage: () => { storageFailed = true; },
    lifecycle: async (name) => {
      let promise;
      handlers.get(name)({ waitUntil: (value) => { promise = value; } });
      await promise;
    },
    request: async (path, options = {}) => {
      const pending = [];
      let response;
      handlers.get("fetch")({
        request: { url: new URL(path, origin).href, method: "GET", mode: "navigate", ...options },
        respondWith: (value) => { response = value; },
        waitUntil: (value) => pending.push(value),
      });
      const result = await response;
      await Promise.all(pending);
      return result;
    },
  };
}

test("installation fetches only public resources without cookies or redirects", async () => {
  const w = worker();
  await w.lifecycle("install");
  assert.deepEqual(w.requests.map((r) => new URL(r.url).pathname).sort(),
    ["/manifest.webmanifest", "/nsuk-crest.png", "/offline"]);
  for (const request of w.requests) {
    assert.equal(request.credentials, "omit");
    assert.equal(request.redirect, "error");
  }
});

test("one failed public asset does not prevent storing the offline notice", async () => {
  const w = worker();
  w.network(async (request) => {
    if (request.url.endsWith(".png")) throw new Error("offline");
    return new Response("public notice");
  });
  await w.lifecycle("install");
  assert.equal(await (await (await w.open("nsuk-shell-v2")).match("/offline")).text(), "public notice");
});

test("activation purges old private-page caches and preserves unrelated caches", async () => {
  const w = worker();
  await (await w.open("nsuk-shell-v1")).put("/assets", new Response("private register"));
  await w.open("other-application");
  await w.lifecycle("install");
  await w.lifecycle("activate");
  assert.deepEqual([...w.stores.keys()].sort(), ["nsuk-shell-v2", "other-application"]);
});

test("signed-in navigation HTML is returned online but never cached", async () => {
  const w = worker();
  w.network(async () => new Response("private register"));
  for (const path of ["/dashboard", "/assets?unit=secret", "/verify", "/users", "/login"]) {
    assert.equal(await (await w.request(path)).text(), "private register");
  }
  assert.equal(w.stores.size, 0);
});

test("offline navigation returns a public notice instead of a previous user's page", async () => {
  const w = worker();
  await (await w.open("nsuk-shell-v1")).put("/assets", new Response("previous administrator"));
  await (await w.open("nsuk-shell-v2")).put("/offline", new Response("public notice"));
  w.network(async () => { throw new Error("offline"); });
  assert.equal(await (await w.request("/assets")).text(), "public notice");
});

test("missing offline notice fails closed without serving a legacy private page", async () => {
  const w = worker();
  await (await w.open("nsuk-shell-v1")).put("/verify", new Response("private exercise"));
  w.network(async () => { throw new Error("offline"); });
  assert.equal((await w.request("/verify")).type, "error");
});

test("build output and explicitly public assets remain available offline", async () => {
  const w = worker();
  for (const path of ["/_next/static/chunks/app.js", "/nsuk-crest.png", "/manifest.webmanifest"]) {
    w.network(async () => new Response("public asset"));
    await w.request(path, { mode: "cors" });
    w.network(async () => { throw new Error("offline"); });
    assert.equal(await (await w.request(path, { mode: "cors" })).text(), "public asset");
  }
});

test("redirects and errors are never saved as public resources", async () => {
  const w = worker();
  for (const response of [new Response("server error", { status: 500 }),
    { ok: true, redirected: true, type: "basic" }]) {
    w.network(async () => response);
    await w.request("/nsuk-crest.png", { mode: "cors" });
    assert.equal(w.stores.get("nsuk-shell-v2").size, 0);
  }
});

test("API calls, image-like API URLs, RSC requests and external requests are untouched", async () => {
  const w = worker();
  for (const path of ["/api/private.png", "/assets?_rsc=secret", "https://project.supabase.co/rest/v1/assets"]) {
    assert.equal(await w.request(path, { mode: "cors" }), undefined);
  }
  assert.equal(await w.request("/assets", { method: "POST" }), undefined);
  assert.equal(w.requests.length, 0);
});

test("cache write failure does not break online asset downloads", async () => {
  const w = worker();
  w.failStorage();
  await w.lifecycle("install");
  assert.equal(await (await w.request("/_next/static/chunks/app.js", { mode: "cors" })).text(), "public content");
  w.network(async () => { throw new Error("offline"); });
  assert.equal((await w.request("/assets")).type, "error");
});

test("Next routes the worker and offline notice without authentication middleware", () => {
  const { unstable_doesMiddlewareMatch } = require("next/experimental/testing/server");
  const proxy = readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8");
  const matcher = JSON.parse(proxy.match(/matcher:\s*\[\s*("[^\n]+")/)[1]);
  const matched = (path) => unstable_doesMiddlewareMatch({
    config: { matcher: [matcher] }, url: `${origin}${path}`,
  });
  for (const path of ["/sw.js", "/sw.js?v=2", "/offline", "/offline?retry=1"]) {
    assert.equal(matched(path), false, path);
  }
  for (const path of ["/assets", "/verify", "/api/admin/users", "/offline-private", "/sw.js/private"]) {
    assert.equal(matched(path), true, path);
  }
});
