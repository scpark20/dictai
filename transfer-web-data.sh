#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
remote=scpark@192.168.0.68
mkdir -p runtime/chapters runtime/conversation runtime/conversation-ko runtime/asr-wasm runtime/asr-wasm-ko
rsync -aL "$remote:/home/scpark/dictai/asr-wasm/" runtime/asr-wasm/
rsync -aL "$remote:/home/scpark/apps/echostep-dev/asr-wasm-ko/" runtime/asr-wasm-ko/
rsync -aL --exclude='*.py' --exclude='*.sh' --exclude='*.log' --exclude='reference*' --exclude='source/' "$remote:/home/scpark/echostep-data/conversation/" runtime/conversation/
rsync -aL --exclude='*.py' --exclude='*.sh' --exclude='*.log' --exclude='reference*' --exclude='source/' "$remote:/home/scpark/echostep-data/conversation-ko/" runtime/conversation-ko/
for chapter in 3 4 5 6 7 8 9; do
  output="runtime/chapters/$chapter"
  mkdir -p "$output/audio-a" "$output/audio-b"
  case "$chapter" in
    3) manifest=/home/scpark/4repeat/jobs/ch003-the-advanced-guard/manifest/ch003.json; proper=/home/scpark/apps/harry-baseline/data/ch003-proper-nouns.json; audio=/home/scpark/harry-dictation-data/chapter3-audio; second=/home/scpark/harry-dictation-data/chapter3-audio-b ;;
    4) manifest=/home/scpark/4repeat/jobs/ch004-number-twelve-grimmauld-place/manifest/ch004.json; proper=/home/scpark/apps/harry-baseline/data/ch004-proper-nouns.json; audio=/home/scpark/harry-dictation-data/chapter4-audio; second=/home/scpark/harry-dictation-data/chapter4-audio-b ;;
    5|6) manifest="/home/scpark/dictai/data/ch00$chapter.json"; proper="/home/scpark/dictai/data/ch00$chapter-proper-nouns.json"; audio="/home/scpark/harry-concise-ch$chapter/audio-a"; second="/home/scpark/harry-concise-ch$chapter/audio-b" ;;
    *) manifest="/home/scpark/harry-concise-ch$chapter/ch00$chapter.json"; proper="/home/scpark/harry-concise-ch$chapter/ch00$chapter-proper-nouns.json"; audio="/home/scpark/harry-concise-ch$chapter/audio-a"; second="/home/scpark/harry-concise-ch$chapter/audio-b" ;;
  esac
  rsync -a "$remote:$manifest" "$output/manifest.json"
  rsync -a "$remote:$proper" "$output/proper-nouns.json"
  rsync -aL --include='*.wav' --exclude='*' "$remote:$audio/" "$output/audio-a/"
  rsync -aL --include='*.wav' --exclude='*' "$remote:$second/" "$output/audio-b/"
  echo "Chapter $chapter copied"
done
echo 'Web playback data copied; no TTS tools, GPU models or source documents transferred.'
