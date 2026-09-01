"use strict";

(async () => {
  const databaseName = "echostep-asr-models";
  const storeName = "files";
  const modelVersion = "sherpa-main-asr-20260901-v1";
  const dataUrl = "/asr-wasm/sherpa-onnx-wasm-main-asr.data";
  const wasmUrl = "/asr-wasm/sherpa-onnx-wasm-main-asr.wasm";
  const expectedDataBytes = 190951044;
  const expectedWasmBytes = 13148431;

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
  const openDatabase = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const readStored = (database, key) => new Promise((resolve, reject) => {
    const request = database.transaction(storeName).objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  const store = (database, key, value) => new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value, key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  const removeStored = (database, key) => new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  const download = async (url, label) => {
    status(label);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    return response.arrayBuffer();
  };

  try {
    if (!("indexedDB" in window)) throw new Error("IndexedDB unavailable");
    if (navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
    const database = await openDatabase();
    const dataKey = `${modelVersion}:data`;
    const wasmKey = `${modelVersion}:wasm`;
    let data = await readStored(database, dataKey);
    let wasm = await readStored(database, wasmKey);

    if (data && (!(data instanceof ArrayBuffer) || data.byteLength !== expectedDataBytes)) {
      await removeStored(database, dataKey);
      data = null;
    }
    if (wasm && (!(wasm instanceof ArrayBuffer) || wasm.byteLength !== expectedWasmBytes)) {
      await removeStored(database, wasmKey);
      wasm = null;
    }

    if (!data) {
      data = await download(dataUrl, "Saving model for the first time");
      await store(database, dataKey, data);
    }
    if (!wasm) {
      wasm = await download(wasmUrl, "Saving runtime for the first time");
      await store(database, wasmKey, wasm);
    }

    window.__asrModuleSeed = {
      wasmBinary: wasm,
      getPreloadedPackage: () => data,
    };
    window.recoverStoredAsrModel = async () => {
      await Promise.all([
        removeStored(database, dataKey),
        removeStored(database, wasmKey),
      ]).catch(() => {});
      if (sessionStorage.getItem("echostep-asr-recovered") !== modelVersion) {
        sessionStorage.setItem("echostep-asr-recovered", modelVersion);
        window.location.reload();
      }
    };

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(
        registrations
          .filter((registration) => registration.active?.scriptURL.includes("model-cache-sw.js"))
          .map((registration) => registration.unregister()),
      ));
    }
    if ("caches" in window) void caches.delete("echostep-asr-model-v1");

    status("Loading saved model");
    await loadScript("/asr-wasm/sherpa-onnx-asr.js");
    await loadScript("/wasm-asr-bootstrap.js?v=20260901-3");
    await loadScript("/asr-wasm/sherpa-onnx-wasm-main-asr.js");
  } catch (_error) {
    status("Could not save model");
  }
})();
