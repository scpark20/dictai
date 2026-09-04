"use strict";

const LEASE_REFRESH_MS = 4 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 90000;
const AUDIO_READY_TIMEOUT_MS = 15000;
const MAX_AUDIO_BLOB_BYTES = 8 * 1024 * 1024;
const PROBLEM_RETRY_DELAYS_MS = [700, 1400];
const DEFAULT_MAX_LEVEL = 191;
const SENTENCE_POSITION_KEY = "harry-potter-concise-ch5-current-sentence";
const VOICE_SETTINGS_KEY = "dictai-voice-settings";
const DEFAULT_VOICE_SETTINGS = Object.freeze({ model: "full", beam: 12, threshold: 0.72, candidate: 0.08 });
const PLAYBACK_RATES = Object.freeze([0.5, 0.8, 1.0, 1.2, 1.5]);
const DEFAULT_TARGET_LANGUAGE = "ko";
const REVEAL_TRANSLATION_MAX_LENGTH = 600;
const REVEAL_PHRASE_MAX_LENGTH = 120;
const REVEAL_MEANING_MAX_LENGTH = 240;
const TARGET_LANGUAGES = Object.freeze({
  ko: Object.freeze({ label: "Korean", lang: "ko" }),
  ja: Object.freeze({ label: "Japanese", lang: "ja" }),
  "zh-CN": Object.freeze({ label: "Chinese (Simplified)", lang: "zh-CN" }),
  es: Object.freeze({ label: "Spanish", lang: "es" }),
});

const API = {
  bootstrap: "/api/bootstrap",
  level: "/api/level",
  problem: "/api/problem",
  touch(attemptId) {
    return `/api/problem/${encodeURIComponent(attemptId)}/touch`;
  },
  audio(attemptId, take = 0) {
    return `/api/problem/${encodeURIComponent(attemptId)}/audio?take=${take}`;
  },
  analysis(attemptId) {
    return `/api/problem/${encodeURIComponent(attemptId)}/analysis`;
  },
  complete(attemptId) {
    return `/api/problem/${encodeURIComponent(attemptId)}/complete`;
  },
  reveal(attemptId) {
    return `/api/problem/${encodeURIComponent(attemptId)}/reveal`;
  },
};

const state = {
  level: null,
  maxLevel: DEFAULT_MAX_LEVEL,
  maxWords: null,
  speedLevel: 3,
  targetLanguage: DEFAULT_TARGET_LANGUAGE,
  problem: null,
  problemVersion: 0,
  problemLoadingContext: null,
  problemLoadingPhase: null,
  nextProblemLevel: null,
  problemLoading: false,
  levelChanging: false,
  slots: [],
  solved: new Set(),
  revealed: new Set(),
  revealing: false,
  analysisPending: false,
  analysisActive: false,
  analysisRequestToken: 0,
  analysisCache: Object.create(null),
  completionAnswers: [],
  usedAnswer: false,
  completing: false,
  completionReady: false,
  composing: false,
  suppressNextSubmit: false,
  compositionSubmitTimer: 0,
  entryFeedbackTimer: 0,
  retryAction: null,
  audioRunId: 0,
  audioPlayId: 0,
  audioAttemptId: null,
  audioReady: false,
  audioFailed: false,
  audioControlMode: "unavailable",
  audioWatchdog: 0,
  audioFetchController: null,
  audioObjectUrl: null,
  audioObjectUrls: [null, null],
  voiceTake: 0,
  voicePlayCount: 0,
  voiceSwapPending: false,
  speedReplayIntent: null,
  leaseTimer: 0,
  completionReplayTimer: 0,
  completionStartTimer: 0,
  voiceCompletionStopTimer: 0,
  levelNavigationId: 0,
  voiceEnabled: false,
  voiceModelReady: false,
  voiceRecognizerStream: null,
  voiceMediaStream: null,
  voiceAudioContext: null,
  voiceProcessor: null,
  voiceSource: null,
  voiceMute: null,
  voiceLastTranscript: "",
  voicePausedForTts: false,
  voiceStarting: false,
  voiceLevel: 0,
  voiceDetectedTimer: 0,
  voiceSettings: { ...DEFAULT_VOICE_SETTINGS },
  wordRevealPromise: null,
  wordRevealRequired: false,
  wordRevealRecorded: false,
  completionPending: false,
};

const elements = {
  card: document.querySelector(".practice-card"),
  headerStep: document.querySelector("#headerStep"),
  levelInput: document.querySelector("#levelInput"),
  previousSentence: document.querySelector("#previousSentence"),
  nextSentence: document.querySelector("#nextSentence"),
  headerMaxLevel: document.querySelector("#headerMaxLevel"),
  chapterProgress: document.querySelector("#chapterProgress"),
  chapterProgressFill: document.querySelector("#chapterProgressFill"),
  targetLanguageLabel: document.querySelector("#targetLanguageLabel"),
  targetLanguageSelect: document.querySelector("#targetLanguageSelect"),
  revealControls: document.querySelector("#revealControls"),
  analysisButton: document.querySelector("#analysisButton"),
  analysisStatus: document.querySelector("#analysisStatus"),
  speedControl: document.querySelector("#speedControl"),
  speedButtons: [...document.querySelectorAll(".speed-button")],
  statusText: document.querySelector("#statusText"),
  answerForm: document.querySelector("#answerForm"),
  wordGrid: document.querySelector("#wordGrid"),
  revealAnalysis: document.querySelector("#revealAnalysis"),
  revealLanguageLabel: document.querySelector("#revealLanguageLabel"),
  revealTranslation: document.querySelector("#revealTranslation"),
  revealExpressions: document.querySelector("#revealExpressions"),
  revealExpressionList: document.querySelector("#revealExpressionList"),
  answerEntry: document.querySelector("#answerEntry"),
  answerInputWrap: document.querySelector("#answerInputWrap"),
  answerInput: document.querySelector("#answerInput"),
  answerFeedback: document.querySelector("#answerFeedback"),
  revealButton: document.querySelector("#revealButton"),
  revealLabel: document.querySelector("#revealLabel"),
  nextButton: document.querySelector("#nextButton"),
  redoButton: document.querySelector("#redoButton"),
  statePanel: document.querySelector("#statePanel"),
  loader: document.querySelector("#loader"),
  stateTitle: document.querySelector("#stateTitle"),
  stateMessage: document.querySelector("#stateMessage"),
  retryButton: document.querySelector("#retryButton"),
  audio: document.querySelector("#sentenceAudio"),
  voiceToggle: document.querySelector("#voiceToggle"),
  voiceStatus: document.querySelector("#voiceStatus"),
  voiceMeter: document.querySelector("#voiceMeter"),
  inputModeStatus: document.querySelector("#inputModeStatus"),
  voiceDetected: document.querySelector("#voiceDetected"),
  voiceSetupProgress: document.querySelector("#voiceSetupProgress"),
  slotClickHint: document.querySelector("#slotClickHint"),
  properNounButton: document.querySelector("#properNounButton"),
  voiceModel: document.querySelector("#voiceModel"),
  beamSetting: document.querySelector("#beamSetting"),
  beamValue: document.querySelector("#beamValue"),
  thresholdSetting: document.querySelector("#thresholdSetting"),
  thresholdValue: document.querySelector("#thresholdValue"),
  candidateSetting: document.querySelector("#candidateSetting"),
  candidateValue: document.querySelector("#candidateValue"),
  applyVoiceSettings: document.querySelector("#applyVoiceSettings"),
};

function loadVoiceSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(VOICE_SETTINGS_KEY) || "{}");
    return {
      model: saved.model === "20m" ? "20m" : "full",
      beam: integerBetween(saved.beam, 12, 1, 32),
      threshold: Math.max(0.01, Math.min(4, Number(saved.threshold) || 0.72)),
      candidate: Math.max(0.01, Math.min(4, Number(saved.candidate) || 0.08)),
    };
  } catch (_error) {
    return { ...DEFAULT_VOICE_SETTINGS };
  }
}

function renderVoiceSettings() {
  const settings = state.voiceSettings;
  elements.voiceModel.value = settings.model;
  elements.beamSetting.value = String(settings.beam);
  elements.thresholdSetting.value = String(settings.threshold);
  elements.candidateSetting.value = String(settings.candidate);
  elements.beamValue.textContent = String(settings.beam);
  elements.thresholdValue.textContent = settings.threshold.toFixed(2);
  elements.candidateValue.textContent = settings.candidate.toFixed(2);
}

state.voiceSettings = loadVoiceSettings();
localStorage.setItem("dictai-voice-model", state.voiceSettings.model);

let chimeContext = null;
const activeWordTicks = new Set();
let wordTickEpoch = 0;

