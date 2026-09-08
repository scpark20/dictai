"""CPU speech-presence check. Never accepts or compares an expected script."""
import json
import sys
from pathlib import Path
from math import gcd
import numpy as np
import soundfile as sf
import sherpa_onnx
from scipy.signal import resample_poly

M=Path('/home/scpark/asr-models/sherpa-onnx-streaming-zipformer-en-2023-06-26')
r=sherpa_onnx.OnlineRecognizer.from_transducer(tokens=str(M/'tokens.txt'),
    encoder=str(M/'encoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx'),
    decoder=str(M/'decoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx'),
    joiner=str(M/'joiner-epoch-99-avg-1-chunk-16-left-128.int8.onnx'),num_threads=4)
for line in sys.stdin:
    try:
        path=json.loads(line)['path']
        a,sr=sf.read(path,dtype='float32')
        if a.ndim==2:a=a.mean(axis=1)
        g=gcd(sr,16000);a=resample_poly(a,16000//g,sr//g)
        s=r.create_stream();s.accept_waveform(16000,np.r_[a,np.zeros(8000,dtype='float32')]);s.input_finished()
        while r.is_ready(s):r.decode_stream(s)
        text=r.get_result(s).strip()
        print(json.dumps({'speech_detected':bool(text),'recognized_words':len(text.split()),
            'method':'existing speech recognizer, nonempty result; no script comparison'}),flush=True)
    except Exception as e:print(json.dumps({'error':str(e),'speech_detected':False}),flush=True)
