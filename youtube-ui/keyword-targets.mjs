// Deterministic, browser-local keyword selection. The original caption remains untouched.
export const KEYWORD_VERSION = 1;

const WORD = /Ph\.D\.|(?:[A-Za-z]\.){2,}|(?:Mr|Mrs|Ms|Dr|Prof|Jr|Sr|St)\.|\d{1,2}(?::\d{2})?[aApP]\.?[mM]\.?|[vV]\d+(?:\.\d+)+|[$£€¢]?(?:[+−-]\s*)?(?:\d[\d,]*(?:(?:[.:/⁄-])\d+)*|\.\d+)(?:[eE][+-]?\d+)?(?:%|¢|°[CF]|[-']?[\p{L}]+(?:[\p{N}]|-[\p{L}\p{N}]+)*)?|[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*|[%$£€¢]/gu;
const tokens = text => [...String(text).normalize('NFKC').replace(/[’‘]/g,"'").matchAll(WORD)].map(match=>match[0]);
const base = word => word.toLowerCase().replace(/^['-]+|['-]+$/g,'').replace(/(?:'s|s')$/,'');

const FUNCTION = new Set(`a an the this that these those i me my mine myself you your yours yourself he him his himself she her hers herself it its itself we us our ours ourselves they them their theirs themselves who whom whose which what when where why how and or but nor so yet if then than as at by for from in into of on onto out over under with without through during before after above below between among around against about to up down off again further here there now today tomorrow yesterday all any both each few many much more most other some such no not only own same too very can could may might must shall should will would do does did have has had having be am is are was were been being gonna wanna gotta let lets please yes yeah yep nope okay ok oh ah uh um hmm well like actually basically literally just also even ever never already still perhaps maybe really kind sorta kind-of sort-of`.split(/\s+/));
const AUX_CONTRACTIONS = new Set(["can't","cannot","won't","shan't","don't","doesn't","didn't","isn't","aren't","wasn't","weren't","haven't","hasn't","hadn't","couldn't","wouldn't","shouldn't","mustn't","needn't","i'm","you're","we're","they're","he's","she's","it's","i've","you've","we've","they've","i'll","you'll","he'll","she'll","it'll","we'll","they'll"]);
const FILLERS = new Set(['er','erm','huh','mm','mmm','uh-huh','mhm','wow','hey','hello','hi','bye','thanks','thank']);
const TITLES = new Set(['mr.','mrs.','ms.','dr.','prof.','jr.','sr.','st.']);

const VERBS = new Set(`accept achieve act add admit agree allow answer appear apply argue arrive ask avoid become begin believe bring build buy call carry cause change check choose come compare consider continue control create cut decide describe develop die discover discuss draw drive eat end enjoy explain fall feel fill find finish follow forget get give go grow happen hear help hold hope include increase jump keep kill know learn leave listen live look lose love make mean meet move need offer open order pay pick plan play prepare produce provide put reach read realize receive remember remove repeat report require return run say see seem sell send set show sit sleep speak spend stand start stay stop study suggest support take talk teach tell think travel try turn understand use wait walk want watch win work write`.split(/\s+/));
const IRREGULAR_VERBS = new Map(Object.entries({ate:'eat',became:'become',began:'begin',bought:'buy',brought:'bring',built:'build',came:'come',chose:'choose',cut:'cut',drew:'draw',drank:'drink',drove:'drive',fell:'fall',felt:'feel',found:'find',forgot:'forget',gave:'give',got:'get',grew:'grow',heard:'hear',held:'hold',kept:'keep',knew:'know',learned:'learn',learnt:'learn',left:'leave',lost:'lose',made:'make',meant:'mean',met:'meet',paid:'pay',put:'put',ran:'run',read:'read',said:'say',saw:'see',sold:'sell',sent:'send',slept:'sleep',spoke:'speak',spent:'spend',stood:'stand',took:'take',taught:'teach',told:'tell',thought:'think',understood:'understand',went:'go',won:'win',woke:'wake',wrote:'write'}));
const ADJECTIVES = new Set(`able afraid alive amazing angry available bad basic beautiful best better big black blue brave bright busy careful certain cheap clear cold common complete correct dark dead deep different difficult dirty early easy empty exciting fair famous fast fine free fresh full funny good great green happy hard healthy heavy high hot huge important impossible interesting kind large late light little local long low main modern natural new nice old open perfect poor popular possible public quick quiet ready real red right safe serious short simple slow small special strange strong sure sweet tall terrible tiny true useful warm white whole wonderful wrong young`.split(/\s+/));
const NOUN_SUFFIX = /(?:tion|sion|ment|ness|ity|ship|ance|ence|ism|ist|er|or|age|hood|dom|ure|ery|ry)$/;
const VERB_SUFFIX = /(?:ate|ify|ise|ize|en|ing|ed)$/;
const ADJ_SUFFIX = /(?:able|ible|al|ary|ful|ic|ical|ish|ive|less|ory|ous|y)$/;
const NUMBER_WORDS = new Set(`zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion trillion first second third fourth fifth sixth seventh eighth ninth tenth`.split(/\s+/));
const PHRASAL = new Set([
  'ask for','back up','break down','bring back','bring up','call back','carry on','carry out',
  'check in','check out','come back','come in','come out','come up','deal with','end up',
  'fall apart','fill in','fill out','find out','get back','get in','get out','get up',
  'give back','give up','go back','go on','grow up','hang on','keep on','leave out',
  'look after','look at','look for','look into','look out','make up','move on','pay back',
  'pick up','point out','put away','put down','put on','put out','put up','run out',
  'set up','show up','sit down','stand up','take away','take back','take off','take out',
  'talk about','think about','throw away','turn down','turn off','turn on','turn out',
  'wake up','walk away','work on','work out','write down',
]);

function verbLemma(word) {
  if(VERBS.has(word))return word;
  if(IRREGULAR_VERBS.has(word))return IRREGULAR_VERBS.get(word);
  if(word.endsWith('ies')&&VERBS.has(word.slice(0,-3)+'y'))return word.slice(0,-3)+'y';
  if(word.endsWith('es')&&VERBS.has(word.slice(0,-2)))return word.slice(0,-2);
  if(word.endsWith('s')&&VERBS.has(word.slice(0,-1)))return word.slice(0,-1);
  if(word.endsWith('ied')&&VERBS.has(word.slice(0,-3)+'y'))return word.slice(0,-3)+'y';
  if(word.endsWith('ed')){
    if(VERBS.has(word.slice(0,-2)))return word.slice(0,-2);
    if(VERBS.has(word.slice(0,-1)))return word.slice(0,-1);
  }
  if(word.endsWith('ing')){
    if(VERBS.has(word.slice(0,-3)))return word.slice(0,-3);
    if(VERBS.has(word.slice(0,-3)+'e'))return word.slice(0,-3)+'e';
  }
  return '';
}

function classify(surface,index,list) {
  const raw=surface.toLowerCase(),word=base(surface),previous=base(list[index-1]||'');
  if(!word||AUX_CONTRACTIONS.has(raw)||FILLERS.has(word))return null;
  const previousVerb=verbLemma(previous);
  if(previousVerb&&PHRASAL.has(`${previousVerb} ${word}`))return {kind:'particle',score:8.6};
  if(FUNCTION.has(word))return null;
  if(TITLES.has(raw))return index+1<list.length?{kind:'proper',score:10}:null;
  if(/\d|[$£€¢%]/.test(surface))return {kind:'number',score:11};
  if(NUMBER_WORDS.has(word))return {kind:'number',score:10.5};
  if(/^(?:[A-Z]\.){2,}$/.test(surface)||(/^[A-Z\d]{2,}$/.test(surface)&&/[A-Z]/.test(surface)))return {kind:'proper',score:11};
  if((index>0&&/^\p{Lu}/u.test(surface))||TITLES.has((list[index-1]||'').toLowerCase()))return {kind:'proper',score:10};
  if(verbLemma(word))return {kind:'verb',score:8.8};
  if(ADJECTIVES.has(word))return {kind:'adjective',score:8.1};
  if(word.endsWith('ly'))return null;
  if(VERB_SUFFIX.test(word))return {kind:'verb',score:8.8};
  if(ADJ_SUFFIX.test(word))return {kind:'adjective',score:8.1};
  if(NOUN_SUFFIX.test(word))return {kind:'noun',score:8.5};
  if(/^\p{L}[\p{L}\p{N}'-]{2,}$/u.test(surface))return {kind:'noun',score:7.2};
  return null;
}

export function selectKeywordTokens(text) {
  const list=tokens(text);
  const candidates=list.map((surface,index)=>({surface,index,...classify(surface,index,list)})).filter(item=>item.kind);
  if(!candidates.length)return list.slice(0,1);
  const desired=Math.min(6,candidates.length);
  const selected=[];
  const take=item=>{if(item&&!selected.some(chosen=>chosen.index===item.index))selected.push(item);};
  // When present, seed the result with the core lexical categories instead of
  // allowing a run of names or modifiers to consume every target.
  for(const family of [['noun','proper','number'],['verb'],['adjective']]){
    take(candidates.filter(item=>family.includes(item.kind)).sort((a,b)=>b.score-a.score||a.index-b.index)[0]);
    if(selected.length===desired)break;
  }
  while(selected.length<desired){
    const remaining=candidates.filter(item=>!selected.some(chosen=>chosen.index===item.index));
    if(!remaining.length)break;
    remaining.sort((a,b)=>{
      const distance=item=>selected.length?Math.min(...selected.map(chosen=>Math.abs(chosen.index-item.index))):0;
      return (b.score+Math.min(distance(b),5)*.12)-(a.score+Math.min(distance(a),5)*.12)||a.index-b.index;
    });
    take(remaining[0]);
  }
  // If a selected lexical verb has a known adjacent particle, keep the phrase
  // intact when capacity allows ("find out", "turn off", ...).
  for(const item of [...selected]){
    if(item.kind!=='verb'||selected.length>=6)continue;
    take(candidates.find(candidate=>candidate.index===item.index+1&&candidate.kind==='particle'));
  }
  return selected.sort((a,b)=>a.index-b.index).slice(0,6).map(item=>item.surface);
}

export const keywordText = text => selectKeywordTokens(text).join(' ');
