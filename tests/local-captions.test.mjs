import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import {parseVideo,cleanCaption,buildSegments,parseSubtitles,packageCaptions} from '../youtube-ui/local-captions.mjs';
import {dictaiURL,youtubeID} from '../browser-extension/policy.mjs';
import {localNameIndices} from '../youtube-ui/local-names.mjs';
test('strict YouTube links and time hints',()=>{
  assert.deepEqual(parseVideo('https://youtu.be/jNQXAC9IVRw?t=2m3s'),{videoId:'jNQXAC9IVRw',start:123});
  assert.equal(parseVideo('https://www.youtube.com/shorts/jNQXAC9IVRw').videoId,'jNQXAC9IVRw');
  for(const input of ['https://evil.test/watch?v=jNQXAC9IVRw','https://youtube.com.evil.test/watch?v=jNQXAC9IVRw','javascript:alert(1)','https://u:p@youtube.com/watch?v=jNQXAC9IVRw'])assert.throws(()=>parseVideo(input));
});
test('plain text and safe caption cleanup',()=>{
  assert.equal(cleanCaption('<i>Mr.</i> Green &amp; I [Music]'),'Mr. Green & I');
  assert.equal(cleanCaption('&#x110000; fine'),'fine');
  const s=buildSegments([{start:0,duration:2,text:'We are'},{start:1,duration:3,text:'We are ready.'}]);
  assert.equal(s[0].text,'We are ready.');
  assert.throws(()=>buildSegments([{start:0,duration:-1,text:'bad'}]));
  assert.throws(()=>buildSegments([{start:NaN,duration:1,text:'bad'}]));
  assert.throws(()=>buildSegments([{start:0,duration:2,text:'[music]'}]));
});
test('SRT and VTT stay local and preserve original display text',async()=>{
  const cues=parseSubtitles('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nMr. Green paid $25.');
  const data=await packageCaptions({videoId:'jNQXAC9IVRw',cues});
  assert.equal(data.segments[0].text,'Mr. Green paid $25.');
  assert.equal(data.version,(await packageCaptions({videoId:'jNQXAC9IVRw',cues})).version);
  assert.throws(()=>parseSubtitles('no timestamps'));
  assert.throws(()=>parseSubtitles('00:60:00.000 --> 00:61:01.000\ninvalid'));
});
test('bridge targets restrict host, port and path',()=>{
  assert.ok(dictaiURL('https://192.168.0.68:8771/youtube?embed=1'));
  assert.ok(dictaiURL('http://127.0.0.1:8771/youtube'));
  for(const url of ['https://192.168.0.68:9000/youtube','https://evil.test/youtube','https://192.168.0.68:8771/book'])assert.equal(dictaiURL(url),false);
  assert.equal(youtubeID('https://www.youtube.com/watch?v=jNQXAC9IVRw'),'jNQXAC9IVRw');
  assert.equal(youtubeID('https://evil.test/watch?v=jNQXAC9IVRw'),null);
});
test('Names hints local and original tokens retained',()=>{
  assert.deepEqual(localNameIndices("Mr. Green didn't leave."),[0,1]);
  assert.deepEqual(localNameIndices('The bird came back.'),[]);
});
const reader=await readFile(new URL('../browser-extension/reader.js',import.meta.url),'utf8');
const row=(time,text)=>`<ytd-transcript-segment-renderer><div class="segment-timestamp">${time}</div><div class="segment-text">${text}</div></ytd-transcript-segment-renderer>`;
function capture(body){
  const dom=new JSDOM(body,{url:'https://www.youtube.com/watch?v=jNQXAC9IVRw',runScripts:'outside-only'});
  dom.window.Element.prototype.getClientRects=()=>[{width:100,height:20}];
  const result=dom.window.eval(reader);dom.window.close();return JSON.parse(JSON.stringify(result));
}
test('displayed transcript collector: timing, duplication, hidden panels',()=>{
  const data=capture(row('0:01','Hello world.')+row('0:04','Next line.')+row('0:04','Next line.')+`<div hidden>${row('0:08','Hidden.')}</div>`);
  assert.equal(data.cues.length,2);assert.equal(data.cues[0].duration,3);assert.equal(data.timingEstimated,true);
  assert.ok(capture('<p>No transcript</p>').error);
  assert.ok(capture(row('bad','Hello')).error);
  assert.ok(capture('<div hidden>'+row('0:01','Hidden')+'</div>').error);
  assert.ok(!/\bfetch\s*\(|document\.cookie|ytInitialPlayerResponse|timedtext/.test(reader));
});
