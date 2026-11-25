#!/usr/bin/env python3
"""냥도사 인연 궤도 검사.

headless Chromium(430×932)에서 실제로 돌려 확인한다.

1. 기본 샘플 네 명이 1·2·3궤도에 나뉘어 있는가
2. 친구 추가 → 만세력으로 사주를 계산해 궤도에 올리고 localStorage에 남는가
3. 새로고침해도 남아 있는가 / 내리면 사라지는가
4. 궤도 위 노드를 누르면 그 사람의 기운 한 줄이 나오는가
5. 무료 사용자도 쓰고, 좋고 나쁨(점수) 대신 관계 특성(충전냥·불꽃냥·거울냥·동료냥·티격태격냥)으로 보이는가
6. 초대 링크 복사 → 그 링크로 들어온 사람이 자기 정보를 넣으면 궁합 카드가 뜨는가
7. 깨진 초대 파라미터는 조용히 무시하는가

    python3 tools/check-orbit.py
"""
import http.server
import os
import socketserver
import threading
import urllib.parse

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8796
BASE = f"http://127.0.0.1:{PORT}/"
problems = []


import json


class Quiet(http.server.SimpleHTTPRequestHandler):
    """정적 파일 + 공유 코드 API 목(mock). 실제 Worker 없이 클라이언트 경로를 검사한다."""
    share = {"ds": 6, "db": 6}

    def log_message(self, *a):
        pass

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.rstrip("/") == "/api/share":
            n = int(self.headers.get("Content-Length") or 0)
            try:
                data = json.loads(self.rfile.read(n) or b"{}")
            except Exception:
                data = {}
            if isinstance(data.get("ds"), int) and isinstance(data.get("db"), int):
                Quiet.share = {"ds": data["ds"], "db": data["db"]}
            self._json(201, {"ok": True, "code": "TESTCODE1234", "expiresAt": 4102444800000})
            return
        self._json(404, {"error": "not_found"})

    def do_GET(self):
        path = self.path.split("?")[0].rstrip("/")
        if path == "/r/TESTCODE1234" and "text/html" in (self.headers.get("Accept") or ""):
            self.send_response(302)
            self.send_header("Location", "/?r=TESTCODE1234")
            self.end_headers()
            return
        if path in ("/r/TESTCODE1234", "/api/share/TESTCODE1234"):
            self._json(200, {"v": 1, "ds": Quiet.share["ds"], "db": Quiet.share["db"], "expiresAt": 4102444800000})
            return
        super().do_GET()


def serve(port):
    handler = lambda *a, **k: Quiet(*a, directory=ROOT, **k)  # noqa: E731
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def expect(label, ok, detail=""):
    print(f'{"OK " if ok else "NG "}{label}' + (f" — {detail}" if detail else ""))
    if not ok:
        problems.append(label + (f": {detail}" if detail else ""))


def to_free(page, name, y, m, d, hour="6"):
    """무료 천기 화면까지 — 인연 궤도는 이제 무료 화면에 있다."""
    page.fill("#name", name)
    page.select_option("#year", str(y))
    page.select_option("#month", str(m))
    page.select_option("#day", str(d))
    page.select_option("#hour", hour)
    page.click('#form button[type="submit"]')
    page.wait_for_selector("#screen-free.is-active", timeout=8000)
    page.wait_for_timeout(450)


def to_result(page, name, y, m, d, hour="6"):
    to_free(page, name, y, m, d, hour)
    page.click("#btn-unlock")
    page.wait_for_selector("#pay-modal.is-open", timeout=4000)
    page.click("#btn-pay")
    page.wait_for_selector("#screen-result.is-active", timeout=12000)
    page.wait_for_timeout(3000)


def orbits(page):
    return page.evaluate("""() => {
      const g = {1: 0, 2: 0, 3: 0};
      document.querySelectorAll('#orbit-svg .orbit__node').forEach(n => {
        const m = n.getAttribute('class').match(/orbit__node--(\\d)/);
        if (m) g[m[1]]++;
      });
      return {
        total: document.querySelectorAll('#orbit-svg .orbit__node').length,
        orbits: g,
        list: [...document.querySelectorAll('#orbit-list .orbit__item-name')].map(n => n.textContent.trim()),
        caption: document.getElementById('orbit-caption').textContent.replace(/\\s+/g, ' ').trim()
      };
    }""")


