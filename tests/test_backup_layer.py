"""Gate wrapper for the backup export/import suite (M7 WO 44eb9e85)."""
import shutil
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def test_backup_suite_passes():
    r = subprocess.run(
        [shutil.which("node"), "--test", "--test-reporter=tap", "tests/backup.test.mjs"],
        cwd=REPO, capture_output=True, text=True, timeout=300,
    )
    assert r.returncode == 0, f"node --test failed:\n{r.stdout}\n{r.stderr}"
    assert "# fail 0" in r.stdout.replace("\r", ""), r.stdout
