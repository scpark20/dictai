import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const html=await readFile(new URL('../practice-ui/index.html',import.meta.url),'utf8');
const app=await readFile(new URL('../practice-ui/app.js',import.meta.url),'utf8');
const dom=new JSDOM(html,{url:'https://192.168.0.68:8775/practice/?book=harry-potter-5&chapter=11',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,$=id=>w.document.getElementById(id),tick=ms=>new Promise(r=>setTimeout(r,ms));
w.matchMedia=()=>({matches:true});w.HTMLElement.prototype.scrollIntoView=()=>{};
w.HTMLMediaElement.prototype.pause=()=>{};w.HTMLMediaElement.prototype.load=()=>{};
w.HTMLCanvasElement.prototype.getContext=()=>({measureText:t=>({width:t.length*10})});
let completionResolve, completeBody;
w.fetch=async(path,options)=>{
  if(path==='/api/bootstrap')return new Promise(()=>{}); // Controlled fixture, no live DB.
  assert.equal(path,'/api/problem/book-fixture/complete');
  completeBody=JSON.parse(options.body);
  return new Promise(resolve=>{completionResolve=()=>resolve({ok:true,headers:{get:()=> 'application/json'},json:async()=>({completed:true,used_answer:false,next_level:3})});});
};
w.eval(app+`
  playWordSuccessTick=()=>{};
  playSuccessChime=()=>{throw new Error('Simulated audio unavailable');};
  window.testLegacy={state,acceptVoiceTranscript,setup(){
    resetProblemSurface();state.maxWords=30;state.maxLevel=191;state.level=2;
    state.problem=validateProblem({attempt_id:'book-fixture',level:2,text:"Harry didn't leave.",word_count:3,target_language:'ko'},'ko');
    state.problemLoading=false;renderWordGrid(3);hideStatePanel();elements.answerInput.disabled=false;
  }};
`);
w.testLegacy.setup();
const enter=value=>{$('answerInput').value=value;$('answerInput').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));};
enter('did not');assert.equal(w.testLegacy.state.solved.has(1),true,'Existing contraction-component matching retained');
enter('Harry');assert.equal(w.testLegacy.state.solved.has(0),true);
$('answerInput').value='do not touch this draft';w.testLegacy.acceptVoiceTranscript('leave',true);
await tick(460);
assert.equal($('redoButton').hidden,false,'Even a slow completion response must not hide Again');
assert.equal($('nextButton').hidden,false,'Even a slow completion response must not hide Next');
assert.equal($('nextButton').disabled,true,'Wait for authoritative Book save');
assert.equal($('answerInput').value,'do not touch this draft');
assert.deepEqual(completeBody.answers,['Harry',"didn't",'leave']);
completionResolve();await tick(15);
assert.equal($('nextButton').disabled,false);assert.equal($('redoButton').disabled,false);
assert.equal(w.testLegacy.state.nextProblemLevel,3);
assert.equal(w.testLegacy.state.level,2,'No automatic screen change');
w.dispatchEvent(new w.Event('pagehide'));w.close();
console.log('Book engine regression passed: original contractions/voice matching, draft isolation, authoritative completion, visible pending actions, and audio-effect failure cannot block completion. No live DB used.');
