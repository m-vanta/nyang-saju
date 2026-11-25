"""냥도사 v3 프런트엔드 통합 검증 (Playwright)

1) Worker 주소가 없을 때: 무료 화면이 그대로 뜨고, 결제 버튼은 "연결 전" 안내만 한다.
2) Worker 를 흉내 냈을 때: 복채 버튼 → /api/order → 토큰 → /api/reading → 유료 화면.
3) 양쪽 다 콘솔 오류 0건, 퍼널 이벤트가 남는지 확인.
"""
from playwright.sync_api import sync_playwright
import json
import sys

BASE = "http://127.0.0.1:8787/index.html"
PAID = json.load(open("/workspace/.tmp/paid.json"))
PREVIEW = json.load(open("/workspace/.tmp/preview.json"))

problems = []
console_errors = []


def attach(page):
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append("pageerror: " + str(e)))


def fill_and_submit(page):
    page.fill("#name", "민지")
    page.select_option("#year", "1990")
    page.select_option("#month", "1")
    page.select_option("#day", "23")
    page.select_option("#hour", "6")
    page.click("#btn-submit" if page.query_selector("#btn-submit") else "form .gold-btn--full")
    page.wait_for_timeout(900)


with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---------------- 1) 설정 없음 ----------------
    page = browser.new_page(viewport={"width": 420, "height": 900})
    attach(page)
    page.goto(BASE)
    page.wait_for_timeout(400)
    fill_and_submit(page)

    free_ok = page.query_selector("#screen-free").is_visible()
    cat = page.inner_text("#cat-name")
    preview = page.inner_text("#preview-list")
    if not free_ok:
        problems.append("무료 화면이 열리지 않음")
    if "마음이 움직이는 방식" not in preview:
        problems.append("설정 없을 때 티저 안내문이 안 나옴: " + preview[:80])

    page.click("#btn-unlock")
    page.wait_for_timeout(300)
    modal_open = page.query_selector("#pay-modal").get_attribute("aria-hidden") == "false"
    pay_disabled = page.query_selector("#btn-pay").is_disabled()
    pay_note = page.inner_text("#pay-note")
    if not modal_open:
        problems.append("결제 모달이 열리지 않음")
    if not pay_disabled:
        problems.append("Worker 미설정인데 결제 버튼이 눌린다 (데모 위장 위험)")
    if "연결 전" not in pay_note:
        problems.append("연결 전 안내가 없음: " + pay_note[:60])
    page.screenshot(path="/workspace/.tmp/shot-1-config-off.png")

    legal_visible = False
    page.click("#pay-modal [data-legal-open]")
    page.wait_for_timeout(250)
    legal_visible = page.query_selector("#legal-modal").get_attribute("aria-hidden") == "false"
    if not legal_visible:
        problems.append("법정 안내 모달이 열리지 않음")
    legal_text = page.inner_text("#legal-modal")
    for must in ["판매자 정보", "청약철회", "개인정보", "1,900원"]:
        if must not in legal_text:
            problems.append("법정 안내에 빠진 항목: " + must)
    page.screenshot(path="/workspace/.tmp/shot-2-legal.png")
    page.click("#legal-modal .legal__close")

    funnel = page.evaluate("JSON.stringify(window.__nyangAnalytics.funnel())")
    page.close()

    # ---------------- 2) Worker 흉내 ----------------
    page = browser.new_page(viewport={"width": 420, "height": 900})
    attach(page)
    html = open('/workspace/apps/nyang-saju/index.html').read().replace(
        "window.NYANG_PAY_API = ''", "window.NYANG_PAY_API = 'https://api.nyangsaju.test'")

    def route_doc(route, request):
        if request.resource_type == "document":
            route.fulfill(status=200, content_type="text/html; charset=utf-8", body=html)
        else:
            route.continue_()


    def handle(route, request):
        url = request.url
        if url.endswith("/api/order"):
            route.fulfill(status=200, content_type="application/json",
                          body=json.dumps({"orderId": "ord_demo_1", "status": "paid",
                                           "amount": 1900, "token": "t1.fake.sig"}))
        elif "/api/preview" in url:
            route.fulfill(status=200, content_type="application/json", body=json.dumps(PREVIEW))
        elif "/api/reading" in url:
            route.fulfill(status=200, content_type="application/json", body=json.dumps(PAID))
        else:
            route.fulfill(status=404, body="{}")

    page.route("**/index.html", route_doc)
    page.route("https://api.nyangsaju.test/**", handle)
    page.goto(BASE)
    page.wait_for_timeout(300)
    fill_and_submit(page)
    page.wait_for_timeout(600)

    teaser = page.inner_text("#preview-list")
    if "마음이 움직이는 방식" in teaser:
        problems.append("서버 티저가 안 붙었다 (폴백 그대로)")
    teaser_ok = page.evaluate("window.__teaserCheck || true")

    page.click("#btn-unlock")
    page.wait_for_timeout(300)
    page.click("#btn-pay")
    page.wait_for_timeout(1500)

    result_visible = page.query_selector("#screen-result").is_visible()
    if not result_visible:
        problems.append("결제 후 유료 화면이 열리지 않음")

    themes = page.inner_text("#result-sections")
    bonus = page.inner_text("#result-sections-bonus")
    patterns = page.inner_text("#pattern-list")
    talis = page.inner_text("#result-sections-talis")
    if PAID["themes"][0]["body"][:20] not in themes:
        problems.append("유료 본문(운 풀이)이 화면에 없다")
    if PAID["paid"]["talisman"][:15] not in talis:
        problems.append("부적 문구가 화면에 없다")
    if PAID["patterns"][0]["label"] not in patterns:
        problems.append("패턴 라벨이 화면에 없다")
    if PAID["paid"]["selfBlind"][:12] not in bonus:
        problems.append("팩폭 심층 문장이 화면에 없다")

    page.screenshot(path="/workspace/.tmp/shot-3-paid.png", full_page=False)
    funnel2 = page.evaluate("JSON.stringify(window.__nyangAnalytics.funnel())")
    page.close()
    browser.close()

print("== 퍼널(설정 없음):", funnel)
print("== 퍼널(결제 흐름):", funnel2)
print("== 콘솔 오류:", console_errors)
print("== 문제:", problems if problems else "없음")
sys.exit(1 if problems or console_errors else 0)