def main():
    httpd = serve(PORT)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 430, "height": 932}, device_scale_factor=2)
        try:
            ctx.grant_permissions(["clipboard-read", "clipboard-write"])
        except Exception:  # noqa: BLE001
            pass
        page = ctx.new_page()
        errs = []
        page.on("console", lambda m: errs.append("console " + m.type + ": " + m.text)
                if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))

        page.goto(BASE, wait_until="networkidle")
        page.evaluate("() => { try { localStorage.clear(); } catch (e) {} }")
        page.reload(wait_until="networkidle")
        to_free(page, "민지", 1995, 4, 12)

        s = orbits(page)
        expect("기본 예시 4명", s["total"] == 4, str(s["orbits"]))
        expect("예시 지도 안내", page.is_visible("#orbit-sample-note"), page.inner_text("#orbit-sample-note")[:40])
        expect("샘플이 1·2·3궤도에 나뉨",
               all(s["orbits"].get(str(k), 0) > 0 for k in (1, 2, 3)), str(s["orbits"]))
        expect("명단에 예시 표시", len(s["list"]) == 4 and all("예시" in x for x in s["list"]), str(s["list"]))

        spec = page.evaluate("""() => {
          const free = document.getElementById('screen-free').innerText;
          const legend = [...document.querySelectorAll('#orbit-legend .orbit__leg b')].map(n => n.textContent.trim());
          const meta = [...document.querySelectorAll('.orbit__item-meta')].map(n => n.textContent.trim());
          return { score: (free.match(/[0-9]+점/g) || []).length, legend, meta };
        }""")
        expect("무료 궤도에 점수 노출 없음", spec["score"] == 0, f'점수 표기 {spec["score"]}건')
        expect("관계 특성 5종 범례",
               spec["legend"] == ["충전냥", "불꽃냥", "거울냥", "동료냥", "티격태격냥"], str(spec["legend"]))
        expect("명단은 유형 이름만",
               all("냥" in m and "점" not in m for m in spec["meta"]), str(spec["meta"]))

        page.click("#orbit-svg .orbit__node")
        page.wait_for_timeout(250)
        cap = orbits(page)["caption"]
        expect("노드를 누르면 유형 + 한 줄 + 지내는 법", "냥" in cap and "점" not in cap and len(cap) > 60, cap[:90])

        page.fill("#friend-name", "지안")
        page.select_option("#friend-year", "1992")
        page.select_option("#friend-month", "12")
        page.select_option("#friend-day", "24")
        page.select_option("#friend-hour", "8")
        page.click('#orbit-form button[type="submit"]')
        page.wait_for_timeout(400)
        s2 = orbits(page)
        expect("친구 추가 → 내 궤도 1명 (예시는 내려감)", s2["total"] == 1, str(s2["list"]))
        expect("친구 추가 뒤 예시 안내 숨김", not page.is_visible("#orbit-sample-note"))
        expect("추가한 친구가 명단에", any(n.startswith("지안") for n in s2["list"]), str(s2["list"]))

        # 같은 사람을 또 올리면 중복 안내
        page.fill("#friend-name", "지안")
        page.select_option("#friend-year", "1992")
        page.select_option("#friend-month", "12")
        page.select_option("#friend-day", "24")
        page.click('#orbit-form button[type="submit"]')
        page.wait_for_timeout(300)
        expect("중복 추가는 막힘", orbits(page)["total"] == 1, str(orbits(page)["list"]))

        # 새로고침해도 남는가
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(400)
        page.evaluate("() => document.getElementById('screen-input').classList.contains('is-active')")
        to_free(page, "민지", 1995, 4, 12)
        stored = orbits(page)
        expect("새로고침 뒤에도 1명", stored["total"] == 1, str(stored["list"]))

        # 궤도에서 내리기
        page.click("#orbit-list .orbit__remove")
        page.wait_for_timeout(300)
        expect("내리면 빈 궤도", orbits(page)["total"] == 0, str(orbits(page)["list"]))

        # 초대 링크 복사 → 실제 URL
        page.click("#btn-invite")
        page.wait_for_timeout(400)
        try:
            link = page.evaluate("navigator.clipboard.readText()")
        except Exception as e:  # noqa: BLE001
            link = ""
            print("  (클립보드 읽기 실패:", e, ")")
        expect("초대 링크에 개인정보 없음 (이름·생년월일·시간·달력·성별)",
               bool(link) and "/r/TESTCODE1234" in link
               and not any(k in link for k in ["inviter", "iy=", "im=", "id=", "ih=", "ic=", "ig="]),
               link)
        if not link:
            link = BASE + "r/TESTCODE1234"

        p2 = ctx.new_page()
        p2.goto(link, wait_until="networkidle")
        p2.wait_for_timeout(500)
        expect("코드 초대 배너가 뜸", p2.is_visible("#invite-banner"),
               p2.inner_text("#invite-banner") if p2.is_visible("#invite-banner") else "")
        to_free(p2, "하늘", 1992, 2, 11, hour="4")
        card = p2.inner_text("#invite-card") if p2.is_visible("#invite-card") else ""
        expect("초대받은 사람이 자기 정보를 넣으면 궁합 카드",
               "초대 손님" in card and "궁합" in card and "점" not in card and "냥" in card, card[:70])
        expect("코드 초대는 이름·생년월일이 없어 궤도에 바로 추가하지 않음",
               not p2.is_visible("[data-invite-add]"))
        p2.close()

        bad = BASE + "?inviter=민지&iy=1995&im=4&id=12&ih=6&ic=solar&ig=f"
        p3 = ctx.new_page()
        p3.goto(bad, wait_until="networkidle")
        p3.wait_for_timeout(400)
        banner = p3.inner_text("#invite-banner") if p3.is_visible("#invite-banner") else ""
        expect("예전 개인정보 링크는 읽지 않고 안내", "예전" in banner and "개인정보" in banner, banner[:60])
        p3.close()

        # 유료: 인연 궤도 상세 해석 (사람마다 유형 + 긴 풀이 + 이렇게)
        page.fill("#friend-name", "지안")
        page.select_option("#friend-year", "1992")
        page.select_option("#friend-month", "12")
        page.select_option("#friend-day", "24")
        page.click('#orbit-form button[type="submit"]')
        page.wait_for_timeout(400)
        page.click("#btn-unlock")
        page.wait_for_selector("#pay-modal.is-open", timeout=4000)
        page.click("#btn-pay")
        page.wait_for_selector("#screen-result.is-active", timeout=12000)
        page.wait_for_timeout(3200)
        detail = page.evaluate("""() => ({
          count: document.querySelectorAll('#orbit-detail li').length,
          types: [...document.querySelectorAll('.orbit__detail-type')].map(n => n.textContent.trim()),
          text: (document.querySelector('.orbit__detail-text') || {}).textContent || '',
          advice: [...document.querySelectorAll('.orbit__detail-advice')].length,
          lockHidden: document.getElementById('orbit-lock').hidden
        })""")
        expect("유료 궤도 상세 목록", detail["count"] >= 1 and detail["advice"] >= 1, str(detail["types"]))
        expect("상세 풀이에 관계 유형 문장", len(detail["text"]) > 60, detail["text"][:60])
        expect("결제 뒤 무료 화면 잠금 문구 숨김", detail["lockHidden"] is True)

        expect("콘솔 에러 없음", not errs, str(errs[:3]))
        browser.close()

    httpd.shutdown()
    httpd.server_close()
    print()
    if problems:
        print("문제:")
        for x in problems:
            print("  - " + str(x))
        return 1
    print("OK — 궤도 배치·추가/삭제/저장·노드 풀이·초대 링크 왕복 전부 확인")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
