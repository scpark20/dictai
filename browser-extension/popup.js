document.getElementById('send').addEventListener('click',async()=>{
  const button=document.getElementById('send'),status=document.getElementById('status');
  button.disabled=true;status.className='';status.textContent='Reading the displayed transcript…';
  try {
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const reply=await chrome.runtime.sendMessage({type:'collect',tabId:tab?.id});
    if(reply.error)throw new Error(reply.error);
    status.textContent=`${reply.result.count} lines sent. Continue in DictAI.`;
  }catch(error){status.className='error';status.textContent=error.message;}finally{button.disabled=false;}
});
