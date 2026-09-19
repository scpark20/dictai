const extensionSurface=new URLSearchParams(location.search).get('surface')==='extension';
let panelOrigin=null;
if(extensionSurface){
  try{const u=new URL(document.referrer);if(u.protocol==='chrome-extension:'&&/^[a-p]{32}$/.test(u.hostname))panelOrigin=`chrome-extension://${u.hostname}`;}catch{}
  const id=new URLSearchParams(location.search).get('bridge');
  if(!panelOrigin&&/^[a-p]{32}$/.test(id||''))panelOrigin=`chrome-extension://${id}`;
}

export function panelSend(type,payload={}) {
  if(!extensionSurface||!panelOrigin)return false;
  window.parent.postMessage({channel:'dictai-panel-command-v2',type,...payload},panelOrigin);return true;
}

export function receivePanelEvents(handler) {
  if(!extensionSurface||!panelOrigin)return;
  window.addEventListener('message',event=>{
    if(event.source!==window.parent||event.origin!==panelOrigin||event.data?.channel!=='dictai-panel-event-v2')return;
    handler(event.data);
  });
}

// Standalone flow: only messages from this document; extension background checks the origin again.
export function extensionRequest(type, payload={}, timeout=1500) {
  if(extensionSurface)return Promise.reject(new Error('This action belongs to the YouTube panel.'));
  const id=crypto.randomUUID();
  return new Promise((resolve,reject)=>{
    const finish=()=>{clearTimeout(timer);window.removeEventListener('message',receive);};
    const receive=e=>{
      if(e.source!==window||e.origin!==location.origin||e.data?.channel!=='dictai-extension-v1'||e.data.id!==id)return;
      finish();e.data.error?reject(new Error(e.data.error)):resolve(e.data.result);
    };
    const timer=setTimeout(()=>{finish();reject(new Error('Install the DictAI Caption Bridge in Chrome or Edge, then reload DictAI.'));},timeout);
    window.addEventListener('message',receive);
    window.postMessage({channel:'dictai-page-v1',id,type,...payload},location.origin);
  });
}
export function receiveCaptions(handler) {
  window.addEventListener('message',async e=>{
    if(extensionSurface){
      if(e.source!==window.parent||e.origin!==panelOrigin||e.data?.channel!=='dictai-panel-event-v2'||e.data.type!=='captions')return;
      try{await handler(e.data.payload);}catch(error){panelSend('error',{message:error.message});}
      return;
    }
    if(e.source!==window||e.origin!==location.origin||e.data?.channel!=='dictai-extension-v1'||e.data.type!=='captions')return;
    try {await handler(e.data.payload);window.postMessage({channel:'dictai-page-v1',type:'received',id:e.data.id},location.origin);}
    catch(error){window.postMessage({channel:'dictai-page-v1',type:'received',id:e.data.id,error:error.message},location.origin);}
  });
}
