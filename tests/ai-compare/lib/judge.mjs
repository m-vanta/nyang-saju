/* ==========================================================================
   lib/judge.mjs — 문단 단위 루브릭 채점
   --------------------------------------------------------------------------
   실호출 모드에서 모델 채점을 붙이기 전까지, 같은 루브릭을 결정적 규칙으로 근사한다.
   근사라는 사실은 리포트에 매번 적는다(모델 채점을 대신하지 않는다).

   루브릭(6.6과 동일)
     5  근거만으로 성립 + 상충 양쪽과 조건 + 개인화
     4  성립하나 상충 한쪽이 약함 / 일부 문단이 일반론
     3  성립하나 근거보다 강하게 단정
     2  근거와 부분적으로 어긋남 · 근거 없음
     1  인용과 무관한 판정
   ========================================================================== */
import { paragraphsOf } from './metrics.mjs';

export const RUBRIC = [
  { score: 5, text: '인용한 근거만으로 문장이 성립하고, 상충이 있으면 양쪽과 조건을 말하며, 개인화돼 있다' },
  { score: 4, text: '성립하나 상충 중 한쪽이 약하거나 일부 문단이 일반론이다' },
  { score: 3, text: '성립하나 근거보다 강하게 단정한다' },
  { score: 2, text: '근거와 부분적으로 어긋나거나 근거가 없다' },
  { score: 1, text: '인용과 무관한 판정·사실을 말한다' }
];

const HARD_RULES = ['V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V13'];

export function heuristicScore(doc, ctx, validation, opts) {
  const o = opts || {};
  const paras = paragraphsOf(doc);
  if (!paras.length) return 1;
  const hard = validation.violations.filter((x) => HARD_RULES.indexOf(x.rule) >= 0).length;
  const soft = validation.violations.filter((x) => ['V1', 'V15'].indexOf(x.rule) >= 0).length;
  const caMiss = (validation.obligations || []).filter((ob) => ob.reachable).length > 0
    && (validation.violations || []).some((x) => x.rule === 'V15');
  const kbMiss = (o.arm === 'D' || o.arm === 'E') && validation.violations.some((x) => x.rule === 'V13');

  let total = 0;
  paras.forEach((p) => {
    let s = 5;
    const refs = p.refs.all;
    if (!refs.length) s = 2;
    const personal = refs.some((r) => /^(analysis\.|period\.|finding\.)/.test(r) || ctx.ids.has(r));
    if (!personal) s = Math.min(s, 4);
    if (hard) s = Math.min(s, 2);
    if (soft) s = Math.min(s, 4);
    if (caMiss) s = Math.min(s, 4);
    if (kbMiss) s = Math.min(s, 4);
    total += s;
  });
  return Math.max(1, Math.min(5, total / paras.length));
}

export async function judge(doc, ctx, validation, opts) {
  if (opts && opts.mode === 'live') {
    throw new Error('judge 실호출은 worker 채점 경로(/api/compare/judge)로만 합니다.');
  }
  return { score: heuristicScore(doc, ctx, validation, opts), method: 'heuristic(stub)' };
}
