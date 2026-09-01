"use strict";
const $ = (id) => document.getElementById(id);
const pct = (value, target) => Math.min(100, Math.round(value / target * 100));
async function refresh() {
  try {
    const response = await fetch("/api/build-status", { cache: "no-store" });
    const data = await response.json();
    const rp = pct(data.reference_total, data.reference_target);
    const ap = pct(data.audio_completed, data.audio_target);
    $("referenceTotal").textContent = `${data.reference_total} / ${data.reference_target}`;
    $("workerTotal").textContent = `${data.soulx_ready} / 8`;
    $("audioTotal").textContent = `${data.audio_completed} / ${data.audio_target}`;
    $("referencePercent").textContent = `${rp}%`;
    $("audioPercent").textContent = `${ap}%`;
    $("referenceBar").style.width = `${rp}%`;
    $("audioBar").style.width = `${ap}%`;
    $("groups").innerHTML = Object.entries(data.references).map(([group,count]) => `<div><span>${group}</span><strong>${count}/25</strong></div>`).join("");
    const second = Number(data.audio_second_completed || 0);
    $("audioMessage").textContent = second === 641 ? "Two distinct voices are ready for every sentence" : `First voice complete · second voice ${second}/641 in progress`;
    $("updated").textContent = `Last checked ${new Date().toLocaleTimeString("en-US")}`;
  } catch (_error) { $("updated").textContent = "Could not load status. Retrying shortly."; }
}
refresh(); setInterval(refresh, 3000);
