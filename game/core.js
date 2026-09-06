// Pure game state: no DOM, microphone, storage or practice-progress side effects.
export const THEMES = ['sky','neon','paper','space','sunset'];
export const normalize = s => String(s).normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,'');
const aliases = {mr:'mister',mrs:'missus',ok:'okay'};
const canonical = s => aliases[normalize(s)] || normalize(s);
export function equivalent(a,b) { return canonical(a) === canonical(b); }
const contractions = {"didn't":'did not',"don't":'do not',"doesn't":'does not',"can't":'can not',"won't":'will not',"isn't":'is not',"wasn't":'was not',"aren't":'are not',"weren't":'were not',"haven't":'have not',"hasn't":'has not',"hadn't":'had not',"couldn't":'could not',"wouldn't":'would not',"shouldn't":'should not',"i'm":'i am',"you're":'you are',"we're":'we are',"they're":'they are',"it's":'it is',"that's":'that is',"there's":'there is',"he's":'he is',"she's":'she is',"i've":'i have',"we've":'we have',"they've":'they have',"i'll":'i will',"you'll":'you will',"he'll":'he will',"she'll":'she will',"we'll":'we will',"they'll":'they will'};
export function matchWords(q, raw) {
  const entered = raw.trim().split(/\s+/).map(normalize).filter(Boolean);
  if (!entered.length) return {kind:'empty',indices:[]};
  const used = new Set(q.solved);
  const partial = structuredClone(q.partial || {});
  const indices = [];
  for (let p=0;p<entered.length;p++) {
    let i=q.words.findIndex((w,j)=>!used.has(j)&&equivalent(w,entered[p]));
    if(i>=0){ used.add(i);indices.push(i);continue; }
    let expanded = false;
    for(let j=0;j<q.words.length;j++) {
      const parts=contractions[normalize(q.words[j])]?.split(' ');
      if(!used.has(j)&&parts&&parts.every((w,k)=>equivalent(w,entered[p+k]))){used.add(j);indices.push(j);p+=parts.length-1;expanded=true;break;}
    }
    if(expanded)continue;
    const parts=contractions[entered[p]]?.split(' ');
    if(parts){
      for(let j=0;j<q.words.length;j++){
        if(parts.every((w,k)=>!used.has(j+k)&&equivalent(w,q.words[j+k]))){parts.forEach((_,k)=>{used.add(j+k);indices.push(j+k);});expanded=true;break;}
      }
    }
    if(!expanded){
      for(let j=0;j<q.words.length;j++){
        const parts=contractions[normalize(q.words[j])]?.split(' ');
        if(used.has(j)||!parts)continue;
        const done=partial[j]||[];
        const k=parts.findIndex((w,k)=>!done.includes(k)&&equivalent(w,entered[p]));
        if(k<0)continue;
        partial[j]=[...done,k];expanded=true;
        if(partial[j].length===parts.length){used.add(j);indices.push(j);delete partial[j];}
        break;
      }
    }
    if(!expanded)return {kind:q.words.some(w=>equivalent(w,entered[p]))||Object.entries(partial).some(([j,done])=>done.some(k=>equivalent(contractions[normalize(q.words[j])]?.split(' ')[k],entered[p])))?'duplicate':'wrong',indices:[]};
  }
  return {kind:'correct',indices,partial};
}
function distance(a,b){let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const n=[i];for(let j=1;j<=b.length;j++)n[j]=Math.min(n[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=n;}return row[b.length];}
function shape(s){return s.replace(/ph/g,'f').replace(/[ckq]/g,'k').replace(/[sz]/g,'s').replace(/[dt]/g,'t').replace(/[gj]/g,'j').replace(/[aeiouy]/g,'').replace(/(.)\1+/g,'$1');}
export function similarity(a,b){a=canonical(a);b=canonical(b);if(!a||!b)return 0;if(a===b)return 1;const x=shape(a),y=shape(b);return Math.max(0,(1-distance(a,b)/Math.max(a.length,b.length))*.7+(x&&y?1-distance(x,y)/Math.max(x.length,y.length):0)*.3);}
export function voiceMatch(q,word,settings){const exact=matchWords(q,word);if(exact.kind==='correct'||exact.kind==='duplicate')return exact;const distinct=new Map();q.words.forEach((w,i)=>{if(!q.solved.includes(i)&&!distinct.has(normalize(w)))distinct.set(normalize(w),{i,score:similarity(word,w)});});const ranked=[...distinct.values()].sort((a,b)=>b.score-a.score).slice(0,settings.beam);const b=ranked[0];return b&&b.score>=settings.threshold&&b.score-(ranked[1]?.score||0)>=settings.candidate?{kind:'correct',indices:[b.i]}:{kind:'wrong',indices:[]};}
export class Game {
  constructor(rows, difficulty='normal'){
    this.version=1;this.status='ready';this.elapsed=0;this.spawnAt=0;this.cursor=0;this.active=null;this.life=5;this.score=0;this.combo=0;this.best=0;this.difficulty=difficulty;
    this.wave=1;this.waveSize=5;this.restUntil=null;this.waveAnnounced=false;this.closeCalls=0;
    this.questions=rows.map((row,i)=>({...row,uid:`q${i}`,number:i+1,state:'queued',y:0,x:[.22,.72,.46,.77,.24][i%5],solved:[],hints:[],partial:{},draft:'',caret:0,audioDuration:row.audioDuration??row.duration,duration:Math.max(36,(row.audioDuration??row.duration)*2.5+16),fallTime:0}));
  }
  get current(){return this.questions.find(q=>q.uid===this.active&&q.state==='falling');}
  select(id){if(this.questions.some(q=>q.uid===id&&q.state==='falling'))this.active=id;}
  auto(){if(['over','clear'].includes(this.status)){this.active=null;return;}if(!this.current)this.active=this.questions.filter(q=>q.state==='falling').sort((a,b)=>b.y-a.y||a.number-b.number)[0]?.uid||null;}
  tick(dt){
    const events=[];if(this.status!=='running')return events;
    this.elapsed+=dt;const factor=this.difficulty==='relaxed'?.65:this.difficulty==='fast'?1.3:1;
    if(!this.waveAnnounced){events.push({type:'wave',wave:this.wave});this.waveAnnounced=true;}
    let boundary=Math.min(this.questions.length,this.wave*this.waveSize);
    if(this.cursor>=boundary&&!this.questions.some(q=>q.state==='falling')&&this.cursor<this.questions.length){
      if(this.restUntil===null){this.restUntil=this.elapsed+4;events.push({type:'rest',wave:this.wave});}
      if(this.elapsed>=this.restUntil){this.wave++;this.restUntil=null;this.spawnAt=this.elapsed;boundary=Math.min(this.questions.length,this.wave*this.waveSize);events.push({type:'wave',wave:this.wave});}
    }
    if(this.restUntil===null&&this.cursor<boundary&&this.elapsed>=this.spawnAt&&this.questions.filter(q=>q.state==='falling').length<5){const q=this.questions[this.cursor++];q.state='falling';q.spawnedAt=this.elapsed;q.speed=factor*Math.min(1.3,1+(this.wave-1)*.07);this.spawnAt=this.elapsed+Math.max(5,8-(this.wave-1)*.65)/factor;events.push({type:'spawn',q});}
    for(const q of this.questions){if(q.state!=='falling')continue;q.fallTime+=Math.min(dt,this.elapsed-(q.spawnedAt||0));q.y=q.fallTime*q.speed/q.duration;if(q.y>=1){q.state='missed';this.life=Math.max(0,this.life-1);this.combo=0;events.push({type:'miss',q});if(this.life===0){this.status='over';this.active=null;break;}}}
    this.auto();this.checkEnd();return events;
  }
  checkEnd(){if(this.status==='running'&&this.cursor===this.questions.length&&!this.questions.some(q=>q.state==='falling')){this.status='clear';this.active=null;}}
  mark(indices,hint=false){
    const q=this.current;if(!q||this.status!=='running')return null;
    for(const i of indices){if(!q.solved.includes(i)&&i>=0&&i<q.words.length){q.solved.push(i);if(hint)q.hints.push(i);}}
    if(q.solved.length!==q.words.length)return null;
    // Resolve before playing the arrow animation: a solved bubble cannot land.
    q.state='solved';q.reward={points:0,closeCall:false,repelled:[],combo:0};
    if(!q.hints.length){
      this.combo++;this.best=Math.max(this.best,this.combo);
      q.reward.closeCall=q.y>=.85;
      if(q.reward.closeCall)this.closeCalls++;
      q.reward.points=100+Math.min(100,(this.combo-1)*10)+(q.reward.closeCall?50:0);
      q.reward.combo=this.combo;this.score+=q.reward.points;
      for(const other of this.questions){
        if(other.state!=='falling'||Math.hypot((other.x-q.x)*.65,other.y-q.y)>.42)continue;
        const before=other.y;other.y=Math.max(0,other.y-(.12+Math.min(5,this.combo)*.02));
        other.fallTime=other.y*other.duration/other.speed;
        if(other.y<before)q.reward.repelled.push(other.uid);
      }
    }else this.combo=0;
    this.active=null;this.auto();this.checkEnd();return q;
  }
  skip(){const q=this.current;if(!q||this.status!=='running')return null;q.state='missed';this.life=Math.max(0,this.life-1);this.combo=0;this.active=null;if(!this.life)this.status='over';else this.auto();this.checkEnd();return q;}
  static restore(data){if(data?.version!==1||!Array.isArray(data.questions)||data.questions.length>20||!data.questions.every(q=>Array.isArray(q.words)&&Array.isArray(q.solved)&&Number.isFinite(q.y)))throw Error('Invalid saved round');const g=Object.assign(Object.create(Game.prototype),data);g.waveSize=5;g.wave=Math.max(1,g.wave||Math.ceil(g.cursor/5));g.restUntil=g.restUntil??null;g.waveAnnounced=true;g.closeCalls=g.closeCalls||0;if(['running','ready','paused'].includes(g.status))g.status='paused';return g;}
}
