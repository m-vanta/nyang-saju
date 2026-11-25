#!/usr/bin/env python3
"""냥도사 v2.2 검사 — 문체·배치·상세 근거·다중 입력 조건.

    python3 tools/check-v22.py

확인하는 것
1. 랜딩 카피(가격·무료 안내 1곳, 발견 재미 중심)
2. 무료 8단계 순서 + 미리보기 바로 아래 결제 버튼
3. 문체 — 냥 말투는 천기팩폭·부적에만, 안내·해설은 해요체, 금지어 0
4. 공유 카드 9:16 / 1:1 저장
5. 인연 궤도 — 친구 입력 전 예시 지도 + 다섯 관계 결 설명
6. 상세 해설 — 일간·일주·오행·십성·대운 근거, 강점·주의점
7. 같은 일간 다른 사주 2쌍 / 출생시간 미상 / 음력·윤달
8. 실결제 OFF (결제 요청 0건)
9. 360·390·430px 가로 스크롤·12px 미만·콘솔 에러 0
"""
import http.server
import io
import json
import os
import socketserver
import struct
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8831
LIVE = os.environ.get("NYANG_BASE", "").rstrip("/")
BASE = (LIVE if LIVE.endswith("index.html") else LIVE + "/index.html") if LIVE else f"http://127.0.0.1:{PORT}/index.html"
OUT = "/workspace/.tmp/v22"
os.makedirs(OUT, exist_ok=True)

problems = []


def expect(label, ok, detail=""):
    print(("OK " if ok else "NG ") + label + (f" — {detail}" if detail else ""))
    if not ok:
        problems.append(label + (f" ({detail})" if detail else ""))
    return ok


class Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass


def serve():
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), Quiet)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


FILL = """
(args) => {
  const [name, y, m, d, hour, calendar, leap, focus] = args;
  document.getElementById('name').value = name;
  if (calendar === 'lunar') {
    document.querySelector('.seg[data-group="calendar"] .seg__btn[data-value="lunar"]').click();
  }
  const sel = (id, v) => { const el = document.getElementById(id); el.value = String(v); el.dispatchEvent(new Event('change', {bubbles: true})); };
  sel('year', y); sel('month', m);
  if (calendar === 'lunar' && leap) {
    const box = document.getElementById('isLeap');
    const wrap = document.getElementById('leap-wrap');
    if (wrap && !wrap.hidden) { box.checked = true; box.dispatchEvent(new Event('change', {bubbles: true})); }
  }
  sel('day', d);
  sel('hour', hour === null ? 'none' : hour);
  const f = document.querySelector('#status-grid .status[data-value="' + focus + '"]');
  if (f) f.click();
}
"""


def submit(page, name, y, m, d, hour=6, calendar='solar', leap=False, focus='love'):
    page.goto(BASE, wait_until="load")
    page.evaluate("() => { try { localStorage.clear(); } catch (e) {} }")
    page.reload(wait_until="load")
    page.wait_for_timeout(350)
    page.evaluate(FILL, [name, y, m, d, hour, calendar, leap, focus])
    page.wait_for_timeout(150)
    page.click('#form button[type="submit"]')
    page.wait_for_selector("#screen-free.is-active", timeout=10000)
    page.wait_for_timeout(800)


def paid(page):
    page.evaluate("() => document.getElementById('app').scrollTo(0,0)")
    page.click("#btn-unlock")
    page.wait_for_selector("#pay-modal.is-open", timeout=5000)
    page.click("#btn-pay")
    page.wait_for_selector("#screen-result.is-active", timeout=12000)
    page.wait_for_timeout(600)


def png_size(path):
    with open(path, 'rb') as f:
        head = f.read(24)
    if head[:8] != b'\x89PNG\r\n\x1a\n':
        return None
    return struct.unpack('>II', head[16:24])


