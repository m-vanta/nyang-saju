#!/usr/bin/env python3
"""냥도사 레이아웃 검사.

프레임 안쪽 먹선(팔각형)과 모든 헤더/본문 요소 사이의 실제 픽셀 여백, 요소끼리의 겹침,
가로 스크롤, 콘솔 에러를 430·390·360px 뷰포트에서 확인한다.

    python3 tools/check-layout.py                 # 랜딩 · 무료 천기 · 유료 천기 전부
    python3 tools/check-layout.py --screen free   # 무료 천기 화면만
    python3 tools/check-layout.py --screen result # 유료 천기 화면만
"""
import argparse
import http.server
import os
import socketserver
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIN_GAP = 18.0

# 프레임 안쪽 먹선 좌표 (index.html frame-svg, viewBox 0 0 430 932)
INNER = [(38, 14), (392, 14), (417, 39), (417, 893), (392, 918), (38, 918), (14, 893), (14, 39)]

SELECTORS = [
    'header', '.masthead__title', '.masthead__orn', '.seal', '.menu-text', '.menu-btn',
    '.plum-rule', '.hero', '.hero__plaque', '.hero__line', '.rail', '.notice', '.slip',
    '.slip__head', '.field', '.gold-btn', '.crumb', '.crumb__tag',
    '.catcard', '.catcard__kicker', '.catcard__stage', '.catcard__plaque',
    '.catcard__plate', '.catcard__name', '.catcard__hanja', '.catcard__def', '.catcard__facts',
    '.catcard__tags', '.catcard__essay',
    '.sec-head', '.sec-head__kicker', '.sec-head__title', '.sec-head__sub',
    '.traits', '.trait', '.trait__no', '.trait__label', '.trait__text',
    '.fold', '.fold__sum', '.fold__key', '.fold__line', '.fold__toggle', '.fold__note', '.fold__body',
    '.preview', '.preview__item', '.preview__top', '.preview__label', '.preview__text', '.preview__lock',
    '.preview__title', '.preview__sub', '.value__label', '.seg--share', '.orbit__caption-advice',
    '.value', '.value__list', '.value__item', '.value__title', '.value__desc', '.value__focus', '.value__note',
    '.value__cta',
    '.pillars', '.pillar', '.pillar__label', '.pillar__ten', '.pillar__han', '.pillar__ko',
    '.block', '.block__head', '.oheng', '.oheng__bar', '.oheng__legend', '.oheng__note',
    '.cycle', '.cycle__wrap', '.cycle__note', '.cycle__key', '.myeong__foot',
    '.fact-ribbon', '.fact-ribbon__text',
    '.share', '.share__head', '.share__title', '.share__sub', '.share__frame', '.share__opt',
    '.share__opt-hint', '.share__actions',
    '.orbit', '.orbit__head', '.orbit__map', '.orbit__type-kicker', '.orbit__legend', '.orbit__caption',
    '.orbit__sample', '.orbit__leg-line',
    '.orbit__list', '.orbit__form-wrap', '.orbit__input', '.orbit__invite-row', '.orbit__hint', '.orbit__lock',
    '.orbit__detail', '.orbit__detail-text', '.orbit__detail-advice', '.orbit__item-meta',
    '.invite', '.invite-bar',
    '.postcard', '.postcard__title', '.postcard__hero', '.postcard__cat', '.postcard__elem',
    '.postcard__birth', '.opened', '.opened__list',
    '.entry', '.entry__head', '.entry__text', '.entry__part', '.entry__tags', '.entry__term', '.entry__badge',
    '.entry__basis', '.pattern__basis',
    '.patterns', '.pattern', '.pattern__label', '.pattern__text', '.pattern__cut',
    '.bonus', '.bonus__head', '.bonus__title', '.bonus__sub', '.bonus__kicker',
    '.result-actions', '.foot', '.foot p', '.btn', '.link',
    '#sticky-cta'
]

