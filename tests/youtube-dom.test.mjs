import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const html=await readFile(new URL('../youtube-ui/youtube.html',import.meta.url),'utf8');
const dom=new JSDOM(html,{url:'https://192.168.0.68:8775/youtube',pretendToBeVisual:true});
const {window}=dom;
Object.assign(globalThis,{window,document:window.document,location:window.location,localStorage:window.localStorage,matchMedia:()=>({matches:true})});
window.matchMedia=globalThis.matchMedia;
window.HTMLElement.prototype.scrollIntoView=()=>{};
let apiCalls=0,playerInstances=0,lastPlayer,rangeTool;
const data={video_id:'jNQXAC9IVRw',title:'Caption fixture',language:'en',version:'fixture1',count:3,end:15,source:'youtube',start_hint:0,tracks:[{code:'en',name:'English'}],segments:[{id:0,start:1,end:4,text:'I saw a bird.'},{id:1,start:5,end:9,text:"Mr. Green didn't leave."},{id:2,start:12,end:15,text:'The bird came back.'}]};
globalThis.fetch=async(url,options)=>{if(url.endsWith('/names'))return {ok:true,json:async()=>({indices:[0,1]})};apiCalls++;return {ok:true,json:async()=>data};};
window.YT={PlayerState:{PLAYING:1,PAUSED:2,BUFFERING:3,ENDED:0},Player:class{
  constructor(id,options){playerInstances++;this.options=options;this.position=0;this.status=2;this.node=document.getElementById(id);assert.ok(this.node,'Mount must exist even after switching videos');lastPlayer=this;queueMicrotask(()=>options.events.onReady());}
  destroy(){this.node.remove();}
  getAvailablePlaybackRates(){return [.75,1,1.25];}
  pauseVideo(){this.status=2;}
  cueVideoById(clip){this.cue=clip;this.position=clip.startSeconds;}
  loadVideoById(clip){this.loaded=clip;this.position=clip.startSeconds;this.status=1;this.options.events.onStateChange({data:1});}
  getPlayerState(){return this.status;}
  getCurrentTime(){return this.position;}
  setPlaybackRate(value){this.rate=value;}
}};
globalThis.YT=window.YT;
document.modelContext={registerTool(tool){rangeTool=tool;}};
await import('../youtube-ui/youtube.js');
const $=id=>document.getElementById(id);
const submit=id=>$(id).dispatchEvent(new window.Event('submit',{cancelable:true,bubbles:true}));
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
$('videoUrl').value='https://youtu.be/jNQXAC9IVRw';submit('importForm');await tick();
assert.equal(apiCalls,1);assert.equal($('workspace').hidden,false);assert.equal($('wordGrid').children.length,4);assert.equal($('replayButton').disabled,false);
assert.ok(!$('timeline').textContent.includes('I saw a bird.'),'Script is hidden by default');
$('playbackButtons').querySelector('[data-rate="1"]').click();assert.equal(lastPlayer.loaded.videoId,data.video_id);assert.equal(lastPlayer.loaded.startSeconds,.88);assert.equal(lastPlayer.loaded.endSeconds,4.12);
$('playbackButtons').querySelector('[data-rate="0.75"]').click();assert.equal(lastPlayer.rate,.75);assert.equal($('playbackButtons').querySelector('[data-rate="0.75"]').getAttribute('aria-pressed'),'true');
$('answerInput').value='I saw a bird';submit('answerForm');assert.equal($('againButton').hidden,false);assert.equal($('nextButton').hidden,false);assert.equal($('answerInputWrap').hidden,true);assert.ok($('answerEntry').classList.contains('is-completing'));
$('nextButton').click();assert.equal($('clipCounter').textContent,'2 / 3');assert.equal($('answerInputWrap').hidden,false);
$('answerInput').value='Mr';submit('answerForm');assert.equal($('wordGrid').children[0].classList.contains('solved'),true);
$('answerInput').value='Mr';submit('answerForm');assert.equal($('answerInput').value,'Mr');assert.equal($('answerFeedback').textContent,'Already entered.');
$('giveUpButton').click();assert.equal($('nextButton').hidden,false);assert.ok($('captionAnswer').textContent.includes("Mr. Green didn't"));
$('againButton').click();assert.equal($('wordGrid').querySelectorAll('.solved,.revealed').length,0);
$('answerInput').value='typed draft';$('namesButton').click();await tick();assert.equal($('wordGrid').querySelectorAll('.revealed').length,2);assert.equal($('answerInput').value,'typed draft');
$('rangeStart').value='0:05';$('rangeEnd').value='0:14';submit('rangeForm');assert.equal($('clipCounter').textContent,'1 / 2');
$('forwardClip').click();assert.equal($('clipCounter').textContent,'2 / 2');
$('giveUpButton').click();assert.equal($('nextButton').disabled,true);assert.equal($('nextButton').textContent,'Range complete ✓');
const saved=JSON.parse(localStorage.getItem('dictai:youtube:v1:jNQXAC9IVRw:en:fixture1'));assert.equal(saved.index,2);assert.equal(saved.start,5);
$('showScript').checked=true;$('showScript').dispatchEvent(new window.Event('change'));assert.ok($('timeline').textContent.includes('I saw a bird.'));
assert.throws(()=>rangeTool.execute({startSeconds:7,endSeconds:2}));assert.equal($('clipCounter').textContent,'2 / 2');
assert.equal(rangeTool.execute({startSeconds:0,endSeconds:10}).clips,2);
// A second import must recreate the iframe mount after destroy.
submit('importForm');await tick();assert.equal(playerInstances,2);assert.equal($('replayButton').disabled,false);
$('forwardClip').click();$('answerInput').value='Green';submit('answerForm');
window.dispatchEvent(new window.Event('pagehide'));
const storage=Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).map(key=>[key,localStorage.getItem(key)]);
dom.window.close();
const restored=new JSDOM(html,{url:'https://192.168.0.68:8775/youtube',pretendToBeVisual:true});
Object.assign(globalThis,{window:restored.window,document:restored.window.document,location:restored.window.location,localStorage:restored.window.localStorage});
for(const [key,value] of storage)localStorage.setItem(key,value);
restored.window.YT=globalThis.YT;
await import('../youtube-ui/youtube.js?restored=1');await tick();
assert.equal(apiCalls,2,'Refresh restores the transcript without refetching');
assert.equal($('clipCounter').textContent,'2 / 2');
assert.equal($('wordGrid').children[1].textContent,'Green');
assert.ok($('wordGrid').children[1].classList.contains('revealed'));
restored.window.dispatchEvent(new restored.window.Event('pagehide'));restored.window.close();
console.log('DOM unit checks passed: import, script visibility, video segment bounds, matching, duplicates, reveal, Again/Next, range, persistence, second player mount, optional tool action. YouTube is mocked; not a real playback test.');
