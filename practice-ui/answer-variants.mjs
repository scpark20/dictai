// Conservative, caption-local equivalences. Never rewrite the caption or infer ASR repairs.
export const TOKEN_VERSION = 2;
const clean = text => String(text).normalize('NFKC').replace(/[’‘]/g, "'");
const WORD = /Ph\.D\.|(?:[A-Za-z]\.){2,}|(?:Mr|Mrs|Ms|Dr|Prof|Jr|Sr|St)\.|\d{1,2}(?::\d{2})?[aApP]\.?[mM]\.?|[vV]\d+(?:\.\d+)+|[$£€¢]?(?:[+−-]\s*)?(?:\d[\d,]*(?:(?:[.:/⁄-])\d+)*|\.\d+)(?:[eE][+-]?\d+)?(?:%|¢|°[CF]|[-']?[\p{L}]+(?:[\p{N}]|-[\p{L}\p{N}]+)*)?|[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*|[%$£€¢]/gu;
const OLD_WORD = /[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu;
export function tokenSpans(text, legacy=false) {
  return [...clean(text).matchAll(legacy ? OLD_WORD : WORD)].map(m=>({text:m[0],start:m.index,end:m.index+m[0].length}));
}
export const tokens = text => tokenSpans(text).map(t=>t.text);
export const legacyTokens = text => tokenSpans(text,true).map(t=>t.text);
export function migrateOpened(text, opened, version) {
  const current=tokenSpans(text), old=tokenSpans(text,true);
  const valid=a=>Array.isArray(a)&&a.every(v=>v===null||v==='solved'||v==='revealed');
  if (!valid(opened)) return null;
  if(version===TOKEN_VERSION) return opened.length===current.length?[...opened]:null;
  if(opened.length!==old.length) return null;
  return current.map(t=>{
    const covered=old.flatMap((o,i)=>o.start<t.end&&o.end>t.start?[i]:[]);
    if(!covered.length||covered.some(i=>!opened[i]))return null;
    return covered.some(i=>opened[i]==='revealed')?'revealed':'solved';
  });
}
export function mapLegacyIndices(text, indices) {
  const old=tokenSpans(text,true), spans=indices.filter(Number.isInteger).map(i=>old[i]).filter(Boolean);
  return tokenSpans(text).flatMap((t,i)=>spans.some(o=>o.start<t.end&&o.end>t.start)?[i]:[]);
}
const TITLES={mr:'mister',mrs:'missus',dr:'doctor',prof:'professor',jr:'junior',sr:'senior'};
const CONTRACTIONS={"can't":'can not',cannot:'can not',"won't":'will not',"shan't":'shall not',"don't":'do not',"doesn't":'does not',"didn't":'did not',"isn't":'is not',"aren't":'are not',"wasn't":'was not',"weren't":'were not',"haven't":'have not',"hasn't":'has not',"hadn't":'had not',"couldn't":'could not',"wouldn't":'would not',"shouldn't":'should not',"mustn't":'must not',"needn't":'need not',"i'm":'i am',"let's":'let us'};
for(const p of ['i','you','we','they'])CONTRACTIONS[p+"'ve"]=p+' have';
for(const p of ['you','we','they'])CONTRACTIONS[p+"'re"]=p+' are';
for(const p of ['i','you','he','she','it','we','they'])CONTRACTIONS[p+"'ll"]=p+' will';
const OMITTED = Object.fromEntries(Object.entries(CONTRACTIONS).filter(([k])=>k.includes("n't")||["i'm","you've","we've","they've","you're","they're"].includes(k)).map(([k,v])=>[k.replaceAll("'",''),v]));
export function normalize(text) {
  const s=clean(text).toLowerCase().trim().replace(/\s+/g,' ');
  const title=s.replace(/\.$/,'');
  if(TITLES[title])return TITLES[title];
  if(['st','ms'].includes(title))return title;
  return CONTRACTIONS[s]||OMITTED[s]||s;
}
const SMALL=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const TENS=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
const SCALES=[[1000000000000,'trillion'],[1000000000,'billion'],[1000000,'million'],[1000,'thousand']];
const ORDINAL={one:'first',two:'second',three:'third',four:'fourth',five:'fifth',six:'sixth',seven:'seventh',eight:'eighth',nine:'ninth',ten:'tenth',eleven:'eleventh',twelve:'twelfth',thirteen:'thirteenth',fourteen:'fourteenth',fifteen:'fifteenth',sixteen:'sixteenth',seventeen:'seventeenth',eighteen:'eighteenth',nineteen:'nineteenth',twenty:'twentieth',thirty:'thirtieth',forty:'fortieth',fifty:'fiftieth',sixty:'sixtieth',seventy:'seventieth',eighty:'eightieth',ninety:'ninetieth',hundred:'hundredth',thousand:'thousandth',million:'millionth',billion:'billionth',trillion:'trillionth',zero:'zeroth'};
export function spellInteger(n,and=false) {
  if(!Number.isSafeInteger(n)||n<0||n>=1e15)return null;
  if(n<20)return SMALL[n];
  if(n<100)return TENS[Math.floor(n/10)]+(n%10?' '+SMALL[n%10]:'');
  if(n<1000)return SMALL[Math.floor(n/100)]+' hundred'+(n%100?(and?' and ':' ')+spellInteger(n%100,and):'');
  for(const [scale,name] of SCALES)if(n>=scale)return spellInteger(Math.floor(n/scale),and)+' '+name+(n%scale?((and&&n%scale<100)?' and ':' ')+spellInteger(n%scale,and):'');
}
const phraseKey = text => clean(text).toLowerCase().replace(/(?<=\p{L})-(?=\p{L})/gu,' ').replace(/\s+/g,' ').trim();
function decimalValue(raw) {
  raw=raw.trim().replace(/^([+−-])\s+/,'$1').replace('−','-').replace(/^([+-]?)\./,'$10.');
  if(!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(raw))return null;
  const value=raw.replaceAll(',','');
  if(/^[-+]?0\d/.test(value))return null; // serial numbers are not cardinals
  return value.replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
}
function numberForms(raw) {
  const result=new Set();const value=decimalValue(raw);if(value===null)return result;
  const sign=value.startsWith('-')?'minus ':value.startsWith('+')?'plus ':'';
  const abs=raw.replaceAll(',','').replace(/^[+−-]\s*/,'').replace(/^\./,'0.');
  const [whole,frac]=abs.split('.'),n=Number(whole),spoken=spellInteger(n);
  if(!spoken)return result;
  result.add(value);
  if(frac){
    const endings=new Set([frac,frac.replace(/0+$/,'')||'0']);
    for(const end of endings)for(const form of new Set([spoken,spellInteger(n,true),...(n===0?['']:[])]))result.add(sign+(form?form+' ':'')+'point '+[...end].map(x=>SMALL[Number(x)]).join(' '));
    if(/^0+$/.test(frac))result.add(sign+spoken);
  }else{
    result.add(sign+spoken);result.add(sign+spellInteger(n,true));
    if(n>=1000&&n<=2099){
      const a=Math.floor(n/100),b=n%100;
      result.add(sign+spellInteger(a)+(b===0?' hundred':b<10?' oh '+SMALL[b]:' '+spellInteger(b)));
      if(b>0&&b<10)result.add(sign+spellInteger(a)+' zero '+SMALL[b]);
    }
    if(n>=100&&/^(?:one hundred|one thousand|one million|one billion|one trillion)(?: |$)/.test(spoken))result.add(sign+spoken.replace(/^one /,'a '));
  }
  if(sign==='minus ')for(const form of [...result])if(form.startsWith('minus '))result.add(form.replace(/^minus /,'negative '));
  return result;
}
const UNIT_FORMS={kg:['kilogram','kilograms'],km:['kilometer','kilometers','kilometre','kilometres'],cm:['centimeter','centimeters','centimetre','centimetres'],mm:['millimeter','millimeters','millimetre','millimetres'],mph:['miles per hour','mile per hour'],hz:['hertz'],gb:['gigabyte','gigabytes'],mb:['megabyte','megabytes'],'°c':['degree celsius','degrees celsius'],'°f':['degree fahrenheit','degrees fahrenheit']};
const ACRONYMS=new Set(['us','usa','uk','un','eu','bbc','tv','hiv','aids','iq','gdp','cpu','gpu','ai','api','nasa','dna','rna','usb','html','http','https','vpn','ceo','cfo','fbi','cia','nhs','phd','ok']);
const NUM=String.raw`[+−-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?`;
const cache=new Map();
function forms(text,english=true) {
  const cacheKey=String(english)+':'+text;if(cache.has(cacheKey))return cache.get(cacheKey);
  const base=phraseKey(text), out=new Set([base]);
  const add=s=>{if(s)out.add(phraseKey(s));};
  if(english){
    add(normalize(text));
    const ac=base.replaceAll('.','');
    if(ACRONYMS.has(ac)){add(ac);add([...ac].join(' '));}
    if(/^[ap]\.?m\.?$/i.test(text)&&(text.includes('.')||text==='AM'||base==='pm')){add(ac);add([...ac].join(' '));}
    if(/^[a-z](?: [a-z])+$/.test(base)&&ACRONYMS.has(base.replaceAll(' ','')))add(base.replaceAll(' ',''));
    if(['email','e mail'].includes(base)) {add('email');add('e mail');}
    if(['okay','ok'].includes(base)){add('okay');add('ok');}
    const literal=text.trim().replace(/^(\d+)\s*¢$/,'¢$1');
    for(const f of numberForms(literal))add(f);
    // Leading-zero IDs: digit-by-digit readings only; never collapse 007 to 7.
    if(/^0\d{1,11}$/.test(literal)){add([...literal].map(d=>SMALL[+d]).join(' '));add([...literal].map(d=>d==='0'?'oh':SMALL[+d]).join(' '));}
    let m;
    if((m=/^(\d+)(st|nd|rd|th)$/i.exec(literal))){
      const n=+m[1],suffix=n%100>=11&&n%100<=13?'th':({1:'st',2:'nd',3:'rd'}[n%10]||'th');
      if(suffix===m[2].toLowerCase())for(const and of [false,true]){const s=spellInteger(n,and);if(s){const a=s.split(' ');a[a.length-1]=ORDINAL[a.at(-1)];if(a.at(-1))add(a.join(' '));}}
    }
    if((m=/^(\d{1,2}):(\d{2})$/.exec(literal))&&+m[1]<=23&&+m[2]<60){
      const h=+m[1],min=+m[2];
      add(spellInteger(h)+(min===0?" o'clock":min<10?' oh '+SMALL[min]:' '+spellInteger(min)));
      if(min>0&&min<10)add(spellInteger(h)+' zero '+SMALL[min]);
      if(h>=1&&h<=12){if(min===30)add('half past '+spellInteger(h));if(min===15){add('quarter past '+spellInteger(h));add('a quarter past '+spellInteger(h));}if(min===45){add('quarter to '+spellInteger(h%12+1));add('a quarter to '+spellInteger(h%12+1));}}
      // Context-free clock readings only; no duration/date or AM/PM guessing.
    }
    if((m=/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i.exec(literal))&&+m[1]>=1&&+m[1]<=12&&(!m[2]||+m[2]<60)){
      const stamp=m[2]?m[1]+':'+m[2]:m[1],period=m[3].toLowerCase()+'m';
      for(const f of forms(stamp))for(const suffix of [period,[...period].join(' ')])add(f+' '+suffix);
    }
    if((m=new RegExp('^('+NUM+')-([a-z]+(?:-[a-z]+)*)$','i').exec(literal)))for(const n of numberForms(m[1]))add(n+' '+m[2].replaceAll('-',' '));
    if((m=/^(\d+)\/(\d+)$/.exec(literal.replace('⁄','/')))){
      const a=+m[1],b=+m[2],den={2:'half',3:'third',4:'quarter',5:'fifth',8:'eighth',10:'tenth'}[b];
      if(den&&a>0&&a<b){add(spellInteger(a)+' '+(a===1?den:b===2?'halves':den+'s'));if(a===1)add('a '+den);}
      if(literal==='24/7')add('twenty four seven');
    }
    if((m=new RegExp('^('+NUM+')\\s*(%|percent|per cent)$','i').exec(literal)))for(const n of numberForms(m[1])){add(n+' percent');add(n+' per cent');add(n+'%');}
    if((m=new RegExp('^([$£€¢])\\s*('+NUM+')(?:\\s*([kKMBT]|thousand|million|billion|trillion))?$','i').exec(literal))){
      const [,symbol,amount,scale]=m,unit={'$':'dollar','£':'pound','€':'euro','¢':'cent'}[symbol];
      const scaleName=scale?({k:'thousand',m:'million',b:'billion',t:'trillion'}[scale.toLowerCase()]||scale.toLowerCase()):'';
      const rawValue=decimalValue(amount);
      if(rawValue!==null){
        for(const n of numberForms(amount))for(const u of [unit,unit+'s'])add(n+(scaleName?' '+scaleName:'')+' '+u);
        add(symbol+rawValue+(scaleName?' '+scaleName:''));
        if(scaleName){const multiplier={thousand:1e3,million:1e6,billion:1e9,trillion:1e12}[scaleName],expanded=Number(rawValue)*multiplier;if(Number.isSafeInteger(expanded))for(const f of forms(symbol+expanded))add(f);}
        if(!scaleName&&symbol!=='¢'&&/^\d+\.\d{1,2}$/.test(rawValue)){
          const [d,c]=rawValue.split('.'),cents=Number(c.padEnd(2,'0'));
          for(const join of [' ',' and '])for(const major of [d,spellInteger(+d)])for(const minor of [String(cents),spellInteger(cents)])add(major+' '+unit+(+d===1?'':'s')+join+minor+' cent'+(cents===1?'':'s'));
          if(+d===0&&symbol==='$'){add(cents+'¢');add(spellInteger(cents)+' cent'+(cents===1?'':'s'));}
        }
      }
    }
    // A currency/percent/unit following a digit may be separate caption slots.
    if((m=new RegExp('^('+NUM+')\\s+(dollars?|pounds?|euros?|cents?)$','i').exec(literal))){
      const sym={dollar:'$',pound:'£',euro:'€',cent:'¢'}[m[2].toLowerCase().replace(/s$/,'')];
      for(const f of forms(sym+m[1]))add(f);
    }
    if((m=new RegExp('^('+NUM+')\\s*(kg|km|cm|mm|mph|Hz|GB|MB|°C|°F)$','i').exec(literal))){
      const unit=m[2].toLowerCase();
      for(const n of numberForms(m[1]))for(const u of UNIT_FORMS[unit])add(n+' '+u);
      add(m[1]+unit);add(m[1]+' '+unit);
    }
    if((m=new RegExp('^('+NUM+')\\s+(hundred|thousand|million|billion|trillion)$','i').exec(literal))){
      for(const n of numberForms(m[1]))add(n+' '+m[2]);
      const multiplier={hundred:100,thousand:1000,million:1e6,billion:1e9,trillion:1e12}[m[2].toLowerCase()];
      const parsed=decimalValue(m[1]),number=Number(parsed)*multiplier;
      if(parsed!==null&&Number.isSafeInteger(number))for(const n of numberForms(String(number)))add(n);
    }
  }
  if(cache.size>=4096)cache.clear();cache.set(cacheKey,out);return out;
}
const NUM_WORDS=new Set([...SMALL,...TENS,...Object.values(ORDINAL),'hundred','thousand','million','billion','trillion','point','minus','negative','plus','oh','half','halves','quarter','quarters','thirds','fifths','eighths','tenths']);
const NUM_UNITS=new Set(['percent','per','cent','dollar','dollars','pound','pounds','euro','euros','cents','degree','degrees','celsius','fahrenheit','kilogram','kilograms','kilometer','kilometers','kilometre','kilometres','centimeter','centimeters','centimetre','centimetres','millimeter','millimeters','millimetre','millimetres','mile','miles','hour','hertz','gigabyte','gigabytes','megabyte','megabytes',"o'clock",'kg','km','cm','mm','mph','hz','gb','mb','%','$','£','€','¢']);
function numericRunEnd(input,pos){
  const numeric=s=>/[\d$£€¢%]/.test(s)||phraseKey(s).split(' ').every(w=>NUM_WORDS.has(w));
  const start=input[pos]?.toLowerCase();
  if(!numeric(start)&&!(start==='a'&&NUM_WORDS.has(input[pos+1]?.toLowerCase())))return pos+1;
  let end=pos+1;
  while(end<input.length){const s=input[end].toLowerCase(),next=input[end+1]?.toLowerCase();
    if(numeric(s)||NUM_UNITS.has(s)||((s==='and'||s==='a')&&next&&(numeric(next)||next==='a'))){end++;continue;}break;
  }
  return end;
}
const matcherCache=new Map();
function matcher(words,english) {
  const key=JSON.stringify([words,english]);if(matcherCache.has(key))return matcherCache.get(key);
  const map=new Map(), prefixes=new Set();
  for(let i=0;i<words.length;i++)for(let end=i+1;end<=Math.min(words.length,i+18);end++){
    const phrase=words.slice(i,end).join(' '),base=phraseKey(phrase);
    for(const alias of forms(phrase,english)){
      const entries=map.get(alias)||[];entries.push({start:i,end,base});map.set(alias,entries);
      if(alias!==base){const bits=alias.split(' ');for(let j=1;j<bits.length;j++)prefixes.add(bits.slice(0,j).join(' '));}
    }
  }
  const result={map,prefixes};if(matcherCache.size>=8)matcherCache.clear();matcherCache.set(key,result);return result;
}
export function submitWords(words,opened,answer,{deferIncomplete=false,language='en'}={}) {
  const next=[...opened],input=tokens(answer),english=language.split('-')[0]==='en',m=matcher(words,english);
  let matched=0,duplicate=0,missed=0,pending=false;const remaining=[];
  const cuts=new Set();
  if(english)for(let i=0;i<input.length;){const end=numericRunEnd(input,i);for(let j=i+1;j<end;j++)cuts.add(j);i=end;}
  // Space must not destroy a still-incomplete spoken-number/contraction alternative.
  if(deferIncomplete&&m.prefixes.has(phraseKey(input.join(' '))))return {opened:next,matched,duplicate,missed,complete:false,pending:true};
  for(let pos=0;pos<input.length;){
    if(deferIncomplete&&m.prefixes.has(phraseKey(input.slice(pos).join(' ')))){pending=true;remaining.push(...input.slice(pos));break;}
    let choice=null,used=0;
    const atomicEnd=english?numericRunEnd(input,pos):pos+1;
    for(let end=Math.min(input.length,pos+18);end>=atomicEnd;end--){
      if(cuts.has(end))continue;
      const phrase=input.slice(pos,end).join(' '),key=phraseKey(phrase),candidates=[];
      for(const f of forms(phrase,english))for(const c of m.map.get(f)||[])candidates.push(c);
      candidates.sort((a,b)=>Number(next.slice(b.start,b.end).some(v=>!v))-Number(next.slice(a.start,a.end).some(v=>!v))||Number(b.base===key)-Number(a.base===key)||(b.end-b.start)-(a.end-a.start)||a.start-b.start);
      if(candidates.length){choice=candidates[0];used=end-pos;break;}
    }
    if(choice){let changed=0;for(let i=choice.start;i<choice.end;i++)if(!next[i]){next[i]='solved';matched++;changed++;}if(!changed)duplicate+=used;pos+=used;}
    else{missed+=atomicEnd-pos;remaining.push(...input.slice(pos,atomicEnd));pos=atomicEnd;}
  }
  return {opened:next,matched,duplicate,missed,complete:next.length>0&&next.every(Boolean),pending,remaining:remaining.join(' ')};
}
