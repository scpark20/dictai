// Audio adapter tests use synthetic buffers; they do not record a microphone.
import assert from 'node:assert/strict';
import {Voice} from './voice.js';
globalThis.window = new EventTarget();
let stopped = 0, freed = 0, text = '', resets = 0;
Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>stopped++}]})}},configurable:true});
class Node { connect(){} disconnect(){} }
globalThis.AudioContext = class {
  constructor(){this.sampleRate=16000;this.state='running';this.destination={};}
  async resume(){} createMediaStreamSource(){return new Node();}
  createScriptProcessor(){return new Node();}
  createGain(){return Object.assign(new Node(),{gain:{value:1}});}
  async close(){this.state='closed';}
};
window.wasmAsrRecognizer={
  createStream:()=>({acceptWaveform(){},free(){freed++;}}),
  reset(){resets++;}, isReady:()=>false, decode(){},
  getResult:()=>({text}),isEndpoint:()=>false
};
const received=[];
const voice=new Voice((words,id)=>{received.push({words,id});if(id==='first')voice.setContext('second');},()=>{});
voice.setContext('first');voice.resume();await voice.enable(true);
assert.ok(voice.stream);assert.equal(voice.enabled,true);
console.log('PASS voice starts only when enabled and resumed');
const input={inputBuffer:{getChannelData:()=>new Float32Array(1024)}};
text='hello';voice.processor.onaudioprocess(input);
assert.equal(voice.context,'second');assert.equal(voice.last,'');
voice.processor.onaudioprocess(input);
assert.deepEqual(received,[{words:['hello'],id:'first'},{words:['hello'],id:'second'}]);
console.log('PASS previous target cannot overwrite next target transcript');
voice.processor.onaudioprocess(input);assert.equal(received.length,2);
console.log('PASS repeated partial recognition is not resubmitted');
voice.suspend();text='different';voice.processor.onaudioprocess(input);
assert.equal(received.length,2);assert.ok(resets>=2);
console.log('PASS suspended audio cannot change answers');
await voice.enable(false);
assert.equal(stopped,1);assert.equal(freed,1);assert.equal(voice.stream,null);assert.equal(voice.processor,null);
console.log('PASS voice off releases the microphone and stream');
voice.loading=true;voice.enabled=true;
const failure=new Event('wasm-asr-status');failure.detail={status:'Could not save model'};
window.dispatchEvent(failure);
assert.equal(voice.loading,false);assert.equal(voice.enabled,false);
console.log('PASS failed model loading permits a fresh retry');
console.log('6 voice adapter tests passed');
