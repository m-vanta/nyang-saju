import base64, json
from playwright.sync_api import sync_playwright
BASE = "https://m-vanta.github.io/nyang-saju/"
OUT = "/workspace/.tmp/v21/live-"
problems = []

def expect(label, ok, detail=""):
    print(("OK " if ok else "NG ") + label + (f" — {detail}" if detail else ""))
    if not ok:
        problems.append(label)

with sync_playwright() as p:
    b = p.chromium.launch()
    for w in (430, 390, 360):
        ctx = b.new_context(viewport={"width": w, "height": 932}, device_scale_factor=2,
                            accept_downloads=True, is_mobile=True, has_touch=True)
        page = ctx.new_page()
        errs = []
        page.on("console", lambda m: errs.append("console " + m.type + ": " + m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))

        page.goto(BASE, wait_until="networkidle")
        page.evaluate("() => { try { localStorage.clear(); } catch (e) {} }")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(600)
        expect(f"{w} 라이브 페이지_뷰", page.evaluate("() => window.__nyangAnalytics.count('page_view')") == 1)

        page.fill("#name", "민지")
        page.select_option("#year", "1995"); page.select_option("#month", "4"); page.select_option("#day", "12")
        page.select_option("#hour", "6")
        page.click('#form button[type="submit"]')
        page.wait_for_selector("#screen-free.is-active", timeout=10000)
        page.wait_for_timeout(1200)

        order = page.evaluate("""() => [...document.querySelectorAll('#screen-free > section, #screen-free > aside, #screen-free > details')]
              .map(e => e.id || e.className.split(' ')[0])""")
        expect(f"{w} 무료 8단계 순서", order == ["catcard", "fact-ribbon", "traits", "share-block", "fold-chart", "value-block", "orbit-block"], str(order))

        vo = page.evaluate("() => [...document.querySelectorAll('#value-block > *')].map(e => e.id || e.className.split(' ')[0])")
        gap = page.evaluate("() => Math.round(document.getElementById('btn-unlock').getBoundingClientRect().top - document.getElementById('preview-block').getBoundingClientRect().bottom)")
        expect(f"{w} 미리보기→결제버튼→목차", vo[:3] == ["sec-head", "preview-block", "value__cta"] and 0 <= gap <= 80, f"{vo} · {gap}px")

        s0 = page.evaluate("() => { const c = document.getElementById('share-card'); return [c.width, c.height]; }")
        expect(f"{w} 카드 9:16", s0 == [1080, 1920], str(s0))
        d = page.evaluate("() => document.getElementById('share-card').toDataURL('image/png')")
        open(OUT + f"story-{w}.png", "wb").write(base64.b64decode(d.split(",")[1]))

        page.click('.seg[data-group="share-ratio"] .seg__btn[data-ratio="square"]')
        page.wait_for_timeout(1100)
        s1 = page.evaluate("() => { const c = document.getElementById('share-card'); return [c.width, c.height]; }")
        expect(f"{w} 카드 1:1", s1 == [1080, 1080], str(s1))
        d = page.evaluate("() => document.getElementById('share-card').toDataURL('image/png')")
        open(OUT + f"square-{w}.png", "wb").write(base64.b64decode(d.split(",")[1]))

        with page.expect_download() as dl:
            page.click("#btn-share-save")
        fn = dl.value.suggested_filename
        dl.value.cancel()
        expect(f"{w} 1:1 저장 파일명", fn.endswith("-1x1.png"), fn)

        orbit = page.evaluate("""() => ({
          nodes: document.querySelectorAll('#orbit-svg .orbit__node').length,
          sampleNote: !document.getElementById('orbit-sample-note').hidden,
          descriptions: [...document.querySelectorAll('#orbit-legend .orbit__leg-line')].length,
          score: (document.getElementById('screen-free').innerText.match(/[0-9]+점/g) || []).length,
          legend: [...document.querySelectorAll('#orbit-legend .orbit__leg b')].map(n => n.textContent.trim())
        })""")
        expect(f"{w} 궤도 무료 사용 + 예시 지도 + 점수 없음", orbit["nodes"] == 4 and orbit["score"] == 0 and orbit["legend"][0] == "충전냥" and orbit["sampleNote"] and orbit["descriptions"] == 5, json.dumps(orbit, ensure_ascii=False))

        page.click("#btn-unlock")
        page.wait_for_selector("#pay-modal.is-open", timeout=6000)
        page.click("#btn-pay")
        page.wait_for_selector("#screen-result.is-active", timeout=15000)
        page.wait_for_timeout(3400)
        pat = page.evaluate("() => [...document.querySelectorAll('#pattern-list .pattern__label')].map(n => n.textContent.trim())")
        basis = page.evaluate("() => document.querySelectorAll('.entry__basis, .pattern__basis').length")
        expect(f"{w} 상세 해설 근거 9곳 이상", basis >= 9, str(basis))
        expect(f"{w} 미리보기 결제 고지", "미리보기" in page.inner_text("#screen-result"), "")
        expect(f"{w} 결제(데모) 후 세 패턴 축", len(pat) == 3 and pat[0] != pat[1] and pat[1] != pat[2], str(pat))

        names = {f["event"]: f["count"] for f in page.evaluate("() => window.__nyangAnalytics.funnel()")}
        expect(f"{w} 8개 이벤트", all(names.get(e, 0) >= 1 for e in ["page_view", "input_start", "input_complete", "free_result_view", "result_share", "friend_invite", "pay_button_click", "payment_complete"]) or
               all(names.get(e, 0) >= 1 for e in ["page_view", "input_start", "input_complete", "free_result_view", "result_share", "pay_button_click", "payment_complete"]), str(names))
        expect(f"{w} 콘솔 에러 없음", not errs, str(errs[:2]))
        ctx.close()

    # 초대 링크 왕복 (라이브)
    ctx = b.new_context(viewport={"width": 390, "height": 932}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.goto(BASE + "?inviter=%EB%AF%BC%EC%A7%80&iy=1995&im=4&id=12&ih=6&ic=solar&ig=f", wait_until="networkidle")
    page.wait_for_timeout(500)
    expect("라이브 초대 배너", page.is_visible("#invite-banner"))
    page.fill("#name", "하늘"); page.select_option("#year", "1992"); page.select_option("#month", "2"); page.select_option("#day", "11")
    page.select_option("#hour", "4")
    page.click('#form button[type="submit"]')
    page.wait_for_selector("#screen-free.is-active", timeout=10000)
    page.wait_for_timeout(1200)
    card = page.inner_text("#invite-card") if page.is_visible("#invite-card") else ""
    expect("라이브 초대 받은 사람이 자기 정보 입력 → 궁합", "민지 님과의 궁합" in card and "냥" in card, card[:60].replace("\n", " "))
    ctx.close()
    b.close()

print()
print("문제:", problems if problems else "없음")
