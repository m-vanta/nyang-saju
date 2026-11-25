#!/usr/bin/env python3
"""냥도사의 천기누설 미리보기 렌더.

headless Chromium(430×932, DPR 2)으로 랜딩 → 입력 → 무료 천기(팔자 고양이) →
결제 → 유료 천기 화면을 찍고, 무료 공유 카드(Canvas 1080×1920)와 천기부적을 PNG 로 저장한다.

  preview-landing.png      랜딩
  preview-free.png         무료 결과 위 (팔자 고양이 + 천기팩폭)
  preview-free-body.png    무료 결과 중단 (대표 성향 3 + 명식 접기)
  preview-free-fold.png    사주명식 · 오행 분포 펼친 모습 (개수 + %)
  preview-share-card.png   무료 결과 카드 (Canvas 1080×1920)
  preview-orbit.png        인연 궤도 (무료 지도 + 관계 유형)
  preview-paid.png         유료 결과 위 (1,900원으로 연 천기)
  preview-paid-body.png    유료 결과 운 풀이
  preview-card.png         나만의 천기부적 (Canvas 1080×1920)

    python3 tools/render-previews.py [--name 민지] [--hour 6] [--focus year]
"""
import argparse
import base64
import http.server
import os
import socketserver
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8765


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve(port):
    handler = lambda *a, **k: Quiet(*a, directory=ROOT, **k)  # noqa: E731
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", default="민지")
    ap.add_argument("--year", default="1995")
    ap.add_argument("--month", default="4")
    ap.add_argument("--day", default="12")
    ap.add_argument("--hour", default="6")
    ap.add_argument("--focus", default="year")
    ap.add_argument("--out-suffix", default="")
    ap.add_argument("--port", type=int, default=PORT)
    args = ap.parse_args()

    port = args.port
    httpd = serve(port)
    errors = []

    def shot(name):
        return os.path.join(ROOT, name + args.out_suffix + ".png")

    def hide_sticky(page):
        """스크롤하면 뜨는 복채 바가 미리보기 내용을 가리지 않게 잠깐 내린다."""
        page.evaluate("() => document.body.classList.remove('is-free-scrolled')")

    def scroll_to(page, selector, offset):
        page.evaluate(
            """(args) => {
              const a = document.getElementById('app');
              const el = document.querySelector(args[0]);
              if (!el) return;
              const r = el.getBoundingClientRect(), ar = a.getBoundingClientRect();
              a.scrollTo({ top: a.scrollTop + r.top - ar.top - args[1], behavior: 'instant' });
            }""", [selector, offset])

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 430, "height": 932}, device_scale_factor=2)
        page.on("console", lambda m: errors.append("console " + m.type + ": " + m.text)
                if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))

        page.goto(f"http://127.0.0.1:{port}/", wait_until="networkidle")
        page.wait_for_timeout(400)
        page.screenshot(path=shot("preview-landing"))

        page.fill("#name", args.name)
        page.select_option("#year", args.year)
        page.select_option("#month", args.month)
        page.select_option("#day", args.day)
        page.select_option("#hour", args.hour)
        page.click(f'#status-grid .status[data-value="{args.focus}"]')
        page.click('#form button[type="submit"]')
        page.wait_for_selector("#screen-free.is-active", timeout=8000)
        page.wait_for_timeout(600)
        page.screenshot(path=shot("preview-free"))

        # 대표 성향 3 + 명식 접기
        scroll_to(page, ".traits", 92)
        hide_sticky(page)
        page.wait_for_timeout(320)
        page.screenshot(path=shot("preview-free-body"))

        # 사주명식 · 오행 분포 (개수 + %) 펼친 모습
        scroll_to(page, "#fold-chart", 84)
        page.click("#fold-chart summary")
        page.wait_for_timeout(300)
        scroll_to(page, "#fold-chart", 84)
        hide_sticky(page)
        page.wait_for_timeout(320)
        page.screenshot(path=shot("preview-free-fold"))

        # 인연 궤도 (무료 지도 + 관계 유형)
        scroll_to(page, ".orbit__head", 66)
        hide_sticky(page)
        page.wait_for_timeout(380)
        page.screenshot(path=shot("preview-orbit"))

        # 무료 공유 카드 — Canvas 원본
        page.wait_for_timeout(900)
        card = page.evaluate("document.getElementById('share-card').toDataURL('image/png')")
        with open(shot("preview-share-card"), "wb") as f:
            f.write(base64.b64decode(card.split(",", 1)[1]))

        # 무료 화면 정보
        free_info = page.evaluate("""() => ({
          cat: document.getElementById('cat-name').textContent,
          hanja: document.getElementById('cat-hanja').textContent,
          def: document.getElementById('cat-def').textContent,
          facts: [...document.querySelectorAll('#cat-facts span')].map(n => n.textContent),
          tags: [...document.querySelectorAll('#cat-tags li')].map(n => n.textContent),
          bomb: document.getElementById('free-bomb').textContent,
          traits: [...document.querySelectorAll('#traits-list .trait__label')].map(n => n.textContent),
          fold: document.getElementById('fold-chart-line').textContent.replace(/\\s+/g, ' ').trim(),
          oheng: document.getElementById('oheng').textContent.replace(/\\s+/g, ' ').trim(),
          preview: [...document.querySelectorAll('.preview__item')].map(n => n.textContent.replace(/\\s+/g, ' ').trim()),
          value: [...document.querySelectorAll('#value-list .value__title')].map(n => n.textContent),
          shareCard: document.getElementById('share-card').width + 'x' + document.getElementById('share-card').height,
          bodySize: getComputedStyle(document.querySelector('.catcard__essay')).fontSize,
          smallest: Math.min(...[...document.querySelectorAll('.screen.is-active *')]
            .filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
            .map(el => parseFloat(getComputedStyle(el).fontSize))),
          scrollX: document.getElementById('app').scrollWidth - document.getElementById('app').clientWidth,
          events: window.__nyangAnalytics.names()
        })""")

        # 결제 → 유료
        scroll_to(page, ".value", 80)
        page.wait_for_timeout(260)
        page.click("#btn-unlock")
        page.wait_for_selector("#pay-modal.is-open", timeout=4000)
        page.wait_for_timeout(320)
        page.screenshot(path=shot("preview-pay"))
        page.click("#btn-pay")
        page.wait_for_selector("#screen-result.is-active", timeout=12000)
        page.wait_for_timeout(3400)
        page.screenshot(path=shot("preview-paid"))

        scroll_to(page, "#result-sections", 92)
        page.wait_for_timeout(340)
        page.screenshot(path=shot("preview-paid-body"))

        scroll_to(page, "#pattern-block", 92)
        page.wait_for_timeout(320)
        page.screenshot(path=shot("preview-paid-pattern"))

        scroll_to(page, "#orbit-detail-block", 92)
        page.wait_for_timeout(320)
        page.screenshot(path=shot("preview-paid-orbit"))

        data_url = page.evaluate("document.getElementById('amulet').toDataURL('image/png')")
        with open(shot("preview-card"), "wb") as f:
            f.write(base64.b64decode(data_url.split(",", 1)[1]))

        paid_info = page.evaluate("""() => ({
          opened: [...document.querySelectorAll('#opened-list li')].map(n => n.textContent.trim()),
          sections: [...document.querySelectorAll('#result-sections .entry__title')].map(n => n.textContent),
          terms: [...document.querySelectorAll('#result-sections .entry__term')].map(n => n.textContent),
          firstBody: document.querySelector('#result-sections .entry__text').textContent.slice(0, 240),
          patterns: [...document.querySelectorAll('#pattern-list .pattern__label')].map(n => n.textContent),
          orbitDetail: document.querySelectorAll('#orbit-detail li').length,
          detailText: (document.querySelector('#orbit-detail .orbit__detail-text') || {}).textContent || '',
          bodySize: getComputedStyle(document.querySelector('#result-sections .entry__text')).fontSize,
          bodyLine: (() => {
            const s = getComputedStyle(document.querySelector('#result-sections .entry__text'));
            return (parseFloat(s.lineHeight) / parseFloat(s.fontSize)).toFixed(2);
          })(),
          amulet: document.getElementById('amulet').width + 'x' + document.getElementById('amulet').height,
          events: window.__nyangAnalytics.funnel()
        })""")

        browser.close()

    httpd.shutdown()
    httpd.server_close()
    print("  [free]", free_info)
    print("  [paid]", paid_info)
    print("console/page errors:", errors if errors else "none")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
