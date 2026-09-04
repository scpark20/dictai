"use strict";
const $ = (id) => document.getElementById(id);
const pct = (value, target) => Math.min(100, Math.round(value / target * 100));
async function refresh() {
  try {
    const response = await fetch("/api/build-status", { cache: "no-store" });
    const data = await response.json();
    const rp = pct(data.reference_total, data.reference_target);
    const completed = Number(data.audio_completed || 0) + Number(data.audio_second_completed || 0);
    const target = Number(data.audio_target || 0) + Number(data.audio_second_target || 0);
    const ap = pct(completed, target);
    $("referenceTotal").textContent = `${data.reference_total} / ${data.reference_target}`;
    $("workerTotal").textContent = `${data.soulx_ready} / 2`;
    $("audioTotal").textContent = `${completed} / ${target}`;
    $("referencePercent").textContent = `${rp}%`;
    $("audioPercent").textContent = `${ap}%`;
    $("referenceBar").style.width = `${rp}%`;
    $("audioBar").style.width = `${ap}%`;
    $("groups").innerHTML = Object.entries(data.references).map(([group,count]) => `<div><span>${group}</span><strong>${count}/25</strong></div>`).join("");
    $("audioMessage").textContent = data.app_ready ? "All two-voice sentence audio is ready." : `Take A ${data.audio_completed}/191 · Take B ${data.audio_second_completed}/191`;
    $("queue").textContent = `Pending ${data.queue.pending} · Active ${data.queue.claimed} · Completed ${data.queue.completed} · Failed ${data.queue.failed}`;
    $("updated").textContent = `Last checked ${new Date().toLocaleTimeString("en-US")}`;
  } catch (_error) { $("updated").textContent = "Could not load status. Retrying shortly."; }
}
refresh(); setInterval(refresh, 3000);
