/* ==========================================================================
   lib/facts.mjs — 실험군별 '보이는 사실'과 '인용 가능한 근거'의 경계
   --------------------------------------------------------------------------
   B/C/D/E 는 받는 정보가 다르다. 그래서 인용할 수 있는 근거의 범위도 다르다.
   검증기는 이 범위(pool) 밖의 근거를 '없는 근거 인용'으로 반려한다.

     A  규칙 엔진의 판정(Finding)                → finding.* · chart.* · period.*
     B  명식 기본표만                            → chart.*
     C  + analysisData (사실)                    → chart.* · analysis.* · period.*
     D  + 구조화 지식베이스                      → C + kb.*
     E  D 의 검증자·수정자                        → D 와 같음

   analysis.* 는 잎 값만이 아니라 배열 길이도 낸다(analysis.roots.count = 0 같은
   '없음'이 인용 가능한 사실이어야 상충 설명을 채점할 수 있다).
   ========================================================================== */
import { SECTIONS } from './schema.mjs';

export const ARMS = {
  A: { key: 'A', name: 'rule', label: '규칙 기반 해석', grounding: 'findings', inputs: ['chart', 'analysis', 'findings', 'period'] },
  B: { key: 'B', name: 'chart', label: '명식만 준 AI', grounding: 'evidence', inputs: ['chart'] },
  C: { key: 'C', name: 'analysis', label: '명식+analysisData AI', grounding: 'evidence', inputs: ['chart', 'analysis', 'period'] },
  D: { key: 'D', name: 'knowledge', label: '명식+analysisData+지식베이스 AI', grounding: 'evidence', inputs: ['chart', 'analysis', 'period', 'kb'] },
  E: { key: 'E', name: 'critic', label: 'D + 검증자(Critic)·수정자', grounding: 'evidence', inputs: ['chart', 'analysis', 'period', 'kb'] }
};

export const ARM_KEYS = ['A', 'B', 'C', 'D', 'E'];

/* ---------------- B 실험군이 보는 명식 기본표 ---------------- */
export function chartFacts(ctx) {
  const c = ctx.chart;
  const pillars = {};
  ['year', 'month', 'day', 'hour'].forEach((k) => {
    const p = c.pillars[k];
    if (!p) return;
    pillars[k] = {
      ganzhi: p.hanja,
      stem: p.hanja.slice(0, 1), branch: p.hanja.slice(1),
      stemKo: p.stemKo, branchKo: p.branchKo,
      stemElem: p.stemElem, branchElem: p.branchElem,
      stemTenGod: k === 'day' ? '일간' : p.ten.stem,
      branchTenGod: p.ten.branch,
      stage: p.stage
    };
  });
  return {
    schemaVersion: 'chart-basics/1.0',
    hourKnown: !c.flags.hourUnknown,
    dayMaster: { stem: ctx.analysis.dayMaster.stem, elem: ctx.analysis.dayMaster.elem, yinYang: ctx.analysis.dayMaster.yinYang },
    pillars,
    monthCommand: {
      branch: ctx.analysis.monthCommand.branch,
      monthType: ctx.analysis.monthCommand.monthType,
      season: ctx.analysis.monthCommand.season,
      branchElem: ctx.analysis.monthCommand.branchElem
    },
    elementCounts: c.counts,
    elementShare: c.share,
    tenGodSurface: c.tenCount,
    tables: {
      hiddenStems: 'cangdun-ge/1', weight: 'product/1',
      tenGods: 'ten-gods/1', stages: 'twelve-stages-yinyang/1'
    },
    note: '값은 모두 코드가 계산한 표 읽기다. 강약·격국·용신 판정은 들어 있지 않다.'
  };
}

/* ---------------- 근거 풀 ---------------- */
function push(map, ref, kind, value) {
  if (!map.has(ref)) map.set(ref, { ref, kind, value });
}

function walkAnalysis(node, path, map) {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    node.forEach((v, i) => walkAnalysis(v, path + '[' + i + ']', map));
    return;
  }
  if (typeof node === 'object') {
    Object.keys(node).forEach((k) => walkAnalysis(node[k], path ? path + '.' + k : k, map));
    return;
  }
  push(map, 'analysis.' + path, 'analysis', node);
}

/* 배열 노드의 '길이'도 사실이다 — 0개(없음)를 인용할 수 있어야 한다. */
function pushCounts(map, node, path) {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    push(map, path + '.count', 'analysis', node.length);
    node.forEach((v, i) => pushCounts(map, v, path + '[' + i + ']'));
    return;
  }
  if (typeof node === 'object') {
    Object.keys(node).forEach((k) => pushCounts(map, node[k], path ? path + '.' + k : k));
  }
}

