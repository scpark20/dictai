// DOM-adapter integration tests; no real browser or microphone access.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const realTimeout=setTimeout;
class Classes {constructor(){this.set=new Set();}add(...xs){xs.forEach(x=>this.set.add(x));}remove(...xs){xs.forEach(x=>this.set.delete(x));}contains(x){return this.set.has(x);}toggle(x,yes){if(yes??!this.set.has(x))this.set.add(x);else this.set.delete(x);}}
const nodes=new Map();
class Element extends EventTarget {
 constructor(tag='div'){super();this.tag=tag;this.children=[];this.style={};this.dataset={};this.classList=new Classes();this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.selectionStart=0;this.clientWidth=420;this.clientHeight=440;this.options=[];this.attributes={};}
 set id(v){this._id=v;nodes.set(v,this);}get id(){return this._id;}
 set className(v){this._classes=v;this.classList=new Classes();v.split(' ').forEach(x=>this.classList.add(x));}get className(){return this._classes||'';}
 append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
 replaceChildren(...xs){this.children=[];this.options=[];this.append(...xs);}
 setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k];}
 querySelector(tag){return this.children.find(c=>c.tag===tag)||null;}
 add(option){this.options.push(option);if(this.options.length===1)this.value=option.value;}
 focus(){}setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}scrollIntoView(){}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);nodes.delete(this.id);}
 animate(){const a={onfinish:null};queueMicrotask(()=>a.onfinish?.());return a;}
}
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
for(const m of html.matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"[^>]*>/g)){const e=new Element(m[1]);e.id=m[2];e.hidden=m[0].includes(' hidden');e.disabled=m[0].includes(' disabled');}
const body=new Element('body');
globalThis.document=Object.assign(new EventTarget(),{body,hidden:false,getElementById:id=>nodes.get(id),createElement:tag=>new Element(tag),querySelectorAll:()=>[]});
globalThis.window=globalThis;globalThis.innerHeight=900;const events=new EventTarget();globalThis.addEventListener=(...x)=>events.addEventListener(...x);globalThis.dispatchEvent=(...x)=>events.dispatchEvent(...x);
globalThis.Option=class{constructor(text,value){this.text=text;this.value=String(value);}};
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
globalThis.sessionStorage={getItem:()=>null,removeItem(){},setItem(){}};
globalThis.location={reload(){throw Error('unexpected reload');}};
class AudioMock extends EventTarget{constructor(){super();this.paused=true;}pause(){this.paused=true;}async play(){this.paused=false;}}globalThis.Audio=AudioMock;
let raf;globalThis.requestAnimationFrame=fn=>{raf=fn;};
// Shorten only UI countdown/effect timeouts, not application clocks.
globalThis.setTimeout=(fn,ms)=>realTimeout(fn,ms>=25000?ms:0);
globalThis.URL.createObjectURL=()=>`blob:test-${Math.random()}`;globalThis.URL.revokeObjectURL=()=>{};
const fixture=Array.from({length:3},(_,i)=>({id:'row'+i,text:'How are you?',words:['How','are','you'],duration:3,turn_lengths:[],label:'A1 · Greetings',audio:'/audio'+i}));
globalThis.fetch=async url=>({ok:true,status:200,json:async()=>url==='/game-api/catalog'?{levels:{A1:['Greetings']},books:[{chapter:5,title:'Chapter Five'}]}:{questions:fixture},blob:async()=>new Blob(['x'.repeat(100)])});
nodes.get('source').value='conversation';nodes.get('difficulty').value='normal';nodes.get('voiceButton').textContent='◉ Voice Off';
await import('./game.js');await new Promise(r=>realTimeout(r,10));
const el=id=>nodes.get(id);const snapshot=()=>JSON.parse(storage.get('dictai-game-round-v1'));
let count=0;const ok=(name,fn)=>{fn();console.log('PASS',name);count++;};
ok('catalog populates and Start enables',()=>{assert.equal(el('start').disabled,false);assert.equal(el('level').value,'A1');});
await el('start').onclick();
ok('round starts with audio prepared and real input enabled',()=>{assert.equal(snapshot().status,'running');assert.equal(el('answer').disabled,false);assert.equal(el('words').children.length,3);});
el('answer').value='How';el('answerForm').onsubmit({preventDefault(){}});
ok('typed success opens slot and clears only submitted draft',()=>{assert.equal(el('answer').value,'');assert.deepEqual(snapshot().questions[0].solved,[0]);});
el('answer').value='How';el('answerForm').onsubmit({preventDefault(){}});
ok('duplicate leaves input intact and shows warning',()=>{assert.equal(el('answer').value,'How');assert.equal(el('feedback').dataset.kind,'duplicate');});
el('answer').value='ar';el('answer').selectionStart=2;el('answer').dispatchEvent(new Event('input'));
el('pause').onclick();
ok('pause saves draft and caret without solving it',()=>{assert.equal(snapshot().status,'paused');assert.equal(snapshot().questions[0].draft,'ar');assert.equal(snapshot().questions[0].caret,2);});
el('themes').children.find(b=>b.dataset.themeChoice==='neon').onclick();
ok('theme change preserves round and draft',()=>{assert.equal(body.dataset.theme,'neon');assert.equal(el('answer').value,'ar');assert.equal(snapshot().score,0);});
await el('resume').onclick();
el('answer').value='are you';el('answerForm').onsubmit({preventDefault(){}});
ok('full answer scores and never stalls on Completing',()=>{assert.equal(snapshot().score,100);assert.equal(snapshot().questions[0].state,'solved');assert(!el('feedback').textContent.includes('Completing'));});
let now=performance.now();for(let i=0;i<35;i++){now+=250;raf(now);}
ok('next bubble auto-selects after solve',()=>{assert.equal(snapshot().active,'q1');assert.equal(el('answer').disabled,false);});
el('answer').value='my draft';el('answer').selectionStart=5;el('answer').dispatchEvent(new Event('input'));el('optionsButton').onclick();
ok('voice options pause game without touching draft',()=>{assert.equal(snapshot().status,'paused');assert.equal(el('answer').value,'my draft');assert.equal(el('options').hidden,false);});
el('model').value='full';el('beam').value='12';el('threshold').value='0.6';el('candidate').value='0.07';el('apply').onclick();
ok('Apply keeps voice off and draft retained',()=>{assert.equal(el('answer').value,'my draft');assert.equal(snapshot().status,'paused');assert.equal(el('voiceButton').textContent,'◉ Voice Off');});
await el('resume').onclick();el('answer').dispatchEvent(new Event('compositionstart'));el('answer').value='한';el('answerForm').onsubmit({preventDefault(){}});
ok('IME composition never submits prematurely',()=>{assert.equal(el('answer').value,'한');assert.deepEqual(snapshot().questions[1].solved,[]);});
el('answer').dispatchEvent(new Event('compositionend'));el('skip').onclick();
ok('Skip consumes exactly one life',()=>{assert.equal(snapshot().life,4);});
el('newRound').onclick();
ok('New round clears only game save and shows setup',()=>{assert.equal(storage.has('dictai-game-round-v1'),false);assert.equal(el('ready').hidden,false);assert.equal(storage.get('dictai-game-theme'),'neon');});
console.log(`${count} DOM-adapter tests passed (not a browser visual test)`);