CHECK_JS = """
(args) => {
  const [pts, selectors, minGap, skipClipped] = args;
  const bandTop = 46;   // 위/아래 46px는 프레임 대각선 모서리 구간(스크롤로 지나가는 자리)
  const bandBottom = 46;
  const phone = document.querySelector('.phone').getBoundingClientRect();
  const sx = phone.width / 430, sy = phone.height / 932;
  const poly = pts.map(([x, y]) => [phone.left + x * sx, phone.top + y * sy]);
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  const edges = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
    if ((cx - a[0]) * nx + (cy - a[1]) * ny < 0) { nx = -nx; ny = -ny; }
    return { a, nx, ny };
  });
  function clearance(r) {
    const corners = [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]];
    let best = Infinity;
    for (const e of edges) {
      let m = Infinity;
      for (const c of corners) m = Math.min(m, (c[0] - e.a[0]) * e.nx + (c[1] - e.a[1]) * e.ny);
      if (m < best) best = m;
    }
    return best;
  }

  const visTop = Math.max(phone.top, 0) + 1;
  const visBottom = Math.min(phone.bottom, window.innerHeight) - 1;
  const found = [];
  const seen = new Set();
  for (const sel of selectors) {
    const q = sel[0] === '#' ? sel : '.screen.is-active ' + sel;
    for (const el of document.querySelectorAll(q)) {
      if (seen.has(el)) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      const det = el.closest('details');
      if (det && !det.open && !el.closest('summary')) continue;  // 접힌 명식 안쪽은 배치상 자리만 차지한다
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.top < visTop || r.bottom > visBottom) continue;   // 화면 밖
      if (bandTop > 0 && r.top < phone.top + bandTop) continue;
      if (bandBottom > 0 && r.bottom > phone.bottom - bandBottom) continue;
      const gap = clearance(r);
      if (skipClipped && gap < 0) continue;                   // 프레임에 걸쳐 잘린 요소는 제외
      found.push({
        el, sel, text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 20),
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
        gap: Math.round(gap * 10) / 10
      });
    }
  }

  const overlaps = [];
  for (let i = 0; i < found.length; i++) {
    for (let j = i + 1; j < found.length; j++) {
      const A = found[i], B = found[j];
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      if (A.sel === '#sticky-cta' || B.sel === '#sticky-cta') continue;  // 떠 있는 바는 겹침 허용
      const ix = Math.min(A.rect[2], B.rect[2]) - Math.max(A.rect[0], B.rect[0]);
      const iy = Math.min(A.rect[3], B.rect[3]) - Math.max(A.rect[1], B.rect[1]);
      if (ix > 1 && iy > 1) overlaps.push([A.sel + ' ↔ ' + B.sel, Math.round(ix), Math.round(iy)]);
    }
  }

  const app = document.getElementById('app');
  return {
    minGap: found.length ? Math.min(...found.map(f => f.gap)) : 999,
    tight: found.filter(f => f.gap < minGap).sort((a, b) => a.gap - b.gap)
      .map(f => ({ sel: f.sel, text: f.text, gap: f.gap, rect: f.rect })),
    overlaps,
    checked: found.length,
    scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    appScrollW: app.scrollWidth - app.clientWidth,
    contentH: app.scrollHeight
  };
}
"""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve(port):
    handler = lambda *a, **k: Quiet(*a, directory=ROOT, **k)  # noqa: E731
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def check(page, label, skip_clipped):
    page.evaluate("() => document.getElementById('app').scrollTo(0,0)")
    page.wait_for_timeout(120)
    res = page.evaluate(CHECK_JS, [INNER, SELECTORS, MIN_GAP, skip_clipped])
    res["label"] = label
    return res


def check_bottom(page, label):
    page.evaluate("() => { const a = document.getElementById('app'); a.scrollTo(0, a.scrollHeight); }")
    page.wait_for_timeout(220)
    res = page.evaluate(CHECK_JS, [INNER, SELECTORS, MIN_GAP, True])
    res["label"] = label
    return res


