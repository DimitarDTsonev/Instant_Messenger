"use strict";
/**
 * Service Worker — enables basic PWA offline support using a cache-first strategy.
 *
 * Key responsibilities:
 *  1. Install: caches the app shell (`/` and `/index.html`) using `CACHE`.
 *     `skipWaiting()` activates the new service worker immediately without waiting
 *     for existing tabs to close.
 *  2. Activate: deletes stale caches from previous versions, then claims all
 *     open clients immediately.
 *  3. Fetch: for GET navigation requests the strategy is network-first → cache
 *     fallback → `index.html` (so the SPA router handles unknown offline routes).
 *     API and socket.io requests bypass the cache entirely.
 *
 * TypeScript note: the service-worker global scope (`self`) types don't match the
 * main-thread DOM types, so a minimal `SwScope` interface is declared here to
 * type-check service-worker-specific APIs without importing `lib.webworker`.
 */
/** Cache bucket name — bump the version string to force all old caches to be purged. */
const CACHE = "im-v1";
/** Static files pre-fetched and cached at install time (the "app shell"). */
const SHELL = ["./", "./index.html"];
const sw = globalThis;
/**
 * Install handler — pre-caches the app shell and activates immediately.
 * `skipWaiting()` ensures the new SW takes control without a page reload.
 * Cache errors are swallowed so a single failed resource doesn't block install.
 */
sw.addEventListener("install", (event) => {
    sw.skipWaiting();
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => { })));
});
/**
 * Activate handler — removes all caches whose key is not the current `CACHE`.
 * Then calls `clients.claim()` so the new SW handles fetches in open tabs
 * without waiting for a reload.
 */
sw.addEventListener("activate", (event) => {
    event.waitUntil(
    // Delete every old cache bucket in one Promise.all
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
    sw.clients.claim();
});
/**
 * Fetch handler — network-first strategy for HTML navigations with cache fallback.
 *
 * Pass-through cases (no service-worker involvement):
 *  - Non-GET methods (POST, PUT, DELETE, …).
 *  - Paths starting with `/api` or `/socket.io` (real-time and REST traffic).
 *
 * For all other GET requests:
 *  1. Try the network.
 *  2. If the response is OK and this is a navigation request, clone it into the cache.
 *  3. On network failure, return the cached response or fall back to `index.html`
 *     so the SPA handles offline routing gracefully.
 */
sw.addEventListener("fetch", (event) => {
    // Only handle GET requests; let API/socket calls pass through untouched
    if (event.request.method !== "GET")
        return;
    const url = new URL(event.request.url);
    if (url.pathname.startsWith("/api") || url.pathname.startsWith("/socket.io"))
        return;
    event.respondWith(fetch(event.request)
        .then((response) => {
        // Cache successful HTML navigations so the app loads offline
        if (response.ok && event.request.mode === "navigate") {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
    })
        // Network failed — serve from cache or fall back to index.html
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html"))));
});
