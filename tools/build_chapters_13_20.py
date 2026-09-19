"""Build strict Chapter 13-20 manifests from the shared reader PDF and TTS script."""

from __future__ import annotations

import difflib
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, "/home/scpark/apps/echostep-dev")
from dictai_pipeline import validate_manifest_payload  # noqa: E402


PDF = Path("/home/scpark/harry-concise-ch10/source/reader.pdf")
TTS = Path("/home/scpark/harry-concise-ch10/source/tts.txt")

CHAPTERS = (
    (13, "Thirteen", "Detention with Dolores", "Chapter Thirteen. Detention with Duh-lor-us.", 120, 131, 230),
    (14, "Fourteen", "Percy and Padfoot", "Chapter Fourteen. Percy and Padfoot.", 132, 141, 190),
    (15, "Fifteen", "The Hogwarts High Inquisitor", "Chapter Fifteen. The Hog-warts High Inquisitor.", 142, 150, 170),
    (16, "Sixteen", "In the Hog's Head", "Chapter Sixteen. In the Hog's Head.", 151, 160, 185),
    (17, "Seventeen", "Educational Decree Number Twenty-Four", "Chapter Seventeen. Educational Decree Number Twenty-Four.", 161, 170, 190),
    (18, "Eighteen", "Dumbledore's Army", "Chapter Eighteen. Dum-bull-door's Army.", 171, 180, 190),
    (19, "Nineteen", "The Lion and the Serpent", "Chapter Nineteen. The Lion and the Serpent.", 181, 189, 165),
    (20, "Twenty", "Hagrid's Tale", "Chapter Twenty. Hag-rid's Tale.", 190, 198, 170),
)

NEXT_SPEAK = {
    13: "Chapter Fourteen. Percy and Padfoot.",
    14: "Chapter Fifteen. The Hog-warts High Inquisitor.",
    15: "Chapter Sixteen. In the Hog's Head.",
    16: "Chapter Seventeen. Educational Decree Number Twenty-Four.",
    17: "Chapter Eighteen. Dum-bull-door's Army.",
    18: "Chapter Nineteen. The Lion and the Serpent.",
    19: "Chapter Twenty. Hag-rid's Tale.",
    20: "Chapter Twenty-One. The Eye of the Snake.",
}

REPLACEMENTS = (
    ("O W L exam examinations", "O.W.L. examinations"),
    ("O W L exam subjects", "O.W.L. subjects"),
    ("O W L exam level", "O.W.L. level"),
    ("O W L exams", "O.W.L.s"),
    ("Her-my-oh-nee", "Hermione"),
    ("Muh-gon-uh-gull", "McGonagall"),
    ("Vole-duh-mort", "Voldemort"),
    ("Dum-bull-door", "Dumbledore"),
    ("Trih-law-nee", "Trelawney"),
    ("Grif-in-dor", "Gryffindor"),
    ("Kwid-itch", "Quidditch"),
    ("Shay-mus", "Seamus"),
    ("Nev-uhl", "Neville"),
    ("Um-bridge", "Umbridge"),
    ("Duh-lor-us", "Dolores"),
    ("Missus Weez-lee", "Mrs. Weasley"),
    ("Missus", "Mrs."),
    ("Grub-lee Plank", "Grubbly-Plank"),
    ("Loo-see-us Mal-foy", "Lucius Malfoy"),
    ("Loo-see-us", "Lucius"),
    ("Dray-koh", "Draco"),
    ("Mal-foyz", "Malfoys"),
    ("Mal-foy", "Malfoy"),
    ("Az-kuh-ban", "Azkaban"),
    ("Kwoff-ul", "Quaffle"),
    ("Slith-er-ins", "Slytherins"),
    ("Slith-er-in", "Slytherin"),
    ("Hur-meez", "Hermes"),
    ("Weez-lee", "Weasley"),
    ("Mak-seem", "Maxime"),
    ("Hogs-meed", "Hogsmeade"),
    ("Kwir-ul", "Quirrell"),
    ("Puh-troh-nus", "Patronus"),
    ("Dih-men-tors", "Dementors"),
    ("Dih-men-tor", "Dementor"),
    ("Reh-par-oh", "Reparo"),
    ("Im-per-vee-us", "Impervius"),
    ("Dob-ee", "Dobby"),
    ("Hed-wig", "Hedwig"),
    ("Mare-ee-et-uh", "Marietta"),
    ("Ex-pell-ee-ar-mus", "Expelliarmus"),
    ("Par-vuh-tee", "Parvati"),
    ("Ray-ven-claws", "Ravenclaws"),
    ("Ray-ven-claw", "Ravenclaw"),
    ("Gal-ee-un", "Galleon"),
    ("Blud-jer", "Bludger"),
    ("Pom-free", "Pomfrey"),
    ("Mug-uls", "Muggles"),
    ("Goo-bray-thee-an", "Gubraithian"),
    ("Mak-nair", "Macnair"),
    ("Gol-go-math", "Golgomath"),
    ("Zak-uh-rye-us", "Zacharias"),
    ("Saint Mungo's", "St. Mungo's"),
    ("Mak-mill-an", "Macmillan"),
    ("Huf-ful-puff", "Hufflepuff"),
    ("Seer-ee-us", "Sirius"),
    ("Hog-warts", "Hogwarts"),
    ("Hag-rid", "Hagrid"),
    ("Aw-rors", "Aurors"),
    ("Aw-ror", "Auror"),
    ("Choh", "Cho"),
    ("Draft of Peace", "Draught of Peace"),
    ("Loo-pin", "Lupin"),
    ("Peevz", "Peeves"),
)


