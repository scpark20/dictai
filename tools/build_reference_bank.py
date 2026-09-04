#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import random
import shutil
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from faster_whisper import WhisperModel
from scipy.signal import butter, sosfilt

PIPELINE = Path("/home/scpark/tts/a1-reader-production-v2/code")
OMNI_ROOT = Path("/home/scpark/tts/omnivoice/OmniVoice")
OMNI_MODEL = Path("/home/scpark/tts/omnivoice/models/OmniVoice")
WHISPER_MODEL = Path("/home/scpark/.cache/huggingface/hub/models--Systran--faster-whisper-small.en/snapshots/d1d751a5f8271d482d14ca55d9e2deeebbae577f")
OUTPUT = Path("/home/scpark/harry-concise-ch5/reference-bank")

sys.path[:0] = [str(OMNI_ROOT), str(PIPELINE)]
from omnivoice.models.omnivoice import OmniVoice  # noqa: E402
from generate_expressive_refs_and_enqueue import acoustic_metrics, transcribe_exact  # noqa: E402

SPEAKERS = (
    ("us-male", "male, american accent"),
    ("us-female", "female, american accent"),
    ("uk-male", "male, british accent"),
    ("uk-female", "female, british accent"),
)

SCENES = (
    ("studio-neutral", "clean studio, neutral and clear", "The room is quiet and the microphone is ready. I will speak clearly at a natural pace. Every word should sound calm and easy to follow."),
    ("living-room", "relaxed conversation in a living room", "It has been a long day, so sit down and make yourself comfortable. We can talk for a while before dinner. There is no need to hurry."),
    ("bedroom-streamer", "casual bedroom streamer speaking to viewers", "Hello everyone, welcome back to the stream. Today we are trying something new together. Let me know what you think as we go."),
    ("public-speech", "confident public speech in a large hall", "Thank you all for coming here today. We have worked hard to reach this moment. Together, we can take the next important step."),
    ("classroom-lecture", "friendly teacher addressing a classroom", "Please look at the example on the board. We will work through it one step at a time. Raise your hand whenever you have a question."),
    ("office-meeting", "professional office meeting", "Let us review the plan before the meeting ends. The first task is ready, but the second needs more time. I will send everyone an update this afternoon."),
    ("telephone-call", "natural telephone call with focused delivery", "Hello, I am calling about tomorrow's appointment. Could you confirm the time for me? Please call me back when you receive this message."),
    ("video-call", "compressed video conference style", "Can everyone hear me clearly? I will share the document on the screen now. We can discuss the final question after everyone has read it."),
    ("podcast", "close microphone podcast host", "Welcome to today's short episode. We are going to explore a simple idea with surprising results. Stay with me, and we will examine it together."),
    ("radio-host", "polished local radio presenter", "Good morning, and thanks for joining us. The weather will remain bright through the afternoon. More news and music are coming up after the break."),
    ("quiet-cafe", "friendly conversation in a quiet cafe", "This table by the window is perfect. I ordered some coffee, and the food will arrive soon. Tell me what you have been doing this week."),
    ("busy-restaurant", "clear speech across a busy restaurant table", "The restaurant is busy tonight, but our table is ready. Would you like to order now or wait a few minutes? I can recommend the soup."),
    ("outdoor-street", "clear outdoor street conversation", "The bus stop is just around the corner. We should cross the street before the light changes. Keep your coat closed because the wind is getting stronger."),
    ("train-station", "concise train station announcement", "Attention, please. The next train will arrive on platform four. Passengers should stand behind the line and have their tickets ready."),
    ("airport", "calm airport gate announcement", "May I have your attention, please. Boarding will begin at gate twelve in ten minutes. Families with young children may come forward first."),
    ("car-interior", "casual speech inside a moving car", "The road ahead looks clear, and we should arrive on time. I will turn down the music for a moment. Tell me if you want to stop along the way."),
    ("shop-assistant", "warm retail customer service", "Good afternoon. Let me know if you need help finding anything. This item is available in another color, and I can check the size for you."),
    ("school-friends", "informal conversation with a school friend", "Did you finish the homework for tomorrow? I understood the first question, but the last one was difficult. We can solve it together after lunch."),
    ("library-whisper", "soft restrained library voice, still intelligible", "This section of the library is very quiet. I found the book you mentioned on the upper shelf. We can read it at the table near the window."),
    ("kitchen", "natural conversation while cooking", "The water is almost ready, so please bring me the vegetables. I left the clean plates beside the sink. Dinner should be ready in a few minutes."),
    ("gaming-headset", "energetic gaming headset commentary", "We are almost at the final level. Stay close and watch the door on the left. Great move, everyone; now let us finish this round together."),
    ("storytelling", "warm expressive storyteller", "Long ago, a small light appeared beyond the dark forest. Nobody knew where it came from. One brave traveler decided to follow it before sunrise."),
    ("urgent", "controlled urgency without shouting", "Listen carefully because we do not have much time. Take the keys and wait beside the front door. I will explain everything when we are safely outside."),
    ("tired-soft", "tired gentle late-night voice", "The house is finally quiet, and everyone has gone to bed. I will finish this last page before turning off the light. Tomorrow can begin slowly."),
    ("excited", "bright excited celebratory voice", "We did it, and the results are better than we expected. Everyone worked hard for this moment. Come and celebrate with us before the evening ends."),
)


