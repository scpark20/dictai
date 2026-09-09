import {tokens, submitWords, parseTime, timeLabel, rangeIndices, indexAtTime, progressKey} from './youtube-core.mjs';

const $ = id => document.getElementById(id);
const state = {data:null, index:0, indices:[], answers:{}, start:0, end:0, request:0, busy:false};
let player=null, playerReady=false, playerLoad=null, stopAt=null, clipLoading=false;
let timer=null, readyTimeout=null, celebrated=false;
if (new URLSearchParams(location.search).get('embed') === '1') document.body.classList.add('embedded');

function message(id, text, kind='') { const el=$(id); el.textContent=text; el.className=el.className.replace(/\b(error|success|warning)\b/g,'').trim(); if(kind)el.classList.add(kind); }
function current() { return state.data?.segments[state.index]; }
function save() {
  if (!state.data) return;
  try {
    localStorage.setItem(progressKey(state.data), JSON.stringify({index:state.index,start:state.start,end:state.end,answers:state.answers}));
    $('saveStatus').textContent='Progress saved on this browser.';
  } catch { $('saveStatus').textContent='Browser storage is unavailable. Keep this page open to retain progress.'; }
}
function loadProgress(data) {
  let saved={};
  try { saved=JSON.parse(localStorage.getItem(progressKey(data))||'{}'); } catch {}
  state.start=Number.isFinite(saved.start)&&saved.start>=0?saved.start:0;
  state.end=Number.isFinite(saved.end)&&saved.end>state.start?Math.min(saved.end,data.end+.01):data.end+.01;
  state.indices=rangeIndices(data.segments,state.start,state.end);
  if (!state.indices.length) {state.start=0;state.end=data.end+.01;state.indices=rangeIndices(data.segments,0,state.end);}
  state.index=state.indices.includes(saved.index)?saved.index:state.indices[0];
  state.answers={};
  if (saved.answers && typeof saved.answers==='object') {
    for (const [index, opened] of Object.entries(saved.answers)) {
      if (data.segments[index] && Array.isArray(opened) && opened.length===tokens(data.segments[index].text).length && opened.every(s=>s===null||s==='solved'||s==='revealed')) state.answers[index]=opened;
    }
  }
  if (data.start_hint > 0) {
    const i=indexAtTime(data.segments,data.start_hint);
    state.start=data.segments[i].start;state.end=data.end+.01;
    state.indices=rangeIndices(data.segments,state.start,state.end);state.index=i;
  }
}
function openedWords() {
  return state.answers[state.index] ||= Array(tokens(current().text).length).fill(null);
}
function isComplete(index) {const a=state.answers[index];return a?.length>0 && a.every(Boolean);}
function stopClip() {stopAt=null;clipLoading=false;try {player?.pauseVideo?.();}catch{}}

