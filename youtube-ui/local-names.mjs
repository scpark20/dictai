// Lightweight local hints, NOT a replacement claiming spaCy-equivalent NER.
// Keep the original tokens and never rewrite the displayed answer.
import {tokens} from './youtube-core.mjs';
export function localNameIndices(text) {
  const words=tokens(text),result=[];
  const excluded=new Set('I A An The This That These Those He She It We They You My Your His Her Our Their And But Or So Then When Where Why How What Who If As At In On For From To With Of Not Yes No'.split(' '));
  const titles=new Set(['Mr','Mrs','Ms','Dr','Mister','Missus','Miss','Professor','Sir']);
  words.forEach((word,i)=>{
    const clean=word.replace(/[^\p{L}'-]/gu,'');
    if(titles.has(clean)||(!excluded.has(clean)&&/^\p{Lu}/u.test(clean)&&(i>0||/^[A-Z]{2,}$/.test(clean)||/^\p{Lu}/u.test(words[i+1]||''))))result.push(i);
  });
  return result;
}
