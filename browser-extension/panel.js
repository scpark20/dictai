(()=>{
  const params=new URLSearchParams(location.search),video=params.get('video'),panel=params.get('panel');
  if(!/^[\w-]{11}$/.test(video||'')||!/^[\w-]{36}$/.test(panel||'')){document.body.textContent='Invalid DictAI panel.';return;}
  const YOUTUBE_ORIGIN='https://www.youtube.com',DICTAI_ORIGIN='https://192.168.0.68:8771';
  const app=document.getElementById('app'),state=document.getElementById('state'),retry=document.getElementById('retry');
  app.src=`${DICTAI_ORIGIN}/youtube?embed=1&surface=extension&video=${encodeURIComponent(video)}&bridge=${encodeURIComponent(chrome.runtime.id)}&v=lr-2`;
  const toYouTube=(type,payload={})=>parent.postMessage({...payload,channel:'dictai-youtube-command-v2',panel,type},YOUTUBE_ORIGIN);
  const toApp=(type,payload={})=>app.contentWindow?.postMessage({...payload,channel:'dictai-panel-event-v2',type},DICTAI_ORIGIN);
  window.addEventListener('message',event=>{
    const message=event.data;
    if(event.source===parent&&event.origin===YOUTUBE_ORIGIN&&message?.channel==='dictai-youtube-event-v2'&&message.panel===panel){
      if(message.type==='status'){state.textContent=message.text;retry.hidden=true;}
      if(message.type==='error'){state.textContent=message.message;retry.hidden=false;toApp('error',{message:message.message});}
      if(message.type==='captions'){state.textContent=`${message.payload.cues.length} caption lines`;retry.hidden=true;toApp('captions',{payload:message.payload});}
      if(message.type==='media-state')toApp('media-state',message);
      return;
    }
    if(event.source===app.contentWindow&&event.origin===DICTAI_ORIGIN&&message?.channel==='dictai-panel-command-v2'){
      if(message.type==='ready')state.textContent=message.cached?'Saved captions':'Preparing captions…';
      toYouTube(message.type,message);
    }
  });
  retry.addEventListener('click',()=>toYouTube('retry'));
  document.getElementById('hide').addEventListener('click',()=>toYouTube('hide'));
})();
