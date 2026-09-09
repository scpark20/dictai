import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const root=new URL('../browser-extension/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
const pageCaptions=await readFile(new URL('page-captions.js',root),'utf8');
const contentScript=await readFile(new URL('youtube-content.js',root),'utf8');
const panelHTML=await readFile(new URL('panel.html',root),'utf8');
const panelScript=await readFile(new URL('panel.js',root),'utf8');

test('manifest is a minimal YouTube-only LR surface',()=>{
  assert.equal(manifest.version,'2.0.0');
  assert.deepEqual(manifest.permissions,['scripting']);
  assert.deepEqual(manifest.host_permissions,['https://www.youtube.com/*']);
  assert.equal(manifest.content_scripts.length,1);
  assert.equal(manifest.content_scripts[0].matches[0],'https://www.youtube.com/*');
  assert.ok(manifest.web_accessible_resources[0].resources.includes('panel.html'));
  assert.equal(manifest.action.default_popup,undefined);
});

function captionDOM({tracks=true,trackURL='https://www.youtube.com/api/timedtext?lang=en'}={}){
  const dom=new JSDOM('<div id="movie_player"></div>',{url:'https://www.youtube.com/watch?v=jNQXAC9IVRw',runScripts:'outside-only'});
  const response={videoDetails:{title:'Fixture video'},captions:tracks?{playerCaptionsTracklistRenderer:{captionTracks:[{baseUrl:trackURL,languageCode:'en',name:{simpleText:'English'}}]}}:undefined};
  dom.window.document.getElementById('movie_player').getPlayerResponse=()=>response;
  let calls=0;
  dom.window.fetch=async url=>{calls++;assert.equal(new URL(url).pathname,'/api/timedtext');assert.equal(new URL(url).searchParams.get('fmt'),'json3');return {ok:true,text:async()=>JSON.stringify({events:[{tStartMs:1000,dDurationMs:2000,segs:[{utf8:'Hello '},{utf8:'world.'}]}]})};};
  return {dom,calls:()=>calls};
}

test('caption reader makes one current-video browser request',async()=>{
  const {dom,calls}=captionDOM();const result=await dom.window.eval(pageCaptions);
  assert.equal(calls(),1);assert.equal(result.videoId,'jNQXAC9IVRw');assert.equal(result.language,'en');
  assert.deepEqual(JSON.parse(JSON.stringify(result.cues)),[{start:1,duration:2,text:'Hello world.'}]);dom.window.close();
});

test('caption reader stops on missing or foreign caption sources',async()=>{
  let fixture=captionDOM({tracks:false});let result=await fixture.dom.window.eval(pageCaptions);assert.match(result.error,/does not provide/);assert.equal(fixture.calls(),0);fixture.dom.window.close();
  fixture=captionDOM({trackURL:'https://evil.example/caption'});result=await fixture.dom.window.eval(pageCaptions);assert.match(result.error,/unsupported/);assert.equal(fixture.calls(),0);fixture.dom.window.close();
});

test('caption reader reports an empty response as unavailable captions',async()=>{
  const fixture=captionDOM();fixture.dom.window.fetch=async()=>({ok:true,text:async()=>''});
  const result=await fixture.dom.window.eval(pageCaptions);
  assert.equal(result.error,'This video does not provide usable captions.');
  fixture.dom.window.close();
});

test('content script mounts one automatic panel and requests one scan',async()=>{
  const dom=new JSDOM('<video></video>',{url:'https://www.youtube.com/watch?v=jNQXAC9IVRw',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;let runtimeListener,messageListener,scanCalls=0;
  w.crypto.randomUUID=()=> '00000000-0000-4000-8000-000000000000';
  w.chrome={runtime:{getURL:path=>'chrome-extension://abcdefghijklmnopabcdefghijklmnop/'+path,onMessage:{addListener:f=>runtimeListener=f},sendMessage:async message=>{scanCalls++;assert.equal(message.videoId,'jNQXAC9IVRw');return {result:{videoId:message.videoId,cues:[{start:1,duration:2,text:'Hello.'}]}};}},};
  const add=w.addEventListener.bind(w);w.addEventListener=(type,listener,options)=>{if(type==='message')messageListener=listener;return add(type,listener,options);};
  w.HTMLMediaElement.prototype.pause=()=>{};w.HTMLMediaElement.prototype.play=async()=>{};
  w.eval(contentScript);
  const host=w.document.getElementById('dictai-youtube-host'),frame=w.document.getElementById('dictai-youtube-frame');
  assert.ok(host);assert.match(frame.src,/panel\.html\?video=jNQXAC9IVRw/);assert.equal(scanCalls,0,'waits for cache decision from app');
  const panel=new URL(frame.src).searchParams.get('panel');
  messageListener({source:frame.contentWindow,origin:'chrome-extension://abcdefghijklmnopabcdefghijklmnop',data:{channel:'dictai-youtube-command-v2',panel,type:'need-captions'}});
  await new Promise(r=>setTimeout(r,10));assert.equal(scanCalls,1);
  runtimeListener({type:'dictai-toggle'});assert.ok(host.classList.contains('dictai-collapsed'));runtimeListener({type:'dictai-toggle'});assert.ok(!host.classList.contains('dictai-collapsed'));
  dom.window.close();
});

test('content script discards a stale caption result after YouTube SPA navigation',async()=>{
  const first='jNQXAC9IVRw',second='aircAruvnKk';
  const dom=new JSDOM('<video></video>',{url:`https://www.youtube.com/watch?v=${first}`,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;const pending=[];let messageListener;
  w.crypto.randomUUID=()=>String(pending.length+1).padStart(36,'0');
  w.chrome={runtime:{getURL:path=>'chrome-extension://abcdefghijklmnopabcdefghijklmnop/'+path,onMessage:{addListener:()=>{}},sendMessage:message=>new Promise(resolve=>pending.push({message,resolve}))}};
  const add=w.addEventListener.bind(w);w.addEventListener=(type,listener,options)=>{if(type==='message')messageListener=listener;return add(type,listener,options);};
  w.HTMLMediaElement.prototype.pause=()=>{};w.HTMLMediaElement.prototype.play=async()=>{};w.eval(contentScript);
  let frame=w.document.getElementById('dictai-youtube-frame'),panel=new URL(frame.src).searchParams.get('panel');
  messageListener({source:frame.contentWindow,origin:'chrome-extension://abcdefghijklmnopabcdefghijklmnop',data:{channel:'dictai-youtube-command-v2',panel,type:'need-captions'}});
  assert.equal(pending[0].message.videoId,first);
  dom.reconfigure({url:`https://www.youtube.com/watch?v=${second}`});w.dispatchEvent(new w.Event('yt-navigate-finish'));
  await new Promise(resolve=>setTimeout(resolve,180));
  frame=w.document.getElementById('dictai-youtube-frame');panel=new URL(frame.src).searchParams.get('panel');const delivered=[];frame.contentWindow.postMessage=message=>delivered.push(message);
  messageListener({source:frame.contentWindow,origin:'chrome-extension://abcdefghijklmnopabcdefghijklmnop',data:{channel:'dictai-youtube-command-v2',panel,type:'need-captions'}});
  assert.equal(pending[1].message.videoId,second);
  pending[0].resolve({error:'The active YouTube video changed.'});await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(delivered.some(message=>message.type==='error'),false);
  pending[1].resolve({result:{videoId:second,cues:[{start:1,duration:1,text:'Current.'}]}});await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(delivered.some(message=>message.type==='captions'),true);
  dom.window.close();
});

test('panel relays only between its YouTube parent and DictAI frame',()=>{
  const id='abcdefghijklmnopabcdefghijklmnop',token='00000000-0000-4000-8000-000000000000';
  const dom=new JSDOM(panelHTML,{url:`chrome-extension://${id}/panel.html?video=jNQXAC9IVRw&panel=${token}`,runScripts:'outside-only'});
  const w=dom.window,parentMessages=[],appMessages=[],fakeParent={postMessage:(message,origin)=>parentMessages.push({message,origin})};
  Object.defineProperty(w,'parent',{value:fakeParent});w.chrome={runtime:{id}};
  let listener;w.addEventListener=(type,fn)=>{if(type==='message')listener=fn;};w.eval(panelScript);
  const app=w.document.getElementById('app');app.contentWindow.postMessage=(message,origin)=>appMessages.push({message,origin});
  assert.match(app.src,/surface=extension/);assert.match(app.src,new RegExp(`bridge=${id}`));
  listener({source:app.contentWindow,origin:'https://192.168.0.68:8771',data:{channel:'dictai-panel-command-v2',type:'need-captions',cached:false}});
  assert.equal(parentMessages[0].message.channel,'dictai-youtube-command-v2');assert.equal(parentMessages[0].message.type,'need-captions');
  listener({source:fakeParent,origin:'https://www.youtube.com',data:{channel:'dictai-youtube-event-v2',panel:token,type:'captions',payload:{cues:[1]}}});
  assert.equal(appMessages[0].message.channel,'dictai-panel-event-v2');assert.equal(appMessages[0].message.type,'captions');
  const count=parentMessages.length;listener({source:fakeParent,origin:'https://evil.test',data:{channel:'dictai-youtube-event-v2',panel:token,type:'captions'}});assert.equal(parentMessages.length,count);
  dom.window.close();
});
