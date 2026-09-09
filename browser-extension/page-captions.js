(async()=>{
  const videoId=new URL(location.href).searchParams.get('v');
  if(location.origin!=='https://www.youtube.com'||location.pathname!=='/watch'||!/^[\w-]{11}$/.test(videoId||''))return {error:'Open a YouTube video.'};
  const player=document.querySelector('#movie_player');
  const response=player?.getPlayerResponse?.()||window.ytInitialPlayerResponse;
  const tracks=response?.captions?.playerCaptionsTracklistRenderer?.captionTracks||[];
  if(!tracks.length)return {videoId,error:'This video does not provide captions.'};
  const selected=tracks.find(t=>t.languageCode?.toLowerCase().startsWith('en')&&!t.kind)||tracks.find(t=>t.languageCode?.toLowerCase().startsWith('en'))||tracks.find(t=>t.isTranslatable)||tracks[0];
  const trackUrl=new URL(selected.baseUrl,location.origin);
  if(trackUrl.origin!==location.origin||trackUrl.pathname!=='/api/timedtext')return {videoId,error:'YouTube returned an unsupported caption source.'};
  trackUrl.searchParams.set('fmt','json3');
  const requestId=`${videoId}:${selected.languageCode||'und'}:${selected.vssId||''}`;
  const responseText=await fetch(trackUrl,{credentials:'include',referrer:location.href}).then(async r=>{if(!r.ok)throw new Error(`Caption request failed (${r.status}).`);return r.text();});
  if(new URL(location.href).searchParams.get('v')!==videoId)return {videoId,error:'The video changed while captions were loading.'};
  if(responseText.length>2000000)return {videoId,error:'This transcript is too large.'};
  const payload=JSON.parse(responseText),cues=[];
  for(const event of payload.events||[]){
    const text=(event.segs||[]).map(s=>s.utf8||'').join('').replace(/\n/g,' ').replace(/\s+/g,' ').trim();
    if(!text)continue;
    const start=Number(event.tStartMs)/1000,duration=Number(event.dDurationMs)/1000;
    if(Number.isFinite(start)&&Number.isFinite(duration)&&duration>0)cues.push({start,duration,text});
  }
  if(!cues.length)return {videoId,error:'YouTube returned no spoken caption lines.'};
  const title=response?.videoDetails?.title||document.title.replace(/ - YouTube$/,'');
  const language=String(selected.languageCode||'und').replace(/[^\w-]/g,'').slice(0,30)||'und';
  return {videoId,title:String(title).slice(0,300),language,languageName:selected.name?.simpleText||language,generated:selected.kind==='asr',requestId,cues};
})().catch(error=>({error:error?.message||'Caption loading failed.'}));