def profiles() -> list[dict[str, object]]:
    rows = []
    for speaker_index, (speaker_id, speaker_label) in enumerate(SPEAKERS):
        for scene_index, (scene_id, scene_instruction, prompt) in enumerate(SCENES):
            number = speaker_index * 25 + scene_index + 1
            if number == 78:
                prompt = "Hello everyone. Welcome back to the stream. Today we will try a new game together. Tell me what you think while we play."
            age = ("young adult", "middle-aged", "elderly")[(number * 7) % 3]
            pitch = ("low pitch", "moderate pitch", "high pitch")[(number * 11) % 3]
            voice_instruction = f"{speaker_label}, {age}, {pitch}"
            if scene_id == "library-whisper":
                voice_instruction += ", whisper"
            rows.append({
                "id": number,
                "reference_id": f"ref{number:03d}",
                "speaker_group": speaker_id,
                "scene": scene_id,
                "prompt": prompt,
                "instruct": voice_instruction,
                "scene_instruction": scene_instruction,
                "seed_base": 5_100_000 + number * 100,
            })
    return rows


def atomic_json(path: Path, payload: object) -> None:
    temporary = path.with_suffix(path.suffix + f".{os.getpid()}.part")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def apply_scene(audio: np.ndarray, scene: str, seed: int, sample_rate: int) -> np.ndarray:
    result = np.asarray(audio, dtype=np.float32).copy()
    rng = np.random.default_rng(seed)
    if scene == "telephone-call":
        result = sosfilt(butter(5, (300, 3400), btype="bandpass", fs=sample_rate, output="sos"), result)
    elif scene == "video-call":
        result = sosfilt(butter(4, (150, 7000), btype="bandpass", fs=sample_rate, output="sos"), result)
        result = np.round(result * 2048) / 2048
    if scene in {"public-speech", "classroom-lecture", "train-station", "airport"}:
        wet = result.copy()
        for delay_ms, gain in ((55, 0.18), (110, 0.10), (175, 0.05)):
            delay = int(sample_rate * delay_ms / 1000)
            wet[delay:] += result[:-delay] * gain
        result = wet
    noise_db = {
        "bedroom-streamer": -43, "office-meeting": -40, "quiet-cafe": -36,
        "busy-restaurant": -31, "outdoor-street": -32, "car-interior": -34,
        "school-friends": -36, "kitchen": -37, "gaming-headset": -40,
    }.get(scene)
    if noise_db is not None:
        rms = float(np.sqrt(np.mean(result * result))) or 0.05
        noise_rms = rms * (10 ** (noise_db / 20))
        result += rng.normal(0, noise_rms, len(result)).astype(np.float32)
    rms = float(np.sqrt(np.mean(result * result))) or 1.0
    result *= (10 ** (-20 / 20)) / rms
    peak = float(np.max(np.abs(result))) or 1.0
    if peak > 0.95:
        result *= 0.95 / peak
    return result.astype(np.float32)


