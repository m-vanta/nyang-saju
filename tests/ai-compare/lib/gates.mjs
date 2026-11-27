/* ==========================================================================
   lib/gates.mjs — 통과 기준(gate)
   --------------------------------------------------------------------------
   품질 게이트는 '결정적으로 확인 가능한 것'만 건다.
     EA-1 100% · EA-2 100% · CA ≥90% · HZ 0 · GA 0 · SC 0 · judge ≥4.5
   CA 는 그 실험군이 근거를 볼 수 있었던 상충 의무만 분모로 센다(caTotal=0 이면 판정 보류).

   실패도 게이트에 건다 (요청 건수 모수)
     품질 지표만 보면 '실패한 요청을 빼고 잘 쓴 것만' 재게 된다. 그래서
       · 최종 실패(finalFailure) 0 — 재시도까지 포함해 요청이 전부 통과해야 한다
       · 품질 미평가(qualityExcluded) 0 — 문서가 안 나온 요청이 있으면 통과가 아니다
     를 함께 요구한다. 둘 다 분모는 그 실험군의 요청 건수(requestedCount)다.

   gate 면제 없음 (리뷰 P0-1)
     예전에는 B(명식만)의 gate 실패를 '설계상 예상'으로 면제했다. 그 면제는 B 에게
     구조적으로 불리한 채점(대운·세운 미제공, chart.* 인용을 일반론으로 계산)을
     전제로 한 것이었다. 이제 B 도 대운·세운을 받고 개인화 판정이 chart.* 를 세므로,
     모든 실험군을 같은 기준으로 판정한다. B 가 실패하면 그건 결과이지 설계 면제가 아니다.
   ========================================================================== */
const pct = (n) => ((n === null || n === undefined ? 0 : n) * 100).toFixed(1) + '%';

export const GATE = {
  ea1: 1.0, ea2: 1.0, ca: 0.9, hz: 0, ga: 0, sc: 0, judge: 4.5,
  finalFailure: 0, qualityExcluded: 0
};

/* 게이트를 통과하지 못하는 것이 '설계상 예상'인 실험군 — 현재 없음 */
export const GATE_EXEMPT = {};

export function gateOf(m) {
  const fails = [];
  /* 요청이 아예 없었으면 판정하지 않는다 */
  if (!m || !m.requestedCount) return { pass: true, fails: [], noData: true };
  /* 실행된 응답이 하나도 없으면 품질 지표를 판정할 수 없다 — 실패로 낸다 */
  if (!m.items) {
    fails.push('품질 평가 0/' + m.requestedCount + '건');
    return { pass: false, fails };
  }
  if (m.ea1 < GATE.ea1) fails.push('EA-1 ' + pct(m.ea1));
  if (m.ea2 < GATE.ea2) fails.push('EA-2 ' + pct(m.ea2));
  if (m.ca !== null && m.ca !== undefined && m.ca < GATE.ca) fails.push('CA ' + pct(m.ca));
  if (m.hz > GATE.hz) fails.push('HZ ' + m.hz);
  if (m.ga > GATE.ga) fails.push('GA ' + m.ga);
  if (m.sc > GATE.sc) fails.push('SC ' + m.sc);
  if (m.judge < GATE.judge) fails.push('judge ' + (Math.round(m.judge * 100) / 100));
  if ((m.finalFailure || 0) > GATE.finalFailure) {
    fails.push('최종 실패 ' + m.finalFailure + '/' + m.requestedCount + '건(' + pct(m.finalFailureRate) + ')');
  }
  if ((m.qualityExcluded || 0) > GATE.qualityExcluded) {
    fails.push('품질 미평가 ' + m.qualityExcluded + '/' + m.requestedCount + '건');
  }
  return { pass: fails.length === 0, fails };
}
