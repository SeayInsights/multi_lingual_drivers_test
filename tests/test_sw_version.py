"""Gate: SW cache version must track precached content (stale-fix regression guard)."""
import json
import re
import shutil
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")


def run_check(cwd=REPO, extra=()):
    return subprocess.run(
        [NODE, "scripts/validate/check-sw-version.mjs", *extra],
        cwd=cwd, capture_output=True, text=True, timeout=120,
    )


def test_current_lock_is_consistent():
    r = run_check()
    assert r.returncode == 0, f"{r.stdout}\n{r.stderr}"
    assert "sw-version ok" in r.stdout


def test_content_change_without_version_bump_fails(tmp_path):
    for item in ("sw.js", "index.html", "404.html", "manifest.webmanifest",
                 "src", "data", "locales", "assets", "scripts", "traffic_signs", "tests"):
        src = REPO / item
        if src.is_dir():
            shutil.copytree(src, tmp_path / item)
        else:
            shutil.copy(src, tmp_path / item)
    # mutate a precached file without bumping VERSION
    target = tmp_path / "src" / "pages" / "study" / "study.js"
    target.write_text(target.read_text(encoding="utf-8") + "\n// changed\n", encoding="utf-8")
    r = run_check(cwd=tmp_path)
    assert r.returncode == 1
    assert "VERSION is still" in r.stderr


def test_lock_matches_sw_version():
    lock = json.loads((REPO / "data" / "sw-version-lock.json").read_text(encoding="utf-8"))
    sw = (REPO / "sw.js").read_text(encoding="utf-8")
    version = re.search(r'const VERSION = "([^"]+)"', sw).group(1)
    assert lock["version"] == version
