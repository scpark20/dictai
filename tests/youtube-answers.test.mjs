import test from 'node:test';
import assert from 'node:assert/strict';
import {tokens,submitWords,spellInteger,migrateOpened,mapLegacyIndices,TOKEN_VERSION} from '../youtube-ui/youtube-answers.mjs';
const solve=(caption,answer,options)=>submitWords(tokens(caption),tokens(caption).map(()=>null),answer,options);
const positives=[
 ['25','twenty five'],['25','twenty-five'],['twenty-five','25'],['twenty five','25'],
 ['105','one hundred and five'],['105','one hundred five'],['100','a hundred'],
 ['1,000','one thousand'],['1,205','one thousand two hundred and five'],
 ['2026','twenty twenty six'],['2026','two thousand and twenty six'],['1990','nineteen ninety'],['1905','nineteen oh five'],
 ['twenty twenty-six','2026'],['0.9','zero point nine'],['0.9','point nine'],['70.5','seventy point five'],['4.5','four point five'],
 ['0.05','zero point zero five'],['-5','minus five'],['−5','negative five'],['+5','plus five'],
 ['1st','first'],['4th','fourth'],['21st','twenty first'],['100th','one hundredth'],['twenty-first','21st'],
 ['6:30','six thirty'],['3:05','three oh five'],['3:05','three zero five'],['12:00',"twelve o'clock"],['3:30','half past three'],['3:45','a quarter to four'],['3:15','quarter past three'],['.5','point five'],
 ['$10','ten dollars'],['$1','one dollar'],['£10','ten pounds'],['€10','ten euros'],['50¢','fifty cents'],
 ['$10.50','ten dollars and fifty cents'],['$10.50','10 dollars 50 cents'],['$10.05','ten dollars five cents'],['$0.50','fifty cents'],['$1.5 million','one million five hundred thousand dollars'],['p.m.','p m'],['a.m.','a m'],
 ['$1M','one million dollars'],['$1 million','one million dollars'],['$1,000,000','one million dollars'],
 ['10 dollars','$10'],['ten dollars','$10'],['1.5 million','one point five million'],['1.5 million','1500000'],
 ['100%','one hundred percent'],['25%','twenty five per cent'],['25 percent','25%'],['twenty five percent','25%'],
 ['1/2','one half'],['1/2','a half'],['3/4','three quarters'],['24/7','twenty four seven'],
 ['5kg','five kilograms'],['5 kg','five kilograms'],['five kilograms','5kg'],['10km','ten kilometres'],['60mph','sixty miles per hour'],['5°C','five degrees celsius'],
 ['Mr.','mister'],['Mrs.','missus'],['Dr.','doctor'],['Prof.','professor'],['U.S.','u s'],['HIV','h i v'],['TV','t v'],['NASA','n a s a'],['OK','okay'],
 ["didn't",'did not'],['did not',"didn't"],["can't",'cannot'],['cannot','can not'],["we're",'we are'],["you've",'you have'],["I'll",'I will'],
 ['007','zero zero seven'],['007','oh oh seven'],['e-mail','email'],['e-mail','e mail'],
 ['I paid $25 at 3:30.','I paid twenty five dollars at three thirty'],['3:30pm','three thirty p m'],['3:30p.m.','three thirty p m'],['3 PM','three pm'],['25-year-old','twenty five year old'],['32-bit','thirty two bit'],['Ph.D.','p h d'],['-5','- 5'],['- 5','minus five'],['St.','St'],
 ['In 1990 it was 0.9 percent.','In nineteen ninety it was zero point nine percent'],
];
for(const [caption,answer] of positives)test(`accept ${caption} ← ${answer}`,()=>assert.equal(solve(caption,answer).complete,true));
const negatives=[
 ['15','fifty'],['50','fifteen'],['1st','one'],['1','first'],['3.5','three'],['3.5','thirty five'],['0.05','zero point five'],
 ['1,000','one hundred'],['25%','25'],['25%','twenty five dollars'],['$10','ten'],['$10','ten pounds'],['£10','ten dollars'],['$10.05','ten dollars fifty cents'],
 ['5kg','five'],['5kg','five kilometers'],['5°C','five degrees fahrenheit'],['-5','five'],['+5','five'],['-5','plus five'],['5','- 5'],['5','+ 5'],['- 5','5'],
 ['3:30','thirty'],['3:30','3.30'],['13:30','one thirty'],['3:05','three fifty'],['007','seven'],['001','1'],
 ['one','won'],['two','to'],['four','for'],["it's",'its'],['its',"it's"],["we're",'were'],["I'll",'ill'],
 ["he's",'he has'],["she'd",'she would'],['St.','saint'],['St.','street'],['US','united states'],['II','two'],
 ['3/4/2026','March fourth twenty twenty six'],['3/4','three four'],['1:02:03','one two three'],['1,00','one hundred'],['10-20','ten twenty'],['re-sign','resign'],['1e6','one'],['v1.2.3','one'],['32-bit','thirty two'],
];
for(const [caption,answer] of negatives)test(`reject ${caption} ← ${answer}`,()=>assert.equal(solve(caption,answer).matched,0));
test('atomic formatted slots preserve symbols, titles and contractions',()=>{
 assert.deepEqual(tokens("Mr. Green paid $1,250.50 at 3:30 for 5kg, up 25%."),['Mr.','Green','paid','$1,250.50','at','3:30','for','5kg','up','25%']);
 assert.deepEqual(tokens('3/4/2026 10-20 007 -5 +5'),['3/4/2026','10-20','007','-5','+5']);
});
test('space buffers incomplete multiword alternatives; Enter can explicitly submit',()=>{
 for(const [target,prefix] of [['25','twenty'],['$10','ten'],['2026','two thousand'],['3:30','three'],["didn't",'did']]){
  const r=solve(target,prefix,{deferIncomplete:true});assert.equal(r.pending,true);assert.equal(r.matched,0);
 }
 assert.equal(solve('twenty 25','twenty',{deferIncomplete:false}).matched,1);
 assert.equal(solve('cat','cat',{deferIncomplete:true}).complete,true);
});
test('repeated numeric occurrences, duplicates and partial reveals',()=>{
 const words=tokens('$10 and $10'),opened=[null,null,null];
 let r=submitWords(words,opened,'ten dollars');assert.deepEqual(r.opened,['solved',null,null]);
 r=submitWords(words,r.opened,'10 dollars');assert.deepEqual(r.opened,['solved',null,'solved']);
 r=submitWords(words,r.opened,'ten dollars');assert.ok(r.duplicate);assert.equal(r.matched,0);
 assert.deepEqual(submitWords(['twenty','five'],['revealed',null],'25').opened,['revealed','solved']);
 assert.deepEqual(opened,[null,null,null]);
});
test('old progress migrates by character overlap, not equal array length guesses',()=>{
 const text='$3.50 Mr. Green';
 assert.deepEqual(migrateOpened(text,['solved','revealed','solved',null]),['revealed','solved',null]);
 assert.deepEqual(migrateOpened(text,['solved',null,'solved',null]),[null,'solved',null]);
 assert.deepEqual(migrateOpened(text,['solved','solved',null],TOKEN_VERSION),['solved','solved',null]);
 assert.equal(migrateOpened(text,['solved']),null);
 assert.deepEqual(mapLegacyIndices(text,[2,3]),[1,2]);
});
test('English alternatives are not applied to Korean caption tracks',()=>{
 assert.equal(solve('25','twenty five',{language:'ko'}).matched,0);
 assert.equal(solve('안녕하세요 25','안녕하세요 25',{language:'ko'}).complete,true);
});
test('cardinal property coverage and nearby-value rejection',()=>{
 for(let n=0;n<1000;n+=7){
  assert.equal(solve(String(n),spellInteger(n,true)).complete,true,String(n));
  assert.equal(solve(String(n),spellInteger(n+1,true)).matched,0,String(n));
 }
});
test('a preceding normal word cannot bypass atomic number validation',()=>{
 const r=solve('I paid seventy dollars','I paid seventy one dollars');
 assert.deepEqual(r.opened,['solved','solved',null,null]);
});
test('mixed submissions preserve unmatched and incomplete numeric drafts',()=>{
 let r=solve('cat $25','cat twenty',{deferIncomplete:true});assert.equal(r.pending,true);assert.equal(r.remaining,'twenty');assert.deepEqual(r.opened,['solved',null]);
 r=solve('cat $25','cat twenty six dollars');assert.equal(r.remaining,'twenty six dollars');assert.deepEqual(r.opened,['solved',null]);
});
