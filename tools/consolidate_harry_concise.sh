#!/usr/bin/env bash
set -euo pipefail

home_root=/home/scpark
root=/home/scpark/harry-concise
chapters="$root/chapters"
archive="$root/archive"
runs="$root/runs/ch15-38"

state="$(python3 -c 'import json; print(json.load(open("/home/scpark/harry-concise-ch15-38-ambient-batch/status.json"))["state"])')"
[[ "$state" == "complete" ]] || { echo "audio batch is not complete" >&2; exit 2; }

mkdir -p "$chapters" "$archive" "$runs"
mkdir -p "$root/references"
ln -sfn /home/scpark/omni-reference-100-fresh-20260910/ambient-bank "$root/references/ambient-bank"
ln -sfn /home/scpark/omni-reference-100-fresh-20260910/speech-audit.json "$root/references/speech-audit.json"

for number in $(seq 3 38); do
  chapter="$(printf 'ch%02d' "$number")"
  mkdir -p "$chapters/$chapter"
done

# Chapters 3-4 keep their established audio stores, exposed through one canonical tree.
cp -p /home/scpark/4repeat/jobs/ch003-the-advanced-guard/manifest/ch003.json "$chapters/ch03/manifest.json"
cp -p /home/scpark/apps/harry-baseline/data/ch003-proper-nouns.json "$chapters/ch03/proper-nouns.json"
ln -sfn /home/scpark/harry-dictation-data/chapter3-audio "$chapters/ch03/audio-a"
ln -sfn /home/scpark/harry-dictation-data/chapter3-audio-b "$chapters/ch03/audio-b"

cp -p /home/scpark/4repeat/jobs/ch004-number-twelve-grimmauld-place/manifest/ch004.json "$chapters/ch04/manifest.json"
cp -p /home/scpark/apps/harry-baseline/data/ch004-proper-nouns.json "$chapters/ch04/proper-nouns.json"
ln -sfn /home/scpark/harry-dictation-data/chapter4-audio "$chapters/ch04/audio-a"
ln -sfn /home/scpark/harry-dictation-data/chapter4-audio-b "$chapters/ch04/audio-b"

# Move chapter-owned manifests and audio into the canonical chapter directories.
for number in $(seq 5 38); do
  source="$home_root/harry-concise-ch$number"
  chapter="$(printf 'ch%02d' "$number")"
  target="$chapters/$chapter"
  manifest="$(printf 'ch%03d.json' "$number")"
  proper="$(printf 'ch%03d-proper-nouns.json' "$number")"
  [[ -f "$source/$manifest" ]] && mv "$source/$manifest" "$target/manifest.json"
  [[ -f "$source/$proper" ]] && mv "$source/$proper" "$target/proper-nouns.json"
  if (( number <= 10 )); then
    [[ -d "$source/audio-a" ]] && mv "$source/audio-a" "$target/audio-a"
    [[ -d "$source/audio-b" ]] && mv "$source/audio-b" "$target/audio-b"
  fi
  if [[ -d "$source" ]]; then
    mkdir -p "$archive/chapter-extras"
    mv "$source" "$archive/chapter-extras/$chapter"
  fi
done

cp -p /home/scpark/dictai/data/ch005.json "$chapters/ch05/manifest.json"
cp -p /home/scpark/dictai/data/ch005-proper-nouns.json "$chapters/ch05/proper-nouns.json"
cp -p /home/scpark/dictai/data/ch006.json "$chapters/ch06/manifest.json"
cp -p /home/scpark/dictai/data/ch006-proper-nouns.json "$chapters/ch06/proper-nouns.json"

# Chapter 11-14 use the newer ambient renders.
for number in 11 12 13 14; do
  source="$home_root/harry-concise-ch${number}-ambient-100"
  chapter="$(printf 'ch%02d' "$number")"
  target="$chapters/$chapter"
  mv "$source/audio-a" "$target/audio-a"
  mv "$source/audio-b" "$target/audio-b"
  mkdir -p "$runs/$chapter"
  find "$source" -maxdepth 1 -type f -exec mv {} "$runs/$chapter/" \;
  rmdir "$source"
done

# Chapter 15-38 audio was generated in one batch but remains separated per chapter.
batch="$home_root/harry-concise-ch15-38-ambient-batch"
for number in $(seq 15 38); do
  chapter="$(printf 'ch%02d' "$number")"
  mv "$batch/$chapter/audio-a" "$chapters/$chapter/audio-a"
  mv "$batch/$chapter/audio-b" "$chapters/$chapter/audio-b"
  rmdir "$batch/$chapter"
done
mv "$batch/status.json" "$runs/status.json"
rmdir "$batch"

# Shared source and batch metadata belong under the single project root.
if [[ -d "$archive/chapter-extras/ch10/source" ]]; then
  mv "$archive/chapter-extras/ch10/source" "$root/source"
fi
mv "$home_root/harry-concise-ch15-38-batch.json" "$runs/batch.json"

# Keep obsolete attempts recoverable, but remove them from the home-directory surface.
for name in harry-concise-ch10-omni-repair harry-concise-ch10-omni-v2 harry-concise-ch15-38-ambient-100; do
  [[ -e "$home_root/$name" ]] && mv "$home_root/$name" "$archive/$name"
done

echo "consolidated"
