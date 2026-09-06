// Decorative motion owns no answer, typing, collision or scoring state.
const $=id=>document.getElementById(id);
const get=(key,fallback)=>{try{return localStorage.getItem(key)||fallback;}catch{return fallback;}};
export class Motion {
  constructor(){
    this.animations=new Set();this.paused=true;this.oscillators=new Set();document.body.dataset.running='false';
    this.reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.level=get('dictai-game-effects','normal');this.sound=false;
    this.applyLevel(this.level);
    this.reduced?.addEventListener?.('change',()=>this.applyLevel(this.level));
    for(let i=0;i<12;i++){
      const p=document.createElement('i');p.className='ambient-dot';
      p.style.left=(7+i*29%90)+'%';p.style.top=(12+i*17%72)+'%';
      p.style.animationDelay=(-i*1.71)+'s';p.style.animationDuration=(8+i%5*3)+'s';
      $('atmosphere').append(p);
    }
  }
  applyLevel(level){
    this.level=['low','normal','rich'].includes(level)?level:'normal';
    document.body.dataset.effects=this.reduced?.matches?'low':this.level;
    for(const id of ['effectLevel','pauseEffects'])$(id).value=this.level;
    try{localStorage.setItem('dictai-game-effects',this.level);}catch{}
  }
  setPaused(paused){
    document.body.dataset.running=String(!paused);
    if(this.paused===paused)return;this.paused=paused;
    for(const a of this.animations){if(paused)a.pause?.();else a.play?.();}
    if(paused)this.silence();
  }
  animate(el,frames,options,finish=()=>{}){
    const low=document.body.dataset.effects==='low';
    const a=el.animate(frames,{...options,duration:low?Math.min(160,options.duration):options.duration});
    this.animations.add(a);if(this.paused)a.pause?.();
    a.onfinish=()=>{this.animations.delete(a);finish();};
    a.oncancel=()=>this.animations.delete(a);return a;
  }
  clear(){for(const a of this.animations)a.cancel?.();this.animations.clear();$('uiEffects').replaceChildren();$('effects').replaceChildren();this.silence();}
  decorate(button,q){
    const actor=document.createElement('span');actor.className='actor';
    actor.style.animationDelay=(-q.number*.73)+'s';
    actor.style.animationDuration=(2.4+q.number%4*.43)+'s';
    const open=document.createElement('span');open.className='sprite s'+q.number%4;
    const blink=document.createElement('span');blink.className='sprite blink-frame s'+q.number%4;
    blink.style.animationDelay=(-q.number*1.17)+'s';blink.style.animationDuration=(3.1+q.number%5*.71)+'s';
    actor.append(open,blink);button.append(actor);
  }
  node(className,text='',parent=$('effects')){const el=document.createElement('span');el.className=className;el.textContent=text;parent.append(el);return el;}
  origins(indices){const box=$('cabinet').getBoundingClientRect();return indices.map(i=>{
    const el=document.getElementById('word-'+i);const r=el?.getBoundingClientRect();
    return r?{x:r.left+r.width/2-box.left,y:r.top+r.height/2-box.top}:null;
  }).filter(Boolean);}
  charge(origins,q,indices,hint=false){
    const rect=$('launcher').getBoundingClientRect(),box=$('cabinet').getBoundingClientRect();
    const x=rect.left+rect.width/2-box.left,y=rect.top+rect.height/2-box.top;
    origins.slice(0,8).forEach((p,n)=>{
      const orb=this.node('charge-orb'+(hint?' hinted':''),'',$('uiEffects'));
      this.animate(orb,[{left:p.x+'px',top:p.y+'px',opacity:1,transform:'scale(.5)'},{left:(p.x+x)/2+'px',top:Math.min(p.y,y)-35+'px',opacity:1,transform:'scale(1.2)'},{left:x+'px',top:y+'px',opacity:0,transform:'scale(.3)'}],{duration:280,delay:n*25,easing:'ease-in'},()=>orb.remove());
    });
    for(const i of indices){const el=$('word-'+i);if(el)this.animate(el,[{transform:'scale(.91)',filter:'brightness(1.5)'},{transform:'scale(1.09)'},{transform:'scale(1)',filter:'brightness(1)'}],{duration:280,easing:'ease-out'});}
    this.animate($('launcher'),[{scale:'.9'},{scale:'1.16'},{scale:'1'}],{duration:280});
    const bubble=$('bubble-'+q.uid);if(bubble)this.animate(bubble,[{scale:'1'},{scale:'1.07'},{scale:'1'}],{duration:240});
  }
  update(game){
    this.setPaused(!game||!['running','clear','over'].includes(game.status));
    const q=game?.current,ratio=q?q.solved.length/q.words.length:0;
    $('launcher').style.setProperty('--power',ratio);
    $('launcher').classList.toggle('charged',!!q&&q.words.length-q.solved.length===1);
    $('powerText').textContent=q?`${Math.round(ratio*100)}%`:'0%';
    $('powerRing').style.background=`conic-gradient(var(--bright) ${ratio*360}deg, #ffffff24 0)`;
    const dangerous=game?.questions.filter(x=>x.state==='falling'&&x.y>.78)||[];
    $('dangerZone').classList.toggle('visible',dangerous.length>0);
    $('wave').textContent=game?game.restUntil!==null?`BREATHER · ${Math.max(0,Math.ceil(game.restUntil-game.elapsed))}s`:`WAVE ${game.wave} / ${Math.ceil(game.questions.length/5)}`:'WAVE 1';
    $('arena').style.setProperty('--daylight',String(game?(Math.sin(game.elapsed/32)+1)*.045:0));
    for(const bubble of game?.questions||[]){const el=$('bubble-'+bubble.uid);if(el){el.classList.toggle('nearly-solved',bubble.state==='falling'&&bubble.words.length-bubble.solved.length===1);el.style.setProperty('--danger',Math.max(0,(bubble.y-.78)/.22));}}
  }
  banner(text){
    const el=this.node('arcade-banner',text);
    this.animate(el,[{opacity:0,transform:'translate(-50%,-20px) scale(.8)'},{opacity:1,transform:'translate(-50%,0) scale(1)',offset:.16},{opacity:1,offset:.7},{opacity:0,transform:'translate(-50%,8px) scale(1)'}],{duration:1500},()=>el.remove());
  }
  launch(q,p){
    const target=$('bubble-'+q.uid);target?.classList.add('resolving');
    this.animate($('launcher'),[{rotate:'0deg',scale:'1'},{rotate:'-17deg',scale:'.8',offset:.35},{rotate:'12deg',scale:'1.2',offset:.5},{rotate:'0deg',scale:'1'}],{duration:430});
    const arrow=this.node('power-arrow','➶');
    this.animate(arrow,[{left:'50%',top:'100%',opacity:0,transform:'scale(.6)',offset:0},{left:'50%',top:'100%',opacity:1,transform:'scale(1.5)',offset:.28},{left:p.x+'px',top:p.y+'px',opacity:1,transform:'scale(1)'}],{duration:560,easing:'cubic-bezier(.3,0,.8,.6)'},()=>{
      arrow.remove();
      if(target)this.animate(target,[{scale:'1'},{scale:'.78'},{scale:'1.35',opacity:1},{scale:'1.6',opacity:0}],{duration:240},()=>target.remove());
      this.impact(p,q.reward?.combo||0);
      const reward=q.reward||{points:0};this.floatText(p,reward.points?`+${reward.points}`:'✦');
      if(reward.closeCall)this.banner('CLOSE CALL! +50');
      else if(reward.combo>1)this.banner(`COMBO ×${reward.combo}`);
      for(const id of reward.repelled||[]){const b=$('bubble-'+id);if(b)this.animate(b,[{filter:'brightness(1)'},{filter:'brightness(1.8)'},{filter:'brightness(1)'}],{duration:420});}
    });
  }
  impact(p,combo=0){
    const ring=this.node('impact-ring');ring.style.left=p.x+'px';ring.style.top=p.y+'px';
    this.animate(ring,[{transform:'translate(-50%,-50%) scale(.1)',opacity:1},{transform:'translate(-50%,-50%) scale(2.8)',opacity:0}],{duration:500},()=>ring.remove());
    const count=document.body.dataset.effects==='low'?4:document.body.dataset.effects==='rich'?22:12;
    for(let i=0;i<count;i++){
      const star=this.node('spark',i%3?'✦':'▪');star.style.color=['#ffe567','#fff','#ff76b8','#65eaff'][i%4];
      const angle=i/count*Math.PI*2,radius=35+Math.min(combo,5)*5+i%3*13;
      this.animate(star,[{left:p.x+'px',top:p.y+'px',opacity:1,transform:'scale(.5)'},{left:p.x+Math.cos(angle)*radius+'px',top:p.y+Math.sin(angle)*radius+'px',opacity:0,transform:`rotate(${i*37}deg) scale(1)`}],{duration:550+i%3*100,easing:'ease-out'},()=>star.remove());
    }
  }
  floatText(p,text){const el=this.node('reward-float',text);el.style.left=p.x+'px';el.style.top=p.y+'px';this.animate(el,[{opacity:0,transform:'translate(-50%,0) scale(.8)'},{opacity:1,transform:'translate(-50%,-15px) scale(1.1)',offset:.2},{opacity:0,transform:'translate(-50%,-65px) scale(1)'}],{duration:1000},()=>el.remove());}
  tone(progress,allowed){
    if(!this.sound||!allowed||this.paused)return;
    try{this.ctx??=new AudioContext();void this.ctx.resume();const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type='sine';o.frequency.setValueAtTime(390+progress*500,this.ctx.currentTime);g.gain.setValueAtTime(.035,this.ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,this.ctx.currentTime+.1);o.connect(g);g.connect(this.ctx.destination);this.oscillators.add(o);o.onended=()=>this.oscillators.delete(o);o.start();o.stop(this.ctx.currentTime+.11);}catch{}
  }
  silence(){for(const o of this.oscillators){try{o.stop();}catch{}}this.oscillators.clear();}
}
