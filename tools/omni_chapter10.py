"""Rebuild only Chapter 10 using the selected OmniVoice reference bank."""
import argparse
import hashlib
import json
import os
import random
import time
from pathlib import Path
import numpy as np
import soundfile as sf
import torch
from omnivoice import OmniVoice

ROOT = Path('/home/scpark/harry-concise-ch10-omni-v2')
REFS = Path('/home/scpark/omni-reference-100-v2/selected')
SEED = 60910302

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
    payload=json.loads((ROOT/'ch010.json').read_text())
    unique={}
    for row in payload['blocks']: unique.setdefault(row['sentence_id'],row)
    rows=sorted(unique.values(),key=lambda r:r['sentence_ordinal'])
    assert len(rows)==151
    refs=assignments(len(rows))[take-1]
    save(status,{'state':'loading','completed':0,'target':151})
    model=OmniVoice.from_pretrained('k2-fsa/OmniVoice',device_map='cuda:0',dtype=torch.float16)
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
            valid=(prev.get('engine')=='OmniVoice' and prev.get('seed')==seed
                   and prev.get('reference_sha256')==ref_hash and prev.get('speak_hash')==row['speak_hash']
                   and prev.get('sha256')==sha(wav))
        if not valid:
            if ref_id not in cache:
                cache[ref_id]=model.create_voice_clone_prompt(ref_audio=str(ref_audio),ref_text=ref_text.read_text().strip())
            random.seed(seed); np.random.seed(seed); torch.manual_seed(seed); torch.cuda.manual_seed_all(seed)
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
            tmp=wav.with_suffix('.part'); sf.write(tmp,audio,sr,format='WAV',subtype='PCM_16'); os.replace(tmp,wav)
            record={k:row[k] for k in ('sentence_id','sentence_ordinal','display_text','speak_text','display_hash','speak_hash')}
            record.update({'engine':'OmniVoice','reference_bank':str(REFS),'reference_id':ref_id,
                'reference_sha256':ref_hash,'reference_text_sha256':sha(ref_text),'seed':seed,
                'take_ordinal':take,'sample_rate':sr,'sha256':sha(wav),'duration':len(audio)/sr,
                'normalization':{'target_rms_dbfs':-20,'gain_db':float(20*np.log10(gain))},
                'state':'generated'})
            save(receipt,record)
        save(status,{'state':'complete' if index==150 else 'generating','completed':index+1,
            'target':151,'elapsed_seconds':round(time.time()-started),'updated_at':time.time()})
        if (index+1)%10==0 or index==150: print(f'take {take}: {index+1}/151',flush=True)

if __name__=='__main__': main()
