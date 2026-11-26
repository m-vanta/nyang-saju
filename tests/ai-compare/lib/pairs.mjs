/* ==========================================================================
   lib/pairs.mjs — 전체 실험(full)이 반드시 포함해야 하는 비교쌍 (리뷰 P1-2)
   --------------------------------------------------------------------------
   실험의 질문은 '입력이 달라지면 해석이 어떻게 달라지는가'다. 그 변화를 읽으려면
   **같은 것과 다른 것을 통제한 쌍**이 전체 세트에 있어야 한다.

     CP1  QA01·QA02·QA03  같은 출생일, 출생시간만 다름(시주 있음/미상/다른 시)
     CP2  QA07·QA08       같은 명식이 나오는 음력·양력 입력
     CP3  QA07·QA12       일간은 같고 전체 명식은 다름

   full 모드에서 이 쌍이 빠지면 run.mjs 가 실패한다(조용히 빠지지 않게).
   ========================================================================== */

export const COMPARISON_PAIRS = [
  {
    id: 'CP1',
    fixtures: ['QA01', 'QA02', 'QA03'],
    axis: '동일 출생일 · 출생시간 차이(시주 유무 포함)',
    question: '같은 날 태어났고 시주만 다를 때, 시주가 있는 해석과 없는 해석이 무엇을 달리 말하는가',
    checks: ['sameBirthDate', 'hourVariation']
  },
  {
    id: 'CP2',
    fixtures: ['QA07', 'QA08'],
    axis: '동일 명식의 음력·양력 입력',
    question: '입력 달력 표기만 다르고 명식이 같을 때, 같은 문서가 나오는가(엔진·해석의 입력 둔감성)',
    checks: ['sameChart']
  },
  {
    id: 'CP3',
    fixtures: ['QA07', 'QA12'],
    axis: '동일 일간, 다른 전체 명식',
    question: '일간이 같아도 나머지 일곱 글자가 다르면 해석이 일간 일반론으로 흐르지 않는가',
    checks: ['sameDayMaster', 'differentChart']
  }
];

export function pairFixtureIds() {
  const ids = [];
  COMPARISON_PAIRS.forEach((p) => p.fixtures.forEach((f) => { if (ids.indexOf(f) < 0) ids.push(f); }));
  return ids;
}

/** 전체 실험 세트에 비교쌍이 다 있는지 — 빠진 픽스처 id 목록 */
export function missingPairs(fixtureIds) {
  const have = new Set(fixtureIds || []);
  const missing = [];
  COMPARISON_PAIRS.forEach((p) => p.fixtures.forEach((f) => {
    if (!have.has(f)) missing.push(p.id + ':' + f);
  }));
  return missing;
}

function chartKey(ctx) {
  return ['year', 'month', 'day', 'hour']
    .map((k) => (ctx.chart.pillars[k] ? ctx.chart.pillars[k].hanja : '—'))
    .join(' ');
}

/**
 * 비교쌍 실제 확인 — 명식·입력에서 계산한다(문서에 적힌 말을 믿지 않는다).
 * @param {Map<string, object>} ctxs 픽스처 id → buildContext 결과
 */
export function pairChecks(ctxs) {
  return COMPARISON_PAIRS.map((pair) => {
    const present = pair.fixtures.every((f) => ctxs.has(f));
    const rows = pair.fixtures.map((f) => {
      const c = ctxs.get(f);
      if (!c) return { id: f, missing: true };
      return {
        id: f,
        calendar: (c.fixture.birth && c.fixture.birth.calendar) || 'solar',
        hourKnown: !c.chart.flags.hourUnknown,
        birth: c.fixture.birth ? [c.fixture.birth.year, c.fixture.birth.month, c.fixture.birth.day].join('-') : null,
        chart: chartKey(c),
        dayMaster: c.chart.dayMasterHanja,
        pillarsKnown: ['year', 'month', 'day', 'hour'].filter((k) => c.chart.pillars[k]).length
      };
    });
    const checks = {};
    if (present) {
      const list = pair.fixtures.map((f) => ctxs.get(f));
      if (pair.checks.indexOf('sameBirthDate') >= 0) {
        const keys = list.map((c) => [c.fixture.birth.year, c.fixture.birth.month, c.fixture.birth.day].join('-'));
        checks.sameBirthDate = new Set(keys).size === 1;
      }
      if (pair.checks.indexOf('hourVariation') >= 0) {
        const hours = list.map((c) => (c.chart.flags.hourUnknown ? 'none' : c.chart.pillars.hour.hanja));
        checks.hourVariation = new Set(hours).size > 1;
      }
      if (pair.checks.indexOf('sameChart') >= 0) checks.sameChart = new Set(list.map(chartKey)).size === 1;
      if (pair.checks.indexOf('sameDayMaster') >= 0) checks.sameDayMaster = new Set(list.map((c) => c.chart.dayMasterHanja)).size === 1;
      if (pair.checks.indexOf('differentChart') >= 0) checks.differentChart = new Set(list.map(chartKey)).size > 1;
    }
    return {
      id: pair.id, axis: pair.axis, question: pair.question, fixtures: pair.fixtures,
      rows, checks, present, ok: present && Object.keys(checks).every((k) => checks[k])
    };
  });
}
