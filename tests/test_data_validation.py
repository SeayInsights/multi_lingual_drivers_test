"""Data-layer checks (WO 2 acceptance): schema validation + locale parity.

Runs the Node validator as a subprocess (same command CI uses) and asserts on
its behavior for both valid and deliberately broken data.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")


def run_validator(cwd=REPO):
    return subprocess.run(
        [NODE, "scripts/validate/validate-data.mjs"],
        cwd=cwd, capture_output=True, text=True, timeout=120,
    )


def test_all_current_data_valid():
    r = run_validator()
    assert r.returncode == 0, f"validator failed:\n{r.stdout}\n{r.stderr}"
    assert "All data valid." in r.stdout


def test_validator_fails_loudly_on_broken_data(tmp_path):
    # Copy the data tree, break the Ohio file (minCorrect > questionCount),
    # drop a locale key — expect exit 1 and readable messages for both.
    for d in ("data", "locales", "scripts"):
        shutil.copytree(REPO / d, tmp_path / d)
    state_file = tmp_path / "data" / "states" / "oh" / "state.json"
    state = json.loads(state_file.read_text(encoding="utf-8"))
    state["test"]["sections"][0]["minCorrect"] = 99
    state_file.write_text(json.dumps(state), encoding="utf-8")

    vi_file = tmp_path / "locales" / "vi-VN.json"
    vi = json.loads(vi_file.read_text(encoding="utf-8"))
    del vi["strings"]["tab.home"]
    vi_file.write_text(json.dumps(vi, ensure_ascii=False), encoding="utf-8")

    # validator resolves ROOT from its own path, so run the copied script;
    # node_modules resolution walks up to the real repo's node_modules
    (tmp_path / "node_modules").symlink_to(REPO / "node_modules", target_is_directory=True)
    r = run_validator(cwd=tmp_path)
    assert r.returncode == 1
    out = r.stdout + r.stderr
    assert "minCorrect 99 > questionCount" in out
    assert "missing key 'tab.home'" in out


def test_locale_parity_is_exact():
    vi = json.loads((REPO / "locales" / "vi-VN.json").read_text(encoding="utf-8"))
    en = json.loads((REPO / "locales" / "en-US.json").read_text(encoding="utf-8"))
    assert set(vi["strings"]) == set(en["strings"])


def test_ohio_facts_are_the_real_bmv_format():
    oh = json.loads((REPO / "data" / "states" / "oh" / "state.json").read_text(encoding="utf-8"))
    assert oh["test"]["totalQuestions"] == 40
    assert oh["test"]["passingRule"] == "per-section"
    ids = {s["id"]: s for s in oh["test"]["sections"]}
    assert ids["signs"]["questionCount"] == 20 and ids["signs"]["minCorrect"] == 15
    assert ids["rules"]["questionCount"] == 20 and ids["rules"]["minCorrect"] == 15
    assert oh["test"]["timeLimitMinutes"] is None
    assert oh["sources"], "facts must carry citations"
