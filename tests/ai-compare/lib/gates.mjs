/* ==========================================================================
   lib/gates.mjs — 통과 기준(gate)
   --------------------------------------------------------------------------
   품질 게이트는 '결정적으로 확인 가능한 것'만 건다.
     EA-1 100% · EA-2 100% · CA ≥90% · HZ 0 · GA 0 · SC 0 · judge ≥4.5
   CA 는 그 실험군이 근거를 볼 수 있었던 상충 의무만 분모로 센다(caTotal=0 이면 판정 보류).
   ========================================================================== */
const pct = (n) => (n * 100).toFixed(1) + '%';

export const GATE = {
  ea1: 1.0, ea2: 1.0, ca: 0.9, hz: 0, ga: 0, sc: 0, judge: 4.5
};

/* 게이트를 통과하지 못하는 것이 '설계상 예상'인 실험군.
   B 는 명식 기본표만 받으므로 개인화·상충 설명을 채울 근거가 없다. 이 실패가 곧 실험 결과다. */
export const GATE_EXEMPT = {
  B: '명식 기본표만 받는 설계 — 깊은 근거가 없어 개인화·상충 설명을 채울 수 없다'
};

export function gateOf(m) {
  const fails = [];
  /* 실행된 항목이 없으면(예산·호출 상한으로 건너뜀) 판정하지 않는다 */
  if (!m || !m.items) return { pass: true, fails: [], noData: true };
  if (m.ea1 < GATE.ea1) fails.push('EA-1 ' + pct(m.ea1));
  if (m.ea2 < GATE.ea2) fails.push('EA-2 ' + pct(m.ea2));
  if (m.ca !== null && m.ca !== undefined && m.ca < GATE.ca) fails.push('CA ' + pct(m.ca));
  if (m.hz > GATE.hz) fails.push('HZ ' + m.hz);
  if (m.ga > GATE.ga) fails.push('GA ' + m.ga);
  if (m.sc > GATE.sc) fails.push('SC ' + m.sc);
  if (m.judge < GATE.judge) fails.push('judge ' + (Math.round(m.judge * 100) / 100));
  return { pass: fails.length === 0, fails };
}
