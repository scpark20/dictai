export {tokens, normalize, submitWords, migrateOpened, mapLegacyIndices, TOKEN_VERSION} from './youtube-answers.mjs?v=multi-1';
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
