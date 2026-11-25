#!/usr/bin/env node
/* ==========================================================================
   tests/ai-compare/run.mjs — 규칙 기반 vs AI 종합 해석 비교 하네스
   --------------------------------------------------------------------------
   실행
     node tests/ai-compare/run.mjs --mode stub                 # 오프라인(CI)
     node tests/ai-compare/run.mjs --mode live --n 3           # 실호출(키 필요)
     node tests/ai-compare/run.mjs --mode score --in out/<id>  # 저장된 출력 재채점

   통과 기준(gate)은 docs/orbit-finding-and-ai-hybrid-design.md §7.8.
   stub 모드에서도 하네스 자체는 항상 돌고, 검증기 자기시험(probe)이 실패하면
   종료 코드 1 로 멈춘다. 엔진의 gate 결과는 리포트에 적는다.
   ========================================================================== */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { loadEngine } from './lib/load.mjs';
import { buildContext } from './lib/readings.mjs';
import { ruleDoc } from './lib/engines/rule.mjs';
import { stubDoc, probeDocs } from './lib/engines/stub.mjs';
import { aiDoc } from './lib/engines/ai.mjs';
import { validate } from './lib/validate.mjs';
import { measure, aggregate, conflictRequirement } from './lib/metrics.mjs';
import { judge } from './lib/judge.mjs';
import { blind, maskDoc } from './lib/normalize.mjs';
import { writeReport, buildScore, gateOf } from './lib/report.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(HERE, '../..');

function args(argv) {
  const out = { mode: 'stub', fixtures: 'fixtures/charts.json', n: 1, in: null, out: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mode') out.mode = argv[++i];
    else if (a === '--fixtures') out.fixtures = argv[++i];
    else if (a === '--n') out.n = Number(argv[++i]);
    else if (a === '--in') out.in = argv[++i];
    else if (a === '--out') out.out = argv[++i];
  }
  return out;
}

const POLICY = { name: '민지', persona: 'dosa-cat/1', allowedNumbers: ['1,900', '1900'] };

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

