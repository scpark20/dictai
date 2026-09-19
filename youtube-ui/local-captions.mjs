import {KEYWORD_VERSION,keywordText} from './keyword-targets.mjs?v=keyword-1';

// Caption ingestion is deliberately network-free. Text is never evaluated as HTML.
export function parseVideo(value) {
  let input=String(value).trim();
  if (/^[\w-]{11}$/.test(input)) return {videoId:input,start:0};
  if (/^(?:www\.|m\.|music\.)?youtube\.com\/|^youtu\.be\//.test(input)) input='https://'+input;
  try {
    const u=new URL(input), parts=u.pathname.split('/').filter(Boolean);
    if (!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port) throw 0;
    let id;
    if (['youtu.be','www.youtu.be'].includes(u.hostname)&&parts.length===1) id=parts[0];
    if (['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','www.youtube-nocookie.com'].includes(u.hostname)) {
      if (u.pathname==='/watch') id=u.searchParams.get('v');
      else if (parts.length===2&&['shorts','live','embed'].includes(parts[0])) id=parts[1];
    }
    if (!/^[\w-]{11}$/.test(id||'')) throw 0;
    const stamp=u.searchParams.get('t')||u.searchParams.get('start')||new URLSearchParams(u.hash.slice(1)).get('t')||'0';
    const units=stamp.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    const start=/^\d+(?:\.\d+)?$/.test(stamp)?Number(stamp):units?Number(units[1]||0)*3600+Number(units[2]||0)*60+Number(units[3]||0):0;
    return {videoId:id,start:Math.min(start,43200)};
  } catch {throw new Error('Paste a valid YouTube video link.');}
}
const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
export function cleanCaption(value) {
  return String(value).replace(/<[^>]*>/g,'').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,key)=>{
    if (key[0]!=='#') return entities[key.toLowerCase()];
    const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));
    return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
  }).replace(/[\[（(](?:music|applause|laughter|laughing|silence|inaudible|음악|박수)[\]）)]/gi,' ').replace(/\u200b/g,'').replace(/\s+/g,' ').trim();
}
export function buildSegments(cues) {
  if (!Array.isArray(cues)||!cues.length||cues.length>15000) throw new Error('No usable captions, or more than 15,000 lines.');
  if (cues.reduce((n,c)=>n+String(c.text||'').length,0)>500000) throw new Error('Transcript is too large.');
  const cleaned=cues.map(c=>{
    const start=Number(c.start),duration=Number(c.duration),text=cleanCaption(c.text);
    if (!Number.isFinite(start)||!Number.isFinite(duration)||start<0||start>=43200||duration<=0||duration>600||text.length>2000) throw new Error('Invalid caption text or timing.');
    return {start:Math.round(start*1000)/1000,end:Math.round(Math.min(43200,start+duration)*1000)/1000,text};
  }).filter(c=>/[\p{L}\p{N}]/u.test(c.text)).sort((a,b)=>a.start-b.start);
  let previous=null,group=null;const result=[];
  const flush=()=>{if(group){result.push({...group,id:result.length});group=null;}};
  for (const cue of cleaned) {
    let words=cue.text.split(' ');
    if (previous&&cue.start<previous.end-.05) {
      const old=previous.text.split(' ');
      for(let n=Math.min(old.length,words.length);n>0;n--) if(old.slice(-n).join(' ')===words.slice(0,n).join(' ')){words=words.slice(n);break;}
    }
    previous=cue;if(!words.length)continue;
    const text=words.join(' ');
    if(group&&(cue.start-group.end>1.5||cue.end-group.start>16||(group.text+' '+text).split(' ').length>38))flush();
    if(group){group.end=Math.max(group.end,cue.end);group.text+=' '+text;}else group={...cue,text};
    if(/[.!?。！？]["'’”]*$/.test(text)||group.end-group.start>=8)flush();
  }
  flush();if(!result.length)throw new Error('No spoken-word captions were found.');return result;
}
export function parseSubtitles(value) {
  if(typeof value!=='string'||value.length>2000000)throw new Error('Use a caption file smaller than 2 MB.');
  const lines=value.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n'),cues=[];
  const timing=/^\s*((?:\d+:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d+:)?\d{2}:\d{2}[.,]\d{3})(?:\s|$)/;
  const seconds=s=>{const bits=s.replace(',','.').split(':').map(Number);if(bits.slice(-2).some(n=>n>=60))throw new Error('Invalid caption timestamp.');return bits.reduce((a,n)=>a*60+n,0);};
  for(let i=0;i<lines.length;i++){
    const m=lines[i].match(timing);if(!m)continue;
    const start=seconds(m[1]),end=seconds(m[2]),text=[];
    while(i+1<lines.length&&lines[i+1].trim()&&!timing.test(lines[i+1]))text.push(lines[++i]);
    cues.push({start,duration:end-start,text:text.join(' ')});
  }
  if(!cues.length)throw new Error('No timestamps found. Use SRT or VTT captions.');return cues;
}
export async function packageCaptions({videoId,start=0,language='en',title,cues,source='browser-transcript',timingEstimated=false}) {
  if(!/^[\w-]{11}$/.test(videoId)||!/^[\w-]{1,30}$/.test(language))throw new Error('Invalid video or caption language.');
  const segments=buildSegments(cues).map(segment=>({...segment,keyword_text:language.startsWith('en')?keywordText(segment.text):segment.text}));
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({segments,keywordVersion:KEYWORD_VERSION})));
  const version='local-'+Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,16);
  return {video_id:videoId,start_hint:start,language,title:String(title||`YouTube · ${videoId}`).slice(0,300),source,generated:false,tracks:[],version,keyword_version:KEYWORD_VERSION,segments,count:segments.length,end:Math.max(...segments.map(s=>s.end)),timing_estimated:timingEstimated};
}
