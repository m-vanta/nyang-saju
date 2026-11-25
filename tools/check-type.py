#!/usr/bin/env python3
"""냥도사 타이포그래피 검사.

headless Chromium(430×932·DPR2)에서 확인한다.

1. Paperlogy 웹폰트가 실제로 로드됐는가 (`document.fonts.check`)
2. 페이지 안 모든 가시 텍스트의 computed font-size 가 12px 이상인가
3. 본문(유료 운 풀이 문단)이 16px / 행간 1.7 이상인가
4. 한자를 뺀 텍스트는 Paperlogy, 한자는 Song Myung(명조)으로 그려지는가
5. 문체 규칙 — 상세 해설에 기계적 `~냥` 0건, `당신` 0건, 단정 표현(무조건·반드시·틀림없이) 0건

    python3 tools/check-type.py
"""
import http.server
import os
import socketserver
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8793
MIN_PX = 12.0

COLLECT_JS = r"""
() => {
  const MIN = 12;
  const HANJA = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
  const small = [], paperless = [], hanjaBad = [];
  let checked = 0;

  function directText(el) {
    let out = '';
    for (const n of el.childNodes) if (n.nodeType === 3) out += n.textContent;
    return out.replace(/\s+/g, ' ').trim();
  }
  function path(el) {
    const id = el.id ? '#' + el.id : '';
    const cls = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    return el.tagName.toLowerCase() + id + cls;
  }
  function visible(el) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1;
  }

  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg') || ['SCRIPT', 'STYLE', 'HEAD'].includes(el.tagName)) continue;
    const text = directText(el);
    const ph = el.matches('input, textarea') ? (el.placeholder || '') : '';
    if (!text && !ph) continue;
    if (!visible(el)) continue;
    checked++;
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    if (size < MIN) small.push({ el: path(el), text: text.slice(0, 24), size: size });

    const fam = cs.fontFamily;
    const body = text || ph;
    const nonHanja = body.replace(new RegExp(HANJA, 'g'), '').replace(/[\s·()]/g, '');
    if (nonHanja && !/Paperlogy/.test(fam)) {
      paperless.push({ el: path(el), text: body.slice(0, 24), font: fam.split(',')[0] });
    }
    const hanjaOnly = body.replace(/[\s·()]/g, '');
    if (hanjaOnly && !nonHanja && !/Song Myung/.test(fam)) {
      hanjaBad.push({ el: path(el), text: body.slice(0, 24), font: fam.split(',')[0] });
    }
  }

  const body16 = [...document.querySelectorAll('#result-sections .entry__text')];
  const bodyCheck = body16.map(p => ({
    size: parseFloat(getComputedStyle(p).fontSize),
    lh: parseFloat(getComputedStyle(p).lineHeight) / parseFloat(getComputedStyle(p).fontSize)
  }));

  return {
    checked, small, paperless, hanjaBad,
    bodyCount: bodyCheck.length,
    bodySizes: [...new Set(bodyCheck.map(b => b.size))],
    bodyLh: bodyCheck.length ? Math.min(...bodyCheck.map(b => b.lh)) : null,
    fonts: {
      'Paperlogy 400': document.fonts.check('400 16px "Paperlogy"'),
      'Paperlogy 700': document.fonts.check('700 16px "Paperlogy"'),
      'Paperlogy 800': document.fonts.check('800 50px "Paperlogy"'),
      'Song Myung': document.fonts.check('700 24px "Song Myung"', '木'),
    },
    bodyFont: getComputedStyle(document.body).fontFamily.split(',')[0],
    bodySize: getComputedStyle(document.body).fontSize
  };
}
"""