class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function integerBetween(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function setStatus(message) {
  elements.statusText.textContent = message;
}

function savedSentencePosition() {
  try {
    const saved = Number(window.localStorage.getItem(SENTENCE_POSITION_KEY));
    return Number.isInteger(saved) && saved >= 1 && saved <= state.maxLevel ? saved : null;
  } catch (_error) {
    return null;
  }
}

function saveSentencePosition(level) {
  try {
    window.localStorage.setItem(SENTENCE_POSITION_KEY, String(level));
  } catch (_error) {
    // Server-side progress remains the fallback when browser storage is unavailable.
  }
}

function renderStep(level) {
  const safeLevel = integerBetween(level, 1, 1, state.maxLevel);
  state.level = safeLevel;
  elements.levelInput.max = String(state.maxLevel);
  elements.levelInput.value = String(safeLevel);
  elements.levelInput.setAttribute("aria-invalid", "false");
  elements.headerMaxLevel.textContent = String(state.maxLevel);
  elements.chapterProgressFill?.style.setProperty("--chapter-progress", `${(safeLevel / state.maxLevel) * 100}%`);
  if (elements.chapterProgress) {
    const percent = Math.round((safeLevel / state.maxLevel) * 100);
    elements.chapterProgress.setAttribute("aria-valuemax", String(state.maxLevel));
    elements.chapterProgress.setAttribute("aria-valuenow", String(safeLevel));
    elements.chapterProgress.title = `Chapter 5 progress ${percent}% · sentence ${safeLevel}/${state.maxLevel}`;
  }
  saveSentencePosition(safeLevel);
  updateSentenceNavigation();
}

function updateLevelInputDisabled() {
  elements.levelInput.disabled = state.level === null;
  updateSentenceNavigation();
}

function updateSentenceNavigation() {
  const unavailable = state.level === null;
  elements.previousSentence.disabled = unavailable || state.level <= 1;
  elements.nextSentence.disabled = unavailable || state.level >= state.maxLevel;
}

function playbackRateForLevel(level = state.speedLevel) {
  const safeLevel = integerBetween(level, 3, 1, PLAYBACK_RATES.length);
  return PLAYBACK_RATES[safeLevel - 1];
}

function applyPlaybackRate() {
  const playbackRate = playbackRateForLevel();
  elements.audio.playbackRate = playbackRate;
  elements.audio.preservesPitch = true;
  return playbackRate;
}

function renderSpeedControl() {
  const mode = state.audioControlMode;
  const disabled = ["unavailable", "loading", "held", "missing"].includes(mode);
  elements.speedControl.setAttribute("aria-busy", String(mode === "loading"));

  elements.speedButtons.forEach((button) => {
    const level = integerBetween(
      button.dataset.speedLevel,
      3,
      1,
      PLAYBACK_RATES.length,
    );
    const selected = level === state.speedLevel;
    const playing = mode === "playing" && selected;
    button.classList.toggle("is-selected", selected);
    button.classList.toggle("is-playing", playing);
    button.disabled = disabled;
    button.setAttribute("aria-pressed", String(selected));
    const playbackRate = playbackRateForLevel(level);
    button.textContent = playbackRate.toFixed(1);
    let action = "Play sentence";
    if (mode === "unavailable") action = "Sentence unavailable";
    if (mode === "loading") action = "Preparing audio";
    if (mode === "held") action = "Processing answer";
    if (mode === "missing") action = "Audio unavailable";
    if (mode === "retry") action = "Retry audio";
    if (playing) action = "Playing; replay from the beginning";
    button.setAttribute(
      "aria-label",
      `${playbackRate.toFixed(1)}x ${action}`,
    );
  });
}

function setAudioControlMode(mode) {
  state.audioControlMode = mode;
  renderSpeedControl();
}

function setSpeedLevel(level) {
  state.speedLevel = integerBetween(
    level,
    3,
    1,
    PLAYBACK_RATES.length,
  );
  renderSpeedControl();
  applyPlaybackRate();
}

function selectSpeedAndReplay(level) {
  setSpeedLevel(level);

  const problem = state.problem;
  const version = state.problemVersion;
  if (
    !problem
    || state.levelChanging
    || (state.completing && state.completionReplayTimer)
  ) return;

  if (!state.audioReady && !state.audioFailed && hasRetainedCurrentAudio(problem, version)) {
    state.speedReplayIntent = Object.freeze({
      attemptId: String(problem.attemptId),
      version,
    });
    return;
  }

  state.speedReplayIntent = null;
  void playSentence();
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function renderVoiceStatus(label, active = false) {
  const compactLabels = {
    "Preparing model": "Loading…",
    "Preparing microphone": "Ready",
  };
  elements.voiceStatus.textContent = compactLabels[label] || label;
  elements.voiceToggle.checked = state.voiceEnabled;
  elements.voiceToggle.closest(".voice-toggle")?.classList.toggle("is-listening", active);
  if (elements.inputModeStatus) elements.inputModeStatus.textContent = state.voiceEnabled ? "Voice + Type" : "Type Only";
}

function renderVoiceSetupProgress(percent = null, visible = true) {
  if (!elements.voiceSetupProgress) return;
  elements.voiceSetupProgress.classList.toggle("is-indeterminate", visible && percent === null);
  elements.voiceSetupProgress.hidden = !visible;
  elements.voiceSetupProgress.querySelector("i")?.style.setProperty(
    "--setup-progress",
    `${Math.max(0, Math.min(100, Number(percent) || 0))}%`,
  );
}

function renderVoiceLevel(samples) {
  let energy = 0;
  for (let index = 0; index < samples.length; index += 1) energy += samples[index] * samples[index];
  const rms = Math.sqrt(energy / Math.max(1, samples.length));
  const target = Math.min(1, rms * 9);
  state.voiceLevel = target > state.voiceLevel ? target : state.voiceLevel * 0.52;
  if (elements.voiceMeter) elements.voiceMeter.dataset.level = String(Math.ceil(state.voiceLevel * 5));
}

function showRecognizedVoiceWord(word) {
  if (!elements.voiceDetected) return;
  window.clearTimeout(state.voiceDetectedTimer);
  elements.voiceDetected.textContent = String(word || "");
  elements.voiceDetected.hidden = false;
  state.voiceDetectedTimer = window.setTimeout(() => {
    elements.voiceDetected.hidden = true;
    elements.voiceDetected.textContent = "";
  }, 700);
}

function flashVoiceCandidate(indices) {
  indices.forEach((index) => {
    const element = state.slots[index]?.element;
    if (!element) return;
    element.classList.remove("is-voice-candidate");
    void element.offsetWidth;
    element.classList.add("is-voice-candidate");
    window.setTimeout(() => element.classList.remove("is-voice-candidate"), 240);
  });
}

function keepSolvedSlotVisible(slotElement) {
  window.setTimeout(() => {
    if (!slotElement?.isConnected) return;
    const bounds = slotElement.getBoundingClientRect();
    const outside = bounds.top < 8 || bounds.bottom > window.innerHeight - 8;
    if (outside) slotElement.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, 90);
}

function downsampleVoice(input, inputRate, outputRate = 16000) {
  if (inputRate === outputRate) return new Float32Array(input);
  const ratio = inputRate / outputRate;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let source = start; source < end; source += 1) sum += input[source];
    output[index] = sum / Math.max(1, end - start);
  }
  return output;
}

function acceptVoiceTranscript(text, endpoint = false) {
  if (!state.problem || state.completing || state.problemLoading) return;
  const previous = entryWords(state.voiceLastTranscript);
  const current = entryWords(text);
  let shared = 0;
  while (shared < previous.length && shared < current.length && previous[shared] === current[shared]) shared += 1;
  for (const word of current.slice(shared)) {
    if (state.completing) break;
    commitVoiceWord(word);
  }
  state.voiceLastTranscript = endpoint ? "" : String(text || "");
}

async function stopVoiceRecognition(label = state.voiceEnabled ? "Ready" : "Off") {
  const recognizerStream = state.voiceRecognizerStream;
  state.voiceRecognizerStream = null;
  if (state.voiceProcessor) state.voiceProcessor.disconnect();
  if (state.voiceSource) state.voiceSource.disconnect();
  if (state.voiceMute) state.voiceMute.disconnect();
  state.voiceMediaStream?.getTracks().forEach((track) => track.stop());
  const context = state.voiceAudioContext;
  state.voiceProcessor = null;
  state.voiceSource = null;
  state.voiceMute = null;
  state.voiceMediaStream = null;
  state.voiceAudioContext = null;
  state.voiceLastTranscript = "";
  state.voiceLevel = 0;
  if (elements.voiceMeter) elements.voiceMeter.dataset.level = "0";
  if (recognizerStream) recognizerStream.free();
  if (context && context.state !== "closed") await context.close().catch(() => {});
  renderVoiceStatus(label, false);
}

async function startVoiceRecognition() {
  if (!state.voiceEnabled || !state.problem || state.completing || state.voiceStarting || state.voiceRecognizerStream) return;
  const recognizer = window.wasmAsrRecognizer;
  if (!recognizer) {
    renderVoiceStatus("Loading…", false);
    return;
  }
  state.voiceStarting = true;
  renderVoiceStatus("Ready", false);
  try {
    const media = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    if (!state.voiceEnabled || !state.problem || state.completing) {
      media.getTracks().forEach((track) => track.stop());
      return;
    }
    const context = new AudioContext({ sampleRate: 16000 });
    const source = context.createMediaStreamSource(media);
    const processor = context.createScriptProcessor(1024, 1, 1);
    const mute = context.createGain();
    mute.gain.value = 0;
    const recognizerStream = recognizer.createStream();
    state.voiceMediaStream = media;
    state.voiceAudioContext = context;
    state.voiceSource = source;
    state.voiceProcessor = processor;
    state.voiceMute = mute;
    state.voiceRecognizerStream = recognizerStream;
    source.connect(processor);
    processor.connect(mute);
    mute.connect(context.destination);
    processor.onaudioprocess = (event) => {
      const inputSamples = event.inputBuffer.getChannelData(0);
      renderVoiceLevel(inputSamples);
      if (state.voicePausedForTts || !state.voiceEnabled || state.voiceRecognizerStream !== recognizerStream) return;
      const samples = downsampleVoice(inputSamples, context.sampleRate);
      recognizerStream.acceptWaveform(16000, samples);
      while (recognizer.isReady(recognizerStream)) recognizer.decode(recognizerStream);
      const result = recognizer.getResult(recognizerStream);
      const text = String(result?.text ?? result ?? "").trim().toLowerCase();
      const endpoint = recognizer.isEndpoint(recognizerStream);
      acceptVoiceTranscript(text, endpoint);
      if (endpoint) recognizer.reset(recognizerStream);
    };
    renderVoiceStatus("Listening…", true);
  } catch (error) {
    const denied = error?.name === "NotAllowedError";
    const label = denied ? "Permission required" : "Unavailable";
    renderVoiceStatus(label, false);
    showError(
      "Could not start the microphone",
      denied ? "Allow microphone access in your browser." : "Check your microphone and try again.",
      () => startVoiceRecognition(),
      "Retry microphone",
    );
  } finally {
    state.voiceStarting = false;
  }
}

function problemRequestBody(targetLanguage = currentTargetLanguage()) {
  return { target_language: normaliseTargetLanguage(targetLanguage) };
}

function createProblemLoadingContext(level, version) {
  const safeLevel = integerBetween(level, state.level || 1, 1, state.maxLevel);
  return Object.freeze({
    level: safeLevel,
    version,
  });
}

function problemLoadingMessage(context) {
  return `Chapter 5 · ${context.level}/191 Selecting sentence`;
}

function showProblemLoadingPhase(context, phase, title) {
  if (
    !context
    || context.version !== state.problemVersion
    || state.problemLoadingContext !== context
  ) return false;

  const message = problemLoadingMessage(context);
  if (
    state.problemLoadingPhase === phase
    && !elements.statePanel.hidden
    && elements.stateTitle.textContent === title
    && elements.stateMessage.textContent === message
  ) return false;

  state.problemLoadingPhase = phase;
  showLoading(title, message);
  return true;
}

function normaliseTargetLanguage(value) {
  const language = String(value || "");
  return Object.prototype.hasOwnProperty.call(TARGET_LANGUAGES, language)
    ? language
    : DEFAULT_TARGET_LANGUAGE;
}

function setTargetLanguage(value) {
  state.targetLanguage = normaliseTargetLanguage(value);
  elements.targetLanguageSelect.value = state.targetLanguage;
}

function setAnalysisControlsAvailable(enabled) {
  const available = Boolean(enabled);
  elements.revealControls.hidden = !available;
  elements.analysisButton.disabled = !available || state.analysisPending;
  elements.targetLanguageSelect.disabled = !available || state.analysisPending;
  elements.targetLanguageLabel.textContent = "Guide language";
  elements.targetLanguageSelect.setAttribute(
    "aria-label",
    available
      ? "Answer guide language; also applies to the next sentence"
      : "Currently selected answer guide language",
  );
}

function currentTargetLanguage() {
  setTargetLanguage(elements.targetLanguageSelect.value);
  return state.targetLanguage;
}

function clearRevealAnalysis() {
  elements.revealAnalysis.hidden = true;
  elements.revealAnalysis.removeAttribute("aria-busy");
  elements.revealAnalysis.classList.remove("is-independent");
  elements.revealLanguageLabel.textContent = TARGET_LANGUAGES[state.targetLanguage].label;
  elements.revealTranslation.textContent = "";
  elements.revealTranslation.removeAttribute("lang");
  elements.revealExpressions.hidden = true;
  elements.revealExpressionList.replaceChildren();
}

function clearAnalysisStatus() {
  elements.analysisStatus.hidden = true;
  elements.analysisStatus.classList.remove("is-error");
  elements.analysisStatus.textContent = "";
}

function showAnalysisStatus(message, isError = false) {
  elements.analysisStatus.textContent = message;
  elements.analysisStatus.classList.toggle("is-error", isError);
  elements.analysisStatus.hidden = false;
}

function boundedRevealText(value, maxLength) {
  if (typeof value !== "string") return null;
  const normalised = value.normalize("NFKC");
  if (/[\p{C}<>]/u.test(normalised)) return null;
  const text = normalised.trim().replace(/\s+/gu, " ");
  if (!text || Array.from(text).length > maxLength) return null;
  return text;
}

function textMatchesTargetLanguage(text, targetLanguage) {
  const hasHangul = /\p{Script=Hangul}/u.test(text);
  const hasHan = /\p{Script=Han}/u.test(text);
  const hasKana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
  const hasLatin = /\p{Script=Latin}/u.test(text);
  if (targetLanguage === "ko") return hasHangul;
  if (targetLanguage === "ja") return hasKana || hasHan;
  if (targetLanguage === "zh-CN") return hasHan && !hasKana;
  return hasLatin && !hasHangul && !hasHan && !hasKana;
}

function phraseOccursInProblem(phrase, problem) {
  const phraseWords = entryWords(phrase);
  if (
    !phraseWords.length
    || phraseWords.length > 4
    || phraseWords.length > problem.answerWords.length
  ) return false;
  return problem.answerWords.some((_word, startIndex) => {
    const candidate = problem.answerWords.slice(startIndex, startIndex + phraseWords.length);
    return sameWordSequence(candidate, phraseWords);
  });
}

function validateAnalysisDetails(payload, problem, targetLanguage) {
  if (
    !payload
    || typeof payload !== "object"
    || Array.isArray(payload)
    || !sameWordSequence(Object.keys(payload).sort(), ["expressions", "translation"])
  ) {
    throw new ApiError("The answer guide could not be verified.");
  }
  const translation = boundedRevealText(payload.translation, REVEAL_TRANSLATION_MAX_LENGTH);
  if (!translation || !textMatchesTargetLanguage(translation, targetLanguage)) {
    throw new ApiError("The full translation could not be verified.");
  }
  if (!Array.isArray(payload.expressions) || payload.expressions.length > 3) {
    throw new ApiError("The key expressions could not be verified.");
  }

  const seenPhrases = new Set();
  const expressions = payload.expressions.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ApiError("The key expressions could not be verified.");
    }
    const keys = Object.keys(entry).sort();
    if (!sameWordSequence(keys, ["meaning", "phrase"])) {
      throw new ApiError("The key expressions could not be verified.");
    }
    const phrase = boundedRevealText(
      standardiseWordPunctuation(entry.phrase),
      REVEAL_PHRASE_MAX_LENGTH,
    );
    const meaning = boundedRevealText(entry.meaning, REVEAL_MEANING_MAX_LENGTH);
    if (
      !phrase
      || !/^[A-Za-z]+(?:['-][A-Za-z]+)*(?:\s+[A-Za-z]+(?:['-][A-Za-z]+)*){0,3}$/u.test(phrase)
      || !phraseOccursInProblem(phrase, problem)
      || !meaning
      || !textMatchesTargetLanguage(meaning, targetLanguage)
    ) {
      throw new ApiError("The key expressions could not be verified.");
    }
    const phraseKey = phrase.toLowerCase();
    if (seenPhrases.has(phraseKey)) throw new ApiError("The key expressions could not be verified.");
    seenPhrases.add(phraseKey);
    return { phrase, meaning };
  });

  return { translation, expressions };
}

function validateRevealPayload(payload, problem) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ApiError("The full answer could not be verified.");
  }
  if (
    !sameWordSequence(
      Object.keys(payload).sort(),
      ["answers", "revealed"],
    )
    || payload.revealed !== true
    || !Array.isArray(payload.answers)
  ) {
    throw new ApiError("The full answer could not be verified.");
  }
  if (payload.answers.length !== problem.wordCount) {
    throw new ApiError("The full answer could not be verified.");
  }
  const answers = payload.answers.map((value, index) => {
    if (typeof value !== "string") throw new ApiError("The full answer could not be verified.");
    const answer = standardiseWordPunctuation(value).trim();
    if (
      !answer
      || Array.from(answer).length > 80
      || normaliseWord(answer) !== problem.answerWords[index]
    ) {
      throw new ApiError("The full answer could not be verified.");
    }
    return answer;
  });
  return { answers };
}

function validateCompletionAnalysisPayload(payload, problem, targetLanguage) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ApiError("The answer guide could not be verified.");
  }
  const keys = Object.keys(payload).sort();
  if (
    !sameWordSequence(keys, ["analysis", "target_language"])
    || payload.target_language !== targetLanguage
  ) {
    throw new ApiError("The answer guide could not be verified.");
  }
  return Object.freeze(validateAnalysisDetails(payload.analysis, problem, targetLanguage));
}

function showCompletionAnalysisPending(targetLanguage) {
  clearRevealAnalysis();
  const language = TARGET_LANGUAGES[targetLanguage];
  elements.revealAnalysis.classList.add("is-independent");
  elements.revealLanguageLabel.textContent = language.label;
  elements.revealTranslation.lang = language.lang;
  elements.revealTranslation.textContent = "Creating the translation and key expressions.";
  elements.revealAnalysis.setAttribute("aria-busy", "true");
  elements.revealAnalysis.hidden = false;
}

function renderRevealAnalysis(analysis, targetLanguage, independent = false) {
  const language = TARGET_LANGUAGES[targetLanguage];
  elements.revealAnalysis.classList.toggle("is-independent", independent);
  elements.revealLanguageLabel.textContent = language.label;
  elements.revealTranslation.textContent = analysis.translation;
  elements.revealTranslation.lang = language.lang;
  elements.revealExpressionList.replaceChildren();

  analysis.expressions.forEach((expression) => {
    const item = document.createElement("li");
    const phrase = document.createElement("strong");
    const meaning = document.createElement("span");
    phrase.lang = "en";
    phrase.textContent = expression.phrase;
    meaning.lang = language.lang;
    meaning.textContent = expression.meaning;
    item.append(phrase, meaning);
    elements.revealExpressionList.append(item);
  });

  elements.revealExpressions.hidden = analysis.expressions.length === 0;
  elements.revealAnalysis.removeAttribute("aria-busy");
  elements.revealAnalysis.hidden = false;
}

async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(path, {
      method: options.method || "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      keepalive: options.keepalive === true,
    });

    let payload = null;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      payload = await response.json();
    }

    if (!response.ok) {
      const detail = typeof payload?.detail === "string" ? payload.detail : "The request could not be completed.";
      throw new ApiError(detail, response.status);
    }

    return payload || {};
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ApiError("The response is taking too long. Try again.");
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError("Could not connect to the server. Try again shortly.");
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function showLoading(title, message) {
  state.retryAction = null;
  elements.statePanel.setAttribute("role", "status");
  elements.statePanel.setAttribute("aria-live", "polite");
  elements.stateTitle.textContent = title;
  elements.stateMessage.textContent = message;
  elements.loader.hidden = false;
  elements.retryButton.hidden = true;
  elements.statePanel.hidden = false;
}

function showError(title, message, retryAction, retryLabel = "Try again") {
  state.retryAction = retryAction;
  elements.statePanel.setAttribute("role", "alert");
  elements.statePanel.setAttribute("aria-live", "assertive");
  elements.stateTitle.textContent = title;
  elements.stateMessage.textContent = message;
  elements.loader.hidden = true;
  elements.retryButton.textContent = retryLabel;
  elements.retryButton.hidden = false;
  elements.statePanel.hidden = false;
}

function hideStatePanel() {
  elements.statePanel.hidden = true;
  elements.statePanel.setAttribute("role", "status");
  elements.statePanel.setAttribute("aria-live", "polite");
}

