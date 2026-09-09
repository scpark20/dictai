import {timeLabel} from './youtube-core.mjs?v=shared-1';
import {createYouTubeProvider} from './practice-provider.mjs?v=shared-1';

const $ = id => document.getElementById(id);
const state = {data:null,index:0,request:0,busy:false};
let player=null, playerReady=false, playerLoad=null, stopAt=null, clipLoading=false;
let timer=null, readyTimeout=null;
let playbackRate=1;
const provider = createYouTubeProvider({
  select(index) {state.index=index;$('clipTime').textContent=`${timeLabel(current().start)} – ${timeLabel(current().end)}`;cueCurrent();},
  stop:stopClip, play(rate) {playbackRate=rate;replay();},
  storageError() {message('importStatus','Browser storage is unavailable. Keep this page open to retain progress.','warning');},
});
window.dictaiPracticeProvider=provider;
document.querySelector('.youtube-navigation').append(document.getElementById('headerStep'));

if (new URLSearchParams(location.search).get('embed') === '1') document.body.classList.add('embedded');

function message(id, text, kind='') { const el=$(id); el.textContent=text; el.className=el.className.replace(/\b(error|success|warning)\b/g,'').trim(); if(kind)el.classList.add(kind); }
function current() { return state.data?.segments[state.index]; }
function stopClip() {stopAt=null;clipLoading=false;try {player?.pauseVideo?.();}catch{} provider.mediaState(playerReady,false);}

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
  provider.mediaState(false,false);
  const explanations={2:'The video link is invalid.',5:'YouTube cannot play this video in this browser.',100:'This video is unavailable or private.',101:'This creator does not allow embedded playback.',150:'This creator does not allow embedded playback.',153:'YouTube could not identify this browser. Open this page in a regular browser and try again.'};
  message('playerStatus',explanations[event.data]||'YouTube playback failed. Try opening the original video.','error');
}
async function mountPlayer(request) {
  clearTimeout(readyTimeout);
  playerReady=false;stopClip();
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
        playerReady=true;
        const rates=player.getAvailablePlaybackRates?.()||[1];
        provider.mediaState(true,false,rates);
        cueCurrent();message('playerStatus','Ready. Choose a playback speed below to replay this clip.');
      },onError:playerError,onStateChange:e=>{
        if(e.data===YT.PlayerState.PLAYING){clipLoading=false;provider.mediaState(true,true);message('playerStatus',stopAt!==null?'Playing this clip…':'Playing video…');}
        if(e.data===YT.PlayerState.BUFFERING)message('playerStatus','Buffering video…');
        if(e.data===YT.PlayerState.ENDED){provider.mediaState(true,false);stopAt=null;message('playerStatus','Clip finished.');}
        if(e.data===YT.PlayerState.PAUSED){provider.mediaState(true,false);message('playerStatus','Paused.');}
      },onAutoplayBlocked:()=>{provider.mediaState(true,false);clipLoading=false;message('playerStatus','Press play inside the video once, then use a playback speed button below.');}}
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
  const {start,end}=clipBounds();stopAt=end;clipLoading=true;provider.mediaState(true,true);
  player.loadVideoById({videoId:state.data.video_id,startSeconds:start,endSeconds:end});
  player.setPlaybackRate(playbackRate);
  message('playerStatus','Loading this clip…');
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
  stopClip();state.data=data;
  void provider.activate(data);
  $('workspace').hidden=false;$('emptyStage').hidden=true;$('videoTitle').textContent=data.title;
  $('originalLink').href=`https://www.youtube.com/watch?v=${data.video_id}`;
  options(data.tracks,data.language);
  message('importStatus',`${data.count} clips loaded. Choose a sentence or play the current clip.`,'success');
  try{localStorage.setItem('dictai:youtube:last',JSON.stringify(data));}catch{message('importStatus','This transcript could not be saved for automatic restoration.','warning');}
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
window.addEventListener('pagehide',()=>{stopClip();clearInterval(timer);clearTimeout(readyTimeout);});

await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/practice/app.js?v=shared-1';script.onload=resolve;script.onerror=reject;document.body.append(script);});
const voiceLoader=document.createElement('script');voiceLoader.src='/practice/persistent-model-loader.js?v=shared-1';document.body.append(voiceLoader);

try{
  const last=JSON.parse(localStorage.getItem('dictai:youtube:last')||'null');
  if(last&&/^[A-Za-z0-9_-]{11}$/.test(last.video_id)&&Array.isArray(last.segments)&&last.segments.length&&last.segments.every(s=>typeof s.text==='string'&&Number.isFinite(s.start)&&Number.isFinite(s.end))){
    $('videoUrl').value=`https://www.youtube.com/watch?v=${last.video_id}`;
    activate({...last,start_hint:0},++state.request);
    message('importStatus','Last video restored. Continue from your saved clip.','success');
  }
}catch{}
