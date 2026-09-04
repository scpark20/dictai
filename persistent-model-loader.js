"use strict";

(async () => {
  const databaseName = "echostep-asr-models";
  const storeName = "files";
  const selectedModel = localStorage.getItem("echostep-voice-model") === "20m" ? "20m" : "full";
  const packages = {
    full: {
      version: "sherpa-zipformer-en-2023-06-21-v1.13.7",
      dataUrl: "/asr-wasm/sherpa-onnx-wasm-main-asr.data",
      scriptUrl: "/asr-wasm/sherpa-onnx-wasm-main-asr.js",
      expectedDataBytes: 190951044,
    },
    "20m": {
      version: "sherpa-zipformer-en-20m-2023-02-17-v1",
      dataUrl: "/asr-wasm/sherpa-onnx-wasm-main-asr-20m.data",
      scriptUrl: "/asr-wasm/sherpa-onnx-wasm-main-asr-20m.js",
      expectedDataBytes: 45969268,
    },
  };
  const selectedPackage = packages[selectedModel];
  const modelVersion = selectedPackage.version;
  const dataUrl = selectedPackage.dataUrl;
  const wasmUrl = "/asr-wasm/sherpa-onnx-wasm-main-asr.wasm";
  const expectedDataBytes = selectedPackage.expectedDataBytes;
  const expectedWasmBytes = 13150239;
  window.__voiceModelId = selectedModel;

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
    const total = Number(response.headers.get("content-length")) || 0;
    if (!response.body || !total) return response.arrayBuffer();
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      window.dispatchEvent(new CustomEvent("wasm-asr-status", {
        detail: {
          status: `${label} ${Math.round((received / total) * 100)}%`,
          percent: Math.round((received / total) * 100),
        },
      }));
    }
    const joined = new Uint8Array(received);
    let offset = 0;
    chunks.forEach((chunk) => { joined.set(chunk, offset); offset += chunk.byteLength; });
    return joined.buffer;
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
    await loadScript("/wasm-asr-bootstrap.js?v=20260904-voice-restore-1");
    await loadScript(selectedPackage.scriptUrl);
  } catch (_error) {
    status("Could not save model");
  }
})();
