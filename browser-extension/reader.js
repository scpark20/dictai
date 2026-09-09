// Runs only when the user clicks Send. No fetch, cookies, player internals or hidden APIs.
(() => {
  const visible=el=>{
    if(!el||el.closest('[hidden], [aria-hidden="true"]'))return false;
    for(let p=el;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden')return false;}
    return el.getClientRects().length>0;
  };
  const videoId=new URL(location.href).searchParams.get('v');
  if(location.hostname!=='www.youtube.com'||location.pathname!=='/watch'||!/^[\w-]{11}$/.test(videoId||''))return {error:'Open a YouTube watch page.'};
  const rows=[...document.querySelectorAll('ytd-transcript-segment-renderer, transcript-segment-view-model')].filter(visible);
  if(!rows.length)return {error:'On YouTube, expand the description and click “Show transcript”. Keep timestamps visible, then press Send again.'};
  if(rows.length>15000)return {error:'This transcript is too long (maximum 15,000 rows).'};
  const cues=[],seen=new Set();let total=0;
  for(const row of rows){
    const stamp=row.querySelector('.segment-timestamp, [class*="timestamp"]');
    const line=row.querySelector('.segment-text, [class*="segmentText"], [class*="segment-text"]');
    if(!stamp||!line||!visible(stamp))return {error:'Enable timestamps in the YouTube transcript, then try again. Its page layout may also have changed.'};
    const label=stamp.textContent.trim(),text=line.textContent.replace(/\s+/g,' ').trim();
    if(!/^\d+(?::\d{1,2}){1,2}$/.test(label))return {error:'A transcript timestamp could not be read. Nothing was imported.'};
    const bits=label.split(':').map(Number);if(bits.slice(1).some(n=>n>=60))return {error:'Invalid transcript timestamp.'};
    const start=bits.reduce((n,v)=>n*60+v,0);total+=text.length;
    if(start>=43200||text.length>2000||total>500000)return {error:'This transcript exceeds the supported size or duration.'};
    const key=JSON.stringify([start,text]);
    if(text&&!seen.has(key)){seen.add(key);cues.push({start,text});}
  }
  cues.sort((a,b)=>a.start-b.start);
  const duration=document.querySelector('video')?.duration;
  // The visible transcript provides start times, not exact caption end times.
  // Use the next displayed timestamp. The final line uses video duration if valid.
  let next;
  for(let i=cues.length-1;i>=0;i--){
    if(i<cues.length-1&&cues[i+1].start>cues[i].start)next=cues[i+1].start;
    const fallback=Math.max(1,Math.min(8,cues[i].text.split(' ').length/2.5));
    const end=next??(Number.isFinite(duration)&&duration>cues[i].start?duration:cues[i].start+fallback);
    cues[i].duration=Math.min(600,end-cues[i].start);
  }
  const title=document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string')?.textContent?.trim()||document.title.replace(/ - YouTube$/,'');
  return {videoId,title:title.slice(0,300),cues,timingEstimated:true};
})();