COPY_JS = r"""
() => {
  const C = window.NyangCopy;
  const PC = window.NyangPaidCopy;
  const detailFields = ['selfSee','selfBlind','firstMet','closer','love','keep','avoidEnergy','gift','money','timing'];
  const nyang = [], banned = [], formal = [];
  const BAN = ['무조건', '반드시', '틀림없', '예외 없이', '수밖에', '이미 늦', '십상', '절대'];
  const NYANG = /(다냥|라냥|지냥|거든냥|보라냥|냥\.)/;

  PC.MASTER.forEach((m, i) => {
    detailFields.forEach(f => {
      const t = String(m[f] || '');
      if (NYANG.test(t)) nyang.push(`MASTER[${i}].${f}`);
      BAN.forEach(w => { if (t.includes(w)) banned.push(`MASTER[${i}].${f}:${w}`); });
      if (/습니다\.|하세요\./.test(t)) formal.push(`MASTER[${i}].${f}`);
    });
    Object.keys(m.focus || {}).forEach(k => {
      const t = String(m.focus[k] || '');
      if (NYANG.test(t)) nyang.push(`MASTER[${i}].focus.${k}`);
      BAN.forEach(w => { if (t.includes(w)) banned.push(`MASTER[${i}].focus.${k}:${w}`); });
      if (/습니다\.|하세요\./.test(t)) formal.push(`MASTER[${i}].focus.${k}`);
    });
  });

  Object.keys(PC.PATTERN.flow).forEach(k => {
    const t = PC.PATTERN.flow[k].text + ' ' + PC.PATTERN.flow[k].cut;
    BAN.forEach(w => { if (t.includes(w)) banned.push('PATTERN.flow.' + k + ':' + w); });
  });

  // 상세 해설·안내에 기계적 ~냥이 섮이지 않는지 (팩폭·부적만 냥도사 목소리)
  const walk = (obj, path) => {
    if (typeof obj === 'string') {
      if (NYANG.test(obj)) nyang.push(path);
      BAN.forEach(w => { if (obj.includes(w)) banned.push(path + ':' + w); });
      if (/습니다|하세요|하십시오/.test(obj)) formal.push(path);
      return;
    }
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach(k => {
      if (k === 'MASTER' || k === 'PALJA' || k === 'ui') return;
      walk(obj[k], path ? path + '.' + k : k);
    });
  };
  walk({ PATTERN: { god: PC.PATTERN.god, pillar: PC.PATTERN.pillar }, THEME: PC.THEME,
         ORBIT_TYPE: C.ORBIT_TYPE, FREE: C.FREE, orbit: C.orbit, VALUE: C.VALUE, PAID: C.PAID }, '');

  ['bomb', 'avoid', 'talisman'].forEach(f => {
    PC.MASTER.forEach((m, i) => {
      const t = String(m[f] || '');
      BAN.forEach(w => { if (t.includes(w)) banned.push(`MASTER[${i}].${f}:${w}`); });
      if (/습니다|하세요/.test(t)) formal.push(`MASTER[${i}].${f}`);
    });
  });

  const all = JSON.stringify(C);
  const badJosa = (all.match(/\{(god|strongKo|lackKo)\}이/g) || []);
  return {
    nyang, banned, formal,
    you: (all.match(/당신/g) || []).length,
    masterCount: PC.MASTER.length,
    patternAxes: Object.keys(PC.PATTERN),
    bannedInAll: BAN.filter(w => all.includes(w)),
    badJosa,
    free: { crumb: C.FREE.crumb, orbit: C.FREE.orbitSub, share: C.FREE.shareSub }
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


def report(label, res, problems):
    ok = True
    if res["small"]:
        ok = False
        problems.append(f'{label}: 12px 미만 {len(res["small"])}건 {res["small"][:5]}')
    if res["paperless"]:
        ok = False
        problems.append(f'{label}: Paperlogy 아닌 비한자 텍스트 {res["paperless"][:5]}')
    if res["hanjaBad"]:
        ok = False
        problems.append(f'{label}: 명조가 아닌 한자 {res["hanjaBad"][:5]}')
    print(f'{"OK " if ok else "NG "}{label:<10} 텍스트 {res["checked"]:>3}개 · 12px미만 {len(res["small"])} · '
          f'Paperlogy위반 {len(res["paperless"])} · 한자명조위반 {len(res["hanjaBad"])}')
    return ok


def main():
    httpd = serve(PORT)
    problems = []
    fonts = None
    body = None
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 430, "height": 932}, device_scale_factor=2)
        errs = []
        page.on("console", lambda m: errs.append("console " + m.type + ": " + m.text)
                if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
        page.goto(f"http://127.0.0.1:{PORT}/", wait_until="networkidle")
        page.evaluate("() => document.fonts.ready")
        page.wait_for_timeout(600)

        report("landing", page.evaluate(COLLECT_JS), problems)

        page.fill("#name", "민지")
        page.select_option("#year", "1995")
        page.select_option("#month", "4")
        page.select_option("#day", "12")
        page.select_option("#hour", "6")
        page.click('#status-grid .status[data-value="love"]')
        page.click('#form button[type="submit"]')
        page.wait_for_selector("#screen-free.is-active", timeout=8000)
        page.wait_for_timeout(400)
        report("free", page.evaluate(COLLECT_JS), problems)

        page.evaluate("() => { const d = document.getElementById('fold-chart'); if (d) d.open = true; }")
        page.wait_for_timeout(260)
        report("free-chart", page.evaluate(COLLECT_JS), problems)
        page.evaluate("() => { const d = document.getElementById('fold-chart'); if (d) d.open = false; }")

        page.evaluate("() => document.getElementById('app').scrollTo(0,0)")
        page.click("#btn-unlock")
        page.wait_for_selector("#pay-modal.is-open", timeout=4000)
        page.wait_for_timeout(250)
        report("pay-modal", page.evaluate(COLLECT_JS), problems)

        page.click("#btn-pay")
        page.wait_for_timeout(700)
        report("loading", page.evaluate(COLLECT_JS), problems)

        page.wait_for_selector("#screen-result.is-active", timeout=12000)
        page.wait_for_timeout(3200)
        res = page.evaluate(COLLECT_JS)
        report("result", res, problems)
        fonts, body = res["fonts"], (res["bodyFont"], res["bodySize"])
        if res["bodySizes"] != [16]:
            problems.append(f'result: 본문 폰트 크기 {res["bodySizes"]} (16px 이어야 함)')
        if res["bodyLh"] is not None and res["bodyLh"] < 1.7:
            problems.append(f'result: 본문 행간 {res["bodyLh"]:.2f} (1.7 이상이어야 함)')
        if not res["bodyCount"]:
            problems.append("result: 본문 문단을 찾지 못했습니다")

        # 결과 화면을 끝까지 내려 푸터·공유 영역까지 검사
        page.evaluate("() => { const a = document.getElementById('app'); a.scrollTo(0, a.scrollHeight); }")
        page.wait_for_timeout(300)
        report("result-bottom", page.evaluate(COLLECT_JS), problems)

        import io as _io
        palja_src = _io.open(os.path.join(ROOT, 'palja.js'), encoding='utf-8').read()
        palja_formal = [w for w in ('습니다', '하세요', '당신') if w in palja_src]
        if palja_formal:
            problems.append(f'palja.js 격식체/2인칭 {palja_formal}')
            print("NG palja.js 격식체", palja_formal)
        else:
            print("OK palja.js    해설 해요체 (격식체·당신 0)")

        copy = page.evaluate(COPY_JS)
        okcopy = (not copy["nyang"] and not copy["banned"] and not copy["formal"]
                  and copy["you"] == 0 and copy["bannedInAll"] == [] and copy["badJosa"] == []
                  and copy["masterCount"] == 10)
        print(f'{"OK " if okcopy else "NG "}copy        MASTER {copy["masterCount"]}종 · 기계적~냥 {len(copy["nyang"])} · '
              f'단정어 {len(copy["banned"])} · 당신 {copy["you"]} · 격식체 {len(copy["formal"])}')
        if copy["nyang"]:
            problems.append(f'copy: 상세 해설에 기계적 ~냥 {copy["nyang"][:5]}')
        if copy["banned"] or copy["bannedInAll"]:
            problems.append(f'copy: 단정 표현 {copy["banned"][:5]} {copy["bannedInAll"]}')
        if copy["formal"]:
            problems.append(f'copy: 상세 해설에 격식체 {copy["formal"][:5]}')
        if copy["you"]:
            problems.append(f'copy: 당신 {copy["you"]}건')
        if copy["badJosa"]:
            problems.append(f'copy: 조사 고정 템플릿 {copy["badJosa"][:5]}')
        if copy["patternAxes"] != ["god", "pillar", "flow"]:
            problems.append(f'copy: 반복 패턴 축 {copy["patternAxes"]}')

        browser.close()
    httpd.shutdown()
    httpd.server_close()

    print("\n폰트 로드:", {k: bool(v) for k, v in (fonts or {}).items()})
    print("body:", body)
    print("본문 16px · 행간 1.7 이상:", not any("본문" in p for p in problems))
    print("콘솔/페이지 에러:", errs if errs else "none")
    if any(not v for v in (fonts or {}).values()):
        problems.append(f"폰트가 로드되지 않았습니다: {fonts}")
    if errs:
        problems.append(f"콘솔/페이지 에러 {errs}")

    print()
    if problems:
        print("문제:")
        for x in problems:
            print("  - " + str(x))
        return 1
    print("OK — Paperlogy 로드 · 12px 미만 0건 · 본문 16px/1.7 · 한자만 명조")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