def check_mid(page, label):
    page.evaluate("() => { const a = document.getElementById('app');"
                  " a.scrollTo(0, Math.round((a.scrollHeight - a.clientHeight) / 2)); }")
    page.wait_for_timeout(220)
    res = page.evaluate(CHECK_JS, [INNER, SELECTORS, MIN_GAP, True])
    res["label"] = label
    return res


def check_at(page, label, selector, offset=70):
    """특정 블록(접힌 명식·인연 궤도·공유 카드)이 화면에 들어오게 스크롤하고 그 구간을 검사한다."""
    page.evaluate("(args) => { const a = document.getElementById('app');"
                  " const el = document.querySelector(args[0]);"
                  " if (!el) return; const r = el.getBoundingClientRect();"
                  " const ar = a.getBoundingClientRect();"
                  " a.scrollTop += r.top - ar.top - args[1]; }", [selector, offset])
    page.wait_for_timeout(260)
    res = page.evaluate(CHECK_JS, [INNER, SELECTORS, MIN_GAP, True])
    res["label"] = label
    return res


SPEC_JS = r"""
() => {
  const q = (s) => document.querySelector(s);
  const order = [
    ['1 캐릭터', '.catcard__stage'],
    ['2 이름·키워드', '.catcard__plate'],
    ['2 키워드', '.catcard__tags'],
    ['3 천기팩폭', '.fact-ribbon'],
    ['4 성향 3', '.traits'],
    ['5 결과 카드', '#share-block'],
    ['6 명식·오행', '#fold-chart'],
    ['7 미리보기', '#preview-block'],
    ['7 결제 버튼', '#btn-unlock'],
    ['8 인연 궤도', '#orbit-block']
  ].map(([label, sel]) => {
    const el = q(sel);
    return { label, sel, top: el ? el.getBoundingClientRect().top + document.getElementById('app').scrollTop : null };
  });

  const landing = q('#screen-input');
  const priceNodes = [...landing.querySelectorAll('*')].filter(el =>
    [...el.childNodes].some(n => n.nodeType === 3 && /1,900원/.test(n.textContent)) &&
    getComputedStyle(el).display !== 'none');
  const bodyText = document.body.innerText;

  const value = q('#value-block');
  const inValue = (sel) => value && value.contains(q(sel));

  return {
    order,
    priceNodes: priceNodes.length,
    priceTexts: priceNodes.map(el => (el.textContent || '').trim().slice(0, 40)),
    banned: { '공짜': (bodyText.match(/공짜/g) || []).length,
              '보너스': (bodyText.match(/보너스/g) || []).length,
              'BONUS': (bodyText.match(/BONUS/g) || []).length,
              'DEEP': (bodyText.match(/DEEP/g) || []).length,
              'PATTERN': (bodyText.match(/PATTERN/g) || []).length,
              '무료·': (bodyText.match(/무료\s*·/g) || []).length,
              '유료·': (bodyText.match(/유료\s*·/g) || []).length },
    previewInValue: !!(inValue('#preview-block') && inValue('#preview-list')),
    payAfterPreview: !!(q('#preview-block') && q('#btn-unlock') &&
      q('#preview-block').compareDocumentPosition(q('#btn-unlock')) & Node.DOCUMENT_POSITION_FOLLOWING),
    payBeforeList: !!(q('#btn-unlock') && q('#value-list') &&
      q('#btn-unlock').compareDocumentPosition(q('#value-list')) & Node.DOCUMENT_POSITION_FOLLOWING),
    shareBeforeFold: !!(q('#share-block').compareDocumentPosition(q('#fold-chart')) & Node.DOCUMENT_POSITION_FOLLOWING),
    foldBeforeValue: !!(q('#fold-chart').compareDocumentPosition(q('#value-block')) & Node.DOCUMENT_POSITION_FOLLOWING),
    valueBeforeOrbit: !!(q('#value-block').compareDocumentPosition(q('#orbit-block')) & Node.DOCUMENT_POSITION_FOLLOWING)
  };
}
"""