/**
 * @param {object} ctx buildContext 결과
 * @param {string} armKey 'A'~'E'
 * @param {object} kb 지식베이스 (D/E 만) — { entries: [{id,title}] }
 */
export function evidencePool(ctx, armKey, kb) {
  const arm = ARMS[armKey] || ARMS.C;
  const map = new Map();
  const a = ctx.analysis;
  const chart = ctx.chart;

  /* chart.* — 모든 실험군 */
  ['year', 'month', 'day', 'hour'].forEach((k) => {
    const p = chart.pillars[k];
    if (!p) return;
    push(map, 'chart.' + k + '.ganzhi', 'chart', p.hanja);
    push(map, 'chart.' + k + '.stem', 'chart', p.hanja.slice(0, 1));
    push(map, 'chart.' + k + '.branch', 'chart', p.hanja.slice(1));
    push(map, 'chart.' + k + '.stemElem', 'chart', p.stemElem);
    push(map, 'chart.' + k + '.branchElem', 'chart', p.branchElem);
    push(map, 'chart.' + k + '.stemTenGod', 'chart', p.ten.stem);
    push(map, 'chart.' + k + '.branchTenGod', 'chart', p.ten.branch);
    push(map, 'chart.' + k + '.stage', 'chart', p.stage);
  });
  ['목', '화', '토', '금', '수'].forEach((e) => {
    push(map, 'chart.element.' + e + '.count', 'chart', chart.counts[e]);
    push(map, 'chart.element.' + e + '.share', 'chart', chart.share[e]);
  });
  Object.keys(chart.tenCount).forEach((g) => {
    if (!chart.tenCount[g]) return;
    push(map, 'chart.tenGod.' + g + '.surface', 'chart', chart.tenCount[g]);
  });
  push(map, 'chart.day.stem', 'chart', a.dayMaster.stem);
  push(map, 'chart.hour.known', 'chart', !chart.flags.hourUnknown);
  push(map, 'chart.month.monthType', 'chart', a.monthCommand.monthType);
  push(map, 'chart.month.season', 'chart', a.monthCommand.season);

  if (!arm.inputs.includes('analysis')) return map;

  /* analysis.* — 사실 트리 전체를 경로로 편다 (A 도 analysisData 를 계산해 낸다) */
  walkAnalysis(a, '', map);
  pushCounts(map, a, 'analysis');

  /* A — 규칙 엔진의 판정을 그대로 인용한다 */
  if (armKey === 'A') {
    /* A 는 앱과 같이 판정 id 를 그대로 인용한다. 'finding.' 접두 형태도 함께 둔다. */
    (ctx.findings || []).forEach((f) => {
      const short = f.display ? f.display.short : f.id;
      push(map, f.id, 'finding', short);
      if (!map.has('finding.' + f.id)) push(map, 'finding.' + f.id, 'finding', short);
    });
    (ctx.ids || []).forEach((id) => {
      if (!map.has(id)) push(map, id, 'finding', id);
      if (!map.has('finding.' + id)) push(map, 'finding.' + id, 'finding', id);
    });
  }

  /* period.* — 대운·세운 */
  const pd = ctx.period;
  if (pd && pd.seun) {
    push(map, 'period.seun.ganzhi', 'period', pd.seun.hanja);
    push(map, 'period.seun.year', 'period', pd.seun.year);
    push(map, 'period.seun.stemTenGod', 'period', pd.seun.stemTen);
    push(map, 'period.seun.branchTenGod', 'period', pd.seun.branchTen);
    push(map, 'period.seun.stemElem', 'period', pd.seun.stemElem);
    push(map, 'period.seun.branchElem', 'period', pd.seun.branchElem);
    push(map, 'period.seun.fromLabel', 'period', pd.seun.fromLabel);
  }
  if (pd && pd.daewoon) {
    push(map, 'period.daewoon.ganzhi', 'period', pd.daewoon.hanja);
    push(map, 'period.daewoon.stemTenGod', 'period', pd.daewoon.stemTen);
    push(map, 'period.daewoon.branchTenGod', 'period', pd.daewoon.branchTen);
    push(map, 'period.daewoon.ageRange', 'period', (pd.daewoon.ageRange || []).join('-'));
    push(map, 'period.daewoon.from', 'period', pd.daewoon.from);
    push(map, 'period.daewoon.to', 'period', pd.daewoon.to);
  } else if (pd) {
    push(map, 'period.daewoon.none', 'period', true);
  }
  if (pd && pd.daewoonStart) push(map, 'period.daewoonStart.forward', 'period', pd.daewoonStart.forward);

  /* kb.* — 지식베이스는 D/E 만 준다 */
  if (arm.inputs.includes('kb') && kb) {
    (kb.entries || kb).forEach((e) => push(map, 'kb.' + e.id, 'kb', e.title));
  }
  return map;
}

