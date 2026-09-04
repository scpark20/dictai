#!/usr/bin/env python3
"""Assign relative CEFR bands, curriculum categories, and same-scene voices."""
from __future__ import annotations

import argparse
import json
import math
import random
import re
from collections import Counter, defaultdict
from pathlib import Path


LEVELS = ("A1", "A2", "B1", "B2", "C1", "C2")
LEVEL_SHARES = (0.18, 0.20, 0.22, 0.19, 0.13, 0.08)
DOMAIN_BY_CHAPTER = {
    1: "work_study_money",
    2: "travel_tech_communication",
    3: "people_plans_relationships",
    4: "daily_life_health",
    5: "ideas_information_truth",
    6: "reasoning_responsibility",
    7: "feelings_change_problems",
    8: "decisions_influence_conflict",
    9: "society_abstract_discourse",
}

# Five curriculum lanes per level.  Labels become more precise as language demand rises.
CATEGORY_LABELS = {
    "A1": {
        "work_study_money": "Work, School & Shopping",
        "travel_tech_communication": "Travel & Communication",
        "people_plans_relationships": "People & Simple Plans",
        "daily_life_health": "Daily Life & Health",
        "abstract": "Thoughts, Feelings & Choices",
    },
    "A2": {
        "work_study_money": "Work, Study & Money",
        "travel_tech_communication": "Travel, Tech & Calls",
        "people_plans_relationships": "Plans & Relationships",
        "daily_life_health": "Home, Food & Wellbeing",
        "abstract": "Ideas, Feelings & Problems",
    },
    "B1": {
        "work_study_money": "Work & Responsibilities",
        "travel_tech_communication": "Communication & Travel",
        "people_plans_relationships": "Relationships & Social Life",
        "daily_life_health": "Health & Lifestyle",
        "abstract": "Opinions & Problem Solving",
    },
    "B2": {
        "work_study_money": "Career & Finance",
        "travel_tech_communication": "Digital & Public Life",
        "people_plans_relationships": "Relationships & Conflict",
        "daily_life_health": "Wellbeing & Change",
        "abstract": "Decisions & Influence",
    },
    "C1": {
        "work_study_money": "Professional & Academic Life",
        "travel_tech_communication": "Public Communication & Mobility",
        "people_plans_relationships": "Interpersonal Nuance",
        "daily_life_health": "Lifestyle, Risk & Recovery",
        "abstract": "Reasoning, Strategy & Consequences",
    },
    "C2": {
        "work_study_money": "Institutional & Economic Affairs",
        "travel_tech_communication": "Systems & Public Communication",
        "people_plans_relationships": "Complex Social Dynamics",
        "daily_life_health": "Human Condition & Wellbeing",
        "abstract": "Abstract Reasoning & Discourse",
    },
}

CLAUSE_MARKERS = {
    "although", "unless", "whereas", "whether", "despite", "however", "whenever",
    "whatever", "whoever", "therefore", "otherwise", "since", "while", "because",
}
ADVANCED_SUFFIXES = ("tion", "sion", "ment", "ity", "ence", "ance", "ous", "ive", "ial")
WORD_RE = re.compile(r"[A-Za-z]+(?:['-][A-Za-z]+)*")


def canonical_domain(chapter: int) -> str:
    domain = DOMAIN_BY_CHAPTER[chapter]
    if domain in {"ideas_information_truth", "reasoning_responsibility", "feelings_change_problems", "decisions_influence_conflict", "society_abstract_discourse"}:
        return "abstract"
    return domain


