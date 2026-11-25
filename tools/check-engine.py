#!/usr/bin/env python3
"""냥도사 만세력 정확도 검사.

headless Chromium에서 앱을 그대로 띄워 `window.NyangSaju`(vendor/manseryeok 엔진 + 해석 계층)를
직접 호출하고, 알려진 기준값과 견준다.

기준값 출처
- 1995-04-12 11:30 → 을해 경진 계유 무오 (한국 표준시, 진태양시 미적용)
- 1995-04-12 10:45 → 을해 경진 계유 정사 (사시 경계 확인)
- 1990-05-15 14:30 → 경오 신사 경진 계미 (@fullstackfamily/manseryeok README 예제)
- 2000-02-04 21:00 → 기묘 정축 / 21:45 → 경진 무인 (입춘 21:40, 엔진 비교 자료)
- 2024-02-04 17:26 → 계묘 을축 / 17:27 → 갑진 병인 (입춘 17:27, 한국천문연구원 값)
- 1997-02-08 양력 → 음력 1997-01-01 (한국 설날)
- 음력 2017 윤5월 1일 → 양력 2017-06-24 (한국은 윤5월, 중국은 윤6월)

    python3 tools/check-engine.py
"""
import http.server
import json
import os
import socketserver
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8794

CASES_JS = r"""
() => {
  const S = window.NyangSaju;
  const out = {};
  const p = (c) => ({
    pillars: c.list.map(x => x.ko).join(' '),
    hanja: c.list.map(x => x.hanja).join(' '),
    solar: c.solar.y + '-' + c.solar.m + '-' + c.solar.d,
    lunar: c.lunar ? c.lunar.year + '-' + c.lunar.month + '-' + c.lunar.day + (c.lunar.isLeap ? '(윤)' : '') : null,
    dist: c.dist.map(d => d.elem + d.count + '(' + d.pct + '%)').join(' '),
    pctSum: c.dist.reduce((s, d) => s + d.pct, 0),
    dayMaster: c.dayMasterName + '(' + c.dayMasterHanja + ')',
    ten: c.list.map(x => x.ten.stem + '/' + x.ten.branch).join(' '),
    tenCount: c.tenCount,
    hidden: c.list.map(x => x.branchKo + ':' + x.hidden.map(h => h.stemKo + h.weight).join('')).join(' '),
    stages: c.list.map(x => x.branchKo + ':' + x.stage).join(' '),
    dominant: c.dominant, lacking: c.lacking, hiddenElems: c.hiddenElems,
    corrected: c.corrected, hourEdge: c.hourEdge, termEdge: c.termEdge,
    term: c.term,
    daewoon: c.daewoon ? { forward: c.daewoon.forward, startAge: c.daewoon.startAge,
      list: c.daewoon.list.slice(0, 6).map(d => d.age + '세' + d.ko), current: c.daewoon.current ? c.daewoon.current.ko : null } : null,
    engine: c.engine
  });
  const run = (label, input) => { try { out[label] = p(S.computePillars(input)); } catch (e) { out[label] = { error: e.message }; } };

  run('1995-0412-1130', { year: 1995, month: 4, day: 12, calendar: 'solar', hourIdx: 6 });
  run('1995-0412-nohour', { year: 1995, month: 4, day: 12, calendar: 'solar', hourIdx: null });
  run('1990-0515-1430', { year: 1990, month: 5, day: 15, calendar: 'solar', hourIdx: 7 });
  run('2000-0204-2100', { year: 2000, month: 2, day: 4, calendar: 'solar', hourIdx: 11 });
  run('2000-0204-2145', { year: 2000, month: 2, day: 4, calendar: 'solar', hourIdx: 11 });
  run('2024-0204-1726', { year: 2024, month: 2, day: 4, calendar: 'solar', hourIdx: 9 });
  run('2024-0204-1740', { year: 2024, month: 2, day: 4, calendar: 'solar', hourIdx: 9 });
  run('1988-0701-0010', { year: 1988, month: 7, day: 1, calendar: 'solar', hourIdx: 0 });
  run('lunar-1995-0801', { year: 1995, month: 8, day: 1, calendar: 'lunar', isLeap: false, hourIdx: 6 });
  run('lunar2017-leap5', { year: 2017, month: 5, day: 1, calendar: 'lunar', isLeap: true, hourIdx: 6 });

  out.engineExact = (() => {
    const E = S.engine;
    const q = (y, mo, d, h, mi) => {
      const r = E.calculateSaju(y, mo, d, h, mi, { applyTimeCorrection: false });
      return r.yearPillar + ' ' + r.monthPillar + ' ' + r.dayPillar + ' ' + r.hourPillar;
    };
    return {
      '2000 입춘 21:40 전(21:39)': q(2000, 2, 4, 21, 39),
      '2000 입춘 21:40 후(21:41)': q(2000, 2, 4, 21, 41),
      '2024 입춘 17:26': q(2024, 2, 4, 17, 26),
      '2024 입춘 17:27': q(2024, 2, 4, 17, 27),
      '1995-04-12 11:15': q(1995, 4, 12, 11, 15),
      '1995-04-12 10:45': q(1995, 4, 12, 10, 45),
      '1988 DST 07-01 00:10 (법정시계)': (() => { const r = E.calculateSaju(1988, 7, 1, 0, 10, { clock: 'korea-legal', applyTimeCorrection: false }); return r.yearPillar + ' ' + r.monthPillar + ' ' + r.dayPillar + ' ' + r.hourPillar; })(),
      '1960-06-01 12:00 시계알림': (() => { const r = E.calculateSaju(1960, 6, 1, 12, 0); return r.clockNotice ? r.clockNotice.message : null; })()
    };
  })();

  out.leapMonths = { 1995: S.leapMonthOf(1995), 2012: S.leapMonthOf(2012), 2017: S.leapMonthOf(2017), 2026: S.leapMonthOf(2026) };
  out.solarToLunar19970208 = S.solarToLunar(1997, 2, 8);
  out.lunarToSolar2017leap5 = S.lunarToSolar(2017, 5, 1, true);
  out.timing = (() => {
    const c = S.computePillars({ year: 1995, month: 4, day: 12, calendar: 'solar', hourIdx: 6 });
    const t = S.loveTiming(c, Date.UTC(2026, 10, 24, 2, 30));
    return t ? { start: S.fmtDate(t.startMs), end: S.fmtDate(t.endMs), term: t.term, why: t.why } : null;
  })();
  return out;
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


CHECKS = [
    ("1995-0412-1130", lambda r: r["pillars"] == "을해 경진 계유 무오", "을해 경진 계유 무오"),
    ("1995-0412-1130", lambda r: abs(r["pctSum"] - 100) <= 0.5, "오행 % 합계 100 (±0.5)"),
    ("1995-0412-1130", lambda r: r["dist"] == "목1(12.5%) 화1(12.5%) 토2(25%) 금2(25%) 수2(25%)", "토25·금25·수25·목12.5·화12.5 (동률은 같은 %)"),
    ("1995-0412-1130", lambda r: r["ten"] == "식신/겁재 정인/정관 비견/편인 정관/편재", "십신"),
    ("1990-0515-1430", lambda r: r["pillars"] == "경오 신사 경진 계미", "경오 신사 경진 계미"),
    ("2000-0204-2100", lambda r: r["pillars"].startswith("경진 무인"), "해시(22:30) = 입춘 뒤 → 경진 무인"),
    ("2000-0204-2145", lambda r: r["pillars"].startswith("경진 무인"), "해시 = 입춘 뒤"),
    ("2024-0204-1726", lambda r: r["pillars"].startswith("갑진 병인"), "유시(18:30) = 입춘 뒤 → 갑진 병인"),
    ("2024-0204-1740", lambda r: r["pillars"].startswith("갑진 병인"), "유시 = 입춘 뒤"),
    ("lunar-1995-0801", lambda r: r["solar"] == "1995-8-26", "음력 1995-08-01 = 양력 08-26 (추석 9/9 역산)"),
    ("lunar2017-leap5", lambda r: r["solar"] == "2017-6-24", "음력 2017 윤5-01 = 양력 06-24"),
]


def main():
    httpd = serve(PORT)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 430, "height": 932})
        errs = []
        page.on("console", lambda m: errs.append("console " + m.type + ": " + m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
        page.goto(f"http://127.0.0.1:{PORT}/", wait_until="networkidle")
        page.evaluate("() => document.fonts.ready")
        page.wait_for_timeout(300)
        res = page.evaluate(CASES_JS)
        browser.close()
    httpd.shutdown()
    httpd.server_close()

    for k, v in res.items():
        if isinstance(v, dict) and "pillars" in v:
            print(f"\n[{k}] {v['pillars']}  ({v['hanja']})")
            print(f"   양력 {v['solar']} · 음력 {v['lunar']} · 일간 {v['dayMaster']} · 엔진 {v['engine']}")
            print(f"   오행 {v['dist']} = {v['pctSum']}%")
            print(f"   십신 {v['ten']}")
            print(f"   지장간 {v['hidden']}")
            print(f"   12운성 {v['stages']}")
            print(f"   진태양시 {v['corrected']} 시진경계 {v['hourEdge']} 절입경계 {v['termEdge']}")
            if v["daewoon"]:
                print(f"   대운 {'순행' if v['daewoon']['forward'] else '역행'} {v['daewoon']['startAge']}세부터 {v['daewoon']['list']} (현재 {v['daewoon']['current']})")
        else:
            print(f"\n[{k}] {json.dumps(v, ensure_ascii=False)}")

    problems = []
    for label, fn, desc in CHECKS:
        r = res.get(label) or {}
        try:
            ok = bool(fn(r))
        except Exception:
            ok = False
        print(("  OK " if ok else "  NG ") + f"{label:<18} {desc}")
        if not ok:
            problems.append(f"{label}: {desc} → {r.get('pillars')} / {r.get('dist')} / {r.get('solar')}")
    for label in ("1995-0412-1130", "1995-0412-nohour", "lunar-1995-0801"):
        s = (res.get(label) or {}).get("pctSum")
        if s is None or abs(s - 100) > 0.5:
            problems.append(f"{label}: 오행 % 합계가 100에서 벗어남 ({s})")

    exact = res.get("engineExact") or {}
    exact_expect = {
        "2000 입춘 21:40 전(21:39)": "기묘 정축 임진 신해",
        "2000 입춘 21:40 후(21:41)": "경진 무인 임진 신해",
        "2024 입춘 17:26": "계묘 을축 무술 신유",
        "2024 입춘 17:27": "갑진 병인 무술 신유",
        "1995-04-12 11:15": "을해 경진 계유 무오",
        "1995-04-12 10:45": "을해 경진 계유 정사",
    }
    print("\n[엔진 직접 호출 — 분 단위 절입·시진 경계]")
    for k, want in exact_expect.items():
        got = exact.get(k)
        ok = got == want
        print(("  OK " if ok else "  NG ") + f"{k:<26} {got}" + ("" if ok else f" (기대 {want})"))
        if not ok:
            problems.append(f"{k}: {got} (기대 {want})")
    print("  1988 서머타임 법정시계:", exact.get("1988 DST 07-01 00:10 (법정시계)"))
    print("  1960 시계알림:", exact.get("1960-06-01 12:00 시계알림"))

    if errs:
        problems.append(f"콘솔/페이지 에러 {errs}")
    print()
    if problems:
        print("문제:")
        for p_ in problems:
            print("  - " + str(p_))
        return 1
    print("OK — 기준값 전부 일치 · 오행 % 합계 100 · 콘솔 에러 없음")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
