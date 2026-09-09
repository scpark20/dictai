import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const html=await readFile(new URL('../youtube-ui/youtube.html',import.meta.url),'utf8');
const dom=new JSDOM(html,{url:'https://192.168.0.68:8775/youtube',pretendToBeVisual:true});
const {window}=dom;
Object.assign(globalThis,{window,document:window.document,location:window.location,localStorage:window.localStorage,matchMedia:()=>({matches:true})});
window.matchMedia=globalThis.matchMedia;
const data={video_id:'jNQXAC9IVRw',title:'Numeric fixture',language:'en',version:'numbers',count:2,end:10,source:'youtube',start_hint:0,tracks:[],segments:[{start:1,end:4,text:'I paid $25 at 3:30.'},{start:5,end:10,text:'At $3.50, Mr. Green left.'}]};
const key='dictai:youtube:v1:jNQXAC9IVRw:en:numbers';
// Legacy $25 and 3:30 were tokenized as 25, 3, 30. Keep location and valid solved slots.
localStorage.setItem(key,JSON.stringify({index:0,start:0,end:10,answers:{0:['solved',null,null,null,null,null]}}));
globalThis.fetch=async(url)=>({ok:true,json:async()=>url.endsWith('/names')?{indices:[3,4]}:data});
window.YT={PlayerState:{PLAYING:1},Player:class{
 constructor(id,o){queueMicrotask(()=>o.events.onReady());}
 getAvailablePlaybackRates(){return [1];} pauseVideo(){}cueVideoById(){}loadVideoById(){}setPlaybackRate(){}getPlayerState(){return 2;}
}};globalThis.YT=window.YT;
await import('../youtube-ui/youtube.js?numbers=1');
const $=id=>document.getElementById(id),input=$('answerInput');
const submit=id=>$(id).dispatchEvent(new window.Event('submit',{cancelable:true,bubbles:true}));
const space=value=>{input.value=value;input.dispatchEvent(new window.KeyboardEvent('keydown',{key:' ',cancelable:true,bubbles:true}));};
const tick=()=>new Promise(r=>setTimeout(r,10));
$('videoUrl').value='https://youtu.be/jNQXAC9IVRw';submit('importForm');await tick();
assert.equal($('wordGrid').children.length,5);assert.equal($('wordGrid').children[0].textContent,'I');
space('twenty');assert.equal(input.value,'twenty ');assert.equal($('wordGrid').children[2].textContent,'—');
space('twenty five');assert.equal(input.value,'twenty five ');
space('twenty five dollars');assert.equal(input.value,'');assert.equal($('wordGrid').children[2].textContent,'$25');
input.value='twenty five dollars';submit('answerForm');assert.equal(input.value,'twenty five dollars');assert.equal($('answerFeedback').textContent,'Already entered.');
space('three');assert.equal(input.value,'three ');
space('three thirty');assert.equal(input.value,'');assert.equal($('wordGrid').children[4].textContent,'3:30');
input.value='paid at';submit('answerForm');assert.equal($('againButton').hidden,false);assert.equal($('nextButton').hidden,false);
assert.equal(JSON.parse(localStorage.getItem(key)).tokenVersion,2);
$('nextButton').click();assert.equal($('clipCounter').textContent,'2 / 2');
input.value='untouched draft';$('namesButton').click();await tick();
assert.equal(input.value,'untouched draft');assert.equal($('wordGrid').children[2].textContent,'Mr.');assert.equal($('wordGrid').children[3].textContent,'Green');assert.equal($('wordGrid').children[1].textContent,'—');
window.dispatchEvent(new window.Event('pagehide'));window.close();
console.log('Numeric DOM checks passed: real Space/Enter handlers, phrase buffering, exact original display, duplicate draft retention, completion, legacy progress migration, Names offsets after decimals. YouTube player mocked.');
