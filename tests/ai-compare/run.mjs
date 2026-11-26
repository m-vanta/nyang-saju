#!/usr/bin/env node
/* ==========================================================================
   tests/ai-compare/run.mjs — 냥도사 AI 종합 해석 실험 (A~E)
   --------------------------------------------------------------------------
   실행
     node tests/ai-compare/run.mjs --mode stub                 # 오프라인(CI). 네트워크 없음
     node tests/ai-compare/run.mjs --mode stub --set pilot     # 파일럿 3건 스텁 검증
     node tests/ai-compare/run.mjs --mode pilot                # 파일럿 3건 실호출(키 필요)
     node tests/ai-compare/run.mjs --mode full                 # QA01~12 실호출(키 필요)
     node tests/ai-compare/run.mjs --mode full --stub          # 실호출 배선을 스텁으로 예행

   안전장치
     --max-calls N        모델 호출 총 횟수 상한(재시도 포함)
     --max-retries N      검증 실패 시 재시도 횟수(기본 1)
     --max-cost-usd X     누적 비용 상한. 넘으면 남은 픽스처를 건너뛴다
     --arms A,B,C,D,E     일부 실험군만 실행
     --model <id>         기본 claude-opus-5-5
     --out <dir>          산출물 경로(기본 out/<runId>)

   종료 코드: 하네스·검증기 자기시험이 실패하면 1. 실험군 gate 결과는 리포트에 적는다.
   ========================================================================== */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { loadEngine } from './lib/load.mjs';
import { buildContext } from './lib/readings.mjs';
import { ruleDoc } from './lib/engines/rule.mjs';
import { stubDoc, probeDocs } from './lib/engines/stub.mjs';
import { aiDoc, apiKey } from './lib/engines/ai.mjs';
import { evidencePool, ARMS, ARM_KEYS } from './lib/facts.mjs';
import { validate } from './lib/validate.mjs';
import { measure, aggregate } from './lib/metrics.mjs';
import { judge } from './lib/judge.mjs';
import { runArm, createBudget } from './lib/retry.mjs';
import { buildScore, writeReport } from './lib/report.mjs';
import { gateOf, GATE, GATE_EXEMPT } from './lib/gates.mjs';
import { buildBlind, writeBlind, BLIND_SEED } from './lib/blind-export.mjs';
import { KB_EVIDENCE, kbStats, validateKB, KB_VERSION } from './lib/knowledge-base.mjs';
import { promptMeta, userPrompt, PROMPT_VERSION } from './lib/prompts.mjs';
import { estimateUsage, summarize, DEFAULT_MODEL, PRICING, FX_KRW_PER_USD, costOf, formatUsd } from './lib/cost.mjs';
import { checkSchema } from './lib/schema.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(HERE, '../..');
const KB_DOC = resolve(APP_DIR, 'docs/myeongri-knowledge-base.md');
const ANALYSIS_DOC = resolve(APP_DIR, 'docs/qa-original-analysis-data.json');

function args(argv) {
  const out = {
    mode: 'stub', set: null, fixtures: null, arms: ARM_KEYS.slice(),
    maxCalls: 0, maxRetries: 1, maxCostUsd: 0, model: DEFAULT_MODEL, out: null, stub: false
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mode') out.mode = argv[++i];
    else if (a === '--set') out.set = argv[++i];
    else if (a === '--fixtures') out.fixtures = argv[++i];
    else if (a === '--arms') out.arms = String(argv[++i]).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    else if (a === '--max-calls') out.maxCalls = Number(argv[++i]);
    else if (a === '--max-retries') out.maxRetries = Number(argv[++i]);
    else if (a === '--max-cost-usd') out.maxCostUsd = Number(argv[++i]);
    else if (a === '--model') out.model = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--stub') out.stub = true;
    else if (a === '--help' || a === '-h') { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]); process.exit(0); }
  }
  if (!out.set) out.set = out.mode === 'pilot' ? 'pilot' : (out.mode === 'full' ? 'all' : 'all');
  return out;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

