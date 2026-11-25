#!/usr/bin/env python3
"""냥도사 퍼널 · 행동 데이터 검사 (analytics.js 8개 이벤트).

headless Chromium(430×932)에서 실제 사용자 흐름을 그대로 밟으며 확인한다.

  page_view        유입(inviter 포함) → 폼 입력 → 무료 결과 → 공유 카드 저장 →
                   초대 링크 복사 → 결제 버튼 → 결제 완료
  input_start      여러 필드를 만져도 한 번만
  input_complete   생년월일·성별·관심운세를 다 채우고 폼을 냈을 때 한 번
  free_result_view 팔자 고양이 · 명식 수치가 실려 오는가
  result_share     카드 저장/공유 클릭 시 (초대 링크 포함 여부 포함)
  friend_invite    초대 링크 복사 시
  pay_button_click 어느 버튼에서 들어왔는가 (source)
  payment_complete 금액(1,900) · 수단 · 주문번호

  외부 전송 훅(setEndpoint)도 함께 확인한다.

    python3 tools/check-funnel.py
"""
import http.server
import json
import os
import socketserver
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8797
BASE = f"http://127.0.0.1:{PORT}/"
problems = []


class Quiet(http.server.SimpleHTTPRequestHandler):
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


def main():
    httpd = serve(PORT)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 430, "height": 932}, device_scale_factor=2,
                                  accept_downloads=True)
        try:
            ctx.grant_permissions(["clipboard-read", "clipboard-write"])
        except Exception:  # noqa: BLE001
            pass

        # 초대 링크로 들어온 경우의 page_view
        invite = "?r=TESTCODE1234"
        page = ctx.new_page()
        errs = []
        page.on("console", lambda m: errs.append("console " + m.type + ": " + m.text)
                if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))

        page.goto(BASE + invite, wait_until="networkidle")
        page.evaluate("() => { try { localStorage.clear(); } catch (e) {} }")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(500)

        pv = page.evaluate("window.__nyangAnalytics.last('page_view')")
        expect("page_view 1회 · 닉네임 미전송",
               pv and "inviter" not in pv["props"] and pv["props"].get("inviteLanded") is True,
               str(pv and pv["props"]))

        # 입력: 여러 필드를 만져도 input_start 는 1회
        page.fill("#name", "민지")
        page.select_option("#year", "1995")
        page.select_option("#month", "4")
        page.select_option("#day", "12")
        page.select_option("#hour", "6")
        page.click('#status-grid .status[data-value="love"]')
        n = page.evaluate("window.__nyangAnalytics.count('input_start')")
        ist = page.evaluate("window.__nyangAnalytics.last('input_start')")
        expect("input_start 1회만", n == 1, f"count={n} props={ist and ist['props']}")

        page.click('#form button[type="submit"]')
        page.wait_for_selector("#screen-free.is-active", timeout=8000)
        page.wait_for_timeout(500)
        ic = page.evaluate("window.__nyangAnalytics.last('input_complete')")
        expect("input_complete · 폼 제출 1회",
               ic and page.evaluate("window.__nyangAnalytics.count('input_complete')") == 1
               and ic["props"].get("focus") == "love"
               and not any(k in ic["props"] for k in ["name", "gender", "calendar", "hasTime", "chars", "year", "month", "day"]),
               str(ic and ic["props"]))
        fr = page.evaluate("window.__nyangAnalytics.last('free_result_view')")
        expect("free_result_view · 출생정보 미전송",
               fr and not any(k in fr["props"] for k in ["cat", "dayMaster", "dayMasterIdx", "chars", "year", "month", "day"]),
               str(fr and fr["props"]))

        # 외부 전송 훅
        page.evaluate("""() => {
          window.__sent = [];
          window.__nyangAnalytics.setEndpoint(url => window.__sent.push(url));
        }""")

        # 공유 카드 두 비율 — 기본 9:16, 1:1 로 바꾸면 캔버스가 1080×1080
        size0 = page.evaluate("() => { const c = document.getElementById('share-card'); return [c.width, c.height]; }")
        expect("공유 카드 기본 9:16 (1080×1920)", size0 == [1080, 1920], str(size0))
        page.click('.seg[data-group="share-ratio"] .seg__btn[data-ratio="square"]')
        page.wait_for_timeout(900)
        size1 = page.evaluate("() => { const c = document.getElementById('share-card'); return [c.width, c.height]; }")
        expect("공유 카드 1:1 (1080×1080)", size1 == [1080, 1080], str(size1))
        page.click('.seg[data-group="share-ratio"] .seg__btn[data-ratio="story"]')
        page.wait_for_timeout(900)

        # 공유 카드 저장 (파일 저장 클릭) — 초대 링크 포함 X
        with page.expect_download() as dl:
            page.click("#btn-share-save")
        dl.value.cancel()
        page.wait_for_timeout(300)
        rs = page.evaluate("window.__nyangAnalytics.last('result_share')")
        expect("result_share · 저장", rs and rs["props"].get("method") == "save"
               and rs["props"].get("inviteIncluded") is False
               and rs["props"].get("ratio") == "story", str(rs and rs["props"]))

        # 초대 링크 포함 토글 → 다시 저장하면 inviteIncluded true
        page.click(".share__opt")
        page.wait_for_timeout(700)
        expect("초대 링크 포함 토글 켜짐", page.is_checked("#share-invite"), "")
        with page.expect_download() as dl2:
            page.click("#btn-share-save")
        dl2.value.cancel()
        page.wait_for_timeout(300)
        rs2 = page.evaluate("window.__nyangAnalytics.last('result_share')")
        expect("result_share · 초대 링크 포함", rs2 and rs2["props"].get("inviteIncluded") is True,
               str(rs2 and rs2["props"]))

        # 친구 초대 링크 복사
        page.click("#btn-invite")
        page.wait_for_timeout(400)
        fi = page.evaluate("window.__nyangAnalytics.last('friend_invite')")
        expect("friend_invite · 복사", fi and fi["props"].get("method") == "copy", str(fi and fi["props"]))

        # 고정 바에서 결제 진입
        page.evaluate("() => { const a = document.getElementById('app'); a.scrollTo(0, 900); }")
        page.wait_for_timeout(400)
        page.click("#btn-unlock-2")
        page.wait_for_selector("#pay-modal.is-open", timeout=4000)
        pc = page.evaluate("window.__nyangAnalytics.last('pay_button_click')")
        expect("pay_button_click · 고정 바", pc and pc["props"].get("source") == "sticky"
               and pc["props"].get("price") == 1900, str(pc and pc["props"]))

        page.click("#btn-pay")
        page.wait_for_selector("#screen-result.is-active", timeout=12000)
        page.wait_for_timeout(3200)
        done = page.evaluate("window.__nyangAnalytics.last('payment_complete')")
        prev = page.evaluate("window.__nyangAnalytics.last('preview_opened')")
        toast = page.inner_text("#toast") if page.query_selector("#toast") else ""
        expect("미리보기: payment_complete 0건 · preview_opened 1건",
               done is None and prev is not None and prev["props"].get("mode") == "preview",
               str(done and done["props"]))
        expect("미리보기 토스트에 결제수단·금액 없음",
               ("카카오" not in toast and "토스" not in toast and "1,900" not in toast and "결제가 끝" not in toast), toast[:60])

        funnel = page.evaluate("window.__nyangAnalytics.funnel()")
        names = {f["event"]: f["count"] for f in funnel}
        expect("이벤트: 미리보기 흐름에 필요한 것 모두 1회 이상",
               all(names[e] >= 1 for e in ["page_view", "input_start", "input_complete", "free_result_view",
                                           "result_share", "friend_invite", "pay_button_click", "preview_opened"])
               and names["payment_complete"] == 0,
               str(names))

        sent = page.evaluate("window.__sent.length")
        expect("외부 전송 훅으로도 전달", sent >= 1, f"훅 수신 {sent}건")

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
    print("OK — 8개 퍼널 이벤트가 실제 화면 동작에 붙어 있고 중복·누락 없음")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
