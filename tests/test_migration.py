"""WO 3 acceptance: migrated question bank + sign manifest integrity."""
import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BANK = json.loads((REPO / "data" / "states" / "oh" / "questions.json").read_text(encoding="utf-8"))
MANIFEST = json.loads((REPO / "data" / "signs" / "manifest.json").read_text(encoding="utf-8"))


def test_every_legacy_question_migrated():
    # Legacy bank: 57 questions (22 signs, 14 rules, 8 rightofway, 8 safety, 5 alcohol)
    assert len(BANK["questions"]) == 57
    sections = {}
    for q in BANK["questions"]:
        sections[q["section"]] = sections.get(q["section"], 0) + 1
    assert sections == {"signs": 22, "rules": 35}
    cats = {q["category"] for q in BANK["questions"]}
    assert cats == {"signs", "rules", "rightofway", "safety", "alcohol"}


def test_questions_are_bilingual_with_explanations():
    for q in BANK["questions"]:
        assert q["text"]["vi-VN"] and q["text"]["en-US"]
        assert q["explanation"]["vi-VN"] and q["explanation"]["en-US"]
        assert len(q["choices"]) == 4
        assert 0 <= q["answerIndex"] < 4


def test_every_sign_reference_resolves_to_disk():
    for q in BANK["questions"]:
        if "sign" in q:
            assert (REPO / q["sign"]["image"]).is_file(), q["sign"]["image"]


def test_manifest_count_matches_disk():
    disk = sum(1 for _ in (REPO / "traffic_signs").rglob("*.svg"))
    assert MANIFEST["count"] == disk == len(MANIFEST["signs"])


def test_manifest_names_cover_quiz_signs():
    named = {s["code"] for s in MANIFEST["signs"] if "name" in s}
    for q in BANK["questions"]:
        if "sign" in q:
            assert q["sign"]["code"] in named, f"quiz sign {q['sign']['code']} lacks display name"
