# Approved Conversation audio baseline

Approved by the user on 2026-09-05 after reviewing the six SoulX scene samples:
https://192.168.0.68:8771/tts-eval?set=soulx-scenes

This is the reference method for subsequent Conversation work. Saving this
decision does not restart bulk generation or publish new learning content.
Book content is unaffected.

## Method to preserve

- Use SoulX-Podcast with existing OmniVoice speaker references.
- Choose an environment appropriate to the dialogue, then two distinct speakers
  whose references belong to that same environment. Keep those identities and
  their environment fixed throughout that dialogue.
- Vary speaker pairings across dialogues, including male/female, female/male,
  male/male and female/female, with US and UK voices as appropriate.
- Use normal, intelligible conversational delivery. Do not choose whispering
  or tired/soft references unless the actual situation calls for them.
- Submit the complete speaker-tagged dialogue in one request, preserving its
  conversational context. Do not issue independent requests per sentence.
- SoulX still synthesizes each turn's waveform separately and concatenates
  them internally. The approved samples use this structure; do not describe
  it as a single continuous waveform generation.
- Preserve the generated pauses and relative speaker loudness. The samples use
  only one constant gain across the full clip, capped at +3 dB and -1 dBFS peak.
  They do not add ambience, crossfades, silence, or noise gating.
- Include noisy-scene listening examples. A scene label does not itself prove
  that background noise is present or continuous. User approval of this sample
  method is not a blanket quality guarantee for future generated clips.

## Reproducible samples

The exact four-turn scripts, reference pairs and scene labels are saved in
`tools/soulx_scene_samples.json`. Generation is implemented in
`tools/generate_soulx_scene_samples.py`.

Parameters: temperature 0.6, top-k 100, top-p 0.9, repetition penalty 1.25;
seeds 9820–9825 in specification order.

| Sample | References | Seed |
|---|---|---|
| Busy restaurant | ref012 / ref037 | 9820 |
| Street traffic | ref063 / ref088 | 9821 |
| Train station | ref014 / ref089 | 9822 |
| Inside a moving car | ref016 / ref066 | 9823 |
| Busy kitchen | ref045 / ref095 | 9824 |
| Gaming headsets | ref021 / ref046 | 9825 |

## Saved artifacts on server 68

- Final audio, raw waveforms and per-sample receipts:
  `/home/scpark/echostep-data/conversation/tts-eval/audio/soulx-scenes/`
- Generator and exact sample specification:
  `/home/scpark/echostep-data/conversation/continuity-example/`
- Original reference bank:
  `/home/scpark/harry-concise-ch5/reference-bank/`

Keep the approved sample files unchanged as a listening baseline. New trials
should use a new output directory and separate sample identifiers.
