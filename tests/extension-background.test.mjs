import assert from 'node:assert/strict';
const db={},listeners=[],calls=[],tabs=new Map();let next=100;
globalThis.chrome={
  runtime:{getManifest:()=>({version:'1.0.0'}),getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>listeners.push(f)}},
  storage:{session:{get:async key=>key===null?{...db}:{[key]:db[key]},set:async values=>Object.assign(db,values),remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])delete db[key];}}},
  tabs:{create:async value=>{const tab={id:next++,...value};tabs.set(tab.id,tab);calls.push(['create',value]);return tab;},get:async id=>tabs.get(id),sendMessage:async(...args)=>{calls.push(['deliver',...args]);return {ok:true};},update:async(...args)=>calls.push(['update',...args]),onRemoved:{addListener(){}}},
  scripting:{executeScript:async value=>{calls.push(['read',value]);return [{result:{videoId:'jNQXAC9IVRw',cues:[{start:1,duration:2,text:'Hello.'}]}}];}},
};
await import('../browser-extension/background.js');
const send=(m,s)=>new Promise(r=>listeners[0](m,s,r));
const sender={tab:{id:5},frameId:3,documentId:'doc-A',url:'https://192.168.0.68:8771/youtube?embed=1'};
const open={type:'open',videoId:'jNQXAC9IVRw',language:'en',requestId:'req-A'};
assert.ok((await send(open,{...sender,url:'https://evil.test/youtube'})).error);
assert.equal(calls.length,0);
assert.ok((await send({type:'hello'},sender)).result);
assert.ok((await send(open,sender)).result.opened);assert.equal(db['job:100'].documentId,'doc-A');
assert.ok((await send({type:'collect',tabId:100},sender)).error,'Page cannot trigger transcript collection');
const popup={url:'chrome-extension://test/popup.html'};
assert.ok((await send({type:'collect',tabId:100},popup)).result);
const delivery=calls.find(c=>c[0]==='deliver');assert.equal(delivery[1],5);assert.equal(delivery[3].documentId,'doc-A');
assert.equal(delivery[2].payload.requestId,'req-A');assert.equal(db['job:100'],undefined);
assert.ok((await send({type:'collect',tabId:100},popup)).error,'Consumed imports cannot be replayed');
await send(open,sender);await send({...open,requestId:'req-B'},sender);
assert.equal(db['job:101'],undefined,'New request revokes old pending tab');
tabs.get(102).url='https://www.youtube.com/watch?v=AAAAAAAAAAA';
assert.ok((await send({type:'collect',tabId:102},popup)).error,'Wrong video rejected');
tabs.get(102).url='https://www.youtube.com/watch?v=jNQXAC9IVRw';db['job:102'].created=0;
assert.ok((await send({type:'collect',tabId:102},popup)).error,'Expired requests rejected');
assert.equal(calls.filter(c=>c[0]==='read').length,1);
console.log('Extension worker tests passed: trusted origins, popup-only collection, exact frame/document delivery, request binding, expiry, wrong video, no replay. Chrome APIs mocked.');