/* ---------------- 상충 의무 ----------------
   명식 안에 '양립하는 두 판독'이 실제로 있을 때만 의무를 만든다.
   의무 = 그 축을 말하려면 양쪽을 다 인용하고, 언제 어느 쪽이 드러나는지(조건)를 말해야 한다.
   실험군의 pool 에 그 근거가 없으면 reachable:false 로 남긴다(못 본 것을 못 봤다고 적는다). */
const CONDITION_MARKERS = ['때', '경우', '조건', '상황', '반면', '한쪽', '동시에', '나란히', '갈릴', '달라', '차이', '반대로', '반면에'];

export function conflictObligations(ctx, pool) {
  const a = ctx.analysis;
  const has = (ref) => !pool || pool.has(ref);
  const out = [];
  const add = (o) => {
    const reachable = o.requires.every(has);
    out.push(Object.assign({ reachable }, o));
  };

  /* O1 — 월령 표 판독은 돕는데 통근이 0 */
  const seasonRank = a.deukryeong.bySeasonRank.rank;
  if ((['왕', '상'].indexOf(seasonRank) >= 0 || a.deukryeong.byElementCycle.supported) && a.roots.length === 0) {
    add({
      id: 'O1',
      topic: '월령 판독과 통근의 어긋남',
      requires: ['analysis.deukryeong.bySeasonRank.rank', 'analysis.roots.count'],
      markers: CONDITION_MARKERS
    });
  }

  /* O2 — 본기와 투출이 다른 격을 가리킴 */
  if (a.geokguk.agreement === 'differs' || a.geokguk.agreement === 'partial') {
    const bonggiIdx = a.geokguk.candidates.findIndex((c) => c.id.indexOf('GEOK.BONGGI.') === 0);
    const tutulIdx = a.geokguk.candidates.findIndex((c) => c.id.indexOf('GEOK.TUTUL.') === 0 && c.transparent);
    const req = [];
    if (bonggiIdx >= 0) req.push('analysis.geokguk.candidates[' + bonggiIdx + '].id');
    if (tutulIdx >= 0) req.push('analysis.geokguk.candidates[' + tutulIdx + '].id');
    if (req.length === 2) {
      add({ id: 'O2', topic: '본기 후보와 투출 후보의 불일치', requires: req, markers: CONDITION_MARKERS });
    }
  }

  /* O3 — 합과 충이 동시에 */
  const hapIdx = (a.hapchong || []).findIndex((h) => ['천간합', '육합', '삼합', '반합'].indexOf(h.kind) >= 0);
  const chungIdx = (a.hapchong || []).findIndex((h) => ['천간충', '육충'].indexOf(h.kind) >= 0);
  if (hapIdx >= 0 && chungIdx >= 0) {
    add({
      id: 'O3', topic: '합과 충의 동시 성립',
      requires: ['analysis.hapchong[' + hapIdx + '].kind', 'analysis.hapchong[' + chungIdx + '].kind'],
      markers: CONDITION_MARKERS
    });
  }

  /* O4 — 표면에는 없고 지장간에만 있는 오행 */
  if (a.elementFacts.hiddenOnly.length) {
    const e = a.elementFacts.hiddenOnly[0];
    add({
      id: 'O4', topic: '표면 0개 · 지장간에만 있는 오행(' + e + ')',
      requires: ['analysis.elementFacts.lacking.count', 'analysis.elementFacts.hiddenOnly.count'],
      markers: CONDITION_MARKERS
    });
  }

  /* O5 — 시진 안에 절입 */
  if (a.flags.termEdge) {
    add({
      id: 'O5', topic: '시진 안 절입 — 월주가 갈릴 수 있음',
      requires: ['analysis.flags.termEdge', 'analysis.monthCommand.branch'],
      markers: ['갈릴', '만세력', '확정', '다를', '경우']
    });
  }

  /* O6 — 시주 미상 */
  if (a.flags.hourUnknown) {
    add({
      id: 'O6', topic: '시주 미상(여섯 글자)',
      requires: ['analysis.flags.hourUnknown'],
      markers: ['빼고', '모르', '여섯', '없', '한계']
    });
  }

  return out;
}

/* ---------------- B 실험군 문맥 (analysisData 없이) ---------------- */
export function chartOnlyContext(ctx) {
  return { fixture: ctx.fixture, chart: ctx.chart, charts: chartFacts(ctx) };
}

export const SECTION_KEYS = SECTIONS.map((s) => s.key);