async function main() {
  const opt = args(process.argv);
  const E = loadEngine();
  const chartsFile = JSON.parse(readFileSync(resolve(HERE, opt.fixtures), 'utf8'));
  const runId = stamp();
  const outDir = resolve(HERE, opt.out || ('out/' + runId));

  if (opt.mode === 'live' && !process.env.NYANG_COMPARE_API_KEY) {
    console.error('실호출 모드에는 NYANG_COMPARE_API_KEY 와 NYANG_COMPARE_ENDPOINT 가 필요합니다.');
    console.error('오프라인 비교는 --mode stub 으로 돌리세요.');
    process.exit(2);
  }

  const rows = [];
  const contexts = new Map();
  let determinism = true;

  /* --mode score — 저장된 출력을 다시 채점만 한다(프롬프트·검증기 변경 후 비교용) */
  if (opt.mode === 'score') {
    if (!opt.in) { console.error('--mode score 에는 --in out/<runId> 가 필요합니다.'); process.exit(2); }
    const inDir = resolve(HERE, opt.in);
    const saved = {
      rule: JSON.parse(readFileSync(resolve(inDir, 'rule.json'), 'utf8')),
      ai: JSON.parse(readFileSync(resolve(inDir, 'ai.json'), 'utf8'))
    };
    for (const fixture of chartsFile.charts) {
      const ctx = buildContext(E, fixture);
      const required = conflictRequirement(ctx);
      for (const engineName of ['rule', 'ai']) {
        const hit = saved[engineName].filter((x) => x.id === fixture.id)[0];
        if (!hit) continue;
        const validation = validate(hit.doc, ctx, POLICY);
        const j = await judge(hit.doc, ctx, validation, required, { mode: 'stub' });
        const metrics = measure(hit.doc, ctx, validation, j.score);
        rows.push({ fixture, engine: engineName, doc: maskDoc(hit.doc, POLICY.name), rawDoc: hit.doc, validation, required, metrics, engineMeta: j.method });
      }
    }
    const aggScore = { rule: aggregate(rows.filter((r) => r.engine === 'rule'), 0), ai: aggregate(rows.filter((r) => r.engine === 'ai'), 0) };
    const outDir2 = resolve(HERE, opt.out || inDir);
    writeFileSync(resolve(outDir2, 'score.json'), JSON.stringify(buildScore(runId, 'score', aggScore, rows, [], { determinism: true }), null, 1));
    console.log(writeReport(outDir2, { runId, mode: 'score', agg: aggScore, rows, probes: [], determinism: true, judgeMethod: rows[0] && rows[0].engineMeta }));
    return;
  }

  for (const fixture of chartsFile.charts) {
    let ctx;
    try {
      ctx = buildContext(E, fixture);
    } catch (e) {
      console.error('픽스처 계산 실패 ' + fixture.id + ': ' + e.message);
      process.exitCode = 1;
      continue;
    }
    contexts.set(fixture.id, ctx);

    const rule = ruleDoc(ctx);
    const rule2 = ruleDoc(ctx);
    if (JSON.stringify(rule) !== JSON.stringify(rule2)) determinism = false;

    for (const engineName of ['rule', 'ai']) {
      let doc;
      if (engineName === 'rule') doc = rule;
      else if (opt.mode === 'live') doc = await aiDoc(ctx, POLICY);
      else doc = stubDoc(ctx, rule);

      const validation = validate(doc, ctx, POLICY);
      const required = conflictRequirement(ctx);
      const j = await judge(doc, ctx, validation, required, { mode: opt.mode === 'live' ? 'live' : 'stub' });
      const metrics = measure(doc, ctx, validation, j.score);

      rows.push({
        fixture, engine: engineName, doc: maskDoc(doc, POLICY.name), rawDoc: doc,
        validation, required, metrics,
        engineMeta: j.method
      });
    }
  }

  /* 검증기 자기시험 — 일부러 어긋난 문서를 잡는가 */
  const probeCtx = contexts.get('QA01') || Array.from(contexts.values())[0];
  const probes = [];
  const probeSpec = [
    ['hallucination', 'G2', ['G2']],
    ['noRef', 'G3', ['G3']],
    ['sensitive', 'G8', ['G8']]
  ];
  const probeSet = probeDocs(probeCtx);
  probeSpec.forEach(([name, expect, rules]) => {
    const v = validate(probeSet[name], probeCtx, POLICY);
    const caught = Array.from(new Set(v.violations.map((x) => x.rule)));
    probes.push({ name, expect, caught, ok: rules.every((r) => caught.indexOf(r) >= 0) });
  });

  const agg = { rule: null, ai: null };
  Object.keys(agg).forEach((k) => {
    agg[k] = aggregate(rows.filter((r) => r.engine === k), chartsFile.charts.filter((c) => c.conflict).length);
  });

  /* A/B 블라인드 라벨 (사람 표본 검토용) */
  const sample = rows.filter((r) => r.fixture.id === 'QA09');
  const blindLabels = sample.length === 2 ? blind({ rule: 1, ai: 1 }, 'QA09') : null;

  mkdirSync(outDir, { recursive: true });
  const ruleRows = rows.filter((r) => r.engine === 'rule').map((r) => ({ id: r.fixture.id, doc: r.rawDoc }));
  const aiRows = rows.filter((r) => r.engine === 'ai').map((r) => ({ id: r.fixture.id, doc: r.rawDoc }));
  writeFileSync(resolve(outDir, 'rule.json'), JSON.stringify(ruleRows, null, 1));
  writeFileSync(resolve(outDir, 'ai.json'), JSON.stringify(aiRows, null, 1));
  const score = buildScore(runId, opt.mode, agg, rows, probes, { determinism, blind: blindLabels, engineMeta: sample[0] ? sample[0].engineMeta : null });
  writeFileSync(resolve(outDir, 'score.json'), JSON.stringify(score, null, 1));
  const md = writeReport(outDir, { runId, mode: opt.mode, agg, rows, probes, determinism, judgeMethod: rows[0] && rows[0].engineMeta });

  console.log(md);
  console.log('\n산출물: ' + outDir);

  const probeFail = probes.filter((p) => !p.ok);
  if (probeFail.length) {
    console.error('\n검증기 자기시험이 실패했습니다: ' + probeFail.map((p) => p.name).join(', '));
    process.exitCode = 1;
  }
  if (!determinism) {
    console.error('\n규칙 엔진이 같은 입력에 다른 출력을 냈습니다.');
    process.exitCode = 1;
  }
  const ruleGate = gateOf(agg.rule);
  console.log('규칙 엔진 gate: ' + (ruleGate.pass ? 'PASS' : 'FAIL — ' + ruleGate.fails.join(', ')));
  console.log('AI(stub) gate: ' + (gateOf(agg.ai).pass ? 'PASS' : 'FAIL — ' + gateOf(agg.ai).fails.join(', ')));
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
