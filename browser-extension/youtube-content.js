(()=>{
  const EXTENSION_ORIGIN=chrome.runtime.getURL('').replace(/\/$/,'');
  let host=null,frame=null,channel=null,videoId=null,scan=null,stopTimer=null,generation=0;
  const currentId=()=>{try{const u=new URL(location.href);return u.origin==='https://www.youtube.com'&&u.pathname==='/watch'&&/^[\w-]{11}$/.test(u.searchParams.get('v')||'')?u.searchParams.get('v'):null;}catch{return null;}};
  const send=(type,payload={})=>frame?.contentWindow?.postMessage({channel:'dictai-youtube-event-v2',panel:channel,type,...payload},EXTENSION_ORIGIN);
  const stop=()=>{clearInterval(stopTimer);stopTimer=null;const video=document.querySelector('video');if(video&&!video.paused)video.pause();send('media-state',{playing:false});};
  const control=async message=>{
    const video=document.querySelector('video');if(!video)throw new Error('YouTube player is not ready.');
    if(message.action==='pause'){stop();return;}
    if(!Number.isFinite(message.start)||message.start<0||!Number.isFinite(message.end)||message.end<=message.start||message.end-message.start>600)throw new Error('Invalid clip time.');
    clearInterval(stopTimer);video.pause();video.currentTime=message.start;
    if(message.action==='cue'){send('media-state',{playing:false});return;}
    if(message.action!=='play')throw new Error('Unsupported playback command.');
    video.playbackRate=[.5,.75,1,1.25,1.5].includes(message.rate)?message.rate:1;
    await video.play();send('media-state',{playing:true});
    stopTimer=setInterval(()=>{if(video.currentTime>=message.end||video.ended){video.pause();clearInterval(stopTimer);stopTimer=null;send('media-state',{playing:false,finished:true});}},60);
  };
  const capture=async(force=false)=>{
    if(scan&&!force)return scan.promise;
    const requestGeneration=generation,requestVideoId=videoId,requestChannel=channel,requestFrame=frame;
    const requestSend=(type,payload={})=>requestFrame?.contentWindow?.postMessage({channel:'dictai-youtube-event-v2',panel:requestChannel,type,...payload},EXTENSION_ORIGIN);
    send('status',{text:'Reading this video’s captions in your browser…'});
    const active={generation:requestGeneration,promise:null};
    active.promise=chrome.runtime.sendMessage({type:'dictai-scan-current',videoId:requestVideoId}).then(reply=>{
      if(generation!==requestGeneration||currentId()!==requestVideoId)return null;
      if(reply?.error)throw new Error(reply.error);
      requestSend('captions',{payload:reply.result});return reply.result;
    }).catch(error=>{if(generation===requestGeneration&&currentId()===requestVideoId)requestSend('error',{message:error.message});return null;}).finally(()=>{if(scan===active)scan=null;});
    scan=active;return active.promise;
  };
  const mount=()=>{
    const next=currentId();
    if(!next){stop();host?.remove();host=frame=null;videoId=channel=null;return;}
    if(host&&next===videoId)return;
    stop();host?.remove();generation++;scan=null;videoId=next;channel=crypto.randomUUID();
    host=document.createElement('aside');host.id='dictai-youtube-host';host.setAttribute('aria-label','DictAI YouTube practice');
    const tab=document.createElement('button');tab.id='dictai-youtube-tab';tab.type='button';tab.textContent='D';tab.title='Open DictAI';tab.addEventListener('click',()=>host.classList.remove('dictai-collapsed'));
    frame=document.createElement('iframe');frame.id='dictai-youtube-frame';frame.title='DictAI YouTube practice';frame.allow='microphone; autoplay';
    frame.src=chrome.runtime.getURL(`panel.html?video=${encodeURIComponent(videoId)}&panel=${encodeURIComponent(channel)}`);
    host.append(tab,frame);document.documentElement.append(host);
  };
  window.addEventListener('message',event=>{
    const message=event.data;
    if(!frame||event.source!==frame.contentWindow||event.origin!==EXTENSION_ORIGIN||message?.channel!=='dictai-youtube-command-v2'||message.panel!==channel)return;
    if(message.type==='need-captions'||message.type==='retry')void capture(message.type==='retry');
    if(message.type==='media')void control(message).catch(error=>send('error',{message:error.message}));
    if(message.type==='hide')host?.classList.toggle('dictai-collapsed',true);
  });
  chrome.runtime.onMessage.addListener(message=>{if(message?.type==='dictai-toggle')host?.classList.toggle('dictai-collapsed');});
  window.addEventListener('yt-navigate-finish',()=>setTimeout(mount,150));
  new MutationObserver(()=>{if(currentId()!==videoId)mount();}).observe(document.documentElement,{childList:true,subtree:false});
  mount();
})();
