"""Gate wrapper for the SRS engine + flashcards behavioral suite."""
import shutil
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def test_srs_suite_passes():
    r = subprocess.run(
        [shutil.which("node"), "--test", "--test-reporter=tap", "tests/srs.test.mjs"],
        cwd=REPO, capture_output=True, text=True, timeout=300,
    )
    assert r.returncode == 0, f"node --test failed:\n{r.stdout}\n{r.stderr}"
    assert "# fail 0" in r.stdout.replace("\r", ""), r.stdout
