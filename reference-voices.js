"use strict";

const state = {
  items: [],
  filter: "all",
  query: "",
  currentId: null,
  queue: [],
  polling: null,
};

const grid = document.querySelector("#voiceGrid");
const template = document.querySelector("#voiceCardTemplate");
const player = document.querySelector("#audioPlayer");
const nowPlaying = document.querySelector("#nowPlaying");
const nowTitle = document.querySelector("#nowTitle");
const playAll = document.querySelector("#playAll");
const emptyState = document.querySelector("#emptyState");

const groupKey = (item) => item.accent.split(" ")[0];
const accentLabel = (key) => ({
  american: "미국", australian: "호주", british: "영국", canadian: "캐나다",
  chinese: "중국", indian: "인도", japanese: "일본", korean: "한국",
  portuguese: "포르투갈", russian: "러시아",
})[key] || key;
const groupLabel = (item) => `${accentLabel(groupKey(item))} · ${item.gender === "male" ? "남성" : "여성"}`;

const formatDuration = (seconds) => {
  const value = Number(seconds) || 0;
  return `${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, "0")}`;
};

const traits = (item) => {
  const voiceTraits = item.instruction
    .split(",")
    .slice(2)
    .map((part) => part.trim());
  const scene = item.ambience?.scene;
  const filters = item.audio_processing?.high_pass_hz && item.audio_processing?.low_pass_hz
    ? `HPF ${item.audio_processing.high_pass_hz}Hz · LPF ${(item.audio_processing.low_pass_hz / 1000).toFixed(1)}kHz`
    : "";
  return [scene, ...voiceTraits, filters].filter(Boolean).join(" · ");
};

const visibleItems = () => state.items.filter((item) => {
  const whisper = item.instruction.includes("whisper");
  const matchesGroup = state.filter === "all"
    || state.filter === item.gender
    || (state.filter === "whisper" && whisper)
    || (state.filter === "voice" && !whisper);
  const query = state.query.trim().toLowerCase();
  const numericQuery = query.replace(/\D/g, "");
  const paddedNumber = String(item.number).padStart(3, "0");
  const matchesQuery = !query
    || (numericQuery && paddedNumber.includes(numericQuery))
    || (item.ambience?.scene || "").toLowerCase().includes(query);
  return matchesGroup && matchesQuery;
});

function setPlayingCard() {
  document.querySelectorAll(".voice-card").forEach((card) => {
    const active = card.dataset.id === state.currentId && !player.paused;
    card.classList.toggle("is-playing", active);
    card.querySelector(".voice-play").setAttribute("aria-label", active ? "일시정지" : "음성 재생");
  });
}

function playItem(item) {
  if (state.currentId === item.id && !player.paused) {
    player.pause();
    return;
  }
  if (state.currentId !== item.id) {
    state.currentId = item.id;
    player.src = item.audio_url;
  }
  nowTitle.textContent = `Voice ${String(item.number).padStart(3, "0")} · ${groupLabel(item)}`;
  nowPlaying.hidden = false;
  player.play().catch(() => {});
}

function render() {
  const fragment = document.createDocumentFragment();
  const items = visibleItems();
  for (const item of items) {
    const node = template.content.firstElementChild.cloneNode(true);
    const key = groupKey(item);
    node.dataset.id = item.id;
    node.dataset.group = key;
    node.querySelector(".voice-name").textContent = `Voice ${String(item.number).padStart(3, "0")}`;
    node.querySelector(".voice-group").textContent = groupLabel(item);
    node.querySelector(".voice-traits").textContent = traits(item);
    node.querySelector(".duration").textContent = formatDuration(item.duration);
    node.querySelector(".voice-play").addEventListener("click", () => playItem(item));
    fragment.append(node);
  }
  grid.replaceChildren(fragment);
  emptyState.hidden = items.length > 0;
  setPlayingCard();
}

async function loadVoices() {
  try {
    const response = await fetch("/api/reference-voices", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.items = payload.items;
    document.querySelector("#completedCount").textContent = payload.completed;
    document.querySelector("#allCount").textContent = payload.completed;
    document.querySelector("#generationState").textContent = payload.completed === payload.target
      ? `사람 음성 검출 통과 · ${payload.speech_check?.passed || payload.completed}개`
      : `새 음성 생성 중 · ${payload.completed}%`;
    document.querySelector("#referenceText").textContent = payload.reference_text || "첫 번째 음성을 생성하고 있습니다.";
    playAll.disabled = state.items.length === 0;
    render();
    if (payload.completed >= payload.target && state.polling) {
      clearInterval(state.polling);
      state.polling = null;
    }
  } catch (error) {
    document.querySelector("#generationState").textContent = "불러오지 못했습니다";
  }
}

document.querySelector("#filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  state.filter = button.dataset.filter;
  document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("is-active", item === button));
  render();
});

document.querySelector("#searchInput").addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

playAll.addEventListener("click", () => {
  state.queue = visibleItems().map((item) => item.id);
  const first = state.items.find((item) => item.id === state.queue.shift());
  if (first) playItem(first);
});

player.addEventListener("play", setPlayingCard);
player.addEventListener("pause", setPlayingCard);
player.addEventListener("ended", () => {
  setPlayingCard();
  const nextId = state.queue.shift();
  const next = state.items.find((item) => item.id === nextId);
  if (next) playItem(next);
});

document.querySelector("#stopPlayback").addEventListener("click", () => {
  state.queue = [];
  player.pause();
  player.currentTime = 0;
  nowPlaying.hidden = true;
});

loadVoices();
state.polling = setInterval(loadVoices, 5000);
