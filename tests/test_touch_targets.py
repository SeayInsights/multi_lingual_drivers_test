"""Gate wrapper for the touch-target regression check (real browser layout)."""
import shutil
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def test_touch_targets_meet_minimum():
    r = subprocess.run(
        [shutil.which("node"), "tests/e2e-touch-targets.mjs"],
        cwd=REPO, capture_output=True, text=True, timeout=300,
    )
    assert r.returncode == 0, f"{r.stdout}\n{r.stderr}"
    assert "Touch-target check passed." in r.stdout