function clearAudioBuffer() {
  window.clearTimeout(state.audioWatchdog);
  state.audioWatchdog = 0;
  if (state.audioFetchController) {
    state.audioFetchController.abort();
    state.audioFetchController = null;
  }
  const objectUrls = [...new Set(state.audioObjectUrls.filter(Boolean))];
  state.audioObjectUrl = null;
  state.audioObjectUrls = [null, null];
  state.audioRunId += 1;
  state.audioPlayId += 1;
  state.audioAttemptId = null;
  state.audioReady = false;
  state.audioFailed = false;
  setAudioControlMode("unavailable");
  const audio = elements.audio;
  audio.onloadedmetadata = null;
  audio.oncanplay = null;
  audio.onplay = null;
  audio.onended = null;
  audio.onpause = null;
  audio.onwaiting = null;
  audio.onstalled = null;
  audio.onabort = null;
  audio.onerror = null;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
}

function isCurrentAudio(runId, problem, version) {
  return runId === state.audioRunId
    && state.problem === problem
    && state.problemVersion === version
    && state.audioAttemptId === String(problem.attemptId);
}

function hasRetainedCurrentAudio(problem = state.problem, version = state.problemVersion) {
  if (!problem) return false;
  const audio = elements.audio;
  return state.problem === problem
    && state.problemVersion === version
    && state.audioAttemptId === String(problem.attemptId)
    && Boolean(state.audioObjectUrl)
    && audio.getAttribute("src") === state.audioObjectUrl;
}

function prepareCompletionReplay(problem = state.problem, version = state.problemVersion) {
  const audio = elements.audio;
  const hasCurrentAudio = hasRetainedCurrentAudio(problem, version);

  // Stop the sentence before the success chime, but retain its source and
  // decoded media so the learner can review it until they choose Next.
  state.audioPlayId += 1;
  audio.pause();
  if (hasCurrentAudio) {
    try {
      audio.currentTime = 0;
    } catch (_error) {
      // A still-loading stream may not be seekable yet. oncanplay will make
      // the retained audio available without starting another request.
    }
  }
  if (state.audioFailed || !hasCurrentAudio) {
    setAudioControlMode("missing");
    return;
  }
  if (!state.audioReady) {
    setAudioControlMode("loading");
    return;
  }
  setAudioControlMode("ready");
}

function holdCompletionReplayForChime(problem, version) {
  window.clearTimeout(state.completionReplayTimer);
  state.completionReplayTimer = 0;
  setAudioControlMode("held");
  state.completionReplayTimer = window.setTimeout(() => {
    state.completionReplayTimer = 0;
    if (state.problem !== problem || state.problemVersion !== version || !state.completing) return;
    prepareCompletionReplay(problem, version);
  }, 760);
}

async function waitForCompletionAudio(problem, version) {
  const deadline = Date.now() + AUDIO_READY_TIMEOUT_MS + 1000;
  while (
    state.problem === problem
    && state.problemVersion === version
    && state.completing
    && hasRetainedCurrentAudio(problem, version)
    && !state.audioReady
    && !state.audioFailed
    && Date.now() < deadline
  ) {
    await delay(100);
  }
}

function isCurrentProblemLoading(problem, version, context) {
  return Boolean(context)
    && state.problemLoading
    && state.problem === problem
    && state.problemVersion === version
    && state.problemLoadingContext === context;
}

function finishProblemLoading(problem, version, context) {
  if (!isCurrentProblemLoading(problem, version, context)) return false;
  state.problemLoading = false;
  state.problemLoadingContext = null;
  state.problemLoadingPhase = null;
  elements.answerInput.disabled = false;
  elements.revealButton.disabled = false;
  elements.answerForm.removeAttribute("aria-busy");
  updateLevelInputDisabled();
  setStatus("The original audio is ready. Choose a playback speed.");
  hideStatePanel();
  elements.answerInput.focus({ preventScroll: true });
  void startVoiceRecognition();
  return true;
}

function retryProblemAudio(problem, version, context) {
  if (
    state.problem !== problem
    || state.problemVersion !== version
    || state.problemLoadingContext !== context
  ) return;
  state.problemLoading = true;
  state.problemLoadingPhase = null;
  elements.answerInput.disabled = true;
  updateLevelInputDisabled();
  showProblemLoadingPhase(context, "audio", "Loading original audio");
  configureCurrentAudio(problem, version, context);
}

function configureCurrentAudio(problem, version, problemLoadingContext = null, take = state.voiceTake) {
  // Download the complete clip while the attempt is active. The retained Blob
  // remains replayable after completion even though the server closes the
  // attempt's authenticated audio route immediately.
  if (state.problem !== problem || state.problemVersion !== version) return;
  clearAudioBuffer();
  const runId = state.audioRunId;
  const audio = elements.audio;
  state.audioAttemptId = String(problem.attemptId);
  setAudioControlMode("loading");
  if (!isCurrentProblemLoading(problem, version, problemLoadingContext)) {
    setStatus("Loading the original audio.");
  }

  const isCurrent = () => isCurrentAudio(runId, problem, version);
  const failCurrentAudio = (message) => {
    if (!isCurrent()) return;
    state.speedReplayIntent = null;
    if (state.audioFetchController) {
      state.audioFetchController.abort();
      state.audioFetchController = null;
    }
    const failedDuringProblemLoading = isCurrentProblemLoading(
      problem,
      version,
      problemLoadingContext,
    );
    window.clearTimeout(state.audioWatchdog);
    state.audioWatchdog = 0;
    audio.onloadedmetadata = null;
    audio.oncanplay = null;

    if (state.completing) {
      // Keep the completed attempt's media source untouched. It must never be
      // replaced by another request after the server closes the attempt.
      state.audioReady = false;
      state.audioFailed = true;
      audio.pause();
      setAudioControlMode("missing");
      setStatus("This sentence cannot be replayed. Move to the next sentence.");
      return;
    }

    state.audioRunId += 1;
    state.audioAttemptId = null;
    state.audioReady = false;
    state.audioFailed = true;
    audio.onplay = null;
    audio.onended = null;
    audio.onpause = null;
    audio.onwaiting = null;
    audio.onstalled = null;
    audio.onabort = null;
    audio.onerror = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    [...new Set(state.audioObjectUrls.filter(Boolean))].forEach((url) => URL.revokeObjectURL(url));
    state.audioObjectUrl = null;
    state.audioObjectUrls = [null, null];
    setAudioControlMode(failedDuringProblemLoading || state.levelChanging ? "missing" : "retry");
    if (failedDuringProblemLoading) {
      showError(
        "Could not load the original audio",
        message,
        () => retryProblemAudio(problem, version, problemLoadingContext),
        "Reload audio",
      );
      return;
    }
    if (!state.levelChanging) {
      setStatus(message);
      showError(
        "Could not play the original audio",
        message,
        () => configureCurrentAudio(problem, version, null, state.voiceTake),
        "Retry original audio",
      );
    }
    void refreshProblemLease(problem, version);
  };
  // Keep the user-selected playback rate when a new Wonder clip is loaded.
  applyPlaybackRate();
  audio.onloadedmetadata = null;
  audio.oncanplay = () => {
    if (!isCurrent()) return;
    applyPlaybackRate();
    window.clearTimeout(state.audioWatchdog);
    state.audioWatchdog = 0;
    state.audioReady = true;
    state.audioFailed = false;
    const speedReplayRequested = state.speedReplayIntent?.attemptId === String(problem.attemptId)
      && state.speedReplayIntent?.version === version;
    if (speedReplayRequested) state.speedReplayIntent = null;
    if (state.levelChanging) {
      setAudioControlMode("unavailable");
      return;
    }
    if (state.completing && state.completionReplayTimer) {
      setAudioControlMode("held");
      return;
    }
    setAudioControlMode(audio.paused ? "ready" : "playing");
    const finishedProblemLoading = finishProblemLoading(
      problem,
      version,
      problemLoadingContext,
    );
    if (!finishedProblemLoading && elements.statePanel.getAttribute("role") === "alert") {
      hideStatePanel();
    }
    if (speedReplayRequested) {
      void playSentence();
      return;
    }
    if (audio.paused && !finishedProblemLoading) {
      setStatus(state.completing
        ? "You can replay the sentence. Move on when ready."
        : "The original audio is ready. Choose a playback speed.");
    }
  };
  audio.onplay = () => {
    if (!isCurrent()) return;
    if (state.levelChanging) {
      audio.pause();
      setAudioControlMode("unavailable");
      return;
    }
    if (state.completing && state.completionReplayTimer) {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch (_error) {
        // The retained stream may still be becoming seekable.
      }
      setAudioControlMode("held");
      return;
    }
    setAudioControlMode("playing");
    state.voicePausedForTts = true;
    renderVoiceStatus(state.voiceEnabled ? "Paused during playback" : "Off", false);
    setStatus(state.completing ? "Replaying the completed sentence." : "Playing the full sentence.");
  };
  audio.onended = () => {
    if (!isCurrent()) return;
    if (state.levelChanging) {
      setAudioControlMode("unavailable");
      return;
    }
    setAudioControlMode("ready");
    state.voicePausedForTts = false;
    if (state.voiceRecognizerStream) renderVoiceStatus("Listening", true);
    setStatus(state.completing
      ? "Replay if needed, then choose the next sentence when ready."
      : "Enter a word you heard, then press Space or Enter.");
  };
  audio.onpause = () => {
    if (!isCurrent() || audio.ended) return;
    if (state.levelChanging) {
      setAudioControlMode("unavailable");
      return;
    }
    if (state.audioReady && !(state.completing && state.completionReplayTimer)) {
      setAudioControlMode("ready");
    }
    state.voicePausedForTts = false;
    if (state.voiceRecognizerStream && !state.completing) renderVoiceStatus("Listening", true);
  };
  audio.onwaiting = () => {
    if (!isCurrent() || state.levelChanging) return;
    if (isCurrentProblemLoading(problem, version, problemLoadingContext)) return;
    setStatus(state.completing
      ? "Loading audio for the completed sentence."
      : "Loading the original audio.");
  };
  audio.onstalled = () => {
    if (!isCurrent() || state.levelChanging) return;
    if (isCurrentProblemLoading(problem, version, problemLoadingContext)) return;
    setStatus(state.completing
      ? "Still loading audio for the completed sentence."
      : "Still loading the original audio.");
  };
  // Replacing take A with take B intentionally aborts the old media element.
  // Network aborts are already handled by the fetch controller below.
  audio.onabort = null;
  audio.onerror = () => failCurrentAudio("Could not load the original audio. Press the button to try again.");

  const fetchController = new AbortController();
  state.audioFetchController = fetchController;
  void (async () => {
    try {
      const loadTake = async (takeIndex) => {
        const response = await fetch(API.audio(problem.attemptId, takeIndex), {
          credentials: "same-origin",
          cache: "no-store",
          signal: fetchController.signal,
        });
        if (!response.ok) throw new ApiError("Could not load the original audio.", response.status);
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.toLowerCase().startsWith("audio/")) {
          throw new ApiError("The original audio format could not be verified.");
        }
        const blob = await response.blob();
        if (blob.size <= 0 || blob.size > MAX_AUDIO_BLOB_BYTES) {
          throw new ApiError("The original audio size could not be verified.");
        }
        return URL.createObjectURL(blob);
      };
      const objectUrls = await Promise.all([loadTake(0), loadTake(1)]);
      if (!isCurrent() || fetchController.signal.aborted) {
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      const objectUrl = objectUrls[take] || objectUrls[0];
      state.audioFetchController = null;
      state.audioObjectUrls = objectUrls;
      state.audioObjectUrl = objectUrl;
      audio.src = objectUrl;
      audio.load();
    } catch (error) {
      if (fetchController.signal.aborted || !isCurrent()) return;
      state.audioFetchController = null;
      failCurrentAudio(error instanceof ApiError
        ? error.message
        : "Could not load the original audio. Press the button to try again.");
    }
  })();
  state.audioWatchdog = window.setTimeout(() => {
    failCurrentAudio("The original audio is taking too long. Press again.");
  }, AUDIO_READY_TIMEOUT_MS);
}

function resetProblemSurface() {
  stopWordSuccessTicks();
  window.clearInterval(state.leaseTimer);
  state.leaseTimer = 0;
  window.clearTimeout(state.completionReplayTimer);
  state.completionReplayTimer = 0;
  window.clearTimeout(state.completionStartTimer);
  state.completionStartTimer = 0;
  window.clearTimeout(state.voiceDetectedTimer);
  state.voiceDetectedTimer = 0;
  window.clearTimeout(state.voiceCompletionStopTimer);
  state.voiceCompletionStopTimer = 0;
  state.voicePausedForTts = false;
  clearAudioBuffer();
  void stopVoiceRecognition(state.voiceEnabled ? "Standby" : "Off");
  state.speedReplayIntent = null;
  state.voiceTake = 0;
  state.voicePlayCount = 0;
  state.voiceSwapPending = false;
  state.problem = null;
  state.problemLoadingContext = null;
  state.problemLoadingPhase = null;
  state.levelChanging = false;
  state.slots = [];
  state.solved = new Set();
  state.revealed = new Set();
  state.revealing = false;
  state.analysisPending = false;
  state.analysisActive = false;
  state.analysisRequestToken += 1;
  state.analysisCache = Object.create(null);
  state.completionAnswers = [];
  state.usedAnswer = false;
  state.wordRevealPromise = null;
  state.wordRevealRequired = false;
  state.wordRevealRecorded = false;
  state.completionPending = false;
  elements.card.classList.remove("is-completion-pending", "is-input-active");
  state.completing = false;
  state.completionReady = false;
  state.composing = false;
  state.suppressNextSubmit = false;
  window.clearTimeout(state.compositionSubmitTimer);
  state.compositionSubmitTimer = 0;
  window.clearTimeout(state.entryFeedbackTimer);
  state.entryFeedbackTimer = 0;

  clearRevealAnalysis();
  clearAnalysisStatus();
  setAnalysisControlsAvailable(false);
  elements.analysisButton.textContent = "Answer guide";

  elements.wordGrid.replaceChildren();
  elements.answerInput.value = "";
  elements.answerInput.disabled = true;
  elements.answerInputWrap.hidden = false;
  elements.answerInput.setAttribute("aria-invalid", "false");
  elements.answerEntry.classList.remove("is-wrong", "is-correct", "is-completing");
  elements.answerFeedback.classList.remove("is-error");
  elements.answerFeedback.textContent = "Type a word. Press Space or Enter.";
  elements.answerForm.removeAttribute("aria-busy");
  elements.revealButton.hidden = false;
  elements.revealButton.disabled = true;
  elements.properNounButton.disabled = true;
  elements.properNounButton.hidden = false;
  elements.properNounButton.textContent = "Names";
  elements.revealLabel.textContent = "Give Up";
  elements.nextButton.hidden = true;
  elements.nextButton.disabled = true;
  elements.nextButton.textContent = "Next →";
  elements.redoButton.hidden = true;
  elements.redoButton.disabled = true;
  elements.card.classList.remove("is-success");
  elements.card.classList.remove("is-reveal-complete");
  updateLevelInputDisabled();
}

