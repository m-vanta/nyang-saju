/* ==========================================================================
   lib/report.mjs — score.json · report.md
   ========================================================================== */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatUsd, formatKrw } from './cost.mjs';
import { gateOf, GATE_EXEMPT } from './gates.mjs';

const pct = (n) => (n === null || n === undefined ? '—' : (n * 100).toFixed(1) + '%');
const num = (n) => (n === null || n === undefined ? '—' : (Math.round(n * 1000) / 1000).toString());

export function buildScore(run) {
  return {
    runId: run.runId,
    mode: run.mode,
    set: run.set,
    model: run.model,
    createdAt: run.createdAt,
    gate: run.gateDef,
    engines: run.agg,
    cost: run.costSummary,
    fixtures: run.rows.map((r) => ({
      id: r.fixture.id,
      arm: r.arm,
      metrics: r.metrics,
      attempts: r.attempts,
      ok: r.ok,
      violations: r.validation ? r.validation.violations.map((v) => v.rule + ' ' + v.where + ' ' + v.detail) : [],
      warnings: r.validation ? r.validation.warnings.length : 0
    })),
    probes: run.probes,
    selfTests: run.selfTests,
    determinism: run.determinism,
    kb: run.kbStats,
    blind: run.blindInfo
  };
}

export function writeReport(outDir, run) {
  mkdirSync(outDir, { recursive: true });
  const arms = Object.keys(run.agg);
  const L = [];
  L.push('# AI 종합 해석 실험 리포트 — run ' + run.runId);
  L.push('');
  L.push('- 모드: **' + run.mode + '**' + (run.mode === 'stub' ? ' (오프라인 · 네트워크 없음 · 응답은 결정적 스텁)' : ' (실호출)'));
  L.push('- 픽스처: ' + run.set + ' (' + run.rows.length / Math.max(1, arms.length) + '건 × ' + arms.length + '실험군)');
  L.push('- 모델: ' + (run.model || '—') + ' · temperature 0');
  L.push('- judge: 결정적 근사(heuristic) — 모델 채점 아님');
  L.push('');
  L.push('## 실험군');
  L.push('');
  L.push('| A | B | C | D | E |');
  L.push('|---|---|---|---|---|');
  L.push('| 규칙 기반 | 명식만 | +analysisData | +지식베이스 | +비평·재작성 |');
  L.push('');
  L.push('## 품질 지표');
  L.push('');
  L.push('| 실험군 | 섹션(ok/비움) | EA-1 | EA-2 | CA | HZ | GA | SC | CR | GN | KB/문단 | judge | gate |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  arms.forEach((k) => {
    const m = run.agg[k];
    const g = gateOf(m);
    if (!m || !m.items) {
      L.push('| ' + k + ' | 실행 없음(예산·호출 상한) | — | — | — | — | — | — | — | — | — | — | — |');
      return;
    }
    L.push('| ' + k + ' | ' + (m.sectionsOk || 0).toFixed(1) + ' / ' + (m.sectionsUnavailable || 0).toFixed(1) + ' | ' +
      pct(m.ea1) + ' | ' + pct(m.ea2) + ' | ' + (m.caHit + '/' + m.caTotal) + ' (' + pct(m.ca) + ') | ' +
      m.hz + ' | ' + m.ga + ' | ' + m.sc + ' | ' + pct(m.cr) + ' | ' + pct(m.gn) + ' | ' + (m.kb || 0).toFixed(2) + ' | ' + num(m.judge) + ' | ' +
      (g.pass ? 'PASS' : 'FAIL — ' + g.fails.join(', ') + (GATE_EXEMPT[k] ? ' (설계상 예상)' : '')) + ' |');
    if (g.noData) L[L.length - 1] = '| ' + k + ' | 실행 없음(예산·호출 상한) | — | — | — | — | — | — | — | — | — | — | — |';
  });
  L.push('');
  L.push('지표 정의: EA-1 인용 유효율 · EA-2 문단 근거율 · CA 상충 설명률(양쪽 인용+조건) · HZ 간지·십성·합충 환각 · GA 금지 판정어·단정·민감 · SC 스키마 · CR 사실 모순률 · GN 일반론률(개인 사실 미인용 문단) · KB/문단 지식베이스 인용 밀도');
  if (Object.keys(GATE_EXEMPT).length) {
    L.push('');
    Object.keys(GATE_EXEMPT).forEach((k) => L.push('- ' + k + ' 의 gate 실패는 설계상 예상이다 — ' + GATE_EXEMPT[k]));
  }
  L.push('');
  L.push('## 실험군별 해석');
  arms.forEach((k) => {
    const m = run.agg[k];
    if (!m || !m.items) { L.push('- **' + k + '**: 실행 없음(예산·호출 상한)'); return; }
    const bits = [];
    bits.push('섹션 ' + (m.sectionsOk || 0).toFixed(1) + '개 작성');
    if (m.caTotal) bits.push('상충 의무 ' + m.caTotal + '건 중 ' + m.caHit + '건 충족');
    else bits.push('상충 의무 없음(또는 근거 없음)');
    if (m.hz) bits.push('환각 ' + m.hz);
    if (m.ga) bits.push('게이트 위반 ' + m.ga);
    if (m.failed) bits.push('검증 실패 ' + m.failed + '건');
    L.push('- **' + k + '**: ' + bits.join(' · '));
  });
  L.push('');
  L.push('## 비용·지연');
  L.push('');
  L.push('| 실험군 | 호출 | 입력 토큰 | 출력 토큰 | 비용(USD) | 비용(KRW) | p50 | p95 | 재시도 |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  arms.forEach((k) => {
    const c = (run.costSummary.byArm || {})[k];
    if (!c) { L.push('| ' + k + ' | — | — | — | — | — | — | — | — |'); return; }
    L.push('| ' + k + ' | ' + c.calls + ' | ' + c.inputTokens + ' | ' + c.outputTokens + ' | ' + formatUsd(c.usd) + ' | ' + formatKrw(c.krw) +
      ' | ' + c.p50ms + 'ms | ' + c.p95ms + 'ms | ' + c.retries + ' |');
  });
  L.push('');
  L.push('- 합계 ' + formatUsd(run.costSummary.totalUsd) + ' (' + formatKrw(run.costSummary.totalKrw) + ')' +
    (run.costSummary.estimated ? ' — **stub 추정치**(글자 수 기반). 청구액이 아니다.' : ' — 실호출 usage 기준'));
  L.push('');
  L.push('## 상충 픽스처 (CA)');
  L.push('');
  L.push('| 픽스처 | 상충 축 | ' + arms.map((k) => k).join(' | ') + ' |');
  L.push('|---|---|' + arms.map(() => '---').join('|') + '|');
  const byFixture = {};
  run.rows.forEach((r) => {
    const f = byFixture[r.fixture.id] = byFixture[r.fixture.id] || { fixture: r.fixture, arms: {} };
    f.arms[r.arm] = r;
  });
  Object.keys(byFixture).forEach((fid) => {
    const f = byFixture[fid];
    const obs = (f.arms[arms[0]] && f.arms[arms[0]].validation && f.arms[arms[0]].validation.obligations) || [];
    if (!obs.length) return;
    const cells = arms.map((k) => {
      const r = f.arms[k];
      if (!r || !r.metrics.caTotal) return '—';
      return r.metrics.caHit + '/' + r.metrics.caTotal;
    });
    L.push('| ' + fid + ' | ' + obs.map((o) => o.id + ' ' + o.topic).join('<br>') + ' | ' + cells.join(' | ') + ' |');
  });
  L.push('');
  L.push('## 최악 픽스처');
  arms.forEach((k) => {
    const list = run.rows.filter((r) => r.arm === k)
      .map((r) => ({ id: r.fixture.id, n: (r.validation ? r.validation.violations.length + r.validation.warnings.length : 0) }))
      .filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3);
    L.push('- ' + k + ': ' + (list.length ? list.map((x) => x.id + '(' + x.n + ')').join(', ') : '위반·경고 0'));
  });
  L.push('');
  L.push('## 검증기 자기시험');
  L.push('');
  L.push('| probe | 기대 규칙 | 잡은 규칙 | 결과 |');
  L.push('|---|---|---|---|');
  run.probes.forEach((p) => {
    L.push('| ' + p.name + ' | ' + p.expect + ' | ' + (p.caught.join(', ') || '없음') + ' | ' + (p.ok ? '✅' : '❌') + ' |');
  });
  L.push('');
  L.push('## 하네스 자기시험');
  L.push('');
  (run.selfTests || []).forEach((t) => L.push('- ' + (t.ok ? '✅' : '❌') + ' ' + t.name + (t.detail ? ' — ' + t.detail : '')));
  L.push('');
  L.push('## 결정성');
  L.push('- 규칙 엔진 같은 입력 2회 동일 출력: ' + (run.determinism ? '100%' : '실패'));
  L.push('');
  L.push('## 지식베이스');
  L.push('- 항목 ' + run.kbStats.total + '개 · 문헌 확인 ' + run.kbStats.byStatus['문헌 확인'] + ' · 현대적 해석 ' + run.kbStats.byStatus['현대적 해석'] + ' · 제품 규약 ' + run.kbStats.byStatus['제품 규약']);
  L.push('- 자기검사: ' + (run.kbProblems && run.kbProblems.length ? '실패 — ' + run.kbProblems.join(' / ') : '통과'));
  L.push('');
  L.push('## 블라인드 패키지');
  if (run.blindInfo) {
    L.push('- 경로: `' + run.blindInfo.dir + '`');
    L.push('- 라벨: ' + Object.keys(run.blindInfo.map || {}).map((a) => a + '→' + run.blindInfo.map[a]).join(' · '));
    L.push('- `blind-key.json`·`prompts.md` 는 평가가 끝날 때까지 평가자에게 주지 않는다.');
  } else {
    L.push('- 생성하지 않음');
  }
  L.push('');
  L.push('## 한계');
  L.push('- stub 모드는 실제 모델의 문장 품질을 재지 않는다. 배선·검증기·채점·비용 계산 경로만 검증한다.');
  L.push('- judge 는 결정적 근사다. 모델 채점·사람 채점과의 상관은 실호출 라운드에서 확인해야 한다.');
  L.push('- 간지 환각 검사(V4)는 한자 쌍만 본다. 한글 표기(예: "갑자")의 오류는 별도 규칙이 필요하다.');
  L.push('- 토큰·비용은 stub 에서 추정치다(글자 수/2.2). 실호출에서 usage 로 대체된다.');

  const md = L.join('\n');
  writeFileSync(resolve(outDir, 'report.md'), md, 'utf8');
  return md;
}
