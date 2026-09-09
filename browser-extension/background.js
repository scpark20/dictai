const youtubeId=value=>{
  try{const u=new URL(value);if(u.origin!=='https://www.youtube.com'||u.pathname!=='/watch')return null;const id=u.searchParams.get('v');return /^[\w-]{11}$/.test(id||'')?id:null;}catch{return null;}
};
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(message?.type!=='dictai-scan-current')return;
  (async()=>{
    const videoId=youtubeId(sender.url);
    if(!sender.tab||!videoId||message.videoId!==videoId)throw new Error('The active YouTube video changed.');
    const [capture]=await chrome.scripting.executeScript({target:{tabId:sender.tab.id,frameIds:[sender.frameId]},files:['page-captions.js'],world:'MAIN'});
    const result=capture?.result;
    if(!result||result.videoId!==videoId)throw new Error(result?.error||'YouTube captions could not be read.');
    if(!Array.isArray(result.cues)||!result.cues.length)throw new Error(result.error||'This video has no usable captions.');
    return result;
  })().then(result=>respond({result})).catch(error=>respond({error:error.message}));
  return true;
});
chrome.action.onClicked.addListener(tab=>{
  if(youtubeId(tab.url))chrome.tabs.sendMessage(tab.id,{type:'dictai-toggle'}).catch(()=>{});
});
