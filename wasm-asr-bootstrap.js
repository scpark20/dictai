"use strict";

var Module = window.__asrModuleSeed || {};

Module.locateFile = function(path) {
  return `/asr-wasm/${path}`;
};

Module.setStatus = function(status) {
  let detail = { status: String(status || ""), percent: null };
  const match = detail.status.match(/Downloading data\.\.\. \((\d+)\/(\d+)\)/);
  if (match) {
    const loaded = Number(match[1]);
    const total = Number(match[2]);
    detail.percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
    detail.status = `Downloading model ${detail.percent}%`;
  } else if (detail.status === "Running...") {
    detail.status = "Initializing model";
  }
  window.dispatchEvent(new CustomEvent("wasm-asr-status", { detail }));
};

Module.onRuntimeInitialized = function() {
  sessionStorage.removeItem("echostep-asr-recovered");
  window.wasmAsrRecognizer = createOnlineRecognizer(Module);
  window.dispatchEvent(new CustomEvent("wasm-asr-ready"));
};

Module.onAbort = function() {
  window.dispatchEvent(new CustomEvent("wasm-asr-status", {
    detail: { status: "Recovering saved model", percent: null },
  }));
  void window.recoverStoredAsrModel?.();
};
