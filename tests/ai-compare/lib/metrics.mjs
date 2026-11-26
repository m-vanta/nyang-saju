/* ==========================================================================
   lib/metrics.mjs — 실험군 출력을 같은 자로 잰다
   --------------------------------------------------------------------------
   결정적 지표
     EA-1 인용 유효율      유효 근거 / 전체 근거
     EA-2 문단 근거율      근거를 가진 문단 / 전체 문단
     CA   상충 설명률      상충 의무를 양쪽 인용 + 조건까지 설명한 비율
     HZ   환각           간지(V4)·십성(V5)·합충(V6) 위반 수
     GA   게이트 위반      금지 판정어(V7)·단정(V8)·민감(V9) 위반 수
     CR   모순률          사실과 반대되는 주장 문단 / 전체 문단
     GN   일반론률        개인 사실(analysis·period·chart) 인용이 없는 문단 / 전체 문단
     SC   스키마          8섹션 그릇 위반 수
   ========================================================================== */
import { checkSchema, flattenSections, groundingOfParagraph } from './schema.mjs';

const ELEM_KO = { 목: '나무', 화: '불', 토: '흙', 금: '쇠', 수: '물' };

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
  const hz = (rules.V4 || 0) + (rules.V5 || 0) + (rules.V6 || 0);
  const ga = (rules.V7 || 0) + (rules.V8 || 0) + (rules.V9 || 0);
  const generic = paras.filter((p) => {
    const refs = p.refs.all;
    /* 개인 사실 = 그 명식에서 계산된 analysis·period, 또는 그 명식의 판정(finding).
       chart.*(간지·오행 개수)만 인용한 문단은 '기본표 수준'으로 보고 일반론 쪽에 둔다. */
    return !refs.some((r) => r.indexOf('analysis.') === 0 || r.indexOf('period.') === 0 || r.indexOf('finding.') === 0 || ctx.ids.has(r));
  }).length;

  /* 상충 의무 충족 */
  const cited = new Set(all);
  const obs = (validation.obligations || []).filter((o) => o.reachable);
  let caHit = 0;
  obs.forEach((ob) => {
    if (!ob.requires.every((r) => cited.has(r))) return;
    const ps = paras.filter((p) => p.refs.all.some((r) => ob.requires.indexOf(r) >= 0));
    if (ps.some((p) => ob.markers.some((k) => p.text.indexOf(k) >= 0))) caHit += 1;
  });

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
  const withCa = rows.filter((r) => r.metrics.ca !== null);
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
    kb: avg(rows, (r) => r.metrics.kb || 0),
    judge: avg(rows, (r) => r.metrics.judge),
    violations: rows.reduce((s, r) => s + r.metrics.violations, 0),
    warnings: rows.reduce((s, r) => s + r.metrics.warnings, 0),
    sectionsOk: avg(rows, (r) => r.metrics.sectionsOk),
    sectionsUnavailable: avg(rows, (r) => r.metrics.sectionsUnavailable),
    attempts: rows.reduce((s, r) => s + (r.attempts || 0), 0),
    failed: rows.filter((r) => r.ok === false).length
  };
}
