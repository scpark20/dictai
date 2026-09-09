(() => {
  const allowed=['https://192.168.0.68:8771','https://192.168.0.68:8775','http://127.0.0.1:8771','http://localhost:8771'];
  if(!allowed.includes(location.origin)||!/^\/youtube\/?$/.test(location.pathname))return;
  const receipts=new Map();
  window.addEventListener('message',e=>{
    const m=e.data;
    if(e.source!==window||e.origin!==location.origin||m?.channel!=='dictai-page-v1'||typeof m.id!=='string'||m.id.length>80)return;
    if(m.type==='received'){receipts.get(m.id)?.(m.error);return;}
    if(!['hello','open'].includes(m.type))return;
    chrome.runtime.sendMessage({type:m.type,videoId:m.videoId,language:m.language,requestId:m.id}).then(result=>{
      window.postMessage({channel:'dictai-extension-v1',id:m.id,result:result?.result,error:result?.error},location.origin);
    }).catch(()=>window.postMessage({channel:'dictai-extension-v1',id:m.id,error:'Extension updated or disconnected. Reload DictAI.'},location.origin));
  });
  chrome.runtime.onMessage.addListener((m,sender,respond)=>{
    if(sender.id!==chrome.runtime.id||m.type!=='captions')return;
    const timer=setTimeout(()=>{receipts.delete(m.id);respond({error:'DictAI did not confirm the import. Keep its YouTube page open and try again.'});},10000);
    receipts.set(m.id,error=>{clearTimeout(timer);receipts.delete(m.id);respond(error?{error}:{ok:true});});
    window.postMessage({channel:'dictai-extension-v1',type:'captions',id:m.id,payload:m.payload},location.origin);
    return true;
  });
})();
