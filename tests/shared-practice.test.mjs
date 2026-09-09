import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createYouTubeProvider} from '../youtube-ui/practice-provider.mjs';

const html = await readFile(new URL('../practice-ui/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../practice-ui/app.js', import.meta.url), 'utf8');
const tick = (ms=15) => new Promise(r=>setTimeout(r,ms));
const data = {video_id:'jNQXAC9IVRw',title:'Fixture',language:'en',version:'shared-fixture',count:3,end:20,segments:[
  {start:1,end:4,text:'I paid $25 at 3:30.'},
  {start:5,end:9,text:"Mr. Green didn't leave."},
  {start:10,end:14,text:'The bird came back.'},
]};
let namesCalls=0, unexpectedCalls=0, plays=[];
globalThis.fetch=async(path)=>{
  if(path==='/api/youtube/names') {namesCalls++;return {ok:true,json:async()=>({indices:[0,1]})};}
  unexpectedCalls++;throw new Error('Unexpected API '+path);
};
const dom=new JSDOM(html,{url:'https://192.168.0.68:8775/youtube?embed=1',pretendToBeVisual:true,runScripts:'outside-only'});
const w=dom.window, d=w.document, $=id=>d.getElementById(id);
w.matchMedia=()=>({matches:true});
w.HTMLElement.prototype.scrollIntoView=()=>{};
w.HTMLMediaElement.prototype.pause=()=>{};
w.HTMLMediaElement.prototype.load=()=>{};
w.HTMLCanvasElement.prototype.getContext=()=>({measureText:t=>({width:t.length*10})});
w.fetch=globalThis.fetch;
const provider=createYouTubeProvider({select(){},stop(){},play(rate){plays.push(rate);}},w.localStorage);
w.dictaiPracticeProvider=provider;
w.eval(app+'\nwindow.testPractice={state,acceptVoiceTranscript,strictRequestedLevel,commitVoiceWord};');
w.eval('playWordSuccessTick = () => {};');
await tick(); assert.equal(d.querySelector('.practice-card').hidden,true);
await provider.activate(data); provider.mediaState(true,false,[.5,.75,1,1.25,1.5]); await tick();
assert.equal($('wordGrid').children.length,3);
assert.equal($('answerInput').disabled,false);
assert.equal($('voiceToggle').checked,false);
assert.equal($('voiceModel').options.length,2);
assert.equal($('voiceSettings').hidden,true);
$('voiceOptionsButton').click();assert.equal($('voiceSettings').hidden,false);
assert.equal($('voiceOptionsButton').getAttribute('aria-expanded'),'true');
const input=$('answerInput');
const enter=text=>{input.value=text;input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));};
const space=text=>{input.value=text;input.dispatchEvent(new w.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));};
space('twenty');assert.equal(input.value,'twenty ');
space('twenty five');assert.equal(input.value,'twenty five ');
space('twenty five dollars');assert.equal(input.value,'');
assert.equal(w.testPractice.state.solved.has(1),true);
enter('twenty five dollars');assert.equal(input.value,'twenty five dollars');
enter('paid at three thirty'); await tick(480);
assert.equal($('redoButton').hidden,false,'Again visible after correct answer');
assert.equal($('redoButton').disabled,false);
assert.equal($('nextButton').hidden,false,'Next visible after correct answer');
assert.equal($('nextButton').disabled,false);
assert.equal($('answerInputWrap').hidden,true);
assert.equal($('levelInput').value,'1','Completion never auto-navigates');
$('nextButton').click();await tick();assert.equal($('levelInput').value,'2');
assert.equal($('answerInputWrap').hidden,false);
input.value='keep my typed draft';
let transcript='mister', micStops=0;
const node=()=>({connect(){},disconnect(){}});
w.AudioContext=class{
  constructor(){this.state='running';this.sampleRate=16000;this.destination={};}
  createMediaStreamSource(){return node();}createScriptProcessor(){return node();}
  createGain(){return {...node(),gain:{value:0}};}async close(){this.state='closed';}
};
Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop(){micStops++;}}]})}});
w.wasmAsrRecognizer={createStream:()=>({acceptWaveform(){},free(){}}),isReady:()=>false,getResult:()=>({text:transcript}),isEndpoint:()=>true,reset(){}};
$('voiceToggle').checked=true;$('voiceToggle').dispatchEvent(new w.Event('change'));await tick();
assert.ok(w.testPractice.state.voiceProcessor,'Existing microphone pipeline starts');
const emit=()=>w.testPractice.state.voiceProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(1024)}});
emit();
assert.equal(input.value,'keep my typed draft','Voice does not clear draft');
assert.equal(w.testPractice.state.solved.has(0),true);
transcript='green did not leave';emit();await tick(480);
assert.equal(input.value,'keep my typed draft','Voice completion preserves draft');
assert.equal($('redoButton').hidden,false);
$('redoButton').click();await tick();assert.equal($('levelInput').value,'2');
assert.ok(micStops>0,'Navigation cleans up the old microphone stream');
// Disable synthesis chime in this test double; it tests recognition, not audio rendering.
w.AudioContext=undefined;
assert.equal(w.testPractice.state.solved.size,0,'Again resets only this clip');
input.value='retained';$('properNounButton').click();await tick();
assert.equal(input.value,'retained');
assert.ok(w.testPractice.state.revealed.has(0));
$('revealButton').click();await tick();
assert.equal($('nextButton').hidden,false);assert.equal($('nextButton').disabled,false);
assert.equal($('redoButton').hidden,false);
$('levelInput').value='3';$('levelInput').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',cancelable:true}));await tick();
assert.equal($('levelInput').value,'3');
assert.equal(provider.index,2);
for(const value of ['0','4','-1','1.5','1e2','']) assert.equal(w.testPractice.strictRequestedLevel(value),null);
$('levelInput').value='0';$('levelInput').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',cancelable:true}));await tick();
assert.equal(provider.index,2);assert.equal($('levelInput').getAttribute('aria-invalid'),'true');
$('previousSentence').click();await tick();assert.equal(provider.index,1);
assert.equal($('redoButton').hidden,false,'Restored completed clip retains Again/Next');
$('redoButton').click();await tick();
const saved=JSON.parse(w.localStorage.getItem('dictai:youtube:v1:jNQXAC9IVRw:en:shared-fixture'));
assert.equal(saved.index,1);assert.equal(saved.tokenVersion,2);
d.querySelector('[data-speed-level="2"]').click();assert.equal(plays.at(-1),.75);
// Apply keeps voice enabled/disabled for threshold-only updates.
w.testPractice.state.voiceEnabled=true;
$('thresholdSetting').value='0.81';$('applyVoiceSettings').click();
assert.equal(w.testPractice.state.voiceEnabled,true);
w.testPractice.state.voiceEnabled=false;$('applyVoiceSettings').click();assert.equal(w.testPractice.state.voiceEnabled,false);
assert.equal(unexpectedCalls,0,'YouTube never sends Book/Conversation API mutations');
assert.equal(namesCalls,0,'Names runs locally without sending caption text');
assert.equal(d.querySelectorAll('#answerForm').length,1);
assert.equal(d.querySelectorAll('#voiceToggle').length,1);
w.dispatchEvent(new w.Event('pagehide'));w.close();
console.log('Shared engine checks passed: numeric aliases, typing/Voice draft isolation, correct/revealed completion, Again/Next, saved position, numeric jump bounds, names, speeds, Voice options and no Book API writes. Audio and microphone mocked.');
