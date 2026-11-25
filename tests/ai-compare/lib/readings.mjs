/* ==========================================================================
   tests/ai-compare/lib/readings.mjs — 픽스처 1건의 계산 문맥
   --------------------------------------------------------------------------
   명식 → analysisData(사실) → Finding(판정) → 규칙 문장. AI 엔진도 이 문맥만 받는다.
   ========================================================================== */

export const ASOF = '2026-11-25T10:00:00+09:00';

export function chartOf(E, birth) {
  return E.D.chart({
    year: birth.year, month: birth.month, day: birth.day,
    calendar: birth.calendar || 'solar', isLeap: !!birth.isLeap,
    hourIdx: birth.hourIdx == null ? null : birth.hourIdx,
    ziSide: birth.ziSide || 'early', gender: birth.gender || '여성'
  });
}

/* 인연 궤도 최소 사실 — v2.4 범위에서는 개인 사주 Finding만 정식이고,
   궤도 Finding 전환은 다음 판본이다. 여기서는 비교 픽스처 C8에 필요한
   '일주뿐' 제한과 일간 관계만 사실로 만든다. */
function orbitFacts(E, mine, them) {
  const STEM_ELEM = E.T.STEM_ELEM, HANJA = E.T.STEMS_HANJA;
  const meStem = mine.dayMaster, youStem = them.dayMaster;
  const meE = STEM_ELEM[meStem], youE = STEM_ELEM[youStem];
  let relation;
  if (meE === youE) relation = 'same';
  else if (E.T.ELEM_MAKES[youE] === meE) relation = 'gwiin';
  else if (E.T.ELEM_KILLS[youE] === meE) relation = 'drain';
  else if (E.T.ELEM_KILLS[meE] === youE) relation = 'press';
  else relation = 'give';

  const f = [{
    id: 'ORBIT.DAYREL.' + relation, ruleId: 'ORB-01', domain: 'orbit', scope: 'day-pillar',
    claim: { subject: '일간 오행 관계', value: relation },
    display: { short: '일간 관계 ' + relation, long: '상대 일간 ' + HANJA[youStem] + '(' + youE + ')과 내 일간 ' + HANJA[meStem] + '(' + meE + ')의 관계는 ' + relation + '이에요.' },
    evidence: [
      { side: 'me', pillar: 'day', slot: 'stem', char: HANJA[meStem], elem: meE },
      { side: 'them', pillar: 'day', slot: 'stem', char: HANJA[youStem], elem: youE }
    ],
    polarity: 'neutral'
  }];
  if (them.codeOnly) {
    f.push({
      id: 'ORBIT.LIMIT.DAY_ONLY', ruleId: 'ORB-09', domain: 'orbit', scope: 'day-pillar',
      claim: { subject: '상대 데이터', predicate: '일주만', value: true },
      display: { short: '일주 두 글자만', long: '상대는 일주 두 글자만 있어요. 월지·연지·시주로는 판정하지 않아요.' },
      evidence: [], polarity: 'neutral'
    });
  }
  return f;
}

export function buildContext(E, fixture) {
  const chart = chartOf(E, fixture.birth);
  const period = E.P.period(chart, ASOF);
  const analysis = E.A.build(chart);
  const findings = []
    .concat(E.R.core(chart))
    .concat(E.R.period(period))
    .concat(E.R.analysis(analysis));
  const name = '민지';
  const free = E.RD.buildFree(chart, name);
  const themes = E.RD.buildThemes(chart, period, name, fixture.birth.focus || 'love');
  const paidTraits = E.RD.buildPaidTraits(chart, name);
  const patterns = E.RD.buildPatterns(chart, period, name);

  let orbit = null;
  if (fixture.orbitThem) {
    const them = { dayMaster: fixture.orbitThem.ds, pillars: { day: { branch: fixture.orbitThem.db } }, codeOnly: true };
    const compat = E.P.compatibility(chart, them);
    const of = orbitFacts(E, chart, them);
    orbit = { compat, findings: of, them };
    of.forEach((f) => findings.push(f));
  }

  const seen = new Set();
  const unique = findings.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));

  return {
    fixture, chart, period, analysis, findings: unique,
    names: name, free, themes, paidTraits, patterns, orbit,
    ids: new Set(unique.map((f) => f.id))
  };
}
