(async()=>{
  const videoId=new URL(location.href).searchParams.get('v');
  if(location.origin!=='https://www.youtube.com'||location.pathname!=='/watch'||!/^[\w-]{11}$/.test(videoId||''))return {error:'Open a YouTube video.'};
  const player=document.querySelector('#movie_player');
  const response=player?.getPlayerResponse?.()||window.ytInitialPlayerResponse;
  const tracks=response?.captions?.playerCaptionsTracklistRenderer?.captionTracks||[];
  const selected=tracks.find(t=>t.languageCode?.toLowerCase().startsWith('en')&&!t.kind)||tracks.find(t=>t.languageCode?.toLowerCase().startsWith('en'))||tracks.find(t=>t.isTranslatable)||tracks[0];
  const timeoutFetch=async(url,options={})=>{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
    try{return await fetch(url,{...options,signal:controller.signal});}
    catch(error){if(error?.name==='AbortError')throw new Error('YouTube caption request timed out.');throw error;}
    finally{clearTimeout(timeout);}
  };
  const clean=value=>String(value||'').replace(/\n/g,' ').replace(/\s+/g,' ').trim();
  const protectedToken=()=>{
    const saved=window.__DICTAI_YOUTUBE_POT__?.[videoId]?.token;if(saved)return saved;
    for(const entry of performance.getEntriesByType?.('resource')||[]){
      try{const url=new URL(entry.name);if(url.origin===location.origin&&url.pathname==='/api/timedtext'&&url.searchParams.get('v')===videoId&&url.searchParams.get('pot'))return url.searchParams.get('pot');}catch{}
    }
    return null;
  };
  const waitForProtectedToken=async()=>{
    for(let attempt=0;attempt<12;attempt++){const token=protectedToken();if(token)return token;await new Promise(resolve=>setTimeout(resolve,250));}
    return null;
  };
  const timedText=async track=>{
    const trackUrl=new URL(track.baseUrl,location.origin);
    if(trackUrl.origin!==location.origin||trackUrl.pathname!=='/api/timedtext')throw new Error('YouTube returned an unsupported caption source.');
    if(trackUrl.searchParams.get('exp')==='xpe'){
      const token=await waitForProtectedToken();if(!token)return null;
      trackUrl.searchParams.set('c','WEB');trackUrl.searchParams.set('pot',token);
    }
    trackUrl.searchParams.set('fmt','json3');
    const result=await timeoutFetch(trackUrl,{credentials:'include',referrer:location.href});
    if(!result.ok)throw new Error(`Caption request failed (${result.status}).`);
    const text=await result.text();if(!text.trim()||text.length>2000000)return null;
    let payload;try{payload=JSON.parse(text);}catch{return null;}
    const cues=[];
    for(const event of payload.events||[]){
      const text=clean((event.segs||[]).map(s=>s.utf8||'').join(''));
      const start=Number(event.tStartMs)/1000,duration=Number(event.dDurationMs)/1000;
      if(text&&Number.isFinite(start)&&Number.isFinite(duration)&&duration>0)cues.push({start,duration,text});
    }
    return cues.length?cues:null;
  };
  const findValue=(root,key)=>{
    const queue=[root],seen=new Set();
    while(queue.length){const node=queue.shift();if(!node||typeof node!=='object'||seen.has(node))continue;seen.add(node);if(node[key])return node[key];for(const value of Object.values(node))if(value&&typeof value==='object')queue.push(value);}
    return null;
  };
  const transcriptCues=async()=>{
    const apiKey=window.ytcfg?.get?.('INNERTUBE_API_KEY'),context=window.ytcfg?.get?.('INNERTUBE_CONTEXT');
    if(!apiKey||!context)return null;
    const configuredName=window.ytcfg?.get?.('INNERTUBE_CONTEXT_CLIENT_NAME');
    const clientName=String(configuredName||(/^WEB/.test(context.client?.clientName||'')?1:context.client?.clientName||1));
    const clientVersion=String(context.client?.clientVersion||window.ytcfg?.get?.('INNERTUBE_CLIENT_VERSION')||'');
    const headers={'content-type':'application/json; charset=UTF-8','x-goog-api-format-version':'2','x-youtube-client-name':clientName,'x-youtube-client-version':clientVersion,'x-youtube-bootstrap-logged-in':String(Boolean(window.ytcfg?.get?.('LOGGED_IN')))};
    const visitorData=context.client?.visitorData||window.ytcfg?.get?.('VISITOR_DATA');if(visitorData)headers['x-goog-visitor-id']=visitorData;
    const watchData=window.ytInitialData||document.querySelector('ytd-watch-flexy')?.data||document.querySelector('ytd-app')?.data;
    let endpoint=findValue(watchData,'getTranscriptEndpoint');
    if(!endpoint?.params){
      const next=await timeoutFetch(`/youtubei/v1/next?prettyPrint=false&key=${encodeURIComponent(apiKey)}`,{method:'POST',credentials:'include',headers,body:JSON.stringify({context,videoId})});
      if(!next.ok)return null;endpoint=findValue(await next.json(),'getTranscriptEndpoint');
    }
    if(!endpoint?.params)return null;
    const result=await timeoutFetch(`/youtubei/v1/get_transcript?prettyPrint=false&key=${encodeURIComponent(apiKey)}`,{method:'POST',credentials:'include',headers,body:JSON.stringify({context,params:endpoint.params})});
    if(!result.ok){const detail=clean(await result.text()).slice(0,160);throw new Error(`Transcript request failed (${result.status})${detail?`: ${detail}`:'.'}`);}
    const data=await result.json(),renderers=[];const queue=[data],seen=new Set();
    while(queue.length){const node=queue.shift();if(!node||typeof node!=='object'||seen.has(node))continue;seen.add(node);if(node.transcriptSegmentRenderer)renderers.push(node.transcriptSegmentRenderer);for(const value of Object.values(node))if(value&&typeof value==='object')queue.push(value);}
    const cues=[];
    for(const item of renderers){
      const text=clean((item.snippet?.runs||[]).map(run=>run.text||'').join(''));
      const start=Number(item.startMs)/1000,end=Number(item.endMs)/1000,duration=end-start;
      if(text&&Number.isFinite(start)&&Number.isFinite(duration)&&duration>0)cues.push({start,duration,text});
    }
    return cues.length?cues:null;
  };
  let cues=null;
  if(selected)try{cues=await timedText(selected);}catch(error){if(!/timed out/.test(error.message))throw error;}
  if(!cues)cues=await transcriptCues();
  if(new URL(location.href).searchParams.get('v')!==videoId)return {videoId,error:'The video changed while captions were loading.'};
  if(!cues)return {videoId,error:tracks.length?'YouTube protected this caption track and did not expose a transcript.':'This video does not provide usable captions.'};
  const title=response?.videoDetails?.title||document.title.replace(/ - YouTube$/,'');
  const language=String(selected?.languageCode||'en').replace(/[^\w-]/g,'').slice(0,30)||'en';
  return {videoId,title:String(title).slice(0,300),language,languageName:selected?.name?.simpleText||language,generated:selected?.kind==='asr',requestId:`${videoId}:${language}:browser`,cues};
})().catch(error=>({error:error?.message||'Caption loading failed.'}));
