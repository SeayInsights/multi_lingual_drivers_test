"""Live-deployment checks for the GitHub Pages site (WO 1 acceptance).

Stdlib-only (urllib) so the suite runs on any Python with pytest installed.
"""
import urllib.request
import urllib.error

BASE = "https://seayinsights.github.io/multi_lingual_drivers_test"
UA = {"User-Agent": "wo1-deployment-check/1.0"}


def _get(url):
    req = urllib.request.Request(url, headers=UA)
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def test_index_is_live_and_mobile_ready():
    status, headers, body = _get(f"{BASE}/")
    text = body.decode("utf-8", errors="replace")
    assert status == 200
    assert "width=device-width" in text, "mobile viewport meta missing"
    assert 'lang="vi"' in text, "Vietnamese lang attribute missing"


def test_sign_svg_served_with_correct_mime():
    status, headers, body = _get(f"{BASE}/traffic_signs/regulatory/MUTCD_R1-1.svg")
    assert status == 200
    assert "image/svg+xml" in headers.get("Content-Type", "")
    assert len(body) > 500, "SVG suspiciously small"


def test_404_page_serves_custom_content():
    status, headers, body = _get(f"{BASE}/khong-ton-tai-nowhere")
    text = body.decode("utf-8", errors="replace")
    assert status == 404
    assert "WRONG WAY" in text, "custom 404 page not served"


def test_app_shell_assets_live():
    """WO 4: every shell asset must be served (offline precache in WO 8 depends on these)."""
    for path, marker in [
        ("/src/app/app.js", b"initI18n"),
        ("/src/app/router.js", b"hashchange"),
        ("/src/app/theme.css", b"--green"),
        ("/src/i18n/i18n.js", b"loadLocale"),
        ("/assets/fonts/fonts.css", b"Be Vietnam Pro"),
        ("/locales/vi-VN.json", "Luyện Thi".encode()),
        ("/locales/en-US.json", b"Driver's License"),
        ("/data/states/oh/state.json", b'"per-section"'),
    ]:
        status, headers, body = _get(f"{BASE}{path}")
        assert status == 200, f"{path} -> {status}"
        assert marker in body, f"{path}: expected content marker missing"


def test_index_boots_module_shell():
    status, headers, body = _get(f"{BASE}/")
    text = body.decode("utf-8", errors="replace")
    assert 'type="module"' in text and "src/app/app.js" in text
    assert 'id="tabbar"' in text and 'id="view"' in text


def test_study_page_module_live():
    status, headers, body = _get(f"{BASE}/src/pages/study/study.js")
    assert status == 200 and b"logAnswer" in body


def test_pwa_assets_live():
    for path, marker in [
        ("/manifest.webmanifest", b"maskable"),
        ("/sw.js", b"mldt-"),
        ("/assets/icons/icon-192.png", b"PNG"),
    ]:
        status, headers, body = _get(f"{BASE}{path}")
        assert status == 200, f"{path} -> {status}"
        assert marker in body[:2048], f"{path}: marker missing"