def complexity(row: dict[str, object]) -> float:
    texts = [str(row["expression"])] + [str(turn["text"]) for turn in row["turns"]]
    words = [word.lower() for word in WORD_RE.findall(" ".join(texts))]
    if not words:
        return 0.0
    long_words = sum(len(word.replace("-", "")) >= 8 for word in words)
    clauses = sum(word in CLAUSE_MARKERS for word in words)
    suffixes = sum(word.endswith(ADVANCED_SUFFIXES) for word in words)
    turns = len(row["turns"])
    max_turn_words = max(len(WORD_RE.findall(str(turn["text"]))) for turn in row["turns"])
    punctuation = sum(str(turn["text"]).count(mark) for turn in row["turns"] for mark in (",", ";", ":"))
    # Expression length matters because multiword idioms and complements raise recall demand.
    expression_words = len(WORD_RE.findall(str(row["expression"])))
    return (
        math.log1p(len(words)) * 1.25
        + math.log1p(max_turn_words) * 1.10
        + long_words * 0.22
        + clauses * 0.48
        + suffixes * 0.15
        + punctuation * 0.12
        + max(0, turns - 2) * 0.32
        + max(0, expression_words - 2) * 0.20
    )


def assign_levels(rows: list[dict[str, object]]) -> None:
    ranked = sorted(range(len(rows)), key=lambda index: (complexity(rows[index]), str(rows[index]["id"])))
    cumulative = 0.0
    boundaries = []
    for share in LEVEL_SHARES[:-1]:
        cumulative += share
        boundaries.append(round(len(rows) * cumulative))
    for rank, index in enumerate(ranked):
        level_index = sum(rank >= boundary for boundary in boundaries)
        rows[index]["level"] = LEVELS[level_index]
        rows[index]["complexity_score"] = round(complexity(rows[index]), 4)


def assign_categories(rows: list[dict[str, object]]) -> None:
    for row in rows:
        level = str(row["level"])
        lane = canonical_domain(int(row["chapter"]))
        row["curriculum_lane"] = lane
        row["category"] = CATEGORY_LABELS[level][lane]


def assign_references(rows: list[dict[str, object]], profiles_path: Path) -> None:
    profiles = json.loads(profiles_path.read_text(encoding="utf-8"))
    if isinstance(profiles, dict):
        profiles = profiles.get("profiles", profiles.get("references", []))
    scenes: dict[str, list[dict[str, object]]] = defaultdict(list)
    for profile in profiles:
        scenes[str(profile["scene"])].append(profile)
    eligible = {scene: refs for scene, refs in scenes.items() if len(refs) >= 2}
    if len(eligible) != 25 or any(len(refs) != 4 for refs in eligible.values()):
        raise RuntimeError("expected 25 scenes with four speaker references each")
    rng = random.Random(5_000_2312)
    scene_names = sorted(eligible)
    for row in rows:
        scene = rng.choice(scene_names)
        first, second = rng.sample(eligible[scene], 2)
        row["audio_plan"] = {
            "scene": scene,
            "speaker_a": first["reference_id"],
            "speaker_b": second["reference_id"],
            "speaker_a_group": first["speaker_group"],
            "speaker_b_group": second["speaker_group"],
            "environment_locked_for_dialogue": True,
        }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("profiles", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    payload = json.loads(args.source.read_text(encoding="utf-8"))
    rows = payload["dialogues"]
    assign_levels(rows)
    assign_categories(rows)
    assign_references(rows, args.profiles)
    output = {
        "schema_version": 2,
        "source": "Mentors Smart English Expressions, Chapters 01-09",
        "classification_method": "corpus-relative CEFR ranking using dialogue length, lexical form, clause load, turn count, and expression complexity",
        "count": len(rows),
        "levels": {level: sum(row["level"] == level for row in rows) for level in LEVELS},
        "categories": CATEGORY_LABELS,
        "dialogues": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "levels": output["levels"],
        "categories": {level: dict(Counter(row["category"] for row in rows if row["level"] == level)) for level in LEVELS},
        "scenes": dict(Counter(row["audio_plan"]["scene"] for row in rows)),
        "speaker_pairs": dict(Counter(f"{row['audio_plan']['speaker_a_group']} + {row['audio_plan']['speaker_b_group']}" for row in rows)),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
