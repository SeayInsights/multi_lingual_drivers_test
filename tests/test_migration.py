"""WO 3 acceptance: migrated question bank + sign manifest integrity."""
import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BANK = json.loads((REPO / "data" / "states" / "oh" / "questions.json").read_text(encoding="utf-8"))
BASE = json.loads((REPO / "data" / "states" / "oh" / "base-questions.json").read_text(encoding="utf-8"))
MANIFEST = json.loads((REPO / "data" / "signs" / "manifest.json").read_text(encoding="utf-8"))


def test_every_legacy_question_preserved():
    # The 57 migrated legacy questions must survive every rebuild verbatim by id
    # (answer-event history keys on question ids).
    assert len(BASE["questions"]) == 57
    bank_by_id = {q["id"]: q for q in BANK["questions"]}
    for legacy in BASE["questions"]:
        assert legacy["id"] in bank_by_id, f"legacy id lost: {legacy['id']}"
        assert bank_by_id[legacy["id"]]["text"] == legacy["text"]
        assert bank_by_id[legacy["id"]]["answerIndex"] == legacy["answerIndex"]


def test_bank_ids_unique():
    ids = [q["id"] for q in BANK["questions"]]
    assert len(ids) == len(set(ids))


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
