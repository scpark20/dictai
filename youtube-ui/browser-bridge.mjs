// Only messages from this document; extension background checks the origin again.
export function extensionRequest(type, payload={}, timeout=1500) {
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
    if(e.source!==window||e.origin!==location.origin||e.data?.channel!=='dictai-extension-v1'||e.data.type!=='captions')return;
    try {await handler(e.data.payload);window.postMessage({channel:'dictai-page-v1',type:'received',id:e.data.id},location.origin);}
    catch(error){window.postMessage({channel:'dictai-page-v1',type:'received',id:e.data.id,error:error.message},location.origin);}
  });
}