def canonical_asr_tokens(tokens: list[str]) -> list[str]:
    equivalents = {"4": "four", "12": "twelve", "10": "ten", "traveller": "traveler"}
    return [equivalents.get(token, token) for token in tokens]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=int, required=True)
    parser.add_argument("--end", type=int, required=True)
    parser.add_argument("--candidates", type=int, default=3)
    args = parser.parse_args()
    selected = [row for row in profiles() if args.start <= int(row["id"]) <= args.end]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    atomic_json(OUTPUT / "profiles.json", profiles())

    model = OmniVoice.from_pretrained(str(OMNI_MODEL), device_map="cuda:0", dtype=torch.float16)
    whisper = WhisperModel(str(WHISPER_MODEL), device="cpu", compute_type="int8", cpu_threads=4)
    for row in selected:
        reference_id = str(row["reference_id"])
        final_audio = OUTPUT / f"{reference_id}.wav"
        final_text = OUTPUT / f"{reference_id}.txt"
        final_meta = OUTPUT / f"{reference_id}.json"
        if final_audio.is_file() and final_text.is_file() and final_meta.is_file():
            print(json.dumps({"reference": reference_id, "state": "reused"}), flush=True)
            continue
        candidates = []
        for candidate_number in range(1, args.candidates + 1):
            seed = int(row["seed_base"]) + candidate_number
            random.seed(seed); np.random.seed(seed); torch.manual_seed(seed); torch.cuda.manual_seed_all(seed)
            generated = model.generate(text=str(row["prompt"]), language="English", instruct=str(row["instruct"]), num_step=32, guidance_scale=2.0, speed=1.0, denoise=True, postprocess_output=True)[0]
            audio = apply_scene(np.asarray(generated, dtype=np.float32).reshape(-1), str(row["scene"]), seed, model.sampling_rate)
            candidate_path = OUTPUT / f".{reference_id}-candidate-{candidate_number}.wav"
            sf.write(candidate_path, audio, model.sampling_rate, subtype="PCM_16")
            asr = transcribe_exact(whisper, candidate_path, str(row["prompt"]))
            asr["exactTokenMatch"] = canonical_asr_tokens(asr["expectedTokens"]) == canonical_asr_tokens(asr["observedTokens"])
            candidates.append({"number": candidate_number, "seed": seed, "path": str(candidate_path), "asr": asr, **acoustic_metrics(candidate_path)})
        exact = [item for item in candidates if item["asr"]["exactTokenMatch"]]
        if not exact:
            atomic_json(OUTPUT / f"{reference_id}.failed.json", {**row, "candidates": candidates})
            print(json.dumps({"reference": reference_id, "state": "failed"}), flush=True)
            continue
        winner = max(exact, key=lambda item: float(item["expressivenessScore"]))
        temporary_audio = final_audio.with_suffix(f".wav.{os.getpid()}.part")
        shutil.copy2(winner["path"], temporary_audio)
        os.replace(temporary_audio, final_audio)
        final_text.write_text(str(row["prompt"]) + "\n", encoding="utf-8")
        atomic_json(final_meta, {**row, "selected_candidate": winner["number"], "selected_seed": winner["seed"], "metrics": {key: winner[key] for key in ("energyRangeDb", "pitchRangeSemitones", "pauseCount", "pauseSeconds", "expressivenessScore")}, "asr": winner["asr"]})
        for item in candidates:
            Path(str(item["path"])).unlink(missing_ok=True)
        print(json.dumps({"reference": reference_id, "state": "completed", "score": winner["expressivenessScore"]}), flush=True)


if __name__ == "__main__":
    main()
