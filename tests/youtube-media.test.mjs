import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const template=await readFile(new URL('../practice-ui/index.html',import.meta.url),'utf8');
const fragment=await readFile(new URL('../youtube-ui/youtube.html',import.meta.url),'utf8');
const app=await readFile(new URL('../practice-ui/app.js',import.meta.url),'utf8');
const html=template.replace('<main class="page" id="practice">',fragment+'<main class="page" id="practice">').replace('<div class="listen-stage">','<div class="youtube-navigation"><span id="clipTime"></span></div><div class="listen-stage">');
const dom=new JSDOM(html,{url:'https://192.168.0.68:8775/youtube?embed=1',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,d=w.document;
Object.assign(globalThis,{window:w,document:d,location:w.location,localStorage:w.localStorage});
w.matchMedia=()=>({matches:true});w.HTMLElement.prototype.scrollIntoView=()=>{};
w.HTMLMediaElement.prototype.pause=()=>{};w.HTMLMediaElement.prototype.load=()=>{};
w.HTMLCanvasElement.prototype.getContext=()=>({measureText:t=>({width:t.length*10})});
let engineLoads=0,modelLoads=0,imports=0,players=0,lastPlayer,openedURL;
w.open=url=>{openedURL=url;};
const append=d.body.append.bind(d.body);
d.body.append=(...nodes)=>{
  append(...nodes);
  for(const node of nodes){
    if(node.tagName==='SCRIPT'&&node.src.includes('/practice/app.js')) {engineLoads++;w.eval(app);queueMicrotask(()=>node.onload());}
    if(node.tagName==='SCRIPT'&&node.src.includes('/practice/persistent-model-loader.js'))modelLoads++;
  }
};
globalThis.fetch=async(path)=>{
  imports++;throw new Error('No transcript or exercise API requests allowed: '+path);
};w.fetch=globalThis.fetch;
w.YT={PlayerState:{PLAYING:1,PAUSED:2,BUFFERING:3,ENDED:0},Player:class{
  constructor(id,options){this.options=options;this.node=d.getElementById(id);assert.ok(this.node);this.status=2;this.position=0;lastPlayer=this;players++;queueMicrotask(()=>options.events.onReady());}
  destroy(){this.node.remove();}getAvailablePlaybackRates(){return [.5,.75,1,1.25,1.5];}
  pauseVideo(){this.status=2;}cueVideoById(value){this.cue=value;this.position=value.startSeconds;}
  loadVideoById(value){this.loaded=value;this.position=value.startSeconds;this.status=1;this.options.events.onStateChange({data:1});}
  setPlaybackRate(value){this.rate=value;}getPlayerState(){return this.status;}getCurrentTime(){return this.position;}
}};globalThis.YT=w.YT;
await import('../youtube-ui/youtube.js?media-test');
const $=id=>d.getElementById(id),tick=(ms=25)=>new Promise(r=>setTimeout(r,ms));
const submit=()=>$('importForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
$('videoUrl').value='https://youtu.be/jNQXAC9IVRw';submit();await tick();
assert.equal(openedURL,'https://www.youtube.com/watch?v=jNQXAC9IVRw');assert.equal(players,0);
$('subtitleText').value='1\n00:00:01.000 --> 00:00:04.000\nHello world.\n\n2\n00:00:05.000 --> 00:00:10.000\nThe bird came back.';
$('useSubtitles').click();await tick();
assert.equal(engineLoads,1);assert.equal(modelLoads,1);assert.equal(imports,0);assert.equal(players,1);
assert.equal($('answerInput').disabled,false);assert.equal($('wordGrid').children.length,1);
assert.equal($('levelInput').value,'1');assert.ok(d.querySelector('.youtube-navigation #levelInput'));
d.querySelector('[data-speed-level="4"]').click();assert.equal(lastPlayer.rate,1.25);
assert.equal(lastPlayer.loaded.startSeconds,.88);assert.equal(lastPlayer.loaded.endSeconds,4.12);
lastPlayer.position=4.5;await tick(120);assert.equal(lastPlayer.status,2,'Clip stops at caption end');
$('answerInput').value='Hello world';$('answerForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick(480);
assert.equal($('redoButton').hidden,false);assert.equal($('nextButton').disabled,false);
$('nextButton').click();await tick();assert.equal($('levelInput').value,'2');assert.equal($('clipTime').textContent,'0:05 – 0:10');
$('answerInput').value='The bird came back';$('answerForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick(480);
assert.equal($('nextButton').textContent,'Video complete ✓');assert.equal($('nextButton').disabled,true);
$('useSubtitles').click();await tick();assert.equal(players,2,'Reimport creates a new player mount');
assert.equal(engineLoads,1,'Reimport never duplicates the engine or input handlers');
assert.equal(modelLoads,1,'Voice loader is shared and loaded once');
assert.equal($('levelInput').value,'2','Import restores saved sentence');
assert.equal($('redoButton').hidden,false,'Saved completed sentence restores controls');
$('restoreCaption').click();await tick();assert.equal(players,3,'Cached video is available without extension');
assert.equal(imports,0,'Link opening, manual captions and cached captions never use a transcript server API');
w.dispatchEvent(new w.Event('pagehide'));w.close();
console.log('Media adapter checks passed: YouTube opening, local SRT/cache, single shared engine/model loader, playback bounds/rates, direct navigator and restored progress. YouTube mocked.');
