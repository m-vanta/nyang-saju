/* ==========================================================================
   lib/metrics.mjs — 두 엔진의 출력을 같은 자로 잰다
   --------------------------------------------------------------------------
   EA-1 인용 유효율 · EA-2 문단 근거율 · CA 상충 설명률 · CR 모순률 ·
   HR 창작률 · TC 톤 일관성 · SF 안전 · 결정성 · 비용
   ========================================================================== */

const ELEM_KO = { 목: '나무', 화: '불', 토: '흙', 금: '쇠', 수: '물' };

/* 픽스처별로 '이 근거를 반드시 인용해야 상충을 설명한 것'인지 계산한다.
   conflicts.json 은 설계표이고, 실제 id 는 findings 에서 확인해 붙인다. */
export function conflictRequirement(ctx) {
  const a = ctx.analysis;
  const exists = (id) => ctx.ids.has(id);
  const pick = (arr) => arr.filter(exists);

  switch (ctx.fixture.conflict) {
    case 'C1':
      return pick(['AN.DEUKRYEONG.SEASON.' + a.deukryeong.bySeasonRank.rank, 'AN.ROOTS.COUNT.0']);
    case 'C2': {
      const bonggi = a.geokguk.candidates.filter((c) => c.id.indexOf('GEOK.BONGGI.') === 0)[0];
      const tutul = a.geokguk.candidates.filter((c) => c.id.indexOf('GEOK.TUTUL.') === 0 && c.transparent && c.god !== (bonggi && bonggi.god))[0];
      return pick([bonggi ? 'AN.' + bonggi.id : null, tutul ? 'AN.' + tutul.id : null].filter(Boolean));
    }
    case 'C3': {
      const bonggi = a.geokguk.candidates.filter((c) => c.id.indexOf('GEOK.BONGGI.') === 0)[0];
      const tutul = a.geokguk.candidates.filter((c) => c.id.indexOf('GEOK.TUTUL.') === 0 && c.transparent)[0];
      const hoejuk = a.geokguk.candidates.filter((c) => c.id.indexOf('GEOK.HOEJUK.') === 0)[0];
      return pick([bonggi ? 'AN.' + bonggi.id : null, tutul ? 'AN.' + tutul.id : null, hoejuk ? 'AN.' + hoejuk.id : null].filter(Boolean));
    }
    case 'C4': {
      const hap = ctx.findings.filter((f) => /^(HAP\.|SAMHAP\.|AN\.HAPCHONG\.CONFLICT)/.test(f.id))[0];
      const chung = ctx.findings.filter((f) => /^CHUNG\./.test(f.id))[0];
      return pick([hap && hap.id, chung && chung.id].filter(Boolean));
    }
    case 'C6':
      return pick(['FLAG.TERM_EDGE']);
    case 'C7': {
      const e = a.elementFacts.lacking.filter((x) => a.elementFacts.hiddenOnly.indexOf(x) >= 0)[0];
      return e ? pick(['ELEM.LACK.' + e, 'ELEM.HIDDEN.' + a.elementFacts.hiddenOnly.join('')]) : [];
    }
    default:
      return [];
  }
}

/* 사실과 반대되는 주장만 모순으로 센다(해석 취향은 모순이 아니다). */
export function contradictions(doc, ctx) {
  const out = [];
  const a = ctx.analysis;
  (doc.sections || []).forEach((s) => (s.paragraphs || []).forEach((p, i) => {
    const t = String(p.text || '');
    const sijuClaim = /시주(?!를\s*빼고)/.test(t) && !/(시주|태어난 시간)[^.!?]{0,12}(빼고|모르|미상|없)/.test(t);
    if (a.flags.hourUnknown && sijuClaim) out.push({ where: s.id + '#' + i, detail: '시주 미상인데 시주를 말함' });
    Object.keys(a.elementFacts.surface).forEach((e) => {
      const ko = ELEM_KO[e];
      if (a.elementFacts.surface[e] === 0 && new RegExp(ko + '\\s*기운(이|은)\\s*(많|강|넘)').test(t)) {
        out.push({ where: s.id + '#' + i, detail: ko + ' 0개인데 많다고 함' });
      }
      if (a.elementFacts.surface[e] > 0 && new RegExp(ko + '\\s*기운(이|은)\\s*(전혀|하나도)\\s*없').test(t)) {
        out.push({ where: s.id + '#' + i, detail: ko + ' ' + a.elementFacts.surface[e] + '개인데 없다고 함' });
      }
    });
    const orbitParagraph = (p.findingRefs || []).some((id) => id.indexOf('ORBIT.') === 0) || /상대|그 사람|{f}/.test(t);
    const fourPillarClaim = /(월지|연지|시주)/.test(t) && !/(월지|연지|시주|네 기둥)[^.!?]{0,16}(판정하지|말하지|보지|않|없)/.test(t);
    if (ctx.orbit && ctx.orbit.them.codeOnly && orbitParagraph && fourPillarClaim) out.push({ where: s.id + '#' + i, detail: '일주뿐인 상대의 네 기둥을 말함' });
  }));
  return out;
}

function refsOf(doc) {
  const out = [];
  (doc.sections || []).forEach((s) => (s.paragraphs || []).forEach((p) => (p.findingRefs || []).forEach((r) => out.push(r))));
  return out;
}

export function measure(doc, ctx, validation, judgeScore) {
  const allRefs = refsOf(doc);
  const valid = allRefs.filter((id) => ctx.ids.has(id)).length;
  const paras = (doc.sections || []).flatMap((s) => s.paragraphs || []);
  const withRef = paras.filter((p) => (p.findingRefs || []).length && (p.findingRefs || []).every((id) => ctx.ids.has(id))).length;
  const contra = contradictions(doc, ctx);
  const g2 = validation.violations.filter((x) => x.rule === 'G2').length;
  const g8 = validation.violations.filter((x) => x.rule === 'G8').length;
  /* TC — 실제 위반(G7 단정·G9 호칭)만 센다. G4(수위)는 결정적 단어 일치로는
     해석 문장과 구분되지 않아 경고로만 리포트한다. */
  const tone = validation.violations.filter((x) => ['G7', 'G9'].indexOf(x.rule) >= 0).length;

  return {
    paragraphs: paras.length,
    ea1: allRefs.length ? valid / allRefs.length : 0,
    ea2: paras.length ? withRef / paras.length : 0,
    cr: paras.length ? contra.length / paras.length : 0,
    hr: paras.length ? g2 / paras.length : 0,
    sf: g8,
    tc: tone,
    judge: judgeScore,
    contradictions: contra
  };
}

export function aggregate(rows, conflicts) {
  const n = rows.length || 1;
  const sum = (k) => rows.reduce((s, r) => s + r.metrics[k], 0);
  const caRows = rows.filter((r) => r.required && r.required.length);
  const caHit = caRows.filter((r) => {
    const cited = refsOf(r.doc);
    return r.required.every((id) => cited.indexOf(id) >= 0);
  }).length;
  return {
    fixtures: n,
    ea1: sum('ea1') / n,
    ea2: sum('ea2') / n,
    cr: sum('cr') / n,
    hr: sum('hr') / n,
    sf: sum('sf'),
    tc: sum('tc'),
    judge: sum('judge') / n,
    ca: caRows.length ? caHit / caRows.length : 1,
    caFixtures: caRows.length,
    caHit,
    conflicts
  };
}
