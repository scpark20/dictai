import assert from 'node:assert/strict';
const listeners=[],actions=[],deliveries=[];
globalThis.chrome={
  runtime:{onMessage:{addListener:f=>listeners.push(f)}},
  scripting:{executeScript:async value=>{
    assert.equal(value.world,'MAIN');assert.deepEqual(value.target,{tabId:7,frameIds:[0]});assert.deepEqual(value.files,['page-captions.js']);
    return [{result:{videoId:'jNQXAC9IVRw',language:'en',cues:[{start:1,duration:2,text:'Hello.'}]}}];
  }},
  action:{onClicked:{addListener:f=>actions.push(f)}},
  tabs:{sendMessage:async(...args)=>deliveries.push(args)},
};
await import('../browser-extension/background.js?lr-test');
const send=(message,sender)=>new Promise(resolve=>listeners[0](message,sender,resolve));
const sender={tab:{id:7},frameId:0,url:'https://www.youtube.com/watch?v=jNQXAC9IVRw'};
assert.ok((await send({type:'dictai-scan-current',videoId:'jNQXAC9IVRw'},sender)).result);
assert.match((await send({type:'dictai-scan-current',videoId:'AAAAAAAAAAA'},sender)).error,/changed/);
assert.match((await send({type:'dictai-scan-current',videoId:'jNQXAC9IVRw'},{...sender,url:'https://evil.test/watch?v=jNQXAC9IVRw'})).error,/changed/);
actions[0]({id:7,url:sender.url});await new Promise(r=>setTimeout(r,0));assert.deepEqual(deliveries,[[7,{type:'dictai-toggle'}]]);
console.log('Extension worker checks passed: exact current-video binding, MAIN-world packaged reader, foreign/mismatched rejection and toolbar toggle. Chrome APIs mocked.');
