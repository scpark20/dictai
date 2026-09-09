export function tokens(text) {
  return String(text).normalize('NFKC').replace(/[’‘]/g, "'").match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu) || [];
}
export function normalize(word) {
  const value = tokens(word).join('').toLocaleLowerCase().replace(/['-]/g, '');
  return ({mr:'mister', mrs:'missus', dr:'doctor'})[value] || value;
}
export function submitWords(words, opened, answer) {
  const next = [...opened]; let matched = 0, duplicate = 0, missed = 0;
  for (const entered of tokens(answer)) {
    const key = normalize(entered);
    const index = words.findIndex((w,i) => !next[i] && normalize(w) === key);
    if (index >= 0) { next[index] = 'solved'; matched++; }
    else if (words.some(w => normalize(w) === key)) duplicate++;
    else missed++;
  }
  return {opened:next, matched, duplicate, missed, complete:next.length > 0 && next.every(Boolean)};
}
export function parseTime(value) {
  const s = String(value).trim();
  if (!s || !/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(s)) return NaN;
  const bits = s.split(':').map(Number);
  if (bits.length > 1 && bits.slice(1).some(v => v >= 60)) return NaN;
  return bits.reduce((n,v) => n*60+v, 0);
}
export function timeLabel(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s/3600), m = Math.floor(s/60)%60;
  return `${h ? h+':'+String(m).padStart(2,'0') : m}:${String(s%60).padStart(2,'0')}`;
}
export function rangeIndices(segments, start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) throw new Error('Enter a valid start and end time.');
  // Never trim inside a caption: use its complete original audio span.
  return segments.map((s,i) => s.start >= start && s.start < end ? i : -1).filter(i => i >= 0);
}
export function indexAtTime(segments, time) {
  const covering = segments.findIndex(s => s.start <= time && s.end > time);
  if (covering >= 0) return covering;
  const next = segments.findIndex(s => s.start >= time);
  return next < 0 ? segments.length-1 : next;
}
export function progressKey(data) {
  return `dictai:youtube:v1:${data.video_id}:${data.language}:${data.version}`;
}
