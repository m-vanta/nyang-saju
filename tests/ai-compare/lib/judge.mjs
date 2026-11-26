/* ==========================================================================
   lib/judge.mjs — 문단 단위 루브릭 채점
   --------------------------------------------------------------------------
   실호출 모드에서는 모델에게 §7.6 루브릭을 주고 채점한다(2회 채점, 2점 이상
   차이면 3회째 중재). 키가 없는 오프라인(stub) 모드에서는 같은 루브릭을
   결정적 규칙으로 근사하고, 그 사실을 리포트에 명시한다.
   ========================================================================== */

export const RUBRIC = [
  { score: 5, text: '인용한 finding 만으로 문장이 성립하고, 상충이 있으면 양쪽을 설명하며, 톤이 일관된다' },
  { score: 4, text: '성립하나 상충 중 한쪽이 약하게만 언급됨' },
  { score: 3, text: '성립하나 finding 보다 강하게 단정함' },
  { score: 2, text: '인용 finding 과 부분적으로 어긋남' },
  { score: 1, text: '인용과 무관한 판정·사실을 말함' }
];

/* 오프라인 근사 — 결정적. 모델 채점을 대신하지 않는다. */
export function heuristicScore(doc, ctx, validation, required) {
  const paras = (doc.sections || []).flatMap((s) => s.paragraphs || []);
  if (!paras.length) return 1;
  const cited = paras.flatMap((p) => p.findingRefs || []);
  const covered = required.filter((id) => cited.indexOf(id) >= 0).length;
  const conflictPenalty = required.length && covered < required.length ? 1 : 0;
  const bad = validation.violations.filter((x) => ['G2', 'G8', 'G6', 'G7'].indexOf(x.rule) >= 0).length;
  const STRONG = ['최고', '최악', '위험', '엄청', '완벽'];
  let total = 0;
  paras.forEach((p) => {
    let s = 5;
    if (!(p.findingRefs || []).length) s = 2;
    const neutral = (p.findingRefs || []).map((id) => ctx.findings.filter((f) => f.id === id)[0]).filter((f) => f && f.polarity === 'neutral');
    if (neutral.length && STRONG.some((w) => String(p.text || '').indexOf(w) >= 0)) s = Math.min(s, 4);
    if (conflictPenalty) s = Math.min(s, 4);
    if (bad) s = Math.min(s, 2);
    total += s;
  });
  return Math.max(1, Math.min(5, total / paras.length));
}

export async function judge(doc, ctx, validation, required, opts) {
  if (opts && opts.mode === 'live') {
    throw new Error('judge 실호출은 worker 채점 경로(/api/compare/judge)로만 합니다.');
  }
  return { score: heuristicScore(doc, ctx, validation, required), method: 'heuristic(stub)' };
}
