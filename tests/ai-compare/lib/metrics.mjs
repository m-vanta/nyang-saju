/* ==========================================================================
   lib/metrics.mjs — 실험군 출력을 같은 자로 잰다
   --------------------------------------------------------------------------
   결정적 지표
     EA-1 인용 유효율      유효 근거 / 전체 근거
     EA-2 문단 근거율      근거를 가진 문단 / 전체 문단
     CA   상충 설명률      상충 의무를 양쪽 인용 + 조건까지 설명한 비율
     HZ   환각           간지(V4)·십성(V5·V18)·합충(V6) 위반 수
     GA   게이트 위반      금지 판정어(V7)·단정(V8)·민감(V9) 위반 수
     CR   모순률          사실과 반대되는 주장 문단 / 전체 문단
     GN   일반론률        개인 사실 인용이 없는 문단 / 전체 문단
     SC   스키마          8섹션 그릇 위반 수

   개인화 기준 (리뷰 P0-1-3)
     명식 사실(chart.*)도 그 사람에게서만 나오는 개인 사실이다. '기본표 수준'이라는
     이유로 chart.* 만 인용한 문단을 일반론으로 몰면, chart.* 만 받는 B 가 구조적으로
     불리해진다. 그래서 GN·judge 의 개인화 판정은 analysis·period·finding·chart 를
     모두 개인 근거로 센다. 예전 정의(chart.* 만 쓴 문단을 일반론으로 봄)는
     gnChartOnly 로 따로 남겨 참고값으로만 보고한다 — 게이트에 쓰지 않는다.
   ========================================================================== */
import { checkSchema, flattenSections, groundingOfParagraph } from './schema.mjs';

const ELEM_KO = { 목: '나무', 화: '불', 토: '흙', 금: '쇠', 수: '물' };

/* 개인 사실 근거인가 — 이 사람의 명식·기간·판정에서 나온 사실 */
export function isPersonalRef(ref, ctx) {
  if (!ref) return false;
  if (/^(analysis\.|period\.|finding\.|chart\.)/.test(ref)) return true;
  return !!(ctx && ctx.ids && ctx.ids.has(ref));
}

export function paragraphsOf(doc) {
  return (doc.sections || []).flatMap((s) => (s.paragraphs || []).map((p, i) => ({ section: s.id, index: i, text: String(p.text || ''), refs: groundingOfParagraph(p), raw: p })));
}

/* 사실과 반대되는 주장만 모순으로 센다(해석 취향은 모순이 아니다). */
export function contradictions(doc, ctx) {
  const out = [];
  const a = ctx.analysis;
  paragraphsOf(doc).forEach((p) => {
    const t = p.text;
    const sijuClaim = /시주(?!를\s*빼고)/.test(t) && !/(시주|태어난 시간)[^.!?]{0,12}(빼고|모르|미상|없)/.test(t);
    if (a.flags.hourUnknown && sijuClaim) out.push({ where: p.section + '#' + p.index, detail: '시주 미상인데 시주를 말함' });
    Object.keys(a.elementFacts.surface).forEach((e) => {
      const ko = ELEM_KO[e];
      if (a.elementFacts.surface[e] === 0 && new RegExp(ko + '\\s*기운(이|은)\\s*(많|강|넘)').test(t)) {
        out.push({ where: p.section + '#' + p.index, detail: ko + ' 0개인데 많다고 함' });
      }
      if (a.elementFacts.surface[e] > 0 && new RegExp(ko + '\\s*기운(이|은)\\s*(전혀|하나도)\\s*없').test(t)) {
        out.push({ where: p.section + '#' + p.index, detail: ko + ' ' + a.elementFacts.surface[e] + '개인데 없다고 함' });
      }
    });
  });
  return out;
}

