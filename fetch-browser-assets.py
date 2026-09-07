"""Download the existing Korean browser ASR assets, not a TTS generation model."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import httpx

root = Path(__file__).resolve().parent / 'runtime'
model = 'onnx-community/whisper-base'
with httpx.Client(follow_redirects=True, timeout=60) as client:
    response = client.get(f'https://huggingface.co/api/models/{model}')
    response.raise_for_status()
    info = response.json()
revision = info['sha']
files = [item['rfilename'] for item in info['siblings'] if '/' not in item['rfilename'] and item['rfilename'].endswith(('.json', '.txt'))]
files += ['onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx']
destination = root / 'models' / model

def download(name):
    target = destination / name
    target.parent.mkdir(parents=True, exist_ok=True)
    url = f'https://huggingface.co/{model}/resolve/{revision}/{name}'
    with httpx.stream('GET', url, follow_redirects=True, timeout=180) as response:
        response.raise_for_status()
        with target.open('wb') as stream:
            for chunk in response.iter_bytes():
                stream.write(chunk)
    print('Browser ASR asset:', name, target.stat().st_size, flush=True)
    return {'path': str(target.relative_to(root)), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'bytes': target.stat().st_size}

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    receipts = list(pool.map(download, files))
(root / 'browser-asr-assets.json').write_text(json.dumps({'model': model, 'revision': revision, 'files': receipts}, indent=2) + '\n')