const CONTRACTION_EXPANSIONS = Object.freeze({
  "aren't": [["are", "not"]], "can't": [["can", "not"], ["cannot"]],
  "cannot": [["can", "not"]],
  "couldn't": [["could", "not"]], "daren't": [["dare", "not"]],
  "didn't": [["did", "not"]], "doesn't": [["does", "not"]], "don't": [["do", "not"]],
  "hadn't": [["had", "not"]], "hasn't": [["has", "not"]], "haven't": [["have", "not"]],
  "isn't": [["is", "not"]], "mightn't": [["might", "not"]],
  "mustn't": [["must", "not"]], "needn't": [["need", "not"]], "oughtn't": [["ought", "not"]],
  "shan't": [["shall", "not"]], "shouldn't": [["should", "not"]],
  "wasn't": [["was", "not"]], "weren't": [["were", "not"]],
  "won't": [["will", "not"]], "wouldn't": [["would", "not"]],
  "i'm": [["i", "am"]], "you're": [["you", "are"]],
  "he's": [["he", "is"], ["he", "has"]], "she's": [["she", "is"], ["she", "has"]],
  "it's": [["it", "is"], ["it", "has"]], "we're": [["we", "are"]],
  "they're": [["they", "are"]], "that's": [["that", "is"], ["that", "has"]],
  "this's": [["this", "is"], ["this", "has"]], "here's": [["here", "is"]],
  "there's": [["there", "is"], ["there", "has"]],
  "what's": [["what", "is"], ["what", "has"], ["what", "does"]],
  "who's": [["who", "is"], ["who", "has"], ["who", "does"]],
  "where's": [["where", "is"], ["where", "has"], ["where", "does"]],
  "when's": [["when", "is"], ["when", "has"], ["when", "does"]],
  "why's": [["why", "is"], ["why", "has"], ["why", "does"]],
  "how's": [["how", "is"], ["how", "has"], ["how", "does"]],
  "i've": [["i", "have"]], "you've": [["you", "have"]], "we've": [["we", "have"]],
  "they've": [["they", "have"]], "could've": [["could", "have"]],
  "should've": [["should", "have"]], "would've": [["would", "have"]],
  "might've": [["might", "have"]], "must've": [["must", "have"]],
  "i'll": [["i", "will"]], "you'll": [["you", "will"]], "he'll": [["he", "will"]],
  "she'll": [["she", "will"]], "it'll": [["it", "will"]], "we'll": [["we", "will"]],
  "they'll": [["they", "will"]], "that'll": [["that", "will"]], "this'll": [["this", "will"]],
  "these'll": [["these", "will"]], "those'll": [["those", "will"]],
  "there'll": [["there", "will"]], "here'll": [["here", "will"]],
  "what'll": [["what", "will"]], "who'll": [["who", "will"]], "where'll": [["where", "will"]],
  "when'll": [["when", "will"]], "why'll": [["why", "will"]], "how'll": [["how", "will"]],
  "i'd": [["i", "would"], ["i", "had"]], "you'd": [["you", "would"], ["you", "had"]],
  "he'd": [["he", "would"], ["he", "had"]], "she'd": [["she", "would"], ["she", "had"]],
  "it'd": [["it", "would"], ["it", "had"]], "we'd": [["we", "would"], ["we", "had"]],
  "they'd": [["they", "would"], ["they", "had"]],
  "that'd": [["that", "would"], ["that", "had"]], "there'd": [["there", "would"], ["there", "had"]],
  "this'd": [["this", "would"], ["this", "had"]],
  "these'd": [["these", "would"], ["these", "had"]],
  "those'd": [["those", "would"], ["those", "had"]],
  "what'd": [["what", "did"], ["what", "would"], ["what", "had"]],
  "who'd": [["who", "did"], ["who", "would"], ["who", "had"]],
  "where'd": [["where", "did"], ["where", "would"], ["where", "had"]],
  "when'd": [["when", "did"], ["when", "would"], ["when", "had"]],
  "why'd": [["why", "did"], ["why", "would"], ["why", "had"]],
  "how'd": [["how", "did"], ["how", "would"], ["how", "had"]],
  "what're": [["what", "are"]], "who're": [["who", "are"]], "where're": [["where", "are"]],
  "when're": [["when", "are"]], "why're": [["why", "are"]], "how're": [["how", "are"]],
  "these're": [["these", "are"]], "those're": [["those", "are"]], "there're": [["there", "are"]],
  "what've": [["what", "have"]], "who've": [["who", "have"]], "where've": [["where", "have"]],
  "when've": [["when", "have"]], "why've": [["why", "have"]], "how've": [["how", "have"]],
  "these've": [["these", "have"]], "those've": [["those", "have"]],
  "there've": [["there", "have"]], "let's": [["let", "us"]],
  "i'd've": [["i", "would", "have"]], "you'd've": [["you", "would", "have"]],
  "he'd've": [["he", "would", "have"]], "she'd've": [["she", "would", "have"]],
  "it'd've": [["it", "would", "have"]],
  "we'd've": [["we", "would", "have"]], "they'd've": [["they", "would", "have"]],
  "can't've": [["can", "not", "have"]], "couldn't've": [["could", "not", "have"]],
  "mightn't've": [["might", "not", "have"]], "mustn't've": [["must", "not", "have"]],
  "needn't've": [["need", "not", "have"]], "shouldn't've": [["should", "not", "have"]],
  "won't've": [["will", "not", "have"]], "wouldn't've": [["would", "not", "have"]],
});

// Colloquial equivalences deliberately live outside the contraction table.
// They share whole-form and semantic-component matching, but must never gain
// apostrophe/surface-suffix aliases such as `gon` or `na`.
const COLLOQUIAL_EXPANSIONS = Object.freeze({
  "gonna": [["going", "to"]],
});
const ONE_WORD_ALIASES = Object.freeze({
  ok: Object.freeze(["okay"]),
  okay: Object.freeze(["ok"]),
});

function standardiseWordPunctuation(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201a\u201b\u02bc\u2032]/g, "'")
    .replace(/[–—]/g, "-");
}

