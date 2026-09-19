const examples=document.querySelector('#examples');
const models=document.querySelector('#models');
const progress=document.querySelector('#progress');
let rendered='';
const sceneMode=new URLSearchParams(location.search).get('set')==='soulx-scenes';
const sceneSamples=[
  ['restaurant','Busy restaurant','US male · US female'],
  ['street','Street traffic','UK male · UK female'],
  ['station','Train station','US male · UK female'],
  ['car','Inside a moving car','US male · UK male'],
  ['kitchen','Busy kitchen','US female · UK female'],
  ['gaming','Gaming headsets','US male · US female'],
];
let sceneCards=[];
async function loadScenes(){
  if(!sceneCards.length){
    document.title='DictAI · SoulX scene samples';
    document.querySelector('h1').textContent='SoulX · Scene samples';
    const grid=document.createElement('section');grid.className='audio-grid';
    grid.setAttribute('aria-label','Scene audio samples');
    document.querySelector('.table-scroll').replaceWith(grid);
    const note=document.createElement('p');note.className='scene-note';
    note.textContent='Scene-matched references · No added ambience · Listen for noise changes between speakers.';
    grid.before(note);
    sceneCards=sceneSamples.map(([id,title,speakers],index)=>{
      const card=document.createElement('article');
      const heading=document.createElement('h2');heading.textContent=String(index+1).padStart(2,'0')+' · '+title;
      const metadata=document.createElement('p');metadata.textContent=speakers;
      const audio=document.createElement('audio');audio.controls=true;audio.preload='metadata';
      audio.setAttribute('aria-label',title+', '+speakers);
      const status=document.createElement('p');status.className='sample-status';status.textContent='Checking audio…';
      audio.addEventListener('error',()=>{status.textContent='Could not play audio. Reload to retry.';});
      card.append(heading,metadata,audio,status);grid.append(card);
      return {audio,status,url:'/tts-eval/audio/soulx-scenes/'+id+'.wav',ready:false};
    });
  }
  await Promise.all(sceneCards.map(async card=>{
    if(card.ready)return;
    try{
      // Range GET works even when the audio endpoint does not expose HEAD.
      const response=await fetch(card.url,{headers:{Range:'bytes=0-43'},cache:'no-store'});
      const ok=response.ok;await response.body?.cancel();
      if(ok){card.audio.src=card.url;card.ready=true;card.status.textContent='';}
      else card.status.textContent='Not available yet';
    }catch{card.status.textContent='Could not load audio. Retrying…';}
  }));
  progress.textContent=`${sceneCards.filter(card=>card.ready).length} / ${sceneCards.length} ready`;
}
document.addEventListener('play',event=>{
  if(event.target.tagName==='AUDIO')document.querySelectorAll('audio').forEach(audio=>{if(audio!==event.target)audio.pause();});
},true);
async function load(){
  if(sceneMode)return loadScenes();
  const response=await fetch('/tts-eval/manifest.json?v='+Date.now());
  if(!response.ok)throw new Error('Manifest unavailable');
  const manifest=await response.json();
  const signature=JSON.stringify(manifest);
  if(signature===rendered || [...document.querySelectorAll('audio')].some(audio=>!audio.paused))return;
  models.replaceChildren();examples.replaceChildren();
  const heading=document.createElement('tr');
  ['Dialogue',...manifest.models.map(model=>model.name)].forEach(name=>{
    const cell=document.createElement('th');cell.scope='col';cell.textContent=name;heading.append(cell);
  });models.append(heading);
  let ready=0;
  manifest.examples.forEach((row,index)=>{
    const tr=document.createElement('tr');const label=document.createElement('th');label.scope='row';
    label.textContent=String(index+1).padStart(2,'0')+' · '+row.level;
    const category=document.createElement('small');category.textContent=row.category;label.append(category);tr.append(label);
    manifest.models.forEach(model=>{
      const cell=document.createElement('td');
      if(row.ready_models.includes(model.id)){
        const audio=document.createElement('audio');audio.controls=true;audio.preload='none';
        audio.src='/tts-eval/audio/'+encodeURIComponent(model.id)+'/'+encodeURIComponent(row.id)+'.wav';
        audio.setAttribute('aria-label',`${model.name}, dialogue ${index+1}`);cell.append(audio);ready++;
      }else{cell.textContent='Pending';cell.className='pending';}
      tr.append(cell);
    });examples.append(tr);
  });
  progress.textContent=`${ready} / ${manifest.examples.length*manifest.models.length} ready`;rendered=signature;
}
load().catch(()=>progress.textContent='Could not load audio list');
setInterval(()=>load().catch(()=>{}),15000);
