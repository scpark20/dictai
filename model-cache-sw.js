"use strict";

const MODEL_CACHE = "echostep-asr-model-v1";
const MODEL_PATHS = new Set([
  "/asr-wasm/sherpa-onnx-asr.js",
  "/asr-wasm/sherpa-onnx-wasm-main-asr.js",
  "/asr-wasm/sherpa-onnx-wasm-main-asr.wasm",
  "/asr-wasm/sherpa-onnx-wasm-main-asr.data",
  "/wasm-asr-bootstrap.js?v=20260901-1",
]);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith("echostep-asr-model-") && name !== MODEL_CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const key = `${url.pathname}${url.search}`;
  if (url.origin !== self.location.origin || !MODEL_PATHS.has(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(MODEL_CACHE);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  })());
});
