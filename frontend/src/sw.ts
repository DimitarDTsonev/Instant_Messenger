const CACHE = "im-v1";

// Files to cache on install for offline shell
const SHELL = ["./", "./index.html"];

type SwExtendableEvent = Event & {
  waitUntil(promise: Promise<unknown>): void;
};

type SwFetchEvent = Event & {
  request: Request;
  respondWith(response: Promise<Response | undefined> | Response): void;
};

type SwScope = typeof globalThis & {
  skipWaiting(): Promise<void>;
  clients: {
    claim(): Promise<void>;
  };
  addEventListener(type: "install" | "activate", listener: (event: SwExtendableEvent) => void): void;
  addEventListener(type: "fetch", listener: (event: SwFetchEvent) => void): void;
};

const sw = globalThis as SwScope;

sw.addEventListener("install", (event: SwExtendableEvent) => {
  sw.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => {}))
  );
});

sw.addEventListener("activate", (event: SwExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  );
  sw.clients.claim();
});

sw.addEventListener("fetch", (event: SwFetchEvent) => {
  // Only handle GET requests; let API/socket calls pass through untouched
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/socket.io")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful HTML navigations so the app loads offline
        if (response.ok && event.request.mode === "navigate") {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
  );
});