function loadPlayerAPI() {
  if(window.YT?.Player)return Promise.resolve();
  if(playerLoad)return playerLoad;
  playerLoad=new Promise((resolve,reject)=>{
    let settled=false;
    const finish=()=>{if(settled)return;settled=true;clearTimeout(timeout);resolve();};
    const previous=window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady=()=>{previous?.();finish();};
    const tag=document.createElement('script');tag.src='https://www.youtube.com/iframe_api';tag.referrerPolicy='strict-origin-when-cross-origin';
    tag.onerror=()=>{clearTimeout(timeout);playerLoad=null;reject(new Error('YouTube player could not load. Check your connection or content blocker.'));};
    const timeout=setTimeout(()=>{if(!settled){settled=true;playerLoad=null;reject(new Error('YouTube player took too long to load. Reload this page to retry.'));}},20000);
    document.head.append(tag);
  });
  return playerLoad;
}
function playerError(event) {
  stopAt=null;clipLoading=false;
  const explanations={2:'The video link is invalid.',5:'YouTube cannot play this video in this browser.',100:'This video is unavailable or private.',101:'This creator does not allow embedded playback.',150:'This creator does not allow embedded playback.',153:'YouTube could not identify this browser. Open this page in a regular browser and try again.'};
  message('playerStatus',explanations[event.data]||'YouTube playback failed. Try opening the original video.','error');
}
async function mountPlayer(request) {
  clearTimeout(readyTimeout);
  playerReady=false;$('replayButton').disabled=true;stopClip();
  message('playerStatus','Loading the YouTube player…');
  try {
    await loadPlayerAPI();if(request!==state.request)return;
    if(player){player.destroy();player=null;}
    const mount=document.createElement('div');mount.id='youtubePlayer';document.querySelector('.video-frame').replaceChildren(mount);
    player=new YT.Player('youtubePlayer', {
      host:'https://www.youtube-nocookie.com',width:'100%',height:'100%',videoId:state.data.video_id,
      playerVars:{playsinline:1,controls:1,rel:0,cc_load_policy:0,origin:location.origin},
      events:{onReady:()=>{
        if(request!==state.request)return;
        clearTimeout(readyTimeout);
        playerReady=true;$('replayButton').disabled=false;
        const rates=player.getAvailablePlaybackRates?.()||[1];
        $('playbackRate').replaceChildren(...rates.map(rate=>{const option=document.createElement('option');option.value=rate;option.textContent=`${rate}×`;option.selected=rate===1;return option;}));
        $('playbackButtons').querySelectorAll('[data-rate]').forEach(button=>{button.disabled=!rates.includes(Number(button.dataset.rate));button.setAttribute('aria-pressed',String(Number(button.dataset.rate)===1));});
        cueCurrent();message('playerStatus','Ready. Choose a playback speed below to replay this clip.');
      },onError:playerError,onStateChange:e=>{
        if(e.data===YT.PlayerState.PLAYING){clipLoading=false;message('playerStatus',stopAt!==null?'Playing this clip…':'Playing video…');}
        if(e.data===YT.PlayerState.BUFFERING)message('playerStatus','Buffering video…');
        if(e.data===YT.PlayerState.ENDED){stopAt=null;message('playerStatus','Clip finished.');}
        if(e.data===YT.PlayerState.PAUSED)message('playerStatus','Paused.');
      },onAutoplayBlocked:()=>{clipLoading=false;message('playerStatus','Press play inside the video once, then use a playback speed button below.');}}
    });
    readyTimeout=setTimeout(()=>{if(!playerReady&&request===state.request)message('playerStatus','The embedded video is not responding. Open it on YouTube, or reload this video to retry.','error');},18000);
    clearInterval(timer);
    timer=setInterval(()=>{
      if(!playerReady||stopAt===null||clipLoading)return;
      if(player.getPlayerState?.()===YT.PlayerState.PLAYING && player.getCurrentTime()>=stopAt){stopClip();message('playerStatus','Clip finished. Type what you heard.');}
    },80);
  }catch(error){message('playerStatus',error.message,'error');}
}
function clipBounds(){const s=current();return {start:Math.max(0,s.start-.12),end:s.end+.12};}
function cueCurrent() {
  if(!playerReady||!current())return;
  stopClip();const {start,end}=clipBounds();
  player.cueVideoById({videoId:state.data.video_id,startSeconds:start,endSeconds:end});
}
function replay() {
  if(!playerReady||!current())return;
  const {start,end}=clipBounds();stopAt=end;clipLoading=true;
  player.loadVideoById({videoId:state.data.video_id,startSeconds:start,endSeconds:end});
  player.setPlaybackRate(Number($('playbackRate').value)||1);
  message('playerStatus','Loading this clip…');
}
function renderTimeline() {
  const fragment=document.createDocumentFragment(),inRange=new Set(state.indices);
  state.data.segments.forEach((segment,i)=>{
    const button=document.createElement('button');button.type='button';button.className='timeline-row';button.dataset.index=i;
    button.setAttribute('role','listitem');button.setAttribute('aria-current',String(i===state.index));
    button.classList.toggle('outside',!inRange.has(i));
    button.setAttribute('aria-label',`Start at ${timeLabel(segment.start)}, clip ${i+1}${!inRange.has(i)?', outside selected range':''}`);
    const time=document.createElement('time');time.textContent=timeLabel(segment.start);
    const text=document.createElement('span');text.className='cue-text';text.textContent=$('showScript').checked?segment.text:`Clip ${i+1} · ${tokens(segment.text).length} words`;
    const check=document.createElement('span');check.className='cue-state';check.textContent=isComplete(i)?'✓':'';
    button.append(time,text,check);fragment.append(button);
  });
  $('timeline').replaceChildren(fragment);
}
function confetti() {
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const el=$('celebration');el.replaceChildren();
  for(let i=0;i<22;i++){const dot=document.createElement('i');dot.style.background=['#1877e8','#2daf75','#f0b62b','#8058c9'][i%4];dot.style.setProperty('--x',`${(Math.random()-.5)*550}px`);dot.style.setProperty('--y',`${(Math.random()-.45)*440}px`);dot.style.setProperty('--r',`${Math.random()*700}deg`);el.append(dot);}
  setTimeout(()=>el.replaceChildren(),1100);
}
function renderExercise({focus=false}={}) {
  const s=current();if(!s)return;
  const words=tokens(s.text),opened=openedWords(),done=opened.length>0&&opened.every(Boolean),allSolved=done&&opened.every(v=>v==='solved');
  const frag=document.createDocumentFragment();
  words.forEach((word,i)=>{const b=document.createElement('button');b.type='button';b.className=`word-slot ${opened[i]||''}`;b.dataset.slot=i;b.textContent=opened[i]?word:'—';b.setAttribute('aria-label',opened[i]?`${word}, ${opened[i]}`:`Reveal word ${i+1}`);b.setAttribute('role','listitem');frag.append(b);});
  $('wordGrid').replaceChildren(frag);
  $('clipTime').textContent=`${timeLabel(s.start)} – ${timeLabel(s.end)}`;
  $('clipProgress').style.width=`${opened.filter(Boolean).length/words.length*100}%`;
  const position=state.indices.indexOf(state.index);
  $('clipCounter').textContent=`${position+1} / ${state.indices.length}`;
  $('previousClip').disabled=position<=0;$('forwardClip').disabled=position>=state.indices.length-1;
  $('answerInputWrap').hidden=done;$('namesButton').hidden=done;$('giveUpButton').hidden=done;$('againButton').hidden=!done;$('nextButton').hidden=!done;
  $('answerEntry').classList.toggle('is-completing',done);
  $('namesButton').disabled=!state.data.language.startsWith('en');
  $('namesButton').title=state.data.language.startsWith('en')?'Reveal names in this caption':'Names helper supports English captions';
  $('nextButton').disabled=position>=state.indices.length-1;
  $('nextButton').textContent=position>=state.indices.length-1?'Range complete ✓':'Next →';
  $('captionAnswer').hidden=!done;$('captionAnswer').textContent=s.text;
  if(done){message('answerFeedback',allSolved?'Solved! Replay, try again, or move to the next clip.':'Answer revealed. Try again or move to the next clip.',allSolved?'success':'warning');if(allSolved&&!celebrated){celebrated=true;confetti();}}
  if(focus&&!done)$('answerInput').focus({preventScroll:true});
  renderTimeline();save();
}
function selectClip(index, {play=false}={}) {
  if(!state.data?.segments[index])return;
  stopClip();state.index=index;celebrated=isComplete(index);$('answerInput').value='';
  message('answerFeedback','Type a word. Press Space or Enter.');renderExercise({focus:true});
  if(play)replay();else cueCurrent();
  const row=$('timeline').querySelector(`[data-index="${index}"]`);
  if(row){const list=$('timeline'),r=row.getBoundingClientRect(),l=list.getBoundingClientRect();if(r.top<l.top||r.bottom>l.bottom)list.scrollTop+=r.top-l.top-30;}
}
function navigate(delta){const i=state.indices.indexOf(state.index)+delta;if(i>=0&&i<state.indices.length)selectClip(state.indices[i],{play:true});}
function renderRange(){
  $('rangeStart').value=timeLabel(state.start);$('rangeEnd').value=timeLabel(Math.ceil(state.end));
  message('rangeStatus',`${state.indices.length} clips, in time order. Whole captions are kept at the boundaries.`);
}
function setRange(start,end){
  const indices=rangeIndices(state.data.segments,start,end);
  if(!indices.length)throw new Error('No captions start in that range. Choose a wider range.');
  state.start=start;state.end=end;state.indices=indices;renderRange();selectClip(indices[0]);
}
function options(tracks, chosen) {
  const choices=new Map([['en','English'],['ko','한국어']]);
  for(const t of tracks||[])choices.set(t.code,t.name);
  if(chosen&&!choices.has(chosen))choices.set(chosen,chosen);
  const previous=chosen||$('captionLanguage').value;
  $('captionLanguage').replaceChildren(...[...choices].map(([code,name])=>{const o=document.createElement('option');o.value=code;o.textContent=name;o.selected=code===previous;return o;}));
}
function activate(data, request) {
  if(request!==state.request)return;
  stopClip();state.data=data;loadProgress(data);celebrated=isComplete(state.index);
  $('workspace').hidden=false;$('emptyStage').hidden=true;$('videoTitle').textContent=data.title;
  $('originalLink').href=`https://www.youtube.com/watch?v=${data.video_id}`;
  options(data.tracks,data.language);
  $('captionNote').textContent=data.source==='uploaded'?'Your caption file · Original wording and timestamps.':`${data.generated?'Auto-generated captions · May contain recognition errors.':'Creator-provided captions.'} ${data.count} practice clips.`;
  $('showScript').checked=false;$('answerInput').value='';renderRange();renderExercise();
  message('importStatus',`${data.count} clips loaded. Choose a time range, then play the first clip.`,'success');
  try{localStorage.setItem('dictai:youtube:last',JSON.stringify(data));}catch{message('saveStatus','This transcript is too large to restore automatically. Its progress is still saved.');}
  void mountPlayer(request);
}
async function loadVideo(manual=false) {
  const url=$('videoUrl').value.trim();if(!url){$('videoUrl').focus();return;}
  if(state.busy)return;
  const request=++state.request;state.busy=true;stopClip();
  $('loadButton').disabled=true;$('useSubtitles').disabled=true;$('workspace').inert=true;
  $('loadButton').textContent='Loading…';
  message('importStatus',manual?'Reading timed captions…':'Reading available captions from YouTube…');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),50000);
  const slow=setTimeout(()=>message('importStatus','Still waiting for YouTube captions… This can take up to 45 seconds.'),10000);
  try{
    const body={url,language:$('captionLanguage').value};if(manual)body.subtitles=$('subtitleText').value;
    const response=await fetch(`/api/youtube/${manual?'subtitles':'import'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
    const data=await response.json();
    if(!response.ok){const detail=data.detail;if(detail?.tracks?.length)options(detail.tracks);throw new Error(detail?.message||'Check the video link and caption input, then try again.');}
    activate(data,request);
  }catch(error){
    message('importStatus',error.name==='AbortError'?'Caption loading timed out. Retry or use an SRT / VTT file.':error.message,'error');
    $('manualDetails').open=true;
  }finally{
    clearTimeout(timeout);clearTimeout(slow);state.busy=false;$('workspace').inert=false;
    $('loadButton').disabled=false;$('useSubtitles').disabled=false;$('loadButton').textContent='Load video →';
  }
}
$('importForm').addEventListener('submit',e=>{e.preventDefault();void loadVideo();});
$('useSubtitles').addEventListener('click',()=>void loadVideo(true));
$('subtitleFile').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;if(file.size>2000000){message('importStatus','Use a caption file smaller than 2 MB.','error');return;}$('subtitleText').value=await file.text();});
$('showScript').addEventListener('change',()=>{if(state.data)renderTimeline();});
$('timeline').addEventListener('click',e=>{const b=e.target.closest('[data-index]');if(!b)return;const i=Number(b.dataset.index);if(!state.indices.includes(i)){state.start=state.data.segments[i].start;state.end=state.data.end+.01;state.indices=rangeIndices(state.data.segments,state.start,state.end);renderRange();}selectClip(i,{play:true});});
$('rangeForm').addEventListener('submit',e=>{e.preventDefault();try{setRange(parseTime($('rangeStart').value),parseTime($('rangeEnd').value));}catch(error){message('rangeStatus',error.message,'error');}});
$('fullRange').addEventListener('click',()=>{if(state.data)setRange(0,state.data.end+.01);});
$('useCurrentTime').addEventListener('click',()=>{if(!playerReady){message('rangeStatus','Wait for the video player to load.','error');return;}const i=indexAtTime(state.data.segments,player.getCurrentTime());setRange(state.data.segments[i].start,state.data.end+.01);});
$('replayButton').addEventListener('click',replay);
$('playbackButtons').addEventListener('click',event=>{const button=event.target.closest('[data-rate]');if(!button||button.disabled)return;$('playbackRate').value=button.dataset.rate;$('playbackButtons').querySelectorAll('[data-rate]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));replay();});
$('playbackRate').addEventListener('change',()=>{if(playerReady)player.setPlaybackRate(Number($('playbackRate').value));});
function submitAnswer(){
  if(!current()||isComplete(state.index))return;
  const answer=$('answerInput').value.trim();if(!answer)return;
  const result=submitWords(tokens(current().text),openedWords(),answer);
  state.answers[state.index]=result.opened;
  if(result.matched)$('answerInput').value='';
  renderExercise({focus:true});
  if(!result.complete){
    if(result.matched)message('answerFeedback',`${result.matched} word${result.matched===1?'':'s'} found. ${result.opened.filter(v=>!v).length} left.${result.missed?' Some words did not match.':''}`,'success');
    else if(result.duplicate&&!result.missed)message('answerFeedback','Already entered.','warning');
    else message('answerFeedback','Not in this caption. Listen again and try another word.','error');
  }
}
$('answerForm').addEventListener('submit',e=>{e.preventDefault();submitAnswer();});
$('answerInput').addEventListener('keydown',e=>{if(e.key===' '&&!e.isComposing){e.preventDefault();submitAnswer();}});
$('wordGrid').addEventListener('click',e=>{const b=e.target.closest('[data-slot]');if(!b)return;const i=Number(b.dataset.slot);if(openedWords()[i])return;openedWords()[i]='revealed';renderExercise();});
$('giveUpButton').addEventListener('click',()=>{state.answers[state.index]=openedWords().map(v=>v||'revealed');renderExercise();});
$('namesButton').addEventListener('click',async()=>{
  const index=state.index,request=state.request,text=current()?.text;if(!text)return;
  $('namesButton').disabled=true;
  message('answerFeedback','Finding names…');
  try{
    const response=await fetch('/api/youtube/names',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
    const result=await response.json();
    if(request!==state.request||index!==state.index)return;
    if(!response.ok)throw new Error(result.detail?.message||'Names could not be loaded.');
    let count=0;
    for(const i of result.indices){if(Number.isInteger(i)&&i>=0&&i<openedWords().length&&!openedWords()[i]){openedWords()[i]='revealed';count++;}}
    renderExercise();
    if(!isComplete(index))message('answerFeedback',count?`${count} name word${count===1?'':'s'} revealed.`:'No new names to reveal.',count?'':'warning');
  }catch(error){if(request===state.request&&index===state.index)message('answerFeedback',error.message,'error');}
  finally{if(request===state.request&&index===state.index)$('namesButton').disabled=false;}
});
$('againButton').addEventListener('click',()=>{state.answers[state.index]=Array(tokens(current().text).length).fill(null);celebrated=false;selectClip(state.index,{play:true});});
$('nextButton').addEventListener('click',()=>navigate(1));$('forwardClip').addEventListener('click',()=>navigate(1));$('previousClip').addEventListener('click',()=>navigate(-1));
window.addEventListener('pagehide',()=>{save();stopClip();clearInterval(timer);clearTimeout(readyTimeout);});

// Optional agent access uses exactly the same page actions; unsupported browsers are unaffected.
if(document.modelContext?.registerTool){
  const lifecycle=new AbortController();
  try{void Promise.resolve(document.modelContext.registerTool({name:'set_youtube_practice_range',description:'Set the time range on the currently loaded YouTube video and select its first caption.',inputSchema:{type:'object',properties:{startSeconds:{type:'number',minimum:0},endSeconds:{type:'number',minimum:0}},required:['startSeconds','endSeconds'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!state.data)throw new Error('Load a YouTube video first.');setRange(input.startSeconds,input.endSeconds);return {clips:state.indices.length,start:state.start,end:state.end};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
try{
  const last=JSON.parse(localStorage.getItem('dictai:youtube:last')||'null');
  if(last&&/^[A-Za-z0-9_-]{11}$/.test(last.video_id)&&Array.isArray(last.segments)&&last.segments.length&&last.segments.every(s=>typeof s.text==='string'&&Number.isFinite(s.start)&&Number.isFinite(s.end))){
    $('videoUrl').value=`https://www.youtube.com/watch?v=${last.video_id}`;
    activate({...last,start_hint:0},++state.request);
    message('importStatus','Last video restored. Continue from your saved clip.','success');
  }
}catch{}
