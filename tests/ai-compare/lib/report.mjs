/* ==========================================================================
   lib/report.mjs — report.md · score.json 만들기
   ========================================================================== */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const pct = (n) => (n * 100).toFixed(1) + '%';
const num = (n) => (Math.round(n * 1000) / 1000).toString();

export function buildScore(runId, mode, agg, rows, probes, extra) {
  return {
    runId, mode,
    gate: {
      ea1: 1.0, ea2: 1.0, ca: 0.9, cr: 0.02, hr: 0.02, tcViolations: 0, judge: 4.5, sf: 0
    },
    engines: agg,
    fixtures: rows.map((r) => ({
      id: r.fixture.id, engine: r.engine, conflict: r.fixture.conflict || null,
      required: r.required,
      metrics: r.metrics,
      violations: r.validation.violations.map((v) => v.rule + ' ' + v.where + ' ' + v.detail),
      warnings: r.validation.warnings.length
    })),
    probes,
    extra
  };
}

export function gateOf(m) {
  const fails = [];
  if (m.ea1 < 1) fails.push('EA-1 ' + pct(m.ea1));
  if (m.ea2 < 1) fails.push('EA-2 ' + pct(m.ea2));
  if (m.ca < 0.9) fails.push('CA ' + pct(m.ca));
  if (m.cr > 0.02) fails.push('CR ' + pct(m.cr));
  if (m.hr > 0.02) fails.push('HR ' + pct(m.hr));
  if (m.tc > 0) fails.push('TC 위반 ' + m.tc);
  if (m.sf > 0) fails.push('SF ' + m.sf);
  if (m.judge < 4.5) fails.push('judge ' + num(m.judge));
  return { pass: fails.length === 0, fails };
}

export function writeReport(outDir, { runId, mode, agg, rows, probes, determinism, judgeMethod }) {
  mkdirSync(outDir, { recursive: true });
  const engines = Object.keys(agg);
  const lines = [];
  lines.push('# AI 비교 리포트 — run ' + runId);
  lines.push('');
  lines.push('- 모드: **' + mode + '**' + (mode === 'stub' ? ' (오프라인 · 네트워크 없음)' : ''));
  lines.push('- 픽스처: ' + rows.length + '건 · 상충 픽스처: ' + agg[engines[0]].caFixtures + '건');
  const jm = judgeMethod || (mode === 'stub' ? 'heuristic(stub)' : 'model');
  lines.push('- judge: ' + (jm.indexOf('heuristic') === 0 ? '결정적 근사(heuristic) — 모델 채점 아님' : '모델 채점'));
  lines.push('');
  lines.push('| 엔진 | EA-1 | EA-2 | CA | CR | HR | TC | SF | judge | gate |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  engines.forEach((k) => {
    const m = agg[k];
    const g = gateOf(m);
    lines.push('| ' + k + ' | ' + pct(m.ea1) + ' | ' + pct(m.ea2) + ' | ' + pct(m.ca) + ' (' + m.caHit + '/' + m.caFixtures + ') | ' +
      pct(m.cr) + ' | ' + pct(m.hr) + ' | ' + m.tc + ' | ' + m.sf + ' | ' + num(m.judge) + ' | ' +
      (g.pass ? 'PASS' : 'FAIL — ' + g.fails.join(', ')) + ' |');
  });
  lines.push('');

  lines.push('## 최악 픽스처');
  engines.forEach((k) => {
    const list = rows.filter((r) => r.engine === k)
      .map((r) => ({ id: r.fixture.id, n: r.validation.violations.length + r.validation.warnings.length + (r.required.length && !r.required.every((id) => (r.doc.sections || []).flatMap((s) => s.paragraphs || []).flatMap((p) => p.findingRefs || []).includes(id)) ? 1 : 0) }))
      .filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3);
    lines.push('- ' + k + ': ' + (list.length ? list.map((x) => x.id + '(' + x.n + ')').join(', ') : '위반·경고 0'));
  });
  lines.push('');

  lines.push('## 상충 픽스처 (CA)');
  lines.push('| 픽스처 | 설계 | 필요 근거 | ' + engines.map((k) => k + ' 인용').join(' | ') + ' |');
  lines.push('|---|---|---|' + engines.map(() => '---').join('|') + '|');
  rows.filter((r) => r.engine === engines[0] && r.required.length).forEach((r) => {
    const cells = engines.map((k) => {
      const hit = rows.filter((x) => x.engine === k && x.fixture.id === r.fixture.id)[0];
      const cited = (hit.doc.sections || []).flatMap((s) => s.paragraphs || []).flatMap((p) => p.findingRefs || []);
      const ok = r.required.filter((id) => cited.indexOf(id) >= 0).length;
      return ok + '/' + r.required.length;
    });
    lines.push('| ' + r.fixture.id + ' | ' + (r.fixture.design || '') + ' | ' + r.required.join('<br>') + ' | ' + cells.join(' | ') + ' |');
  });
  lines.push('');

  lines.push('## 검증기 자기시험');
  lines.push('| probe | 기대 | 잡은 규칙 |');
  lines.push('|---|---|---|');
  probes.forEach((p) => {
    lines.push('| ' + p.name + ' | ' + p.expect + ' | ' + (p.caught.join(', ') || '없음') + (p.ok ? ' ✅' : ' ❌') + ' |');
  });
  lines.push('');

  lines.push('## 결정성');
  lines.push('- 규칙 엔진 같은 입력 2회 동일 출력: ' + (determinism ? '100%' : '실패'));
  lines.push('');
  lines.push('## 산출물');
  lines.push('- rule.json · ai.json · score.json · report.md (이 폴더)');
  lines.push('- 실호출 결과는 커밋하지 않는다(out/ 는 gitignore).');

  const md = lines.join('\n');
  writeFileSync(resolve(outDir, 'report.md'), md, 'utf8');
  return md;
}
