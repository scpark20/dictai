import {dictaiURL,youtubeID} from './policy.mjs';
chrome.runtime.onMessage.addListener((m,sender,respond)=>{
  (async()=>{
    if(m.type==='hello'||m.type==='open') {
      if(!sender.tab||!dictaiURL(sender.url))throw new Error('Open the DictAI YouTube page first.');
      if(m.type==='hello')return {version:chrome.runtime.getManifest().version};
      if(!/^[\w-]{11}$/.test(m.videoId||'')||!/^[\w-]{1,30}$/.test(m.language||''))throw new Error('Invalid video or language.');
      // Bind one request to the exact receiving document, not an arbitrary URL.
      const key=`target:${sender.tab.id}:${sender.frameId}`;
      const old=(await chrome.storage.session.get(key))[key];
      if(old)await chrome.storage.session.remove(`job:${old}`);
      const tab=await chrome.tabs.create({url:`https://www.youtube.com/watch?v=${m.videoId}`,active:true});
      await chrome.storage.session.set({[key]:tab.id,[`job:${tab.id}`]:{tabId:sender.tab.id,frameId:sender.frameId,documentId:sender.documentId,videoId:m.videoId,language:m.language,requestId:m.requestId,created:Date.now(),key}});
      return {opened:true,requestId:m.requestId};
    }
    if(m.type==='collect') {
      if(sender.url!==chrome.runtime.getURL('popup.html')||!Number.isInteger(m.tabId))throw new Error('Use the extension button on YouTube.');
      const key=`job:${m.tabId}`,job=(await chrome.storage.session.get(key))[key];
      if(!job||Date.now()-job.created>3600000)throw new Error('Start with “Open YouTube” in DictAI, then send the transcript from that video tab.');
      const tab=await chrome.tabs.get(m.tabId);
      if(youtubeID(tab.url)!==job.videoId)throw new Error('This is a different video. Open the requested video from DictAI again.');
      const [capture]=await chrome.scripting.executeScript({target:{tabId:m.tabId},files:['reader.js']});
      const data=capture?.result;
      if(data?.error)throw new Error(data.error);
      if(data?.videoId!==job.videoId||!Array.isArray(data.cues)||!data.cues.length)throw new Error('No displayed transcript was found.');
      const result=await chrome.tabs.sendMessage(job.tabId,{type:'captions',id:crypto.randomUUID(),payload:{...data,language:job.language,requestId:job.requestId}}, {documentId:job.documentId});
      if(!result?.ok)throw new Error(result?.error||'DictAI could not confirm the import.');
      await chrome.storage.session.remove([key,job.key]);
      await chrome.tabs.update(job.tabId,{active:true});
      return {count:data.cues.length};
    }
    throw new Error('Unsupported extension operation.');
  })().then(result=>respond({result})).catch(error=>respond({error:error.message}));
  return true;
});
chrome.tabs.onRemoved.addListener(async tabId=>{
  const items=await chrome.storage.session.get(null),keys=[];
  for(const [key,value] of Object.entries(items))if(key===`job:${tabId}`||key.startsWith(`target:${tabId}:`)||(key.startsWith('job:')&&value.tabId===tabId))keys.push(key);
  if(keys.length)await chrome.storage.session.remove(keys);
});