export function measure(doc, ctx, validation, pool, judgeScore) {
  const paras = paragraphsOf(doc);
  const all = paras.flatMap((p) => p.refs.all);
  const valid = all.filter((r) => pool.has(r)).length;
  const withRef = paras.filter((p) => p.refs.all.length && p.refs.all.every((r) => pool.has(r))).length;
  const contra = contradictions(doc, ctx);
  const rules = validation.violations.reduce((o, x) => { o[x.rule] = (o[x.rule] || 0) + 1; return o; }, {});
  const hz = (rules.V4 || 0) + (rules.V5 || 0) + (rules.V6 || 0) + (rules.V18 || 0);
  const ga = (rules.V7 || 0) + (rules.V8 || 0) + (rules.V9 || 0);

  /* GN — 개인 사실(chart·analysis·period·finding)을 하나도 인용하지 않은 문단 */
  const generic = paras.filter((p) => !p.refs.all.some((r) => isPersonalRef(r, ctx))).length;

  /* gnChartOnly — 예전 정의(chart.* 만 쓴 문단도 일반론). 참고값일 뿐 게이트에 쓰지 않는다. */
  const chartOnly = paras.filter((p) => {
    const refs = p.refs.all;
    if (!refs.length) return false;
    const hasDeeper = refs.some((r) => /^(analysis\.|period\.|finding\.)/.test(r) || ctx.ids.has(r));
    const hasChart = refs.some((r) => r.indexOf('chart.') === 0);
    return hasChart && !hasDeeper;
  }).length;

  /* 상충 의무 충족 */
  const cited = new Set(all);
  const obs = (validation.obligations || []).filter((o) => o.reachable);
  let caHit = 0;
  obs.forEach((ob) => {
    if (!ob.requires.every((r) => cited.has(r))) return;
    /* 한 문단 안에서 양쪽을 함께 인용하고, 그 문단이 조건을 말해야 충족 */
    const both = paras.filter((p) => ob.requires.every((r) => p.refs.all.indexOf(r) >= 0));
    if (both.some((p) => ob.markers.some((k) => p.text.indexOf(k) >= 0))) caHit += 1;
  });

  const checks = validation.checks || null;
  return {
    paragraphs: paras.length,
    sectionsOk: flattenSections(doc).filter((s) => s.status === 'ok').length,
    sectionsUnavailable: flattenSections(doc).filter((s) => s.status === 'unavailable').length,
    ea1: all.length ? valid / all.length : 0,
    ea2: paras.length ? withRef / paras.length : 0,
    ca: obs.length ? caHit / obs.length : null,
    caHit,
    caTotal: obs.length,
    caUnreachable: (validation.obligations || []).filter((o) => !o.reachable).length,
    hz,
    ga,
    sc: (validation.violations.filter((x) => x.rule === 'V1').length) + checkSchema(doc).length,
    cr: paras.length ? contra.length / paras.length : 0,
    gn: paras.length ? generic / paras.length : 0,
    gnChartOnly: paras.length ? chartOnly / paras.length : 0,
    /* 구조·참조 검증과 내용 검증을 나눠 센다(리뷰 P0-2-1) */
    referenceViolations: checks ? checks.structural.violations.length : null,
    contentViolations: checks ? checks.content.violations.length : null,
    kb: paras.length ? paras.reduce((s, p) => s + (p.raw.kbRefs || []).length, 0) / paras.length : 0,
    judge: judgeScore,
    violations: validation.violations.length,
    warnings: validation.warnings.length,
    contradictions: contra
  };
}

function avg(list, fn) {
  if (!list.length) return 0;
  return list.reduce((s, x) => s + fn(x), 0) / list.length;
}

export function aggregate(rows) {
  const withCa = rows.filter((r) => r.metrics && r.metrics.ca !== null);
  const caHit = withCa.reduce((s, r) => s + r.metrics.caHit, 0);
  const caTotal = withCa.reduce((s, r) => s + r.metrics.caTotal, 0);
  return {
    items: rows.length,
    ea1: avg(rows, (r) => r.metrics.ea1),
    ea2: avg(rows, (r) => r.metrics.ea2),
    ca: caTotal ? caHit / caTotal : null,
    caHit, caTotal,
    hz: rows.reduce((s, r) => s + r.metrics.hz, 0),
    ga: rows.reduce((s, r) => s + r.metrics.ga, 0),
    sc: rows.reduce((s, r) => s + r.metrics.sc, 0),
    cr: avg(rows, (r) => r.metrics.cr),
    gn: avg(rows, (r) => r.metrics.gn),
    gnChartOnly: avg(rows, (r) => r.metrics.gnChartOnly),
    kb: avg(rows, (r) => r.metrics.kb || 0),
    judge: avg(rows, (r) => r.metrics.judge),
    violations: rows.reduce((s, r) => s + r.metrics.violations, 0),
    warnings: rows.reduce((s, r) => s + r.metrics.warnings, 0),
    referenceViolations: rows.reduce((s, r) => s + (r.metrics.referenceViolations || 0), 0),
    contentViolations: rows.reduce((s, r) => s + (r.metrics.contentViolations || 0), 0),
    sectionsOk: avg(rows, (r) => r.metrics.sectionsOk),
    sectionsUnavailable: avg(rows, (r) => r.metrics.sectionsUnavailable),
    attempts: rows.reduce((s, r) => s + (r.attempts || 0), 0),
    failed: rows.filter((r) => r.ok === false).length,
    skipped: rows.filter((r) => r.skipped).length
  };
}
