"""Repair speech-absent references and affected Chapter 10 WAVs in a separate stage."""
import hashlib
import json
import os
import random
import shutil
import subprocess
import time
from pathlib import Path
import numpy as np
import soundfile as sf
import torch
from omnivoice import OmniVoice

OLD=Path('/home/scpark/harry-concise-ch10-omni-v2')
OLDREF=Path('/home/scpark/omni-reference-100-v2/selected')
ROOT=Path('/home/scpark/harry-concise-ch10-omni-repair')
REF=ROOT/'references'
CODE=ROOT/'code'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,data):
    t=p.with_suffix('.tmp');t.write_text(json.dumps(data,indent=2)+'\n');os.replace(t,p)
def status(phase,done,total,**extra):
    save(ROOT/'status.json',{'phase':phase,'completed':done,'target':total,'updated_at':time.time(),**extra})
    print(json.dumps({'phase':phase,'completed':done,'target':total,**extra}),flush=True)

def main():
    ROOT.mkdir(exist_ok=True)
    assert not (ROOT/'repair-report.json').exists(),'Already completed; do not overwrite'
    audit=json.loads((OLD/'speech-audit.json').read_text())
    assert audit['completed']==audit['target']==402
    badrefs={r['reference_id'] for r in audit['rows'] if r['kind']=='reference' and r['flag']=='no_transcript'}
    empty={Path(r['path']).relative_to(OLD).as_posix() for r in audit['rows'] if r['kind']=='chapter' and r['flag']=='no_transcript'}
    for folder in ('audio-a','audio-b'):
        shutil.copytree(OLD/folder,ROOT/folder,dirs_exist_ok=True)
    shutil.copytree(OLDREF,REF,dirs_exist_ok=True)
    for name in ('ch010.json','ch010-proper-nouns.json'):shutil.copy2(OLD/name,ROOT/name)
    jobs=[]
    for folder in ('audio-a','audio-b'):
        for p in sorted((ROOT/folder).glob('*.json')):
            m=json.loads(p.read_text()); rel=p.with_suffix('.wav').relative_to(ROOT).as_posix()
            if m['reference_id'] in badrefs or rel in empty:jobs.append((p,m))
    status('loading',0,len(badrefs)+len(jobs),references=len(badrefs),chapter_audio=len(jobs))
    model=OmniVoice.from_pretrained('k2-fsa/OmniVoice',device_map='cuda:0',dtype=torch.float16)
    checker=subprocess.Popen(['/home/scpark/miniconda3/envs/soulx/bin/python','-u',str(CODE/'speech_presence_check.py')],
        stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,bufsize=1,env={**os.environ,'CUDA_VISIBLE_DEVICES':''})
    report={'references':[],'chapter_audio':[],'criterion':'speech presence only; no expected-text comparison'}
    def check(path):
        checker.stdin.write(json.dumps({'path':str(path)})+'\n');checker.stdin.flush()
        answer=json.loads(checker.stdout.readline())
        if 'error' in answer:raise RuntimeError(answer['error'])
        return answer
    def generate(path,seed,**kwargs):
        for retry in range(8):
            current=seed+retry*100003
            random.seed(current);np.random.seed(current);torch.manual_seed(current);torch.cuda.manual_seed_all(current)
            a=np.asarray(model.generate(language='English',num_step=32,guidance_scale=2.0,
                denoise=True,postprocess_output=True,**kwargs)[0],dtype='float32').reshape(-1)
            sr=model.sampling_rate
            if not np.isfinite(a).all() or len(a)/sr<.3:continue
            rms=float(np.sqrt(np.mean(a.astype('float64')**2)));peak=float(abs(a).max())
            if rms<.001:continue
            gain=min(.1/rms,10**(-1/20)/peak);a*=gain
            candidate=path.with_suffix('.candidate.wav');sf.write(candidate,a,sr,subtype='PCM_16')
            checked=check(candidate)
            if checked['speech_detected']:
                os.replace(candidate,path)
                return {'seed':current,'sample_rate':sr,'duration':len(a)/sr,'sha256':sha(path),
                    'normalization':{'target_rms_dbfs':-20,'gain_db':float(20*np.log10(gain))},'speech_check':checked}
            print(f'retrying speech-absent {path.name}: {retry+1}',flush=True)
        raise RuntimeError(f'No speech after bounded retries: {path}')
    try:
        for i,refid in enumerate(sorted(badrefs),1):
            p=REF/(refid+'.json'); m=json.loads(p.read_text());wav=p.with_suffix('.wav')
            info=generate(wav,70910000+i*1009,text=m['text'],instruct=m['instruction'],speed=m.get('speed',1.0))
            m.pop('nearest_selected_cosine',None)
            m.update(info);m['previous_sha256']=sha(OLDREF/wav.name);m['source_candidate']=str(wav)
            save(p,m);report['references'].append({'reference_id':refid,**info})
            status('references',i,len(badrefs),last=refid)
        cache={}
        for i,(p,m) in enumerate(jobs,1):
            refid=m['reference_id'];refwav=REF/(refid+'.wav');reftxt=REF/(refid+'.txt')
            if refid not in cache:cache[refid]=model.create_voice_clone_prompt(ref_audio=str(refwav),ref_text=reftxt.read_text().strip())
            info=generate(p.with_suffix('.wav'),71910000+i*1013,text=m['speak_text'],voice_clone_prompt=cache[refid])
            m.update(info);m.update(reference_bank=str(REF),reference_sha256=sha(refwav),reference_text_sha256=sha(reftxt),state='speech_present')
            save(p,m);report['chapter_audio'].append({'file':str(p.with_suffix('.wav').relative_to(ROOT)),**info})
            status('chapter_audio',i,len(jobs),last=p.with_suffix('.wav').relative_to(ROOT).as_posix())
        records=[json.loads(p.read_text()) for p in sorted(REF.glob('ref*.json'))]
        save(REF/'manifest.json',{'engine':'OmniVoice','count':100,'records':records,
            'criterion':'speech presence only; repaired files checked, unchanged files retained from prior audit'})
        save(ROOT/'repair-report.json',report)
        status('complete',len(badrefs)+len(jobs),len(badrefs)+len(jobs))
    finally:
        checker.stdin.close();checker.wait(timeout=30)

if __name__=='__main__':
    try:main()
    except Exception as e:
        status('failed',0,0,error=str(e));raise
