"use strict";

(async () => {
  const cacheName = "echostep-asr-model-v1";
  const assets = [
    "/asr-wasm/sherpa-onnx-asr.js",
    "/wasm-asr-bootstrap.js?v=20260901-1",
    "/asr-wasm/sherpa-onnx-wasm-main-asr.js",
    "/asr-wasm/sherpa-onnx-wasm-main-asr.wasm",
    "/asr-wasm/sherpa-onnx-wasm-main-asr.data",
  ];

  const status = (label) => window.dispatchEvent(new CustomEvent("wasm-asr-status", {
    detail: { status: label, percent: null },
  }));
  const loadScript = (source) => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = source;
    script.onload = resolve;
    script.onerror = reject;
    document.body.append(script);
  });

  try {
    if (navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
    if ("serviceWorker" in navigator && "caches" in window) {
      await navigator.serviceWorker.register("/model-cache-sw.js?v=2", { scope: "/" });
      await navigator.serviceWorker.ready;
      const cache = await caches.open(cacheName);
      let stored = 0;
      for (const asset of assets) {
        if (!(await cache.match(asset))) {
          status(`모델 저장 중 ${stored + 1}/${assets.length}`);
          const response = await fetch(asset, { cache: "no-store" });
          if (!response.ok) throw new Error(`model asset ${response.status}`);
          await cache.put(asset, response);
        }
        stored += 1;
      }
      if (!navigator.serviceWorker.controller) {
        window.location.reload();
        return;
      }
    }

    await loadScript(assets[0]);
    await loadScript(assets[1]);
    await loadScript(assets[2]);
  } catch (_error) {
    status("모델 불러오기 실패");
  }
})();