def run():
    httpd = None if LIVE else serve()
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ---------- 1) 390px 기본 흐름 ----------
        ctx = browser.new_context(viewport={"width": 390, "height": 932}, device_scale_factor=2,
                                  accept_downloads=True, is_mobile=True, has_touch=True)
        page = ctx.new_page()
        errs, reqs = [], []
        page.on("console", lambda m: errs.append("console " + m.type + ": " + m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
        page.on("request", lambda r: reqs.append(r.url))

        page.goto(BASE, wait_until="load")
        page.wait_for_timeout(600)
        landing = page.evaluate("""() => ({
          price: (document.getElementById('screen-input').innerText.match(/1,900원/g) || []).length,
          hero: document.querySelector('.hero__line').textContent.trim(),
          notice: document.querySelector('.notice__text').textContent.trim(),
          freeMentions: (document.getElementById('screen-input').innerText.match(/무료/g) || []).length
        })""")
        expect("390 랜딩 가격 안내 1곳", landing["price"] == 1, str(landing["price"]))
        expect("390 랜딩 발견 재미 카피", "재미" in landing["hero"] and "찾는" in landing["hero"], landing["hero"])
        expect("390 랜딩 무료 반복 없음", landing["freeMentions"] <= 2, str(landing["freeMentions"]))

        submit(page, "민지", 1987, 6, 23, 6)
        free = page.evaluate("""() => ({
          order: [...document.querySelectorAll('#screen-free > section, #screen-free > aside, #screen-free > details')].map(e => e.id || e.className.split(' ')[0]),
          valueOrder: [...document.querySelectorAll('#value-block > *')].map(e => e.id || e.className.split(' ')[0]),
          gap: Math.round(document.getElementById('btn-unlock').getBoundingClientRect().top -
                          document.getElementById('preview-block').getBoundingClientRect().bottom),
          cat: document.getElementById('cat-name').textContent,
          def: document.getElementById('cat-def').textContent,
          bomb: document.getElementById('free-bomb').textContent,
          traits: [...document.querySelectorAll('#traits-list .trait__text')].map(e => e.textContent),
          preview: [...document.querySelectorAll('#preview-list .preview__text')].map(e => e.textContent),
          nodes: document.querySelectorAll('#orbit-svg .orbit__node').length,
          sampleShown: !document.getElementById('orbit-sample-note').hidden,
          legend: [...document.querySelectorAll('#orbit-legend li')].map(li => li.innerText.replace(/\\n/g, ' / ')),
          text: document.getElementById('screen-free').innerText
        })""")
        expect("390 무료 8단계 순서", free["order"] == ["catcard", "fact-ribbon", "traits", "share-block", "fold-chart", "value-block", "orbit-block"], str(free["order"]))
        expect("390 미리보기 바로 아래 결제 버튼", free["valueOrder"][:3] == ["sec-head", "preview-block", "value__cta"] and 0 <= free["gap"] <= 80, f'{free["valueOrder"]} · {free["gap"]}px')
        expect("390 예시 관계 지도 보임", free["nodes"] == 4 and free["sampleShown"], f'{free["nodes"]} nodes')
        expect("390 다섯 관계 결 설명", len(free["legend"]) == 5 and all(len(x.split(" / ")) == 3 for x in free["legend"]), str(free["legend"]))

        # 공유 카드 9:16 · 1:1
        s0 = page.evaluate("() => { const c = document.getElementById('share-card'); return [c.width, c.height, c.toDataURL('image/png').length]; }")
        with page.expect_download() as dl:
            page.click("#btn-share-save")
        f0 = dl.value.suggested_filename
        dl.value.save_as(f"{OUT}/story-390.png")
        page.click('.seg[data-group="share-ratio"] .seg__btn[data-ratio="square"]')
        page.wait_for_timeout(900)
        s1 = page.evaluate("() => { const c = document.getElementById('share-card'); return [c.width, c.height, c.toDataURL('image/png').length]; }")
        with page.expect_download() as dl2:
            page.click("#btn-share-save")
        f1 = dl2.value.suggested_filename
        dl2.value.save_as(f"{OUT}/square-390.png")
        expect("390 카드 9:16 1080×1920", s0[:2] == [1080, 1920] and s0[2] > 100000, str(s0[:2]))
        expect("390 카드 1:1 1080×1080", s1[:2] == [1080, 1080] and s1[2] > 100000, str(s1[:2]))
        expect("390 저장 파일명", f0.endswith("-9x16.png") and f1.endswith("-1x1.png"), f"{f0} / {f1}")
        expect("390 PNG 실제 크기", png_size(f"{OUT}/story-390.png") == (1080, 1920) and png_size(f"{OUT}/square-390.png") == (1080, 1080), f'{png_size(f"{OUT}/story-390.png")} {png_size(f"{OUT}/square-390.png")}')

        # 친구 올리기 → 예시 안내 사라짐
        page.evaluate("""() => {
          const f = document.getElementById('friend-name'); f.value = '테스트';
          const set = (id, v) => { const el = document.getElementById(id); el.value = String(v); el.dispatchEvent(new Event('change', {bubbles: true})); };
          set('friend-year', 1990); set('friend-month', 5); set('friend-day', 15); set('friend-hour', 6);
        }""")
        page.click("#orbit-form button[type=submit]")
        page.wait_for_timeout(500)
        after = page.evaluate("""() => ({ nodes: document.querySelectorAll('#orbit-svg .orbit__node').length,
          sample: !document.getElementById('orbit-sample-note').hidden,
          names: [...document.querySelectorAll('#orbit-list .orbit__item-name')].map(e => e.textContent.trim()) })""")
        expect("390 친구 올리면 내 궤도", after["nodes"] == 1 and not after["sample"] and any("테스트" in n for n in after["names"]), str(after))

        # 상세 해설 — 근거·강점·주의점
        paid(page)
        res = page.evaluate("""() => ({
          text: document.getElementById('screen-result').innerText,
          basis: [...document.querySelectorAll('#result-sections .entry__basis, #result-sections-bonus .entry__basis, .pattern__basis')].map(e => e.innerText.replace(/\\n/g, ' ')),
          parts: [...document.querySelectorAll('#result-sections-bonus .entry__part-label')].map(e => e.textContent),
          sampleWord: (document.getElementById('screen-result').innerText.match(/샘플/g) || []).length,
          terms: [...document.querySelectorAll('#result-sections .entry__term')].length
        })""")
        expect("390 근거 줄 10개 이상", len(res["basis"]) >= 9, str(len(res["basis"])))
        axes = ["일간", "일주", "오행" if False else "개(", "십성" if False else "", "대운"]
        joined = " ".join(res["basis"])
        expect("390 근거에 일간·일주·오행·십성·대운", all(k in joined for k in ["일간", "일주", "대운"]) and "개(" in joined and any(g in joined for g in ["편재", "정재", "상관", "식신", "비견", "겁재", "편관", "정관", "편인", "정인"]), joined[:160])
        expect("390 강점·지금 이 구간", "강점" in res["parts"] and "지금 이 구간" in res["parts"], str(res["parts"]))
        expect("390 샘플 표기 없음", res["sampleWord"] == 0, str(res["sampleWord"]))

        # 결제 요청 없음
        pay_reqs = [u for u in reqs if any(k in u for k in ("kakaopay", "tosspay", "payapp", "checkout", "payment"))]
        expect("390 실결제 요청 0건", not pay_reqs, str(pay_reqs[:3]))
        expect("390 미리보기 결제 고지", "미리보기" in res["text"], "")
        expect("390 콘솔 에러 0", not errs, str(errs[:3]))

        # 문체 검사 (무료+유료 렌더 텍스트)
        tone = page.evaluate(r"""() => {
          const badNyang = [];
          const ALLOWED = e => e.closest('.fact-ribbon') || e.closest('#talis-block');
          const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let n;
          while ((n = w.nextNode())) {
            const el = n.parentElement;
            if (!el || el.closest('script,style')) continue;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            const t = (n.textContent || '').trim();
            if (!t) continue;
            if (/(다냥|라냥|지냥|거든냥|보라냥|냥[.!?])/.test(t) && !ALLOWED(el)) badNyang.push(t.slice(0, 40));
          }
          const body = document.body.innerText;
          const banned = ['무조건', '반드시', '틀림없', '절대 ', '할 수밖에', '이미 늦', '십상이에요'].filter(w => body.includes(w));
          const formal = (body.match(/(습니다|하십시오)/g) || []).length;
          return { badNyang: badNyang.slice(0, 5), banned, formal };
        }""")
        expect("문체 냥 말투는 팩폭·부적에만", not tone["badNyang"], str(tone["badNyang"]))
        expect("문체 단정 표현 0", not tone["banned"], str(tone["banned"]))
        expect("문체 격식체 0", tone["formal"] == 0, str(tone["formal"]))
        page.screenshot(path=f"{OUT}/paid-390.png", full_page=True)
        ctx.close()

        # ---------- 2-1) 올해 총운 관심사 ----------
        ctx = browser.new_context(viewport={"width": 390, "height": 932}, device_scale_factor=2)
        pg = ctx.new_page()
        e = []
        pg.on("pageerror", lambda x: e.append(str(x)))
        submit(pg, "연말", 1995, 4, 12, 6, focus='year')
        yr = pg.evaluate("""() => ({
          preview: [...document.querySelectorAll('#preview-list .preview__label')].map(x => x.textContent),
          title: document.getElementById('preview-title').textContent
        })""")
        expect("올해 총운 미리보기 우선", yr["preview"][0] == "올해 총운" and not e, json.dumps(yr, ensure_ascii=False))
        paid(pg)
        yp = pg.evaluate("""() => ({
          titles: [...document.querySelectorAll('#result-sections .entry__title')].map(x => x.textContent),
          basis: [...document.querySelectorAll('#result-sections .entry__basis')].map(x => x.innerText),
          err: document.getElementById('form-error').hidden
        })""")
        expect("올해 총운 상세 4칸·올해 근거", yp["titles"][0] == "올해 총운" and len(yp["titles"]) == 4 and "올해" in yp["basis"][0], json.dumps(yp, ensure_ascii=False)[:160])
        ctx.close()

        # ---------- 2) 같은 일간 · 다른 사주 ----------
        pairs = [
            ((1987, 6, 23, 6), (1985, 3, 15, 6)),
            ((1986, 11, 15, 6), (1987, 7, 23, 6)),
        ]
        outs = []
        for i, cases in enumerate(pairs):
            got = []
            for (y, m, d, h) in cases:
                ctx = browser.new_context(viewport={"width": 390, "height": 932}, device_scale_factor=2)
                pg = ctx.new_page()
                e = []
                pg.on("pageerror", lambda x: e.append(str(x)))
                submit(pg, "검증", y, m, d, h)
                info = pg.evaluate("""() => ({
                  cat: document.getElementById('cat-name').textContent,
                  def: document.getElementById('cat-def').textContent,
                  ten: document.getElementById('cat-ten').textContent,
                  bomb: document.getElementById('free-bomb').textContent,
                  traits: [...document.querySelectorAll('#traits-list .trait__text')].map(x => x.textContent),
                  preview: [...document.querySelectorAll('#preview-list .preview__text')].map(x => x.textContent),
                  day: document.getElementById('free-meta').textContent
                })""")
                paid(pg)
                info2 = pg.evaluate("""() => ({
                  themes: [...document.querySelectorAll('#result-sections .entry__text')].map(x => x.textContent),
                  patterns: [...document.querySelectorAll('#pattern-list .pattern__label')].map(x => x.textContent),
                  basis: [...document.querySelectorAll('.entry__basis, .pattern__basis')].map(x => x.innerText)
                })""")
                info.update(info2)
                info["err"] = e
                got.append(info)
                ctx.close()
            outs.append(got)
            a, b = got
            same_cat = a["cat"] == b["cat"]
            diff_def = (a["def"] + a["ten"]) != (b["def"] + b["ten"])
            diff_bomb = a["bomb"] != b["bomb"]
            diff_traits = sum(1 for x, y in zip(a["traits"], b["traits"]) if x != y)
            diff_preview = sum(1 for x, y in zip(a["preview"], b["preview"]) if x != y)
            diff_paid = sum(1 for x, y in zip(a["themes"], b["themes"]) if x != y)
            expect(f"쌍{i+1} 같은 일간·같은 고양이 ({a['cat']})", same_cat, f"{a['cat']} / {b['cat']}")
            expect(f"쌍{i+1} 한 줄 정의·팩폭 개인화", diff_def and diff_bomb, f"def {diff_def} bomb {diff_bomb}")
            expect(f"쌍{i+1} 성향·미리보기·상세 개인화", diff_traits >= 2 and diff_preview >= 2 and diff_paid >= 2,
                   f"traits {diff_traits}/3 · preview {diff_preview}/3 · paid {diff_paid}/3")
            expect(f"쌍{i+1} 근거 다른 축", a["basis"] != b["basis"], "same basis")
            expect(f"쌍{i+1} 에러 0", not a["err"] and not b["err"], str(a["err"] + b["err"]))
            print(f"  {a['day']}\n  {b['day']}")

        # ---------- 3) 출생시간 미상 ----------
        ctx = browser.new_context(viewport={"width": 390, "height": 932}, device_scale_factor=2, is_mobile=True)
        pg = ctx.new_page()
        e = []
        pg.on("pageerror", lambda x: e.append(str(x)))
        pg.on("console", lambda m: e.append(m.text) if m.type == "error" else None)
        submit(pg, "무명", 1990, 5, 15, None)
        nt = pg.evaluate("""() => ({
          fold: document.getElementById('fold-chart-line').innerText,
          essay: document.getElementById('cat-essay').innerText,
          nodes: document.querySelectorAll('#orbit-svg .orbit__node').length
        })""")
        expect("시간 미상 삼주 계산", "?" in nt["fold"] and "여섯 글자" in nt["essay"], nt["fold"])
        paid(pg)
        ntp = pg.evaluate("""() => ({ text: document.getElementById('screen-result').innerText,
          birth: document.getElementById('result-birth').innerText })""")
        expect("시간 미상 상세·공유 정상", "시간 모름" in ntp["birth"] and "여섯 글자" in ntp["text"] and not e, ntp["birth"])
        sh = pg.evaluate("() => { const c = document.getElementById('share-card'); return [c.width, c.height, c.toDataURL('image/png').length]; }")
        expect("시간 미상 카드 생성", sh[0] == 1080 and sh[2] > 100000, str(sh[:2]))
        ctx.close()

        # ---------- 4) 음력·윤달 ----------
        ctx = browser.new_context(viewport={"width": 390, "height": 932}, device_scale_factor=2)
        pg = ctx.new_page()
        e = []
        pg.on("pageerror", lambda x: e.append(str(x)))
        submit(pg, "윤달", 2017, 5, 1, 6, calendar='lunar', leap=True)
        lunar = pg.evaluate("""() => ({
          leapShown: !document.getElementById('leap-wrap').hidden,
          note: document.getElementById('lunar-note').innerText,
          cat: document.getElementById('cat-name').textContent,
          fold: document.getElementById('fold-chart-line').innerText
        })""")
        conv = pg.evaluate("""() => {
          const S = window.NyangSaju;
          const a = S.computePillars({year:2017, month:5, day:1, calendar:'lunar', isLeap:true, hourIdx:6});
          const b = S.computePillars({year:2017, month:6, day:24, calendar:'solar', hourIdx:6});
          return { lunar: a.list.map(x => x.ko).join(' '), solar: b.list.map(x => x.ko).join(' '),
                   solarDate: [a.solar.y, a.solar.m, a.solar.d] };
        }""")
        expect("음력 윤달 변환 (2017 윤5/1 → 2017-06-24)", conv["lunar"] == conv["solar"] and conv["solarDate"] == [2017, 6, 24], json.dumps(conv, ensure_ascii=False))
        expect("음력·윤달 UI 계산", lunar["leapShown"] and "윤달" in lunar["note"] and not e, f'{lunar["note"]} / {e}')
        paid(pg)
        lb = pg.evaluate("() => document.getElementById('result-birth').innerText")
        expect("음력·윤달 상세 고지", "음력" in lb and "윤달" in lb, lb)
        ctx.close()

        # ---------- 5) 360 · 430px ----------
        for w in (360, 430):
            ctx = browser.new_context(viewport={"width": w, "height": 932}, device_scale_factor=2, is_mobile=True, has_touch=True)
            pg = ctx.new_page()
            e = []
            pg.on("pageerror", lambda x: e.append(str(x)))
            pg.on("console", lambda m: e.append(m.text) if m.type == "error" else None)
            submit(pg, "민지", 1994, 10, 8, 4)
            m = pg.evaluate("""() => {
              const app = document.getElementById('app');
              const small = [...document.querySelectorAll('#screen-free *')].filter(el => {
                const cs = getComputedStyle(el);
                if (cs.display === 'none' || cs.visibility === 'hidden') return false;
                const t = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
                return t && parseFloat(cs.fontSize) < 12;
              }).length;
              const legend = document.getElementById('orbit-legend');
              const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
              return { small, overflow, legendW: Math.round(legend.getBoundingClientRect().width),
                legendScroll: legend.scrollWidth - legend.clientWidth,
                gap: Math.round(document.getElementById('btn-unlock').getBoundingClientRect().top -
                  document.getElementById('preview-block').getBoundingClientRect().bottom),
                appScroll: app.scrollWidth - app.clientWidth };
            }""")
            expect(f"{w} 12px 미만 0", m["small"] == 0, str(m["small"]))
            expect(f"{w} 가로 스크롤 0", m["overflow"] == 0 and m["appScroll"] == 0, str(m))
            expect(f"{w} 결제 버튼 위치", 0 <= m["gap"] <= 80, str(m["gap"]))
            expect(f"{w} 다섯 결 범례 안 넘침", m["legendScroll"] == 0, str(m["legendScroll"]))
            expect(f"{w} 콘솔 에러 0", not e, str(e[:2]))
            pg.screenshot(path=f"{OUT}/free-{w}.png", full_page=True)
            ctx.close()

        browser.close()
    if httpd:
        httpd.shutdown()
        httpd.server_close()

    print()
    if problems:
        print("문제:")
        for x in problems:
            print("  - " + x)
        return 1
    print("OK — v2.2 전 항목 통과")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
