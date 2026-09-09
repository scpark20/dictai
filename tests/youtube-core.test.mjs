import test from 'node:test';
import assert from 'node:assert/strict';
import {tokens,normalize,submitWords,parseTime,timeLabel,rangeIndices,indexAtTime,progressKey} from '../youtube-ui/youtube-core.mjs';
test('original wording, contractions, names and punctuation',()=>{
  assert.deepEqual(tokens("Mr. Green didn’t go."),['Mr','Green',"didn't",'go']);
  assert.equal(normalize('Mr.'),normalize('Mister'));
  assert.equal(normalize("didn't"),normalize('didnt'));
  assert.deepEqual(tokens('안녕하세요 여러분 2026'),['안녕하세요','여러분','2026']);
});
test('one entry opens one repeated word; duplicate does not mutate typed input',()=>{
  const words=['I','said','I'];let r=submitWords(words,[null,null,null],'I');
  assert.equal(r.matched,1);assert.equal(r.complete,false);
  r=submitWords(words,r.opened,'I');assert.equal(r.matched,1);
  const opened=[...r.opened];r=submitWords(words,r.opened,'I');assert.equal(r.duplicate,1);assert.deepEqual(r.opened,opened);
  r=submitWords(words,r.opened,'said');assert.equal(r.complete,true);
});
test('paste phrase, reveal states and unknown words',()=>{
  const r=submitWords(['A','small','cat'],['revealed',null,null],'small cat');
  assert.equal(r.complete,true);assert.equal(r.opened[0],'revealed');
  assert.equal(submitWords(['cat'],[null],'dog').missed,1);
  assert.equal(submitWords([],[],'').complete,false);
});
test('time formats and invalid ranges',()=>{
  assert.equal(parseTime('1:02:03.5'),3723.5);assert.equal(parseTime('65'),65);
  for(const v of ['','-1','x','1:60','1:2:3:4'])assert.ok(Number.isNaN(parseTime(v)));
  assert.equal(timeLabel(3723.5),'1:02:03');
  assert.throws(()=>rangeIndices([],3,2));assert.throws(()=>rangeIndices([],0,NaN));
});
test('range retains whole clips in chronological order; jump covers current caption',()=>{
  const s=[{start:1,end:5},{start:8,end:10},{start:12,end:15}];
  assert.deepEqual(rangeIndices(s,8,13),[1,2]);
  assert.equal(indexAtTime(s,3),0);assert.equal(indexAtTime(s,7),1);assert.equal(indexAtTime(s,20),2);
});
test('progress isolated by video, caption language and transcript version',()=>{
  const d={video_id:'123',language:'en',version:'one'};
  assert.notEqual(progressKey(d),progressKey({...d,video_id:'456'}));
  assert.notEqual(progressKey(d),progressKey({...d,language:'ko'}));
  assert.notEqual(progressKey(d),progressKey({...d,version:'two'}));
});
