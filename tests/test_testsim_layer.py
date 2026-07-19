"""WO 7 gate wrapper: runs the jsdom behavioral suite for the BMV test simulation."""
import shutil
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def test_simulation_suite_passes():
    r = subprocess.run(
        [shutil.which("node"), "--test", "--test-reporter=tap", "tests/testsim.test.mjs"],
        cwd=REPO, capture_output=True, text=True, timeout=300,
    )
    assert r.returncode == 0, f"node --test failed:\n{r.stdout}\n{r.stderr}"
    assert "# fail 0" in r.stdout.replace("\r", ""), r.stdout


def test_overall_passing_rule_suite_passes():
    r = subprocess.run(
        [shutil.which("node"), "--test", "--test-reporter=tap", "tests/testsim-overall.test.mjs"],
        cwd=REPO, capture_output=True, text=True, timeout=300,
    )
    assert r.returncode == 0, f"node --test failed:\n{r.stdout}\n{r.stderr}"
    assert "# fail 0" in r.stdout.replace("\r", ""), r.stdout