function normaliseWord(value) {
  const normalised = standardiseWordPunctuation(value).trim().toLowerCase();
  const match = normalised.match(/[a-z]+(?:['-][a-z]+)*/);
  if (!match) return "";
  const wrapperIsPunctuation = (wrapper) => Array.from(wrapper).every((character) =>
    /\s/u.test(character) || /\p{P}/u.test(character));
  if (!wrapperIsPunctuation(normalised.slice(0, match.index))) return "";
  if (!wrapperIsPunctuation(normalised.slice(match.index + match[0].length))) return "";
  return match[0];
}

function extractSentenceWords(sentence) {
  return standardiseWordPunctuation(sentence).match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g) || [];
}

function wordMatchesExpected(expectedWord, enteredWord) {
  return wordMatchPriority(expectedWord, enteredWord) !== null;
}

function hyphenatedExpectedParts(value) {
  const expected = normaliseWord(value);
  if (!/^[a-z]+(?:\u0027[a-z]+)*(?:-[a-z]+(?:\u0027[a-z]+)*){1,2}$/.test(expected)) return [];
  const parts = expected.split("-");
  return parts.length >= 2 && parts.length <= 3 && parts.every(Boolean) ? parts : [];
}

function wordMatchPriority(expectedWord, enteredWord) {
  const expected = normaliseWord(expectedWord);
  const entered = normaliseWord(enteredWord);
  if (!expected || !entered) return null;
  if (expected === entered) return 0;
  const hyphenatedParts = hyphenatedExpectedParts(expected);
  if (hyphenatedParts.length && entered === hyphenatedParts.join("")) return 1;
  if (ONE_WORD_ALIASES[expected]?.includes(entered)) return 1;
  return null;
}

function contractionSuffixMatchPriority(expectedSuffix, enteredSuffix) {
  const directPriority = wordMatchPriority(expectedSuffix, enteredSuffix);
  if (directPriority !== null) return directPriority;
  const expected = normaliseWord(expectedSuffix);
  const entered = normaliseWord(enteredSuffix);
  if (!expected || !entered || !entered.includes("'")) return null;
  return expected.replaceAll("'", "") === entered.replaceAll("'", "") ? 1 : null;
}

function sameWordSequence(left, right) {
  return left.length === right.length && left.every((word, index) => word === right[index]);
}

function entryWords(value) {
  const rawTokens = standardiseWordPunctuation(value).trim().split(/\s+/).filter(Boolean);
  const words = rawTokens.map(normaliseWord);
  return words.length && words.every(Boolean) ? words : [];
}

function targetContractionExpansions(word) {
  const target = normaliseWord(word);
  return CONTRACTION_EXPANSIONS[target] || COLLOQUIAL_EXPANSIONS[target] || [];
}

function targetApostropheExpansions(word) {
  const target = normaliseWord(word);
  if (!target.includes("'") || target.includes("-")) return [];
  return contiguousPartGroupings(contractionSurfaceParts(target))
    .filter((expansion) => expansion.length >= 2);
}

function contiguousPartGroupings(parts) {
  if (parts.length < 2 || parts.length > 6) return [];
  const groupings = [];
  const maximumMask = (1 << (parts.length - 1)) - 1;
  for (let mask = maximumMask; mask >= 0; mask -= 1) {
    const grouping = [parts[0]];
    for (let index = 1; index < parts.length; index += 1) {
      if (mask & (1 << (index - 1))) grouping.push(parts[index]);
      else grouping[grouping.length - 1] += parts[index];
    }
    groupings.push(grouping);
  }
  return groupings;
}

function targetHyphenExpansions(word) {
  const parts = hyphenatedExpectedParts(word);
  if (!parts.length) return [];
  const expansions = [];
  const add = (expansion) => {
    if (
      !expansion.length
      || !expansion.every((part) => /^[a-z]+(?:\u0027[a-z]+)*$/.test(part))
      || expansions.some((existing) => sameWordSequence(existing, expansion))
    ) return;
    expansions.push(expansion);
  };
  add(parts);
  const atomicParts = parts.flatMap((part) => {
    const possessive = part.match(/^([a-z]+)\u0027s$/);
    return possessive ? [possessive[1], "s"] : [part];
  });
  contiguousPartGroupings(atomicParts).forEach(add);
  return expansions;
}

function targetComponentExpansions(word) {
  const expansions = [];
  const add = (expansion) => {
    if (
      !expansion.length
      || expansions.some((existing) => sameWordSequence(existing, expansion))
    ) return;
    expansions.push(expansion);
  };
  targetContractionExpansions(word).forEach(add);
  targetApostropheExpansions(word).forEach(add);
  targetHyphenExpansions(word).forEach(add);
  return expansions;
}

function enteredContractionExpansionMatch(word) {
  const entered = normaliseWord(word);
  return {
    expansions: CONTRACTION_EXPANSIONS[entered] || COLLOQUIAL_EXPANSIONS[entered] || [],
    omittedApostrophe: false,
  };
}

function rangeIsUnsolved(start, length, solved) {
  for (let index = start; index < start + length; index += 1) {
    if (solved.has(index)) return false;
  }
  return true;
}

function answerMatchCandidates(problem, solved, rawValue) {
  const entered = entryWords(rawValue);
  if (!entered.length) return [];
  const candidates = new Map();
  const add = (start, length, kind, priority) => {
    const key = `${start}:${length}`;
    const existing = candidates.get(key);
    if (existing && existing.priority <= priority) return;
    candidates.set(key, {
      start,
      indices: Array.from({ length }, (_, offset) => start + offset),
      kind,
      priority,
    });
  };

  for (let start = 0; start + entered.length <= problem.wordCount; start += 1) {
    if (!rangeIsUnsolved(start, entered.length, solved)) continue;
    const priorities = entered.map((word, offset) =>
      wordMatchPriority(problem.answerWords[start + offset], word));
    if (priorities.every((priority) => priority !== null)) {
      add(start, entered.length, "literal", Math.max(...priorities));
    }
  }

  problem.displayWords.forEach((displayWord, index) => {
    if (solved.has(index)) return;
    for (const expansion of targetContractionExpansions(displayWord)) {
      if (sameWordSequence(expansion, entered)) add(index, 1, "expanded-to-contraction", 1);
    }
    for (const expansion of targetApostropheExpansions(displayWord)) {
      if (sameWordSequence(expansion, entered)) add(index, 1, "expanded-to-apostrophe", 1);
    }
    for (const expansion of targetHyphenExpansions(displayWord)) {
      if (sameWordSequence(expansion, entered)) add(index, 1, "expanded-to-hyphen", 1);
    }
  });

  if (entered.length === 1) {
    const enteredContraction = enteredContractionExpansionMatch(entered[0]);
    for (const expansion of enteredContraction.expansions) {
      for (let start = 0; start + expansion.length <= problem.wordCount; start += 1) {
        if (!rangeIsUnsolved(start, expansion.length, solved)) continue;
        if (sameWordSequence(problem.answerWords.slice(start, start + expansion.length), expansion)) {
          add(
            start,
            expansion.length,
            "contraction-to-expanded",
            enteredContraction.omittedApostrophe ? 3 : 1,
          );
        }
      }
    }
  }

  return [...candidates.values()].sort((left, right) =>
    left.priority - right.priority
    || left.start - right.start
    || right.indices.length - left.indices.length);
}

function expansionFitsSolvedParts(expansion, solvedParts) {
  for (const [partIndex, word] of solvedParts) {
    if (expansion[partIndex] !== word) return false;
  }
  return true;
}

function partialSurfaceSolvedParts(partial) {
  return partial?.surfaceSolvedParts || new Map();
}

function partialRevealedParts(partial) {
  return partial?.revealedParts || new Map();
}

function partialHasSolvedPart(partial, partIndex) {
  return Boolean(partial?.solvedParts?.has(partIndex)
    || partialSurfaceSolvedParts(partial).has(partIndex));
}

function partialSolvedPartCount(partial) {
  if (!partial) return 0;
  const solvedPartIndices = new Set(partial.solvedParts?.keys() || []);
  for (const partIndex of partialSurfaceSolvedParts(partial).keys()) {
    solvedPartIndices.add(partIndex);
  }
  return solvedPartIndices.size;
}

function contractionSurfaceParts(word) {
  const contraction = normaliseWord(word);
  if (!contraction.includes("'")) return [];
  const parts = contraction.split("'");
  return parts.length > 1 && parts.every(Boolean) ? parts : [];
}

function semanticContractionSurfaceParts(word, expansion) {
  const writtenParts = contractionSurfaceParts(word);
  if (
    writtenParts.length < 2
    || !Array.isArray(expansion)
    || expansion.length !== writtenParts.length
  ) return [];

  const surface = writtenParts.join("");
  const semanticBase = normaliseWord(expansion[0]).replace(/['-]/g, "");
  // Only derive an omitted-apostrophe remainder when the already-opened
  // semantic base is literally the beginning of the canonical spelling.
  // Irregular forms such as will -> won't and shall -> shan't deliberately
  // fall back to their apostrophe-delimited suffix (`t`) instead.
  if (!semanticBase || !surface.startsWith(semanticBase)) return [];

  const parts = Array(expansion.length).fill("");
  parts[0] = semanticBase;
  let suffixEnd = surface.length;
  for (let partIndex = parts.length - 1; partIndex >= 2; partIndex -= 1) {
    const writtenSuffixPart = writtenParts[partIndex];
    if (
      !writtenSuffixPart
      || suffixEnd <= semanticBase.length
      || !surface.slice(0, suffixEnd).endsWith(writtenSuffixPart)
    ) return [];
    parts[partIndex] = writtenSuffixPart;
    suffixEnd -= writtenSuffixPart.length;
  }
  parts[1] = surface.slice(semanticBase.length, suffixEnd);
  return parts.every(Boolean) && parts.join("") === surface ? parts : [];
}

function contractionSurfaceVariants(word, expansions) {
  const writtenParts = contractionSurfaceParts(word);
  if (writtenParts.length < 2) return [];
  const variants = new Map();
  const addVariant = (surfaceParts, expansion) => {
    if (
      surfaceParts.length !== writtenParts.length
      || !surfaceParts.every(Boolean)
      || !Array.isArray(expansion)
      || expansion.length !== surfaceParts.length
    ) return;
    const key = surfaceParts.join("\u0000");
    if (!variants.has(key)) {
      variants.set(key, { surfaceParts, expansions: [] });
    }
    const group = variants.get(key);
    if (!group.expansions.some((existing) => sameWordSequence(existing, expansion))) {
      group.expansions.push(expansion);
    }
  };

  expansions.forEach((expansion) => {
    addVariant(writtenParts, expansion);
    const semanticParts = semanticContractionSurfaceParts(word, expansion);
    if (semanticParts.length) addVariant(semanticParts, expansion);
  });
  return [...variants.values()];
}

function contractionComponentCandidates(problem, slots, solved, rawValue) {
  const entered = entryWords(rawValue);
  if (entered.length !== 1) return [];
  const enteredWord = entered[0];
  const candidates = [];

  problem.displayWords.forEach((displayWord, slotIndex) => {
    if (solved.has(slotIndex)) return;
    const partial = slots[slotIndex]?.partial;
    const solvedParts = partial?.solvedParts || new Map();
    const expansions = (partial?.expansions || targetComponentExpansions(displayWord))
      .filter((expansion) => expansionFitsSolvedParts(expansion, solvedParts));
    if (!expansions.length) return;

    const longest = Math.max(...expansions.map((expansion) => expansion.length));
    for (let partIndex = 0; partIndex < longest; partIndex += 1) {
      if (partialHasSolvedPart(partial, partIndex)) continue;
      const matchingExpansions = expansions.filter((expansion) =>
        partIndex < expansion.length && wordMatchesExpected(expansion[partIndex], enteredWord));
      if (!matchingExpansions.length) continue;
      candidates.push({ slotIndex, partIndex, expansions: matchingExpansions });
    }
  });

  return candidates.sort((left, right) =>
    left.slotIndex - right.slotIndex || left.partIndex - right.partIndex);
}

function contractionSuffixCandidates(problem, slots, solved, rawValue) {
  const entered = entryWords(rawValue);
  if (entered.length !== 1) return [];
  const enteredWord = entered[0];
  const candidates = [];

  problem.displayWords.forEach((displayWord, slotIndex) => {
    if (solved.has(slotIndex)) return;
    const partial = slots[slotIndex]?.partial;
    // A bare suffix such as `t`, `ll`, or `s` is meaningful only after the
    // learner has opened at least one semantic component in this exact slot.
    if (!partial || partialSolvedPartCount(partial) < 1) return;

    const expansions = partial.expansions.filter((expansion) =>
      expansionFitsSolvedParts(expansion, partial.solvedParts));
    if (!expansions.length) return;

    // Match one or more adjacent, still-hidden written suffix pieces. In
    // addition to apostrophe-delimited pieces (`t`, `d've`), the semantic-base
    // variant exposes the exact remaining canonical letters (`is` -> `nt`).
    // Every earlier component must already be open in this same slot.
    for (const variant of contractionSurfaceVariants(displayWord, expansions)) {
      const { surfaceParts } = variant;
      for (let start = 1; start < surfaceParts.length; start += 1) {
        const prefixIsSolved = Array.from(
          { length: start },
          (_unused, partIndex) => partIndex,
        ).every((partIndex) => partialHasSolvedPart(partial, partIndex));
        if (!prefixIsSolved) continue;
        if (partialHasSolvedPart(partial, start)) continue;
        for (let end = start; end < surfaceParts.length; end += 1) {
          if (partialHasSolvedPart(partial, end)) break;
          const writtenSuffix = surfaceParts.slice(start, end + 1).join("'");
          const matchPriority = contractionSuffixMatchPriority(writtenSuffix, enteredWord);
          if (matchPriority === null) continue;
          candidates.push({
            kind: "contracted-slot",
            slotIndex,
            sortIndex: slotIndex,
            partIndices: Array.from(
              { length: end - start + 1 },
              (_unused, offset) => start + offset,
            ),
            expansions: variant.expansions,
            surfaceParts,
            writtenSuffix,
            priority: matchPriority,
          });
        }
      }
    }
  });

  // The same written suffix equivalence also works in the opposite storage
  // direction. If the canonical answer is `I will`, solving `I` first allows
  // `ll` to open canonical `will`; the final payload still contains `I will`.
  for (const [contraction, contractionExpansions] of Object.entries(CONTRACTION_EXPANSIONS)) {
    for (const expansion of contractionExpansions) {
      for (let answerStart = 0; answerStart + expansion.length <= problem.wordCount; answerStart += 1) {
        if (!sameWordSequence(
          problem.answerWords.slice(answerStart, answerStart + expansion.length),
          expansion,
        )) continue;

        for (const variant of contractionSurfaceVariants(contraction, [expansion])) {
          const { surfaceParts } = variant;
          for (let start = 1; start < surfaceParts.length; start += 1) {
            const prefixIsSolved = Array.from(
              { length: start },
              (_unused, partIndex) => answerStart + partIndex,
            ).every((answerIndex) => solved.has(answerIndex));
            if (!prefixIsSolved || solved.has(answerStart + start)) continue;

            for (let end = start; end < surfaceParts.length; end += 1) {
              if (solved.has(answerStart + end)) break;
              const writtenSuffix = surfaceParts.slice(start, end + 1).join("'");
              const matchPriority = contractionSuffixMatchPriority(writtenSuffix, enteredWord);
              if (matchPriority === null) continue;
              candidates.push({
                kind: "expanded-slots",
                sortIndex: answerStart,
                indices: Array.from(
                  { length: end - start + 1 },
                  (_unused, offset) => answerStart + start + offset,
                ),
                writtenSuffix,
                priority: matchPriority,
              });
            }
          }
        }
      }
    }
  }

  return candidates.sort((left, right) =>
    left.priority - right.priority
    || left.sortIndex - right.sortIndex
    || (left.partIndices?.[0] || 0) - (right.partIndices?.[0] || 0)
    || (right.partIndices?.length || right.indices?.length || 0)
      - (left.partIndices?.length || left.indices?.length || 0));
}

function validateProblem(payload, expectedTargetLanguage) {
  const attemptId = payload?.attempt_id;
  const wordCount = integerBetween(payload?.word_count, 0, 1, state.maxWords || 0);
  const level = integerBetween(payload?.level, 0, 1, state.maxLevel);

  if ((typeof attemptId !== "string" && typeof attemptId !== "number") || String(attemptId) === "") {
    throw new ApiError("No sentence ID was received.");
  }
  if (!wordCount || !level || typeof payload?.text !== "string" || !payload.text) {
    throw new ApiError("The sentence data is invalid.");
  }
  if (payload?.target_language !== expectedTargetLanguage) {
    throw new ApiError("The translation language could not be verified.");
  }
  const displayWords = extractSentenceWords(payload.text);
  if (displayWords.length !== wordCount) {
    throw new ApiError("The sentence word structure could not be verified.");
  }
  const properNounIndices = Array.isArray(payload?.proper_noun_indices)
    ? [...new Set(payload.proper_noun_indices.filter(
      (index) => Number.isInteger(index) && index >= 0 && index < wordCount,
    ))]
    : [];
  return {
    attemptId,
    level,
    wordCount,
    targetLanguage: expectedTargetLanguage,
    text: payload.text,
    displayWords,
    answerWords: displayWords.map(normaliseWord),
    properNounIndices,
  };
}

let wordMeasureContext = null;

function sizeWordSlot(slotElement, word) {
  const value = String(word || "");
  const characterCount = Array.from(value).length;
  const isVeryLong = characterCount > 12;
  const isLong = characterCount > 8;
  const fontSize = isVeryLong ? 11 : isLong ? 12 : 13;

  slotElement.classList.toggle("is-long", isLong);
  slotElement.classList.toggle("is-very-long", isVeryLong);

  if (!wordMeasureContext) {
    wordMeasureContext = document.createElement("canvas").getContext("2d");
  }
  if (wordMeasureContext) {
    wordMeasureContext.font = `650 ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Text", Arial, sans-serif`;
  }
  const measuredTextWidth = wordMeasureContext
    ? wordMeasureContext.measureText(value).width
    : characterCount * fontSize * 0.72;
  const characterWidthFloor = characterCount * fontSize * 0.72;
  const slotWidth = Math.max(
    52,
    Math.ceil(Math.max(measuredTextWidth, characterWidthFloor) + 32),
  );
  slotElement.style.setProperty("--slot-width", `${slotWidth}px`);
}

function createWordSlot(index) {
  const slotElement = document.createElement("div");
  slotElement.className = "word-slot";
  sizeWordSlot(slotElement, state.problem?.displayWords[index]);
  slotElement.setAttribute("role", "button");
  slotElement.tabIndex = 0;
  slotElement.setAttribute("aria-label", `Word ${index + 1}, unsolved`);
  slotElement.addEventListener("click", () => revealWordByClick(index));
  slotElement.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    revealWordByClick(index);
  });

  const wordValue = document.createElement("span");
  wordValue.className = "word-value";
  wordValue.lang = "en";
  wordValue.setAttribute("aria-hidden", "true");
  slotElement.append(wordValue);
  elements.wordGrid.append(slotElement);

  return {
    element: slotElement,
    wordValue,
    value: "",
    partial: null,
    wordParts: null,
  };
}

function renderWordGrid(wordCount) {
  elements.wordGrid.replaceChildren();
  state.slots = Array.from({ length: wordCount }, (_, index) => createWordSlot(index));
}

function clearEntryFeedback() {
  window.clearTimeout(state.entryFeedbackTimer);
  state.entryFeedbackTimer = 0;
  elements.answerEntry.classList.remove("is-wrong", "is-correct");
  elements.answerInput.setAttribute("aria-invalid", "false");
  elements.answerFeedback.classList.remove("is-error");
}

function showEntryWrong(message) {
  clearEntryFeedback();
  window.requestAnimationFrame(() => elements.answerEntry.classList.add("is-wrong"));
  elements.answerInput.setAttribute("aria-invalid", "true");
  elements.answerFeedback.classList.add("is-error");
  elements.answerFeedback.textContent = message;
  setStatus(message);
  elements.answerInput.focus({ preventScroll: true });
  elements.answerInput.select();
}

function flashEntryCorrect() {
  clearEntryFeedback();
  elements.answerEntry.classList.add("is-correct");
  state.entryFeedbackTimer = window.setTimeout(() => {
    state.entryFeedbackTimer = 0;
    elements.answerEntry.classList.remove("is-correct");
  }, 190);
}

function clearSplitSlot(slot, preserveSettledWidth = false) {
  const splitWidth = slot.element.style.getPropertyValue("--split-slot-width");
  slot.partial = null;
  slot.wordParts?.remove();
  slot.wordParts = null;
  slot.element.classList.remove("is-split", "is-mixed-result");
  slot.element.style.removeProperty("--split-slot-width");
  if (preserveSettledWidth && splitWidth) {
    slot.element.style.setProperty("--settled-slot-width", splitWidth);
  }
}

function renderSplitSlot(slotIndex) {
  const slot = state.slots[slotIndex];
  const partial = slot?.partial;
  if (!slot || !partial || !partial.expansions.length) return;
  const partCount = partial.expansions[0].length;

  slot.wordParts?.remove();
  const wordParts = document.createElement("span");
  wordParts.className = "word-parts";
  wordParts.setAttribute("aria-hidden", "true");
  let estimatedWidth = 8;
  const spokenParts = [];
  const revealedParts = partialRevealedParts(partial);

  for (let partIndex = 0; partIndex < partCount; partIndex += 1) {
    const part = document.createElement("span");
    part.className = "word-part";
    const solvedWord = partial.solvedParts.get(partIndex);
    const solvedSurface = partialSurfaceSolvedParts(partial).get(partIndex);
    const revealedWord = revealedParts.get(partIndex);
    const possibleWords = [...new Set(partial.expansions
      .map((expansion) => expansion[partIndex])
      .filter(Boolean))];
    const longestWordLength = Math.max(
      2,
      String(solvedSurface || "").length,
      ...possibleWords.map((word) => word.length),
    );
    part.style.setProperty("--part-grow", String(longestWordLength));
    estimatedWidth += Math.max(32, longestWordLength * 7 + 14);
    if (solvedWord || solvedSurface) {
      const displayedPart = solvedWord || solvedSurface;
      part.textContent = displayedPart;
      part.classList.add("is-part-solved");
      spokenParts.push(`solved ${displayedPart}`);
    } else if (revealedWord) {
      part.textContent = revealedWord;
      part.classList.add("is-part-revealed");
      spokenParts.push(`revealed answer ${revealedWord}`);
    } else {
      part.classList.add("is-part-pending");
      spokenParts.push("blank");
    }
    wordParts.append(part);
  }

  slot.wordValue.textContent = "";
  slot.wordParts = wordParts;
  slot.element.append(wordParts);
  slot.element.classList.add("is-split");
  slot.element.style.setProperty("--split-slot-width", `${estimatedWidth}px`);
  slot.element.setAttribute(
    "aria-label",
    `Split expression ${slotIndex + 1}, ${spokenParts.join(", ")}`,
  );
}

function revealRemainingSplitParts(slotIndex, revealedWord, priorPartial) {
  const slot = state.slots[slotIndex];
  const expansions = priorPartial?.expansions;
  if (!slot || !Array.isArray(expansions) || !expansions.length) return false;
  const partCount = expansions[0].length;
  if (partCount < 2 || partialSolvedPartCount(priorPartial) < 1) return false;

  const compatible = expansions.filter((expansion) => expansion.length === partCount);
  if (!compatible.length) return false;
  const canonicalLetters = normaliseWord(revealedWord).replace(/['-]/g, "");
  const displayExpansion = compatible.find((expansion) =>
    expansion.join("").replace(/['-]/g, "") === canonicalLetters)
    || compatible[0];
  const solvedParts = new Map(priorPartial.solvedParts || []);
  const surfaceSolvedParts = new Map(partialSurfaceSolvedParts(priorPartial));
  const revealedParts = new Map();
  displayExpansion.forEach((part, partIndex) => {
    if (!partialHasSolvedPart(priorPartial, partIndex)) {
      revealedParts.set(partIndex, part);
    }
  });
  if (!revealedParts.size) return false;

  slot.partial = {
    expansions: [displayExpansion],
    solvedParts,
    surfaceSolvedParts,
    revealedParts,
  };
  slot.element.classList.remove("is-revealed");
  slot.element.classList.add("is-solved", "is-mixed-result");
  renderSplitSlot(slotIndex);
  return true;
}

function commitContractionComponent(candidate) {
  const slot = state.slots[candidate.slotIndex];
  const priorSolvedParts = slot.partial?.solvedParts || new Map();
  const solvedParts = new Map(priorSolvedParts);
  const surfaceSolvedParts = new Map(partialSurfaceSolvedParts(slot.partial));
  const solvedWord = candidate.expansions[0][candidate.partIndex];
  solvedParts.set(candidate.partIndex, solvedWord);
  const compatibleExpansions = candidate.expansions.filter((expansion) =>
    expansionFitsSolvedParts(expansion, solvedParts));
  slot.partial = { expansions: compatibleExpansions, solvedParts, surfaceSolvedParts };

  const completedExpansion = compatibleExpansions.find((expansion) =>
    expansion.every((_word, partIndex) => partialHasSolvedPart(slot.partial, partIndex)));
  if (completedExpansion) {
    markSolved([candidate.slotIndex], false);
    return true;
  }

  renderSplitSlot(candidate.slotIndex);
  const remaining = compatibleExpansions[0].length - partialSolvedPartCount(slot.partial);
  const message = `Opened “${solvedWord}” in split expression ${candidate.slotIndex + 1}. ${remaining} left.`;
  elements.answerFeedback.textContent = message;
  setStatus(message);
  return false;
}

function suffixCandidateCompletesSlot(candidate, partial) {
  if (candidate.kind === "expanded-slots") return true;
  const newlySolved = new Set(candidate.partIndices);
  return candidate.expansions.some((expansion) => expansion.every((_word, partIndex) =>
    partialHasSolvedPart(partial, partIndex) || newlySolved.has(partIndex)));
}

function commitContractionSuffix(candidate) {
  if (candidate.kind === "expanded-slots") {
    markSolved(candidate.indices, false);
    return true;
  }

  const slot = state.slots[candidate.slotIndex];
  const solvedParts = new Map(slot.partial?.solvedParts || []);
  const surfaceSolvedParts = new Map(partialSurfaceSolvedParts(slot.partial));
  candidate.partIndices.forEach((partIndex) => {
    surfaceSolvedParts.set(partIndex, candidate.surfaceParts[partIndex]);
  });
  slot.partial = {
    expansions: candidate.expansions,
    solvedParts,
    surfaceSolvedParts,
  };

  const completedExpansion = candidate.expansions.find((expansion) =>
    expansion.every((_word, partIndex) => partialHasSolvedPart(slot.partial, partIndex)));
  if (completedExpansion) {
    markSolved([candidate.slotIndex], false);
    return true;
  }

  renderSplitSlot(candidate.slotIndex);
  const remaining = candidate.expansions[0].length - partialSolvedPartCount(slot.partial);
  const message = `Opened “${candidate.writtenSuffix}” in split expression ${candidate.slotIndex + 1}. ${remaining} left.`;
  elements.answerFeedback.textContent = message;
  setStatus(message);
  return false;
}

function commitAnswerWord(
  rawValue = elements.answerInput.value,
  trigger = "enter",
  suppressTick = false,
) {
  const problem = state.problem;
  if (
    !problem
    || state.problemLoading
    || state.levelChanging
    || state.revealing
    || state.completing
    || state.completionPending
    || elements.answerInput.disabled
  ) return false;

  const typedWords = entryWords(rawValue);
  if (!typedWords.length) {
    if (String(rawValue || "").trim()) showEntryWrong("Enter an English word or short phrase.");
    return false;
  }

  const candidates = answerMatchCandidates(problem, state.solved, rawValue);
  const match = candidates[0];
  if (match) {
    elements.answerInput.value = "";
    flashEntryCorrect();
    const isFinalWord = state.solved.size + match.indices.length === problem.wordCount;
    if (!isFinalWord && !suppressTick) playWordSuccessTick();
    markSolved(match.indices, false);
    if (!state.completing) elements.answerInput.focus({ preventScroll: true });
    return true;
  }

  const component = contractionComponentCandidates(problem, state.slots, state.solved, rawValue)[0];
  if (component) {
    elements.answerInput.value = "";
    flashEntryCorrect();
    const willCompleteOuter = component.expansions.some((expansion) =>
      expansion.length === partialSolvedPartCount(state.slots[component.slotIndex].partial) + 1);
    const isFinalWord = willCompleteOuter && state.solved.size + 1 === problem.wordCount;
    if (!isFinalWord && !suppressTick) playWordSuccessTick();
    commitContractionComponent(component);
    if (!state.completing) elements.answerInput.focus({ preventScroll: true });
    return true;
  }

  const suffix = contractionSuffixCandidates(
    problem,
    state.slots,
    state.solved,
    rawValue,
  )[0];
  if (suffix) {
    elements.answerInput.value = "";
    flashEntryCorrect();
    const willCompleteOuter = suffixCandidateCompletesSlot(
      suffix,
      suffix.kind === "contracted-slot" ? state.slots[suffix.slotIndex].partial : null,
    );
    const solvedCount = suffix.kind === "expanded-slots" ? suffix.indices.length : 1;
    const isFinalWord = willCompleteOuter
      && state.solved.size + solvedCount === problem.wordCount;
    if (!isFinalWord && !suppressTick) playWordSuccessTick();
    commitContractionSuffix(suffix);
    if (!state.completing) elements.answerInput.focus({ preventScroll: true });
    return true;
  }

  const typedLabel = typedWords.join(" ");
  showEntryWrong(`No remaining slot matches “${typedLabel}”.`);
  return false;
}

function commitVoiceWord(rawValue) {
  const problem = state.problem;
  if (
    !problem
    || state.problemLoading
    || state.levelChanging
    || state.revealing
    || state.completing
    || state.completionPending
  ) return false;

  const typedWords = entryWords(rawValue);
  if (!typedWords.length) return false;

  const match = answerMatchCandidates(problem, state.solved, rawValue)[0];
  if (match) {
    flashVoiceCandidate(match.indices);
    showRecognizedVoiceWord(problem.displayWords[match.indices[0]]);
    markSolved(match.indices, false);
    return true;
  }

  const component = contractionComponentCandidates(problem, state.slots, state.solved, rawValue)[0];
  if (component) {
    flashVoiceCandidate([component.slotIndex]);
    showRecognizedVoiceWord(rawValue);
    commitContractionComponent(component);
    return true;
  }

  const suffix = contractionSuffixCandidates(
    problem,
    state.slots,
    state.solved,
    rawValue,
  )[0];
  if (suffix) {
    flashVoiceCandidate(suffix.indices || [suffix.slotIndex]);
    showRecognizedVoiceWord(rawValue);
    commitContractionSuffix(suffix);
    return true;
  }

  const heard = normaliseWord(typedWords[0]);
  const rankedByWord = new Map();
  problem.answerWords.forEach((answerWord, index) => {
    if (state.solved.has(index)) return;
    const target = normaliseWord(answerWord);
    const score = voiceWordSimilarity(heard, target);
    const existing = rankedByWord.get(target);
    if (!existing || score > existing.score) rankedByWord.set(target, { index, score, target });
  });
  const ranked = [...rankedByWord.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, state.voiceSettings.beam);
  const best = ranked[0];
  const runnerUp = ranked[1];
  if (
    best
    && best.score >= state.voiceSettings.threshold
    && best.score - (runnerUp?.score || 0) >= state.voiceSettings.candidate
  ) {
    flashVoiceCandidate([best.index]);
    showRecognizedVoiceWord(problem.displayWords[best.index]);
    markSolved([best.index], false);
    return true;
  }

  return false;
}

function voiceEditDistance(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_value, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function voicePhoneticShape(word) {
  return String(word || "")
    .replace(/ph/g, "f")
    .replace(/[ckq]/g, "k")
    .replace(/[sz]/g, "s")
    .replace(/[dt]/g, "t")
    .replace(/[gj]/g, "j")
    .replace(/[aeiouy]/g, "")
    .replace(/(.)\1+/g, "$1");
}

function voiceWordSimilarity(heard, target) {
  if (!heard || !target) return 0;
  if (heard === target) return 1;
  const spelling = 1 - voiceEditDistance(heard, target) / Math.max(heard.length, target.length);
  const heardShape = voicePhoneticShape(heard);
  const targetShape = voicePhoneticShape(target);
  const phonetic = heardShape && targetShape
    ? 1 - voiceEditDistance(heardShape, targetShape) / Math.max(heardShape.length, targetShape.length)
    : 0;
  return Math.max(0, Math.min(1, spelling * 0.7 + phonetic * 0.3));
}

function markSolved(indices, revealed) {
  const solvedIndices = [];
  indices.forEach((index) => {
    const slot = state.slots[index];
    if (!slot || state.solved.has(index)) return;
    const word = state.problem.displayWords[index];
    clearSplitSlot(slot, true);
    slot.value = String(word);
    slot.wordValue.textContent = String(word);
    slot.element.setAttribute("aria-label", `Word ${index + 1}, answer ${word}`);
    sizeWordSlot(slot.element, word);
    slot.element.style.setProperty("--solve-delay", `${solvedIndices.length * 55}ms`);
    slot.element.classList.add("is-solved");
    if (revealed) {
      slot.element.classList.add("is-revealed");
      state.revealed.add(index);
    }
    state.solved.add(index);
    solvedIndices.push(index);
    keepSolvedSlotVisible(slot.element);
  });
  if (!solvedIndices.length) return;

  if (state.solved.size === state.problem.wordCount) {
    elements.answerFeedback.textContent = "Sentence complete.";
    state.completionPending = true;
    elements.card.classList.add("is-completion-pending");
    elements.answerInput.disabled = true;
    window.clearTimeout(state.completionStartTimer);
    state.completionStartTimer = window.setTimeout(() => {
      state.completionStartTimer = 0;
      beginCompletion();
    }, 420);
    return;
  }

  const remaining = state.problem.wordCount - state.solved.size;
  const message = revealed
    ? "Answer revealed."
    : solvedIndices.length > 1
      ? `Opened slots ${solvedIndices[0] + 1}–${solvedIndices.at(-1) + 1}. ${remaining} left.`
      : `Opened slot ${solvedIndices[0] + 1}. ${remaining} left.`;
  elements.answerFeedback.textContent = message;
  setStatus(message);
}

function revealWordByClick(index) {
  const problem = state.problem;
  if (
    !problem
    || state.problemLoading
    || state.levelChanging
    || state.completing
    || state.completionPending
    || state.solved.has(index)
  ) return;

  state.usedAnswer = true;
  dismissSlotClickHint();
  state.wordRevealRequired = true;
  void ensureWordRevealRecorded(problem);
  markSolved([index], true);
}

function revealProperNouns() {
  const problem = state.problem;
  if (
    !problem
    || state.problemLoading
    || state.levelChanging
    || state.completing
    || state.completionPending
    || elements.properNounButton.disabled
  ) return;

  const indices = problem.properNounIndices.filter((index) => !state.solved.has(index));
  if (!indices.length) {
    elements.properNounButton.disabled = true;
    elements.properNounButton.textContent = problem.properNounIndices.length
      ? "Names shown"
      : "No names";
    const message = problem.properNounIndices.length
      ? "The proper nouns in this sentence are already open."
      : "No proper nouns were detected in this sentence.";
    elements.answerFeedback.textContent = message;
    setStatus(message);
    return;
  }

  state.usedAnswer = true;
  state.wordRevealRequired = true;
  void ensureWordRevealRecorded(problem);
  elements.properNounButton.disabled = true;
  elements.properNounButton.textContent = "Names shown";
  markSolved(indices, true);
}

function dismissSlotClickHint() {
  if (!elements.slotClickHint || elements.slotClickHint.hidden) return;
  elements.slotClickHint.hidden = true;
  try {
    window.localStorage.setItem("dictai-slot-hint-seen", "1");
  } catch (_error) {
    // The hint remains session-only when storage is unavailable.
  }
}

function initializeSlotClickHint() {
  if (!elements.slotClickHint) return;
  try {
    elements.slotClickHint.hidden = (window.localStorage.getItem("dictai-slot-hint-seen") || window.localStorage.getItem("echostep-slot-hint-seen")) === "1";
  } catch (_error) {
    elements.slotClickHint.hidden = false;
  }
}

function ensureWordRevealRecorded(problem) {
  if (state.wordRevealRecorded) return Promise.resolve(true);
  if (state.wordRevealPromise) return state.wordRevealPromise;
  let request;
  request = apiRequest(API.reveal(problem.attemptId), {
    method: "POST",
    body: {},
  }).then(() => {
    if (state.problem === problem) state.wordRevealRecorded = true;
    return true;
  }).catch(() => false).finally(() => {
    if (state.wordRevealPromise === request) state.wordRevealPromise = null;
  });
  state.wordRevealPromise = request;
  return request;
}

async function revealAllAnswers() {
  const problem = state.problem;
  const version = state.problemVersion;
  if (
    !problem
    || state.problemLoading
    || state.levelChanging
    || state.revealing
    || state.completing
    || state.completionPending
  ) return;
  state.revealing = true;
  updateLevelInputDisabled();
  hideStatePanel();
  elements.answerForm.setAttribute("aria-busy", "true");
  elements.answerInput.disabled = true;
  setAnalysisControlsAvailable(false);
  elements.revealButton.disabled = true;
  elements.revealLabel.textContent = "Giving up…";
  setStatus("Confirming the revealed answer.");

  try {
    const result = await apiRequest(API.reveal(problem.attemptId), {
      method: "POST",
      body: {},
    });
    if (state.problem !== problem || state.problemVersion !== version) return;
    const reveal = validateRevealPayload(result, problem);
    const solvedBeforeReveal = new Set(state.solved);

    clearEntryFeedback();
    state.usedAnswer = true;
    state.solved = new Set();
    state.revealed = new Set();
    state.slots.forEach((slot, index) => {
      const revealedWord = reveal.answers[index];
      const wasSolved = solvedBeforeReveal.has(index);
      const priorPartial = slot.partial;
      slot.value = revealedWord;
      slot.wordValue.textContent = revealedWord;
      sizeWordSlot(slot.element, revealedWord);

      if (!wasSolved && revealRemainingSplitParts(index, revealedWord, priorPartial)) {
        state.solved.add(index);
        state.revealed.add(index);
        return;
      }

      clearSplitSlot(slot, true);
      slot.element.setAttribute(
        "aria-label",
        `Word ${index + 1}, ${wasSolved ? "solved answer" : "revealed answer"} ${revealedWord}`,
      );
      slot.element.classList.add("is-solved");
      slot.element.classList.toggle("is-revealed", !wasSolved);
      state.solved.add(index);
      if (!wasSolved) state.revealed.add(index);
    });
    elements.revealButton.hidden = true;
    beginCompletion(true);
  } catch (error) {
    if (state.problem !== problem || state.problemVersion !== version) return;
    clearRevealAnalysis();
    elements.revealButton.disabled = false;
    elements.revealLabel.textContent = "Give Up";
    elements.answerInput.disabled = false;
    showError(
      "Could not reveal the answer",
      error.message,
      () => revealAllAnswers(),
    );
    elements.retryButton.focus({ preventScroll: true });
  } finally {
    if (state.problem === problem && state.problemVersion === version) {
      state.revealing = false;
      elements.answerForm.removeAttribute("aria-busy");
      updateLevelInputDisabled();
    }
  }
}

async function requestCompletionAnalysis(
  problem,
  version,
  targetLanguage,
) {
  if (
    !problem
    || state.problem !== problem
    || state.problemVersion !== version
    || !state.completing
    || !state.completionReady
    || state.analysisPending
  ) return;

  const requestedTargetLanguage = normaliseTargetLanguage(targetLanguage);
  const cached = state.analysisCache[requestedTargetLanguage];
  state.analysisActive = true;
  setTargetLanguage(requestedTargetLanguage);
  if (cached) {
    clearAnalysisStatus();
    renderRevealAnalysis(cached, requestedTargetLanguage, true);
    elements.analysisButton.textContent = "Answer guide";
    return;
  }

  state.analysisPending = true;
  const requestToken = ++state.analysisRequestToken;
  setAnalysisControlsAvailable(true);
  elements.analysisButton.textContent = "Creating guide…";
  showCompletionAnalysisPending(requestedTargetLanguage);
  showAnalysisStatus(
    `${TARGET_LANGUAGES[requestedTargetLanguage].label}  guide is being created. You may move to the next sentence.`,
  );

  try {
    const result = await apiRequest(API.analysis(problem.attemptId), {
      method: "POST",
      body: { target_language: requestedTargetLanguage },
    });
    if (
      state.problem !== problem
      || state.problemVersion !== version
      || !state.completing
      || !state.completionReady
      || state.analysisRequestToken !== requestToken
    ) return;
    const analysis = validateCompletionAnalysisPayload(
      result,
      problem,
      requestedTargetLanguage,
    );
    state.analysisCache[requestedTargetLanguage] = analysis;
    renderRevealAnalysis(analysis, requestedTargetLanguage, true);
    clearAnalysisStatus();
    elements.analysisButton.textContent = "Answer guide";
  } catch (error) {
    if (
      state.problem !== problem
      || state.problemVersion !== version
      || !state.completing
      || !state.completionReady
      || state.analysisRequestToken !== requestToken
    ) return;
    clearRevealAnalysis();
    showAnalysisStatus(
      `${TARGET_LANGUAGES[requestedTargetLanguage].label} guide could not be created. Press Answer guide again.`,
      true,
    );
    elements.analysisButton.textContent = "Retry guide";
  } finally {
    if (
      state.problem === problem
      && state.problemVersion === version
      && state.analysisRequestToken === requestToken
    ) {
      state.analysisPending = false;
      setAnalysisControlsAvailable(state.completing && state.completionReady);
    }
  }
}

function beginCompletion(usedAnswer = state.usedAnswer) {
  const problem = state.problem;
  const version = state.problemVersion;
  if (!problem || state.completing) return;
  state.completionPending = false;
  elements.card.classList.remove("is-completion-pending");
  state.completing = true;
  const voiceContextForChime = !usedAnswer && state.voiceAudioContext?.state === "running"
    ? state.voiceAudioContext
    : null;
  if (voiceContextForChime) {
    window.clearTimeout(state.voiceCompletionStopTimer);
    state.voiceCompletionStopTimer = window.setTimeout(() => {
      state.voiceCompletionStopTimer = 0;
      if (state.voiceAudioContext === voiceContextForChime) void stopVoiceRecognition("Complete");
    }, 820);
  } else {
    void stopVoiceRecognition("Complete");
  }
  state.speedReplayIntent = null;
  state.completionReady = false;
  elements.answerEntry.classList.add("is-completing");
  updateLevelInputDisabled();
  state.usedAnswer = usedAnswer;
  const answers = Object.freeze(problem.displayWords.map((word) => String(word)));
  state.completionAnswers = answers;
  elements.answerInput.value = "";
  elements.answerInput.disabled = true;
  elements.answerInputWrap.hidden = true;
  elements.revealButton.hidden = true;
  elements.properNounButton.hidden = true;
  elements.nextButton.hidden = false;
  elements.nextButton.disabled = true;
  elements.nextButton.textContent = "Completing…";
  elements.redoButton.hidden = false;
  elements.redoButton.disabled = true;
  setAnalysisControlsAvailable(false);
  prepareCompletionReplay(problem, version);
  elements.card.classList.toggle("is-success", !usedAnswer);
  elements.card.classList.toggle("is-reveal-complete", usedAnswer);
  if (usedAnswer) {
    elements.answerFeedback.textContent = "Answer revealed. Review the full sentence.";
    setStatus("Processing the revealed answer.");
  } else {
    elements.answerFeedback.textContent = "Sentence complete. Confirming the result.";
    setStatus("Correct. Confirming the result.");
    launchCompletionConfetti();
    playSuccessChime(voiceContextForChime);
    holdCompletionReplayForChime(problem, version);
  }
  void completeProblem(problem, version, answers, usedAnswer);
}

function launchCompletionConfetti() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const burst = document.createElement("div");
  burst.className = "completion-confetti";
  burst.setAttribute("aria-hidden", "true");
  const colors = ["#34c759", "#0a84ff", "#ffcc00", "#ff453a", "#bf5af2"];
  for (let index = 0; index < 18; index += 1) {
    const particle = document.createElement("i");
    const angle = (Math.PI * 2 * index) / 18 + (Math.random() - 0.5) * 0.22;
    const distance = 70 + Math.random() * 75;
    particle.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--y", `${Math.sin(angle) * distance - 28}px`);
    particle.style.setProperty("--r", `${Math.round(Math.random() * 300 + 120)}deg`);
    particle.style.setProperty("--delay", `${Math.round(Math.random() * 55)}ms`);
    particle.style.background = colors[index % colors.length];
    burst.append(particle);
  }
  elements.card.append(burst);
  window.setTimeout(() => burst.remove(), 900);
}

async function completeProblem(
  problem = state.problem,
  version = state.problemVersion,
  answers = state.slots.map((slot) => slot.value),
  usedAnswer = state.usedAnswer,
) {
  if (!problem) return;

  try {
    if (state.wordRevealRequired && !(await ensureWordRevealRecorded(problem))) {
      throw new ApiError("The revealed answer could not be saved. Try again.");
    }
    // If the original clip is still loading, let it finish before closing the
    // attempt so the completed screen can retain it for replay.
    // A ready/failed/already-absent source returns immediately.
    await waitForCompletionAudio(problem, version);
    if (state.problem !== problem || state.problemVersion !== version || !state.completing) return;
    const result = await apiRequest(API.complete(problem.attemptId), {
      method: "POST",
      body: { answers },
      keepalive: true,
    });
    if (state.problem !== problem || state.problemVersion !== version) return;
    if (result.completed !== true) {
      throw new ApiError("Sentence completion could not be verified.");
    }

    window.clearInterval(state.leaseTimer);
    state.leaseTimer = 0;
    hideStatePanel();
    const serverUsedAnswer = result.used_answer === true;
    state.usedAnswer = serverUsedAnswer;
    const nextLevel = integerBetween(result.next_level, problem.level, 1, state.maxLevel);
    state.nextProblemLevel = nextLevel;
    const completionMessage = serverUsedAnswer
      ? nextLevel < problem.level
        ? `Answer revealed. Moving to sentence ${nextLevel}.`
        : `Answer revealed. Staying on sentence ${nextLevel}.`
      : `Solved. Next is sentence ${nextLevel}.`;
    state.completionReady = true;
    elements.answerFeedback.textContent = completionMessage;
    elements.nextButton.textContent = "Next →";
    elements.nextButton.disabled = false;
    elements.redoButton.disabled = false;
    setStatus(serverUsedAnswer
      ? "The answer is revealed. Open the answer guide if needed."
      : "Complete. Move to the next sentence when ready.");
    setAnalysisControlsAvailable(true);
    elements.nextButton.focus();
  } catch (error) {
    if (state.problem !== problem || state.problemVersion !== version) return;
    const retry = error.status === 404 || error.status === 409
      ? () => loadProblem()
      : () => completeProblem(problem, version, answers, usedAnswer);
    showError("Completion stopped", error.message, retry);
  }
}

async function playSentence() {
  if (!state.problem || state.problemLoading || state.levelChanging) return;

  primeChimeContext();
  const problem = state.problem;
  const version = state.problemVersion;

  if (state.voiceSwapPending) {
    state.voiceSwapPending = false;
  } else if (state.voicePlayCount > 0 && !state.audioFailed) {
    state.voiceTake = state.voiceTake === 0 ? 1 : 0;
    state.voiceSwapPending = true;
    state.speedReplayIntent = Object.freeze({
      attemptId: String(problem.attemptId),
      version,
    });
    const cachedUrl = state.audioObjectUrls[state.voiceTake];
    if (!cachedUrl) {
      configureCurrentAudio(problem, version, null, state.voiceTake);
      return;
    }
    state.audioObjectUrl = cachedUrl;
    state.audioReady = false;
    elements.audio.src = cachedUrl;
    elements.audio.load();
    return;
  }

  if (state.completing) {
    if (state.completionReplayTimer) return;
    // Never configure or fetch after completion. Only replay the exact media
    // that was retained for this problem while the attempt was active.
    const hasCurrentAudio = hasRetainedCurrentAudio(problem, version);
    if (state.audioFailed || !state.audioReady || !hasCurrentAudio) {
      setAudioControlMode(state.audioFailed || !hasCurrentAudio ? "missing" : "loading");
      setStatus(state.audioFailed || !hasCurrentAudio
        ? "This sentence cannot be replayed. Move to the next sentence."
        : "The saved audio is still loading.");
      return;
    }
  } else if (state.audioFailed || state.audioAttemptId !== String(problem.attemptId)) {
    configureCurrentAudio(problem, version);
  }
  const runId = state.audioRunId;
  const playId = ++state.audioPlayId;
  state.voicePlayCount += 1;

  try {
    elements.audio.currentTime = 0;
    applyPlaybackRate();
    await elements.audio.play();
  } catch (error) {
    if (playId !== state.audioPlayId || !isCurrentAudio(runId, problem, version)) return;
    const blocked = error?.name === "NotAllowedError";
    if (blocked) {
      setAudioControlMode("ready");
      setStatus("Press your preferred playback speed again.");
    } else if (state.completing) {
      // The retained source remains in place so a transient playback failure
      // can be retried, but no completed-attempt network request is started.
      setAudioControlMode("ready");
      setStatus("Could not play the audio. Press your preferred speed again.");
    } else {
      clearAudioBuffer();
      state.audioFailed = true;
      setAudioControlMode("retry");
      setStatus("Could not play the original audio. Press a speed button again.");
      void refreshProblemLease(problem, version);
    }
  }
}

async function refreshProblemLease(problem = state.problem, version = state.problemVersion) {
  if (!problem || state.problemLoading || state.levelChanging || state.completing) return;
  try {
    await apiRequest(API.touch(problem.attemptId), {
      method: "POST",
      body: {},
      keepalive: true,
    });
  } catch (error) {
    if (
      state.problem !== problem
      || state.problemVersion !== version
      || state.problemLoading
      || state.levelChanging
      || state.completing
    ) return;
    if (error.status === 404 || error.status === 409) {
      window.clearInterval(state.leaseTimer);
      state.leaseTimer = 0;
      showError(
        "Reload the sentence",
        "A new sentence was opened in another tab, or this session expired.",
        () => loadProblem(),
      );
    }
  }
}

function startProblemLease(problem, version) {
  window.clearInterval(state.leaseTimer);
  state.leaseTimer = window.setInterval(() => {
    void refreshProblemLease(problem, version);
  }, LEASE_REFRESH_MS);
}

function strictRequestedLevel(value) {
  const text = String(value || "").trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const level = Number(text);
  return Number.isInteger(level) && level <= state.maxLevel ? level : null;
}

function validateLevelChangePayload(payload, requestedLevel) {
  if (
    !payload
    || typeof payload !== "object"
    || Array.isArray(payload)
    || !sameWordSequence(Object.keys(payload).sort(), ["current_level"])
    || payload.current_level !== requestedLevel
  ) {
    throw new ApiError("The selected sentence could not be verified.");
  }
}

function restoreProblemAfterLevelChangeFailure(problem) {
  state.levelChanging = false;
  elements.levelInput.value = String(problem.level);
  elements.levelInput.setAttribute("aria-invalid", "true");
  elements.answerInput.disabled = false;
  elements.revealButton.disabled = false;
  elements.answerForm.removeAttribute("aria-busy");
  setAudioControlMode(state.audioReady ? "ready" : state.audioFailed ? "retry" : "loading");
  setTargetLanguage(problem.targetLanguage);
  setAnalysisControlsAvailable(false);
  updateLevelInputDisabled();
}

async function changeLevelFromInput() {
  const requestedLevel = strictRequestedLevel(elements.levelInput.value);
  if (requestedLevel === null) {
    elements.levelInput.value = String(state.level || 1);
    elements.levelInput.setAttribute("aria-invalid", "true");
    setStatus(`Enter a whole-number sentence from 1 to ${state.maxLevel}.`);
    elements.levelInput.focus({ preventScroll: true });
    elements.levelInput.select();
    return;
  }
  await navigateToLevel(requestedLevel);
}

async function navigateToLevel(requestedLevel) {
  const target = integerBetween(requestedLevel, state.level || 1, 1, state.maxLevel);
  const navigationId = ++state.levelNavigationId;
  const capturedTargetLanguage = state.problem?.targetLanguage || currentTargetLanguage();
  ++state.problemVersion;
  resetProblemSurface();
  state.levelChanging = true;
  state.nextProblemLevel = target;
  renderStep(target);
  elements.levelInput.setAttribute("aria-invalid", "false");
  updateLevelInputDisabled();
  setAudioControlMode("unavailable");
  elements.answerForm.setAttribute("aria-busy", "true");
  showLoading("Moving to sentence", `Loading sentence ${target}.`);
  setStatus(`Moving to sentence ${target}.`);

  try {
    const result = await apiRequest(API.level, {
      method: "POST",
      body: { level: target },
    });
    if (navigationId !== state.levelNavigationId) return;
    validateLevelChangePayload(result, target);
    state.nextProblemLevel = target;
    await loadProblem(0, capturedTargetLanguage, target);
  } catch (error) {
    if (navigationId !== state.levelNavigationId) return;
    state.levelChanging = false;
    updateLevelInputDisabled();
    showError("Could not move to the sentence", error.message, () => navigateToLevel(target));
  }
}

async function loadProblem(
  retryCount = 0,
  requestedTargetLanguage = currentTargetLanguage(),
  requestedLevel = state.nextProblemLevel ?? state.level,
) {
  const appliedTargetLanguage = normaliseTargetLanguage(requestedTargetLanguage);
  const appliedLevel = integerBetween(requestedLevel, state.level || 1, 1, state.maxLevel);
  const version = ++state.problemVersion;
  state.problemLoading = true;
  setTargetLanguage(appliedTargetLanguage);
  resetProblemSurface();
  const loadingContext = createProblemLoadingContext(appliedLevel, version);
  state.problemLoadingContext = loadingContext;
  elements.answerForm.setAttribute("aria-busy", "true");
  showProblemLoadingPhase(loadingContext, "selecting", "Loading sentence");
  try {
    const payload = await apiRequest(API.problem, {
      method: "POST",
      body: problemRequestBody(appliedTargetLanguage),
    });
    if (version !== state.problemVersion) return;
    showProblemLoadingPhase(loadingContext, "selected", "Sentence selected");

    const problem = validateProblem(payload, appliedTargetLanguage);
    state.problem = problem;
    setTargetLanguage(problem.targetLanguage);
    setAnalysisControlsAvailable(false);
    state.nextProblemLevel = null;
    startProblemLease(problem, version);
    renderStep(problem.level);
    renderWordGrid(problem.wordCount);
    elements.properNounButton.disabled = false;
    elements.answerInput.disabled = true;
    updateLevelInputDisabled();
    showProblemLoadingPhase(loadingContext, "audio", "Loading original audio");
    configureCurrentAudio(problem, version, loadingContext);

  } catch (error) {
    if (version !== state.problemVersion) return;
    const retryable = [0, 409, 429, 503, 504].includes(error.status);
    if (retryable && retryCount < PROBLEM_RETRY_DELAYS_MS.length) {
      showProblemLoadingPhase(
        loadingContext,
        `retry:${retryCount + 1}`,
        "Reloading sentence",
      );
      await delay(PROBLEM_RETRY_DELAYS_MS[retryCount]);
      if (version !== state.problemVersion) return;
      return loadProblem(
        retryCount + 1,
        appliedTargetLanguage,
        appliedLevel,
      );
    }
    state.problemLoading = false;
    state.problemLoadingContext = null;
    state.problemLoadingPhase = null;
    elements.answerForm.removeAttribute("aria-busy");
    updateLevelInputDisabled();
    const failureMessage = error.status === 502
      ? "Could not load a matching Wonder sentence. Try again."
      : error.message;
    showError(
      "Could not load the sentence",
      failureMessage,
      () => loadProblem(0, appliedTargetLanguage, appliedLevel),
      "Reload",
    );
  }
}

async function bootstrap(retryCount = 0) {
  setAnalysisControlsAvailable(false);
  showLoading("Checking the current sentence", "Please wait.");

  try {
    const payload = await apiRequest(API.bootstrap);
    const maxWords = integerBetween(payload?.max_words, 0, 1, 1000);
    if (!maxWords) throw new ApiError("The sentence length limit could not be verified.");
    state.maxWords = maxWords;
    state.maxLevel = integerBetween(payload?.max_level, DEFAULT_MAX_LEVEL, 1, DEFAULT_MAX_LEVEL);
    const serverLevel = integerBetween(payload?.level, 1, 1, state.maxLevel);
    const initialLevel = savedSentencePosition() ?? serverLevel;
    if (initialLevel !== serverLevel) {
      const result = await apiRequest(API.level, {
        method: "POST",
        body: { level: initialLevel },
      });
      validateLevelChangePayload(result, initialLevel);
    }
    state.nextProblemLevel = initialLevel;
    renderStep(initialLevel);
    await loadProblem(0, currentTargetLanguage(), initialLevel);
  } catch (error) {
    if (error.status === 0 && retryCount < 3) {
      showLoading("Reconnecting to the server", "Please wait.");
      await delay(700 * (retryCount + 1));
      return bootstrap(retryCount + 1);
    }
    showError("Could not start", error.message, () => bootstrap(0));
  }
}

function primeChimeContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  if (!chimeContext) chimeContext = new AudioContextClass();
  if (chimeContext.state === "suspended") void chimeContext.resume();
}

function playWordSuccessTick() {
  primeChimeContext();
  if (!chimeContext) return;
  const tickEpoch = wordTickEpoch;

  const play = () => {
    if (!chimeContext || chimeContext.state !== "running" || tickEpoch !== wordTickEpoch) return;
    try {
      const now = chimeContext.currentTime + 0.008;
      const oscillator = chimeContext.createOscillator();
      const gain = chimeContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(660, now);
      oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.075);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.045, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
      oscillator.connect(gain);
      gain.connect(chimeContext.destination);
      const tick = { oscillator, gain };
      activeWordTicks.add(tick);
      oscillator.start(now);
      oscillator.stop(now + 0.12);
      oscillator.onended = () => {
        activeWordTicks.delete(tick);
        oscillator.disconnect();
        gain.disconnect();
      };
    } catch (_error) {
      // Sound feedback is optional; visual and live-region feedback still work.
    }
  };

  if (chimeContext.state === "suspended") {
    void chimeContext.resume().then(play).catch(() => {});
  } else {
    play();
  }
}

function stopWordSuccessTicks() {
  wordTickEpoch += 1;
  if (!chimeContext) return;
  const now = chimeContext.currentTime;
  for (const tick of activeWordTicks) {
    activeWordTicks.delete(tick);
    try {
      tick.gain.gain.cancelScheduledValues(now);
      tick.gain.gain.setValueAtTime(0.0001, now);
      tick.oscillator.stop(now + 0.005);
    } catch (_error) {
      // An already-ended tick will clean itself up in onended.
    }
  }
}

function playSuccessChime(contextOverride = null) {
  if (!contextOverride) primeChimeContext();
  const context = contextOverride || chimeContext;
  if (!context || context.state !== "running") return;
  stopWordSuccessTicks();

  const now = context.currentTime + 0.02;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.17, now + 0.025);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
  master.connect(context.destination);

  [
    { frequency: 523.25, offset: 0, duration: 0.28 },
    { frequency: 659.25, offset: 0.09, duration: 0.3 },
    { frequency: 783.99, offset: 0.19, duration: 0.34 },
    { frequency: 1046.5, offset: 0.31, duration: 0.4 },
  ].forEach((note, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startsAt = now + note.offset;
    const endsAt = startsAt + note.duration;
    oscillator.type = index < 3 ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(note.frequency, startsAt);
    gain.gain.setValueAtTime(0.0001, startsAt);
    gain.gain.exponentialRampToValueAtTime(index === 3 ? 0.32 : 0.22, startsAt + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, endsAt);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(startsAt);
    oscillator.stop(endsAt + 0.02);
  });
}

elements.speedButtons.forEach((button) => {
  button.addEventListener("click", () => selectSpeedAndReplay(button.dataset.speedLevel));
});
initializeSlotClickHint();
renderSpeedControl();
setTargetLanguage(elements.targetLanguageSelect.value);
elements.targetLanguageSelect.addEventListener("change", () => {
  setTargetLanguage(elements.targetLanguageSelect.value);
  if (!state.completing || !state.completionReady || !state.analysisActive) return;
  const problem = state.problem;
  if (!problem) return;
  const cached = state.analysisCache[state.targetLanguage];
  if (cached) {
    clearAnalysisStatus();
    renderRevealAnalysis(cached, state.targetLanguage, true);
    elements.analysisButton.textContent = "Answer guide";
    return;
  }
  void requestCompletionAnalysis(problem, state.problemVersion, state.targetLanguage);
});
elements.analysisButton.addEventListener("click", () => {
  const problem = state.problem;
  if (
    !problem
    || !state.completing
    || !state.completionReady
    || state.analysisPending
  ) return;
  void requestCompletionAnalysis(problem, state.problemVersion, state.targetLanguage);
});
elements.levelInput.addEventListener("input", () => {
  elements.levelInput.setAttribute("aria-invalid", "false");
});
elements.levelInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.repeat) return;
  event.preventDefault();
  void changeLevelFromInput();
});
elements.levelInput.addEventListener("change", () => {
  void changeLevelFromInput();
});
elements.levelInput.addEventListener("blur", () => {
  void changeLevelFromInput();
});
elements.previousSentence.addEventListener("click", () => {
  void navigateToLevel((state.level || 1) - 1);
});
elements.nextSentence.addEventListener("click", () => {
  void navigateToLevel((state.level || 1) + 1);
});
elements.answerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (state.suppressNextSubmit) {
    state.suppressNextSubmit = false;
    return;
  }
  if (!state.composing) commitAnswerWord(elements.answerInput.value, "enter");
});
elements.answerInput.addEventListener("compositionstart", () => {
  window.clearTimeout(state.compositionSubmitTimer);
  state.compositionSubmitTimer = 0;
  state.suppressNextSubmit = false;
  state.composing = true;
});
elements.answerInput.addEventListener("compositionend", () => {
  state.composing = false;
  state.suppressNextSubmit = true;
  window.clearTimeout(state.compositionSubmitTimer);
  state.compositionSubmitTimer = window.setTimeout(() => {
    state.compositionSubmitTimer = 0;
    state.suppressNextSubmit = false;
  }, 0);
});
elements.answerInput.addEventListener("input", () => {
  if (elements.answerEntry.classList.contains("is-wrong")) {
    clearEntryFeedback();
    elements.answerFeedback.textContent = "Type a word. Press Space or Enter.";
  }
});
elements.answerInput.addEventListener("keydown", (event) => {
  if (state.composing || event.isComposing || event.repeat) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    commitAnswerWord(elements.answerInput.value, event.key === " " ? "space" : "enter");
  }
});
elements.answerInput.addEventListener("beforeinput", (event) => {
  if (state.composing || event.isComposing) return;
  const commitsWord = event.inputType === "insertParagraph"
    || event.inputType === "insertLineBreak"
    || (event.inputType === "insertText" && /^\s+$/.test(event.data || ""));
  if (!commitsWord) return;
  event.preventDefault();
  const trigger = event.inputType === "insertText" ? "space" : "enter";
  commitAnswerWord(elements.answerInput.value, trigger);
});
elements.answerInput.addEventListener("paste", (event) => {
  if (
    state.problemLoading
    || state.levelChanging
    || state.revealing
    || state.analysisPending
    || state.completing
    || elements.answerInput.disabled
  ) return;
  const pastedWords = entryWords(event.clipboardData?.getData("text") || "");
  if (pastedWords.length <= 1) return;
  event.preventDefault();
  let pending = elements.answerInput.value.trim();
  let acceptedWords = 0;
  for (const word of pastedWords) {
    const combined = pending ? `${pending} ${word}` : word;
    elements.answerInput.value = combined;
    const result = commitAnswerWord(combined, "space", true);
    if (!result || state.completing) break;
    acceptedWords += 1;
    pending = "";
  }
  if (acceptedWords > 0 && !state.completing) playWordSuccessTick();
});
elements.nextButton.addEventListener("click", () => {
  if (
    !state.problem
    || !state.completing
    || !state.completionReady
    || elements.nextButton.disabled
  ) return;
  state.completionReady = false;
  state.analysisRequestToken += 1;
  state.analysisPending = false;
  elements.nextButton.disabled = true;
  void loadProblem();
});
elements.redoButton.addEventListener("click", () => {
  if (
    !state.problem
    || !state.completing
    || !state.completionReady
    || elements.redoButton.disabled
  ) return;
  const currentLevel = state.problem.level;
  state.completionReady = false;
  state.analysisRequestToken += 1;
  state.analysisPending = false;
  elements.redoButton.disabled = true;
  elements.nextButton.disabled = true;
  void navigateToLevel(currentLevel);
});
elements.voiceToggle.addEventListener("change", () => {
  state.voiceEnabled = elements.voiceToggle.checked;
  if (state.voiceEnabled) {
    renderVoiceStatus(state.voiceModelReady ? "Ready" : "Loading…", false);
    void startVoiceRecognition();
  } else {
    void stopVoiceRecognition("Off");
  }
});
const voiceSettingBindings = [
  [elements.beamSetting, elements.beamValue, 0],
  [elements.thresholdSetting, elements.thresholdValue, 2],
  [elements.candidateSetting, elements.candidateValue, 2],
];
voiceSettingBindings.forEach(([input, output, digits]) => {
  input.addEventListener("input", () => {
    output.textContent = Number(input.value).toFixed(digits);
  });
});
elements.applyVoiceSettings.addEventListener("click", () => {
  const next = {
    model: elements.voiceModel.value === "20m" ? "20m" : "full",
    beam: integerBetween(elements.beamSetting.value, 12, 1, 32),
    threshold: Math.max(0.01, Math.min(4, Number(elements.thresholdSetting.value) || 0.72)),
    candidate: Math.max(0.01, Math.min(4, Number(elements.candidateSetting.value) || 0.08)),
  };
  const recognizerMustRestart = next.model !== state.voiceSettings.model || next.beam !== state.voiceSettings.beam;
  state.voiceSettings = next;
  localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(next));
  localStorage.setItem("dictai-voice-model", next.model);
  renderVoiceSettings();
  if (recognizerMustRestart) {
    renderVoiceStatus("Reloading model…", false);
    window.location.reload();
  } else {
    renderVoiceStatus(state.voiceEnabled ? "Listening…" : "Off", Boolean(state.voiceRecognizerStream));
  }
});
window.addEventListener("wasm-asr-status", (event) => {
  const status = event.detail?.status || "Loading…";
  if (!state.voiceModelReady && state.voiceEnabled) {
    renderVoiceStatus(status, false);
    renderVoiceSetupProgress(event.detail?.percent ?? null, true);
  }
  if (status.includes("failed")) {
    showError(
      "Could not prepare the voice model",
      "Checking the saved model and loading it again.",
      () => window.location.reload(),
      "Reload model",
    );
  }
});
window.addEventListener("wasm-asr-ready", () => {
  state.voiceModelReady = true;
  renderVoiceSetupProgress(100, false);
  if (state.voiceEnabled) {
    renderVoiceStatus("Ready", false);
    void startVoiceRecognition();
  }
});
elements.revealButton.addEventListener("click", () => {
  void revealAllAnswers();
});
elements.properNounButton.addEventListener("click", revealProperNouns);
elements.retryButton.addEventListener("click", () => {
  const retry = state.retryAction;
  if (typeof retry === "function") void retry();
});
window.addEventListener("pointerdown", primeChimeContext, { once: true, passive: true });
window.addEventListener("pointerdown", () => {
  if (state.voiceEnabled && state.problem && !state.completing && !state.voiceRecognizerStream) {
    void startVoiceRecognition();
  }
}, { passive: true });
window.addEventListener("keydown", primeChimeContext, { once: true });
window.addEventListener("keydown", () => {
  if (state.voiceEnabled && state.problem && !state.completing && !state.voiceRecognizerStream) {
    void startVoiceRecognition();
  }
});
window.addEventListener("pagehide", () => { clearAudioBuffer(); void stopVoiceRecognition("Off"); });
window.addEventListener("beforeunload", () => { clearAudioBuffer(); void stopVoiceRecognition("Off"); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void refreshProblemLease();
});

renderVoiceSettings();
void bootstrap();
