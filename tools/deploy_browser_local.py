"""Deploy only the reviewed browser-import surface; keep audio/data/ASR untouched."""
import pathlib
import shutil
import subprocess

repo = pathlib.Path('/home/scpark/apps/dictai-youtube')
live = pathlib.Path('/home/scpark/apps/echostep-dev')
base = '18210ac'
revision = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=repo, text=True).strip()
existing = ['server.py', 'youtube-ui/youtube.js', 'youtube-ui/youtube.html', 'youtube-ui/youtube.css', 'youtube-ui/practice-provider.mjs']
new = ['youtube-ui/local-captions.mjs', 'youtube-ui/browser-bridge.mjs', 'youtube-ui/local-names.mjs', 'youtube-ui/dictai-caption-bridge.zip']
for name in existing:
    expected = subprocess.check_output(['git', 'show', f'{base}:{name}'], cwd=repo)
    if (live / name).read_bytes() != expected:
        raise SystemExit(f'Live file changed independently: {name}. Deployment stopped.')
for name in new:
    if (live / name).exists():
        raise SystemExit(f'Unexpected existing file: {name}. Deployment stopped.')
backup = pathlib.Path('/home/scpark/dictai-youtube-deploy') / revision
backup.mkdir(parents=True, exist_ok=False)
for name in existing:
    (backup / name).parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(live / name, backup / name)
for name in existing + new:
    shutil.copy2(repo / name, live / name)
print(f'Deployed {len(existing + new)} runtime files. Backup: {backup}')
