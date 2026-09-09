"""Build Chapter 11 with OmniVoice and a speech-presence-only acceptance gate."""
import argparse
import hashlib
import json
import os
import random
import subprocess
import time
from pathlib import Path
import numpy as np
import soundfile as sf
import torch
from omnivoice import OmniVoice

ROOT = Path('/home/scpark/harry-concise-ch11')
REFS = Path('/home/scpark/harry-concise-ch10-omni-repair/references')
SEED = 60911362

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def save(path, value):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    os.replace(temp, path)

def assignments(count):
    rng = random.Random(SEED)
    def sequence():
        result = []
        while len(result) < count:
            batch = list(range(1,101)); rng.shuffle(batch); result.extend(batch)
        return result[:count]
    a,b = sequence(),sequence()
    for i in range(count):
        if a[i] == b[i]:
            j = next(j for j in range(count) if j != i and a[i] != b[j] and a[j] != b[i])
            b[i],b[j] = b[j],b[i]
    assert all(x != y for x,y in zip(a,b))
    assert len(set(a)) == len(set(b)) == 100
    return a,b

def main():
    p=argparse.ArgumentParser(); p.add_argument('--take',type=int,choices=[1,2],required=True)
    take=p.parse_args().take
    output=ROOT/('audio-a' if take==1 else 'audio-b'); output.mkdir(parents=True,exist_ok=True)
    status=ROOT/f'take-{take}-status.json'
    payload=json.loads((ROOT/'ch011.json').read_text())
    unique={}
    for row in payload['blocks']: unique.setdefault(row['sentence_id'],row)
    rows=sorted(unique.values(),key=lambda r:r['sentence_ordinal'])
    count=len(rows)
    assert count==181
    paired_refs=assignments(len(rows))
    refs=paired_refs[take-1]
    save(status,{'state':'loading','completed':0,'target':count})
    model=OmniVoice.from_pretrained('k2-fsa/OmniVoice',device_map='cuda:0',dtype=torch.float16)
    checker=subprocess.Popen(['/home/scpark/miniconda3/envs/soulx/bin/python','-u',str(ROOT/'code/speech_presence_check.py')],
        stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,bufsize=1,env={**os.environ,'CUDA_VISIBLE_DEVICES':''})
    def speech_check(path):
        checker.stdin.write(json.dumps({'path':str(path)})+'\n');checker.stdin.flush()
        result=json.loads(checker.stdout.readline())
        if 'error' in result:raise RuntimeError(result['error'])
        return result
    cache={}; started=time.time()
    for index,(row,ref) in enumerate(zip(rows,refs)):
        ordinal=row['sentence_ordinal']; ref_id=f'ref{ref:03d}'
        ref_audio=REFS/f'{ref_id}.wav'; ref_text=REFS/f'{ref_id}.txt'
        ref_hash=sha(ref_audio)
        wav=output/f'{ordinal:04d}.wav'; receipt=wav.with_suffix('.json')
        seed=SEED+take*100000+ordinal
        valid=False
        if wav.exists() and receipt.exists():
            prev=json.loads(receipt.read_text())
            previous_ref=prev.get('reference_id','')
            if previous_ref.startswith('ref') and previous_ref[3:].isdigit():
                previous_audio=REFS/f'{previous_ref}.wav'
                if previous_audio.exists(): ref_hash=sha(previous_audio)
            valid=(prev.get('engine')=='OmniVoice' and prev.get('base_seed')==seed and prev.get('speech_check',{}).get('speech_detected') is True
                   and prev.get('reference_sha256')==ref_hash and prev.get('speak_hash')==row['speak_hash']
                   and prev.get('sha256')==sha(wav))
        if not valid:
            candidates=[ref]+[r for r in range(1,101) if r not in (ref,paired_refs[2-take][index])]
            for retry in range(36):
                ref_id=f'ref{candidates[retry//12]:03d}'
                ref_audio=REFS/f'{ref_id}.wav'; ref_text=REFS/f'{ref_id}.txt';ref_hash=sha(ref_audio)
                if ref_id not in cache:
                    cache[ref_id]=model.create_voice_clone_prompt(ref_audio=str(ref_audio),ref_text=ref_text.read_text().strip())
                used_seed=seed+retry*100003
                random.seed(used_seed); np.random.seed(used_seed); torch.manual_seed(used_seed); torch.cuda.manual_seed_all(used_seed)
                audio=np.asarray(model.generate(text=row['speak_text'],language='English',
                    voice_clone_prompt=cache[ref_id],num_step=32,guidance_scale=2.0,
                    denoise=True,postprocess_output=True)[0],dtype=np.float32).reshape(-1)
                sr=model.sampling_rate
                assert np.isfinite(audio).all() and .3<len(audio)/sr<30,(ordinal,len(audio)/sr)
                rms=float(np.sqrt(np.mean(audio.astype(np.float64)**2)))
                peak=float(np.max(np.abs(audio)))
                assert rms>.001
                gain=min(.1/rms,(10**(-1/20))/peak)
                audio*=gain
                tmp=wav.with_suffix('.candidate.wav'); sf.write(tmp,audio,sr,format='WAV',subtype='PCM_16')
                detected=speech_check(tmp)
                if detected['speech_detected']:
                    os.replace(tmp,wav);break
                print(f'retrying speech-absent take {take} sentence {ordinal} attempt {retry+1}',flush=True)
            else:raise RuntimeError(f'No speech after retries: take {take}, sentence {ordinal}')
            record={k:row[k] for k in ('sentence_id','sentence_ordinal','display_text','speak_text','display_hash','speak_hash')}
            record.update({'engine':'OmniVoice','reference_bank':str(REFS),'reference_id':ref_id,
                'reference_sha256':ref_hash,'reference_text_sha256':sha(ref_text),'base_seed':seed,'seed':used_seed,'speech_check':detected,
                'take_ordinal':take,'sample_rate':sr,'sha256':sha(wav),'duration':len(audio)/sr,
                'normalization':{'target_rms_dbfs':-20,'gain_db':float(20*np.log10(gain))},
                'state':'speech_present'})
            save(receipt,record)
        save(status,{'state':'complete' if index==count-1 else 'generating','completed':index+1,
            'target':count,'elapsed_seconds':round(time.time()-started),'updated_at':time.time()})
        if (index+1)%10==0 or index==count-1: print(f'take {take}: {index+1}/{count}',flush=True)
    checker.stdin.close();checker.wait(timeout=30)

if __name__=='__main__': main()
