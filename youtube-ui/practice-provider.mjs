import {tokens, migrateOpened, TOKEN_VERSION} from './youtube-core.mjs?v=shared-1';
import {localNameIndices} from './local-names.mjs?v=local-1';
import * as answerVariants from '../practice-ui/answer-variants.mjs';
import {progressKey, indexAtTime} from './youtube-core.mjs?v=shared-1';
import {keywordText} from './keyword-targets.mjs?v=keyword-1';

// YouTube owns transcript transport, clip playback and its local progress only.
// Slot rendering, input, Voice, reveal and completion belong to practice/app.js.
export function createYouTubeProvider(media, storage = localStorage) {
  let data = null, index = 0, answers = {}, callbacks = {}, usedAnswer = false;
  const attempts = new Map(), names = new Map();
  let generation = 0;
  const practiceText = segment => data?.language?.startsWith('en') ? (segment.keyword_text || keywordText(segment.text)) : segment.text;
  const persist = () => {
    if (!data) return;
    try { storage.setItem(progressKey(data), JSON.stringify({index, answers, tokenVersion:TOKEN_VERSION})); }
    catch { media.storageError?.(); }
  };
  const provider = {
    playbackRates:[0.5, 0.75, 1, 1.25, 1.5], availableRates:[1], ready:false,
    get data() { return data; }, get index() { return index; }, tokens, answerVariants,
    connect(value) { callbacks = value; },
    async activate(next) {
      generation++; data = next; answers = {}; attempts.clear(); names.clear();
      let saved = {};
      try { saved = JSON.parse(storage.getItem(progressKey(data)) || '{}'); } catch {}
      index = Number.isInteger(saved.index) && data.segments[saved.index] ? saved.index : 0;
      if (data.start_hint > 0) index = indexAtTime(data.segments, data.start_hint);
      for (const [key, value] of Object.entries(saved.answers || {})) {
        if (data.segments[key]) answers[key] = migrateOpened(practiceText(data.segments[key]), value, saved.tokenVersion);
      }
      persist();
      await callbacks.reload?.();
    },
    select(level) { index = level - 1; persist(); media.select(index); },
    stop() { media.stop(); }, play(rate) { media.play(rate); },
    mediaState(ready, playing = false, rates) {
      provider.ready = ready;
      if (rates) provider.availableRates = rates;
      callbacks.media?.(ready, playing);
    },
    opened(level) { return answers[level - 1]?.slice() || null; },
    save(level, values) { answers[level - 1] = values.slice(); persist(); },
    reset(level) { delete answers[level - 1]; persist(); },
    async request(path, options = {}) {
      if (!data) throw new Error('Load a YouTube video first.');
      if (path === '/api/bootstrap') return {level:index + 1, max_level:data.segments.length, max_words:1000};
      if (path === '/api/level') {
        const level = options.body?.level;
        if (!Number.isInteger(level) || level < 1 || level > data.segments.length) throw new Error('Invalid sentence number.');
        index = level - 1; persist(); return {current_level:level};
      }
      if (path === '/api/problem') {
        const level = options.body?.level || index + 1;
        index = level - 1;
        const segment = data.segments[index];
        if (!segment) throw new Error('The selected caption is unavailable.');
        usedAnswer = Boolean(answers[index]?.includes('revealed'));
        const id = `youtube-${generation}-${index}`;
        const text=practiceText(segment);
        attempts.set(id, {index, words:tokens(text)});
        if (data.language.startsWith('en') && !names.has(index)) {
          names.set(index,localNameIndices(text));
        }
        return {attempt_id:id, level, text, source_text:segment.text, word_count:tokens(text).length, target_language:options.body?.target_language, proper_noun_indices:names.get(index) || []};
      }
      const match = path.match(/^\/api\/problem\/([^/]+)\/(touch|reveal|complete)$/);
      const attempt = match && attempts.get(decodeURIComponent(match[1]));
      if (!attempt) throw new Error('This caption session is no longer active.');
      if (match[2] === 'touch') return {};
      if (match[2] === 'reveal') { usedAnswer = true; return {revealed:true, answers:attempt.words}; }
      if (match[2] === 'complete') {
        if (JSON.stringify(options.body?.answers) !== JSON.stringify(attempt.words)) throw new Error('The completed words do not match this caption.');
        return {completed:true, used_answer:usedAnswer, next_level:Math.min(data.segments.length, attempt.index + 2)};
      }
      throw new Error('Unsupported YouTube content operation.');
    },
  };
  return provider;
}