def check_specs(page, width, problems):
    """v2.1 확정 스펙 — 무료 8단계 순서·랜딩 안내 1곳·금지어·카드 두 비율."""
    res = page.evaluate(SPEC_JS)
    tops = [o['top'] for o in res['order']]
    ordered = all(t is not None for t in tops) and all(tops[i] < tops[i + 1] for i in range(len(tops) - 1))
    ok = ordered
    print(f'{"OK " if ok else "NG "}{width}/spec/8단계 순서' +
          ('  ' + ' < '.join(o['label'] for o in res['order']) if ok else f'  {[(o["label"], o["top"]) for o in res["order"]]}'))
    if not ok:
        problems.append(f'{width}px: 무료 화면 8단계 순서가 어긋남 {[(o["label"], o["top"]) for o in res["order"]]}')

    ok2 = res['priceNodes'] == 1
    print(f'{"OK " if ok2 else "NG "}{width}/spec/랜딩 가격·무료 안내 1곳 — {res["priceNodes"]}곳 {res["priceTexts"]}')
    if not ok2:
        problems.append(f'{width}px: 랜딩 가격·무료 안내가 {res["priceNodes"]}곳')

    banned_total = sum(res['banned'].values())
    ok3 = banned_total == 0
    print(f'{"OK " if ok3 else "NG "}{width}/spec/금지어(공짜·보너스·BONUS·DEEP·무료·) — {res["banned"]}')
    if not ok3:
        problems.append(f'{width}px: 금지어 {res["banned"]}')

    ok4 = res['previewInValue'] and res['payAfterPreview'] and res['payBeforeList'] and res['shareBeforeFold'] and res['foldBeforeValue'] and res['valueBeforeOrbit']
    print(f'{"OK " if ok4 else "NG "}{width}/spec/미리보기→결제버튼→목차·카드→명식→결제→궤도 배치')
    if not ok4:
        problems.append(f'{width}px: 무료 화면 블록 배치 어긋남 {res}')

    # 카드 두 비율
    size0 = page.evaluate("() => { const c = document.getElementById('share-card'); return [c.width, c.height]; }")
    page.click('.seg[data-group="share-ratio"] .seg__btn[data-ratio="square"]')
    page.wait_for_timeout(700)
    size1 = page.evaluate("() => { const c = document.getElementById('share-card'); return [c.width, c.height]; }")
    page.click('.seg[data-group="share-ratio"] .seg__btn[data-ratio="story"]')
    page.wait_for_timeout(700)
    ok5 = size0 == [1080, 1920] and size1 == [1080, 1080]
    print(f'{"OK " if ok5 else "NG "}{width}/spec/공유 카드 9:16·1:1 — {size0} / {size1}')
    if not ok5:
        problems.append(f'{width}px: 공유 카드 비율 {size0} / {size1}')


