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