/* 픽스처 정규화 — qa-original.json(profiles) / charts.json(charts) 둘 다 받는다 */
function loadFixtures(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const list = raw.profiles || raw.charts || [];
  return list.map((p) => ({
    id: p.id,
    birth: p.birth || p.input || p,
    focus: p.focus || (p.input && p.input.focus) || null,
    conflict: p.conflict || null,
    design: p.design || null,
    expected: p.expected || null
  }));
}

function pilotIds() {
  if (existsSync(ANALYSIS_DOC)) {
    try {
      const doc = JSON.parse(readFileSync(ANALYSIS_DOC, 'utf8'));
      if (doc.pilotSet && doc.pilotSet.ids && doc.pilotSet.ids.length) return doc.pilotSet.ids;
    } catch (e) { /* 아래 기본값 */ }
  }
  return ['QA02', 'QA04', 'QA09'];
}

const POLICY = { name: '민지', persona: 'dosa-cat/1' };

async function main() {
  const opt = args(process.argv);
  if (['stub', 'pilot', 'full'].indexOf(opt.mode) < 0) {
    console.error('--mode 는 stub | pilot | full 중 하나입니다.');
    process.exit(2);
  }
  const live = opt.mode !== 'stub' && !opt.stub;
  const key = apiKey(APP_DIR);
  if (live && !key) {
    console.error('실호출 모드(' + opt.mode + ')에는 ANTHROPIC_API_KEY 가 필요합니다.');
    console.error('  · 환경변수 또는 ' + resolve(APP_DIR, '.env.local') + ' 에 설정하세요.');
    console.error('  · 키 없이 배선만 확인하려면 --mode stub 또는 --mode pilot --stub 을 쓰세요.');
    process.exit(2);
  }

  const E = loadEngine();
  const fixturesPath = opt.fixtures || resolve(APP_DIR, 'tests/fixtures/qa-original.json');
  const allFixtures = loadFixtures(fixturesPath);
  const pilot = pilotIds();
  const picked = opt.set === 'pilot' ? allFixtures.filter((f) => pilot.indexOf(f.id) >= 0) : allFixtures;
  if (!picked.length) {
    console.error('픽스처가 없습니다: set=' + opt.set + ' · ' + fixturesPath);
    process.exit(2);
  }
  const arms = opt.arms.filter((a) => ARM_KEYS.indexOf(a) >= 0);
  const runId = stamp();
  const outDir = resolve(opt.out || resolve(HERE, 'out/' + runId));
  const createdAt = new Date().toISOString();
  const kbList = { entries: KB_EVIDENCE };

  const budget = createBudget({ maxCalls: opt.maxCalls, maxUsd: opt.maxCostUsd });
  const rows = [];
  const contexts = new Map();
  let determinism = true;
  let skipped = 0;

  for (const fixture of picked) {
    let ctx;
    try {
      ctx = buildContext(E, fixture);
      ctx.policy = POLICY;
    } catch (e) {
      console.error('픽스처 계산 실패 ' + fixture.id + ': ' + e.message);
      process.exitCode = 1;
      continue;
    }
    contexts.set(fixture.id, ctx);

    /* 규칙 엔진 결정성 */
    if (arms.indexOf('A') >= 0) {
      const poolA = evidencePool(ctx, 'A', kbList);
      const r1 = JSON.stringify(ruleDoc(ctx, poolA));
      const r2 = JSON.stringify(ruleDoc(ctx, poolA));
      if (r1 !== r2) determinism = false;
    }

    let draftD = null;
    for (const arm of arms) {
      const pool = evidencePool(ctx, arm, kbList);
      const base = { fixture, arm, ctx, pool };

      if (arm === 'A') {
        const doc = ruleDoc(ctx, pool);
        const validation = validate(doc, ctx, { arm, pool, policy: POLICY });
        const j = await judge(doc, ctx, validation, { mode: 'stub', arm });
        const metrics = measure(doc, ctx, validation, pool, j.score);
        rows.push(Object.assign(base, {
          doc, validation, metrics, attempts: 0, records: [], ok: validation.violations.length === 0,
          engine: 'rule', model: null, label: ARMS.A.label, inputBoundary: 'chart+analysis+findings',
          settings: { temperature: 0 }, prompt: null
        }));
        continue;
      }

      if (!budget.canCall()) { skipped += 1; continue; }

      const prompt = promptMeta(arm, ctx, { pool, draftDoc: arm === 'E' ? draftD : null });
      const settings = { temperature: 0, maxTokens: 8000 };
      let callFn;

      if (live) {
        callFn = async ({ feedback }) => {
          const r = await aiDoc(arm, ctx, { pool, draftDoc: arm === 'E' ? draftD : null, feedback, key, dir: APP_DIR, temperature: 0 });
          return { doc: r.doc, usage: r.usage, ms: r.ms, model: r.model };
        };
      } else {
        callFn = ({ attempt }) => {
          const doc = stubDoc(arm, ctx, { pool, draftDoc: arm === 'E' ? draftD : null, attempt });
          /* 비용은 실험 대상 모델 단가로 계산한다(usage 는 글자 수 추정). */
          return { doc, usage: estimateUsage(prompt.system + prompt.user, JSON.stringify(doc)), ms: 0, model: opt.model, estimated: true };
        };
      }

      const res = await runArm({
        arm, ctx, pool, policy: POLICY, callFn,
        maxRetries: opt.maxRetries, budget, model: opt.model,
        prompt: prompt.system + prompt.user
      });
      if (arm === 'D') draftD = res.doc;

      const doc = res.doc;
      const validation = res.validation || validate(doc, ctx, { arm, pool, policy: POLICY });
      const j = await judge(doc, ctx, validation, { mode: 'stub', arm });
      const metrics = measure(doc, ctx, validation, pool, j.score);
      rows.push(Object.assign(base, {
        doc, validation, metrics, attempts: res.attempts, records: res.records || [],
        ok: res.ok, engine: (doc && doc.engine) || ('ai-' + arm.toLowerCase()), model: opt.model,
        label: ARMS[arm].label, inputBoundary: ARMS[arm].inputs.join('+'),
        settings, prompt
      }));
    }
  }

  /* ---------------- 검증기 자기시험 ---------------- */
  const probeCtx = contexts.get(picked[0].id) || Array.from(contexts.values())[0];
  const probePoolC = evidencePool(probeCtx, 'C', kbList);
  const probePoolD = evidencePool(probeCtx, 'D', kbList);
  const probePoolB = evidencePool(probeCtx, 'B', kbList);
  const probeSet = probeDocs(probeCtx, probePoolC);
  const probes = [];
  Object.keys(probeSet).forEach((name) => {
    const entry = probeSet[name];
    const arm = entry.arm || (name === 'outOfPool' ? 'B' : 'C');
    const pool = arm === 'B' ? probePoolB : (arm === 'D' ? probePoolD : probePoolC);
    const v = validate(entry.doc, probeCtx, { arm, pool, policy: POLICY });
    const caught = Array.from(new Set(v.violations.map((x) => x.rule)));
    const ok = entry.expect ? caught.indexOf(entry.expect) >= 0 : caught.length === 0;
    probes.push({ name, expect: entry.expect || '무위반', caught, ok });
  });

  /* ---------------- 하네스 자기시험 ---------------- */
  const selfTests = [];
  const st = (name, fn) => {
    try {
      const detail = fn();
      selfTests.push({ name, ok: true, detail: detail == null ? '' : String(detail) });
    } catch (e) {
      selfTests.push({ name, ok: false, detail: e && e.message ? e.message : String(e) });
    }
  };
  const assert = (c, msg) => { if (!c) throw new Error(msg); };

  st('지식베이스 자기검사', () => {
    const problems = validateKB();
    assert(!problems.length, problems.join(' / '));
    return KB_EVIDENCE.length + '개 · ' + KB_VERSION;
  });

  st('지식베이스 문서 동기화(docs/myeongri-knowledge-base.md)', () => {
    assert(existsSync(KB_DOC), '문서가 없습니다: docs/myeongri-knowledge-base.md');
    const text = readFileSync(KB_DOC, 'utf8');
    const missing = KB_EVIDENCE.filter((e) => text.indexOf(e.id) < 0).map((e) => e.id);
    assert(!missing.length, '문서에 없는 항목: ' + missing.join(', '));
    return KB_EVIDENCE.length + '개 id 확인';
  });

  st('analysisData 추출 문서 동기화(docs/qa-original-analysis-data.json)', () => {
    assert(existsSync(ANALYSIS_DOC), '문서가 없습니다 — tools/extract-qa-analysis.mjs 를 먼저 실행하세요.');
    const doc = JSON.parse(readFileSync(ANALYSIS_DOC, 'utf8'));
    assert(Array.isArray(doc.profiles) && doc.profiles.length === 12, 'QA01~12 12건이 아닙니다.');
    const engine = loadEngine();
    let checked = 0;
    doc.profiles.forEach((p) => {
      const f = { id: p.id, birth: p.input };
      const ctx = buildContext(engine, f);
      const same = JSON.stringify(ctx.analysis) === JSON.stringify(p.analysisData);
      assert(same, p.id + ' analysisData 가 엔진 결과와 다릅니다.');
      checked += 1;
    });
    return checked + '건 일치';
  });

  st('단가 계산 (입력 1M + 출력 1M)', () => {
    const c = costOf({ input_tokens: 1000000, output_tokens: 1000000 }, 'claude-opus-5-5');
    assert(Math.abs(c.usd - (PRICING['claude-opus-5-5'].input + PRICING['claude-opus-5-5'].output)) < 1e-6, 'USD 합이 단가표와 다릅니다: ' + c.usd);
    assert(c.krw === Math.round(c.usd * FX_KRW_PER_USD), 'KRW 환산이 다릅니다.');
    return formatUsd(c.usd) + ' / ₩' + c.krw;
  });

  st('프롬프트 JSON 직렬화', () => {
    const p = userPrompt('D', probeCtx, { pool: probePoolD });
    const parsed = JSON.parse(p);
    assert(parsed.analysisData && parsed.knowledgeBase && parsed.evidenceRefs.length, 'D 프롬프트에 analysisData·KB·근거가 빠졌습니다.');
    ['B', 'C', 'E'].forEach((arm) => {
      const q = JSON.parse(userPrompt(arm, probeCtx, { pool: evidencePool(probeCtx, arm, kbList), draftDoc: arm === 'E' ? ruleDoc(probeCtx) : null }));
      assert(Array.isArray(q.sections) && q.sections.length === 8, arm + ' 섹션 과제가 8개가 아닙니다.');
    });
    return 'B/C/D/E 8섹션 · 근거 ' + probePoolD.size + '개';
  });

  st('B 는 analysisData 를 받지 않는다', () => {
    const q = JSON.parse(userPrompt('B', probeCtx, { pool: probePoolB }));
    assert(!q.analysisData && !q.period && !q.knowledgeBase, 'B 프롬프트에 analysisData/period/KB 가 들어갔습니다.');
    const c = JSON.parse(userPrompt('C', probeCtx, { pool: probePoolC }));
    assert(c.analysisData && !c.knowledgeBase, 'C 프롬프트 경계가 틀렸습니다.');
    const d = JSON.parse(userPrompt('D', probeCtx, { pool: probePoolD }));
    assert(d.knowledgeBase, 'D 프롬프트에 KB 가 없습니다.');
    return 'B=명식만 · C=+analysis · D=+KB';
  });

  st('예산 가드 — max-calls 를 넘기면 호출하지 않는다', () => {
    const b = createBudget({ maxCalls: 2 });
    assert(b.canCall(), '첫 호출이 막혔습니다.');
    b.spend(0); assert(b.canCall(), '두 번째 호출이 막혔습니다.');
    b.spend(0); assert(!b.canCall(), '세 번째 호출이 허용됐습니다.');
    assert(b.state.exceeded === 'max-calls', '초과 사유가 기록되지 않았습니다.');
    const c = createBudget({ maxUsd: 1 });
    c.spend(1.2);
    assert(!c.canCall() && c.state.exceeded === 'max-cost-usd', '비용 상한이 동작하지 않습니다.');
    return 'max-calls · max-cost-usd 동작';
  });

  /* 비동기 자기시험 — 재시도 */
  try {
    const stride = { n: 0 };
    const res = await runArm({
      arm: 'C', ctx: probeCtx, pool: probePoolC, policy: POLICY, maxRetries: 1, model: 'stub-C',
      callFn: ({ attempt }) => {
        stride.n = attempt;
        const doc = stubDoc('C', probeCtx, { pool: probePoolC });
        if (attempt === 1) doc.sections[0].paragraphs[0].evidenceRefs = [];   // 일부러 위반
        return { doc, usage: estimateUsage('x', 'y'), ms: 1, model: 'stub-C', estimated: true };
      }
    });
    assert(res.attempts === 2, '재시도 횟수가 2가 아닙니다: ' + res.attempts);
    assert(res.ok, '재시도 후에도 통과하지 못했습니다: ' + (res.validation ? res.validation.violations.map((x) => x.rule).join(',') : ''));
    assert(res.records.length === 2 && res.records[0].ok === false, '첫 시도 실패 기록이 없습니다.');
    selfTests.push({ name: '재시도 — 피드백을 붙여 한 번 더 부르고 통과', ok: true, detail: '2회 시도 · 1회 반려' });
  } catch (e) {
    selfTests.push({ name: '재시도 — 피드백을 붙여 한 번 더 부르고 통과', ok: false, detail: e.message });
  }

  st('스키마 검사기 — 8섹션 그릇', () => {
    const good = stubDoc('C', probeCtx, { pool: probePoolC });
    assert(checkSchema(good).length === 0, checkSchema(good).join(', '));
    const bad = JSON.parse(JSON.stringify(good));
    bad.sections.pop();
    assert(checkSchema(bad).length > 0, '섹션 누락을 잡지 못했습니다.');
    return '통과 문서 1 · 누락 문서 반려';
  });

  /* ---------------- 집계 ---------------- */
  const agg = {};
  arms.forEach((k) => { agg[k] = aggregate(rows.filter((r) => r.arm === k)); });
  const costSummary = summarize(rows.flatMap((r) => (r.records || [])));

  /* ---------------- 블라인드 패키지 ---------------- */
  const blindItems = rows.filter((r) => r.doc).map((r) => ({
    ctx: r.ctx, arm: r.arm, doc: r.doc, validation: r.validation, metrics: r.metrics,
    attempts: r.attempts, records: r.records, prompt: r.prompt, settings: r.settings,
    model: r.model, engine: r.engine, label: r.label, inputBoundary: r.inputBoundary
  }));
  const built = buildBlind({ runId, createdAt, items: blindItems, seed: BLIND_SEED, name: POLICY.name });
  const blindDir = writeBlind(outDir, built);
  const blindText = JSON.stringify(built.pkg);
  st('블라인드 패키지 — 실험군 이름·모델명이 새지 않는다', () => {
    const leaks = ['"arm"', 'stub-A', 'stub-B', 'stub-C', 'stub-D', 'stub-E', 'ai-a', 'ai-b', 'ai-c', 'ai-d', 'ai-e', '"engine"'];
    const found = leaks.filter((w) => blindText.indexOf(w) >= 0);
    assert(!found.length, '패키지에 샌 것: ' + found.join(', '));
    assert(!blindText.includes('민지'), '패키지에 실명이 남았습니다.');
    assert(blindText.indexOf('critique') < 0, '패키지에 E 의 비평 기록이 남았습니다(블라인드 깨짐).');
    assert(blindText.indexOf('"draft"') < 0, '패키지에 D 초안이 남았습니다.');
    const ranArms = Array.from(new Set(blindItems.map((it) => it.arm)));
    assert(Object.keys(built.key.mapping).length === ranArms.length, '키 매핑 수가 실행된 실험군 수와 다릅니다.');
    return 'Model-1~' + Object.keys(built.key.mapping).length + ' · 키 분리';
  });

  /* ---------------- 산출물 ---------------- */
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'docs.json'), JSON.stringify(rows.map((r) => ({ fixture: r.fixture.id, arm: r.arm, doc: r.doc, attempts: r.attempts, ok: r.ok })), null, 1));
  const allRecords = rows.flatMap((r) => (r.records || []).map((x) => Object.assign({ fixture: r.fixture.id }, x)));
  writeFileSync(resolve(outDir, 'cost.json'), JSON.stringify({ summary: costSummary, records: allRecords }, null, 1));

  const run = {
    runId, mode: opt.mode + (live ? '' : (opt.mode === 'stub' ? '' : '+stub')), set: opt.set + (picked.length ? ' (' + picked.map((f) => f.id).join(',') + ')' : ''),
    model: live ? opt.model : 'stub (결정적 오프라인 응답)',
    createdAt, gateDef: GATE, agg, costSummary,
    rows, probes, selfTests, determinism,
    kbStats: Object.assign({ version: KB_VERSION, promptVersion: PROMPT_VERSION }, kbStats()),
    kbProblems: validateKB(),
    blindInfo: { dir: blindDir, map: built.map, seed: BLIND_SEED },
    budget: budget.state, skipped
  };
  writeFileSync(resolve(outDir, 'score.json'), JSON.stringify(buildScore(run), null, 1));
  const md = writeReport(outDir, run);
  console.log(md);
  console.log('\n산출물: ' + outDir);
  console.log('블라인드: ' + blindDir + ' (blind-key.json 은 평가 전 공개 금지)');
  if (budget.state.exceeded) console.log('예산/호출 상한으로 건너뜀: ' + skipped + '건 (' + budget.state.exceeded + ')');

  const probeFail = probes.filter((p) => !p.ok);
  const selfFail = selfTests.filter((t) => !t.ok);
  const gateFails = Object.keys(agg).filter((k) => !gateOf(agg[k]).pass);
  const unexpectedGate = gateFails.filter((k) => !GATE_EXEMPT[k]);
  Object.keys(agg).forEach((k) => {
    const g = gateOf(agg[k]);
    console.log(k + ' gate: ' + (g.noData ? '— (실행 없음)' : (g.pass ? 'PASS' : 'FAIL — ' + g.fails.join(', ') + (GATE_EXEMPT[k] ? ' (설계상 예상)' : ''))));
  });
  if (probeFail.length) {
    console.error('\n검증기 자기시험이 실패했습니다: ' + probeFail.map((p) => p.name).join(', '));
    process.exitCode = 1;
  }
  if (selfFail.length) {
    console.error('\n하네스 자기시험이 실패했습니다: ' + selfFail.map((t) => t.name + '(' + t.detail + ')').join(', '));
    process.exitCode = 1;
  }
  if (!determinism) {
    console.error('\n규칙 엔진이 같은 입력에 다른 출력을 냈습니다.');
    process.exitCode = 1;
  }
  if (unexpectedGate.length && opt.mode === 'stub') {
    console.error('\n스텁 게이트 예상 밖 실패: ' + unexpectedGate.join(', ') + ' — 검증기나 스텁 계약을 고쳐야 합니다.');
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