def digest_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def digest_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def comparable(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def display_sentences(start_page: int, end_page: int, body_count: int) -> list[str]:
    extracted = subprocess.check_output(
        ["pdftotext", "-f", str(start_page), "-l", str(end_page), "-layout", str(PDF), "-"],
        text=True,
    )
    found: dict[int, str] = {}
    for line in extracted.splitlines():
        match = re.match(r"^\s*(\d{3})\s+(.+?)\s*$", line)
        if match:
            found[int(match.group(1))] = match.group(2)
    missing = [number for number in range(1, body_count + 1) if number not in found]
    if missing:
        raise RuntimeError(f"PDF sentence numbers missing: {missing}")
    return [found[number] for number in range(1, body_count + 1)]


def speak_sentences(start_title: str, next_title: str, body_count: int) -> list[str]:
    lines = TTS.read_text(encoding="utf-8").splitlines()
    start = lines.index(start_title)
    end = lines.index(next_title, start + 1)
    selected = [line.strip() for line in lines[start + 1 : end] if line.strip()]
    if len(selected) != body_count:
        raise RuntimeError(f"TTS section has {len(selected)} lines, expected {body_count}")
    return selected


def restore(spoken: str, display: str) -> tuple[str, list[dict[str, str]]]:
    restored = spoken
    changes = []
    for speak, written in REPLACEMENTS:
        if speak in restored:
            restored = restored.replace(speak, written)
            changes.append({"display": written, "speak": speak})
    if "read" in display:
        for pronunciation in ("red", "reed"):
            if re.search(rf"\b{pronunciation}\b", restored):
                restored = re.sub(rf"\b{pronunciation}\b", "read", restored)
                changes.append({"display": "read", "speak": pronunciation})
    if re.search(r"\bclose\b", display) and re.search(r"\bcloze\b", restored):
        restored = re.sub(r"\bcloze\b", "close", restored)
        changes.append({"display": "close", "speak": "cloze"})
    return restored, changes


def build_chapter(config: tuple[int, str, str, str, int, int, int]) -> dict[str, int]:
    number, number_word, title, speak_title, start_page, end_page, body_count = config
    display_title = f"Chapter {number_word}. {title}."
    displays = display_sentences(start_page, end_page, body_count)
    speaks = speak_sentences(speak_title, NEXT_SPEAK[number], body_count)
    title_changes = [] if comparable(display_title) == comparable(speak_title) else [
        {"display": title, "speak": speak_title.removeprefix(f"Chapter {number_word}. ").removesuffix(".")}
    ]
    rows = [{
        "sentence_id": f"ch{number:03d}-s0001",
        "sentence_ordinal": 1,
        "kind": "title",
        "source_display_text": display_title,
        "display_text": display_title,
        "speak_text": speak_title,
        "display_hash": digest_text(display_title),
        "speak_hash": digest_text(speak_title),
        "pronunciation_changes": title_changes,
    }]
    mismatches = []
    for ordinal, (display, speak) in enumerate(zip(displays, speaks), 2):
        restored, changes = restore(speak, display)
        if comparable(restored) != comparable(display):
            ratio = difflib.SequenceMatcher(None, comparable(restored), comparable(display)).ratio()
            mismatches.append((ordinal - 1, ratio, display, speak, restored))
            continue
        rows.append({
            "sentence_id": f"ch{number:03d}-s{ordinal:04d}",
            "sentence_ordinal": ordinal,
            "kind": "body",
            "source_display_text": display,
            "display_text": display,
            "speak_text": speak,
            "display_hash": digest_text(display),
            "speak_hash": digest_text(speak),
            "pronunciation_changes": changes,
        })
    if mismatches:
        details = "\n".join(
            f"ch{number} sentence {ordinal} ({ratio:.3f}): display={display!r}; speak={speak!r}; restored={restored!r}"
            for ordinal, ratio, display, speak, restored in mismatches[:40]
        )
        raise RuntimeError(f"{len(mismatches)} text mismatch(es):\n{details}")

    blocks = [
        {**row, "id": f"{row['sentence_id']}-t{take:02d}", "take_ordinal": take}
        for row in rows
        for take in (1, 2)
    ]
    payload = {
        "schema_version": 1,
        "text_contract_version": 1,
        "variant": "concise-edition",
        "chapter": {"number": number, "title": title},
        "source": {
            "pdf_pages": [start_page, end_page],
            "pdf_sha256": digest_file(PDF),
            "tts_sha256": digest_file(TTS),
        },
        "counts": {"sentences": len(rows), "body_sentences": body_count, "takes": len(blocks)},
        "blocks": blocks,
    }
    root = Path(f"/home/scpark/harry-concise-ch{number}")
    target = root / f"ch{number:03d}.json"
    validate_manifest_payload(payload, label=str(target))
    root.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload["counts"]


def main() -> None:
    for config in CHAPTERS:
        number = config[0]
        print(json.dumps({"chapter": number, **build_chapter(config)}))


if __name__ == "__main__":
    main()