def run(args):
    httpd = serve(args.port)
    rows, problems = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width in args.widths:
            page = browser.new_page(viewport={"width": width, "height": 932}, device_scale_factor=2)
            errs = []
            page.on("console", lambda m: errs.append(m.type + ": " + m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
            page.goto(f"http://127.0.0.1:{args.port}/", wait_until="networkidle")
            page.wait_for_timeout(400)

            if args.screen in ("all", "landing"):
                rows.append(check(page, f"{width}/landing/top", False))
                rows.append(check_mid(page, f"{width}/landing/mid"))
                rows.append(check_bottom(page, f"{width}/landing/bottom"))

            if args.screen != "landing":
                page.fill("#name", args.name)
                page.select_option("#year", args.year)
                page.select_option("#month", args.month)
                page.select_option("#day", args.day)
                page.select_option("#hour", args.hour)
                page.click(f'#status-grid .status[data-value="{args.focus}"]')
                page.click('#form button[type="submit"]')
                page.wait_for_selector("#screen-free.is-active", timeout=8000)
                page.wait_for_timeout(450)

                if args.screen in ("all", "free"):
                    check_specs(page, width, problems)
                    rows.append(check(page, f"{width}/free/top", False))
                    rows.append(check_mid(page, f"{width}/free/mid"))
                    rows.append(check_bottom(page, f"{width}/free/bottom"))
                    rows.append(check_at(page, f"{width}/free/traits", ".traits", 80))
                    # 명식 접기 펼친 상태
                    page.evaluate("() => { const d = document.getElementById('fold-chart'); if (!d.open) d.open = true; }")
                    rows.append(check_at(page, f"{width}/free/chart", "#fold-chart", 80))
                    page.evaluate("() => { const d = document.getElementById('fold-chart'); d.open = false; }")
                    rows.append(check_at(page, f"{width}/free/preview", ".preview", 80))
                    rows.append(check_at(page, f"{width}/free/share", "#share-block", 84))
                    rows.append(check_at(page, f"{width}/free/orbit", ".orbit__map", 90))
                    rows.append(check_at(page, f"{width}/free/orbit-form", ".orbit__form-wrap", 90))
                    rows.append(check_at(page, f"{width}/free/value", ".value", 80))

                page.evaluate("() => document.getElementById('app').scrollTo(0,0)")
                page.click("#btn-unlock")
                page.wait_for_selector("#pay-modal.is-open", timeout=4000)
                page.wait_for_timeout(260)
                rows.append(check(page, f"{width}/pay", False))
                page.click("#btn-pay")
                page.wait_for_selector("#screen-result.is-active", timeout=12000)
                page.wait_for_timeout(3300)

                if args.screen in ("all", "result"):
                    rows.append(check(page, f"{width}/result/top", False))
                    rows.append(check_at(page, f"{width}/result/sections", "#result-sections", 80))
                    rows.append(check_at(page, f"{width}/result/bonus", "#bonus-block", 80))
                    rows.append(check_at(page, f"{width}/result/pattern", "#pattern-block", 80))
                    rows.append(check_at(page, f"{width}/result/orbit", "#orbit-detail-block", 80))
                    rows.append(check_at(page, f"{width}/result/talis", "#talis-block", 84))
                    rows.append(check_mid(page, f"{width}/result/mid"))
                    rows.append(check_bottom(page, f"{width}/result/bottom"))

            if errs:
                problems.append(f"{width}px: 콘솔/페이지 에러 {errs}")
            page.close()
        browser.close()
    httpd.shutdown()
    httpd.server_close()

    for r in rows:
        flag = "OK " if r["minGap"] >= MIN_GAP and not r["overlaps"] and not r["scrollX"] and not r["appScrollW"] else "NG "
        print(f'{flag}{r["label"]:<26} 최소여백 {r["minGap"]:>6}px  검사 {r["checked"]:>2}개  겹침 {len(r["overlaps"])}  스크롤X {r["scrollX"]}/{r["appScrollW"]}')
        for t in r["tight"][:3]:
            print(f'      · {t["sel"]} "{t["text"]}" {t["gap"]}px {t["rect"]}')
        for o in r["overlaps"][:3]:
            print("      · 겹침", o)
        if r["minGap"] < MIN_GAP:
            problems.append(f'{r["label"]}: 최소 여백 {r["minGap"]}px')
        if r["scrollX"] or r["appScrollW"]:
            problems.append(f'{r["label"]}: 가로 스크롤 {r["scrollX"]}/{r["appScrollW"]}')
        if r["overlaps"]:
            problems.append(f'{r["label"]}: 겹침 {r["overlaps"][:3]}')

    print()
    if problems:
        print("문제:", *("  - " + str(x) for x in problems), sep="\n")
        return 1
    print(f"OK — 모든 요소가 프레임 선에서 {MIN_GAP}px 이상, 겹침·가로 스크롤·콘솔 에러 없음")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--screen", default="all", choices=["all", "landing", "free", "result"])
    ap.add_argument("--widths", type=int, nargs="+", default=[430, 390, 360])
    ap.add_argument("--name", default="민지")
    ap.add_argument("--year", default="1995")
    ap.add_argument("--month", default="4")
    ap.add_argument("--day", default="12")
    ap.add_argument("--hour", default="6")
    ap.add_argument("--focus", default="love")
    ap.add_argument("--port", type=int, default=8792)
    raise SystemExit(run(ap.parse_args()))


if __name__ == "__main__":
    main()
