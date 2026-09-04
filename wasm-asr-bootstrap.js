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
  sessionStorage.removeItem("dictai-asr-recovered");
  let beam = 12;
  try {
    const saved = JSON.parse(localStorage.getItem("dictai-voice-settings") || localStorage.getItem("echostep-voice-settings") || "{}");
    beam = Math.max(1, Math.min(32, Math.round(Number(saved.beam) || 12)));
  } catch (_error) {}
  window.wasmAsrRecognizer = createOnlineRecognizer(Module, {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    enableEndpoint: true,
    rule1MinTrailingSilence: 2.4,
    rule2MinTrailingSilence: 1.2,
    rule3MinUtteranceLength: 20,
    decodingMethod: "modified_beam_search",
    maxActivePaths: beam,
    modelConfig: {
      debug: 0,
      tokens: "./tokens.txt",
      transducer: {
        encoder: "./encoder.onnx",
        decoder: "./decoder.onnx",
        joiner: "./joiner.onnx",
      },
      numThreads: 1,
      provider: "cpu",
      modelType: "",
    },
  });
  window.dispatchEvent(new CustomEvent("wasm-asr-ready"));
};

Module.onAbort = function() {
  window.dispatchEvent(new CustomEvent("wasm-asr-status", {
    detail: { status: "Recovering saved model", percent: null },
  }));
  void window.recoverStoredAsrModel?.();
};
