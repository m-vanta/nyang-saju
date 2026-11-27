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
     --max-retries N      검증 실패 시 재시도 횟수(기본 1 · pilot 기본 0)
     --max-cost-usd X     누적 비용 상한. 호출 전 최대 예상 비용으로 검사해 넘으면 호출하지 않는다
     --arms A,B,C,D,E     일부 실험군만 실행
     --model <id>         기본 claude-opus-5-5
     --out <dir>          산출물 경로(기본 out/<runId>)

   파일럿 기본값 (--mode pilot, 직접 지정하지 않았을 때만)
     --max-calls 12 · --max-retries 0
     QA02·QA04·QA09 × B·C·D·E = 12회 호출 (A 는 로컬 규칙이라 API 호출 0회).
     E 는 유효한 D 초안이 없으면 호출하지 않으므로 실제 호출은 12회 이하일 수 있다.
     세션 한도·작은 비용으로 첫 실험을 끝내기 위한 값이고, 더 필요하면 명시적으로 넘긴다.

   리뷰 반영 (P0·P1)
     · B 도 명식 기본표 + 대운·세운을 받는다(P0-1-1). C/D 경계는 analysisData vs KB 하나(P0-1-2).
     · chart.* 만 인용한 문단을 일반론으로 몰지 않는다(P0-1-3). A 문단마다 콘텐츠 출처(P0-1-4).
     · 구조·참조 검증과 내용 검증을 분리해 리포트한다(P0-2-1). 자동 검증의 한계를 명시(P0-2-2).
     · 7가지 의도적 오류 + 무관 근거 probe 를 매 실행에서 확인(P0-2-3).
     · --model 전달·요청/응답 모델 기록·단가 미등록 비용 미상·호출 전 예산 차단·파싱 실패에도
       토큰/비용 기록·예외 상태 기록·E 는 유효 D 초안이 있을 때만·호출별 프롬프트/이력 보존(P0-3).
     · 블라인드 3종 분리(고객·명리·기술) + 사례별 표시 순서 무작위(P1-1).
     · full 모드는 비교쌍 3종을 반드시 포함(P1-2).

   종료 코드: 하네스·검증기 자기시험이 실패하면 1. 예산·비교쌍 설정 오류는 2.

   주의: API 비용 추정치는 사전 추정치일 뿐 절대적인 과금 상한이 아니며,
        실제 과금은 API 제공자의 청구 기준을 따른다. 이 문장은 리포트·cost.json·
        CLI 출력에도 같이 나간다(lib/cost.mjs COST_ESTIMATE_DISCLAIMER).
   ========================================================================== */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { loadEngine } from './lib/load.mjs';
import { buildContext } from './lib/readings.mjs';
import { ruleDoc } from './lib/engines/rule.mjs';
import { stubDoc, probeDocs } from './lib/engines/stub.mjs';
import { aiDoc, apiKey, MAX_TOKENS, EFFORT, requestBody, extractText, countThinkingBlocks, REJECTED_SAMPLING_PARAMS } from './lib/engines/ai.mjs';
import { shouldAbortOn, abortInfo, notAttemptedRow, NOT_ATTEMPTED, COMMON_CONFIG_ERROR_STATUSES } from './lib/abort.mjs';
import { evidencePool, ARMS, ARM_KEYS } from './lib/facts.mjs';
import { validate } from './lib/validate.mjs';
import { measure, aggregate, successStage } from './lib/metrics.mjs';
import { judge } from './lib/judge.mjs';
import { runArm, createBudget } from './lib/retry.mjs';
import { buildScore, writeReport } from './lib/report.mjs';
import { gateOf, GATE, GATE_EXEMPT } from './lib/gates.mjs';
import { buildBlind, writeBlind, BLIND_SEED } from './lib/blind-export.mjs';
import { KB_EVIDENCE, kbStats, validateKB, KB_VERSION } from './lib/knowledge-base.mjs';
import { promptMeta, userPrompt, PROMPT_VERSION } from './lib/prompts.mjs';
import {
  estimateUsage, summarize, DEFAULT_MODEL, PRICING, FX_KRW_PER_USD, costOf, costRecord,
  formatUsd, estimateMaxUsd, COST_ESTIMATE_DISCLAIMER
} from './lib/cost.mjs';
import { checkSchema } from './lib/schema.mjs';
import { COMPARISON_PAIRS, missingPairs, pairChecks } from './lib/pairs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(HERE, '../..');
const KB_DOC = resolve(APP_DIR, 'docs/myeongri-knowledge-base.md');
const ANALYSIS_DOC = resolve(APP_DIR, 'docs/qa-original-analysis-data.json');

/* 모든 AI 실험군(B·C·D·E) 공통 설정 — temperature 는 보내지 않는다(Opus 5.5 는 400). */
const SETTINGS = { effort: EFFORT, maxTokens: MAX_TOKENS };
const RUN_SETTINGS = {
  modelEnv: process.env.NYANG_COMPARE_MODEL || null,
  effort: EFFORT,
  maxTokens: MAX_TOKENS,
  anthropicVersion: '2026-10-21',
  samplingParams: 'temperature·top_p·top_k 전송 안 함 (Opus 5.5 는 보내면 HTTP 400)',
  thinking: 'adaptive 항상 켜짐 · 응답은 type==="text" 블록만 읽음 · max_tokens 는 thinking+본문 합산',
  truncation: 'stop_reason:max_tokens 는 잘림으로 기록하고 성공·유효 초안으로 세지 않는다',
  abortRemaining: '첫 실호출이 HTTP ' + COMMON_CONFIG_ERROR_STATUSES.join('/') + ' 로 실패하면 남은 호출 중단 · 미시도는 ' + NOT_ATTEMPTED
};

function args(argv) {
  const out = {
    mode: 'stub', set: null, fixtures: null, arms: ARM_KEYS.slice(),
    maxCalls: 0, maxRetries: 1, maxCostUsd: 0, model: DEFAULT_MODEL, out: null, stub: false,
    given: { maxCalls: false, maxRetries: false }
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mode') out.mode = argv[++i];
    else if (a === '--set') out.set = argv[++i];
    else if (a === '--fixtures') out.fixtures = argv[++i];
    else if (a === '--arms') out.arms = String(argv[++i]).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    else if (a === '--max-calls') { out.maxCalls = Number(argv[++i]); out.given.maxCalls = true; }
    else if (a === '--max-retries') { out.maxRetries = Number(argv[++i]); out.given.maxRetries = true; }
    else if (a === '--max-cost-usd') out.maxCostUsd = Number(argv[++i]);
    else if (a === '--model') out.model = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--stub') out.stub = true;
    else if (a === '--help' || a === '-h') { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]); process.exit(0); }
  }
  if (!out.set) out.set = out.mode === 'pilot' ? 'pilot' : 'all';
  return out;
}

/* 파일럿 기본 안전장치 — 직접 지정하지 않았을 때만 적용한다.
   QA02·QA04·QA09 × B·C·D·E = 12회 호출, 재시도 0회. A 는 로컬 규칙(API 호출 0회). */
export const PILOT_DEFAULTS = { maxCalls: 12, maxRetries: 0 };

export function applySafetyDefaults(opt) {
  const applied = [];
  if (opt.mode !== 'pilot') return { maxCalls: opt.maxCalls, maxRetries: opt.maxRetries, applied };
  if (!opt.given || !opt.given.maxCalls) { opt.maxCalls = PILOT_DEFAULTS.maxCalls; applied.push('--max-calls ' + PILOT_DEFAULTS.maxCalls); }
  if (!opt.given || !opt.given.maxRetries) { opt.maxRetries = PILOT_DEFAULTS.maxRetries; applied.push('--max-retries ' + PILOT_DEFAULTS.maxRetries); }
  return { maxCalls: opt.maxCalls, maxRetries: opt.maxRetries, applied };
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

/* E 는 유효한(성공·파싱·유효성 확인) D 초안이 있을 때만 돈다(리뷰 P0-3-7). */
function eSkipReason(state) {
  const s = state || {};
  if (!s.hasD) return 'skipped_no_d';
  if (!s.dOk) return 'skipped_no_valid_d' + (s.dError ? ':' + s.dError : '');
  return null;
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

  /* 전체 실험은 비교쌍 3종을 반드시 포함한다(리뷰 P1-2) */
  const missing = (opt.set === 'all') ? missingPairs(picked.map((f) => f.id)) : [];
  if (missing.length) {
    console.error('전체 실험(--set all)에 비교쌍 픽스처가 빠졌습니다: ' + missing.join(', '));
    COMPARISON_PAIRS.forEach((p) => console.error('  · ' + p.id + ' ' + p.axis + ' → ' + p.fixtures.join('·')));
    process.exit(2);
  }

  const arms = opt.arms.filter((a) => ARM_KEYS.indexOf(a) >= 0).sort((a, b) => ARM_KEYS.indexOf(a) - ARM_KEYS.indexOf(b));
  const safetyApplied = applySafetyDefaults(opt);
  const safety = {
    mode: opt.mode,
    set: opt.set,
    maxCalls: opt.maxCalls,
    maxRetries: opt.maxRetries,
    maxCostUsd: opt.maxCostUsd,
    defaulted: safetyApplied.applied,
    plannedCallRule: 'QA02·QA04·QA09 × B·C·D·E = 12회 (A 는 로컬 규칙 · API 호출 0회)',
    costDisclaimer: COST_ESTIMATE_DISCLAIMER
  };
  const runId = stamp();
  const outDir = resolve(opt.out || resolve(HERE, 'out/' + runId));
  const createdAt = new Date().toISOString();
  const kbList = { entries: KB_EVIDENCE };

  const budget = createBudget({ maxCalls: opt.maxCalls, maxUsd: opt.maxCostUsd });
  if (opt.mode === 'pilot') {
    console.log('파일럿 안전장치: --max-calls ' + opt.maxCalls + ' · --max-retries ' + opt.maxRetries +
      (safetyApplied.applied.length ? ' (기본값 적용: ' + safetyApplied.applied.join(' · ') + ')' : ' (직접 지정)') +
      ' — ' + safety.plannedCallRule);
  }
  const rows = [];
  const contexts = new Map();
  const callLog = [];
  let determinism = true;
  let skipped = 0;
  /* 첫 실호출이 공통 설정 오류(HTTP 400·401·403·404)로 실패하면 채운다 — 이후 요청은 보내지 않는다. */
  let abort = null;

  mkdirSync(outDir, { recursive: true });
  mkdirSync(resolve(outDir, 'calls'), { recursive: true });

  /* ---------------- 호출 전 최대 예상 비용(실행 전) ---------------- */
  let preflight = null;
  if (opt.maxCostUsd > 0) {
    let total = 0;
    let unknown = false;
    let planned = 0;
    for (const fixture of picked) {
      let ctx;
      try { ctx = buildContext(E, fixture); } catch (e) { continue; }
      ctx.policy = POLICY;
      for (const arm of arms) {
        if (arm === 'A') continue;
        const pool = evidencePool(ctx, arm, kbList);
        const pm = promptMeta(arm, ctx, { pool, draftDoc: null });
        const est = estimateMaxUsd({ promptText: pm.system + pm.user, maxTokens: SETTINGS.maxTokens, model: opt.model });
        planned += 1 + Math.max(0, opt.maxRetries);
        if (est.usd === null) unknown = true;
        else total += est.usd * (1 + Math.max(0, opt.maxRetries));
      }
    }
    preflight = {
      usd: unknown ? null : Math.round(total * 1e6) / 1e6,
      maxUsd: opt.maxCostUsd,
      plannedCalls: planned,
      model: opt.model,
      note: '프롬프트 입력 토큰 추정 + max_tokens 전량 출력 가정 × (1+재시도). E 의 초안 포함 프롬프트는 더 클 수 있다.'
    };
    if (unknown || (preflight.usd !== null && preflight.usd > opt.maxCostUsd)) {
      preflight.blocked = true;
      preflight.reason = unknown ? 'unknown-pricing' : 'max-cost-usd';
      console.error('호출 전 최대 예상 비용이 예산을 넘습니다: ' + (unknown ? '단가 미등록' : formatUsd(preflight.usd)) +
        ' > ' + formatUsd(opt.maxCostUsd) + ' — 호출하지 않고 중단합니다.');
      writeFileSync(resolve(outDir, 'preflight.json'), JSON.stringify(preflight, null, 1));
      process.exit(2);
    }
  }

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
    let dAttempted = false;
    let dOk = false;
    let dError = null;

    for (const arm of arms) {
      const pool = evidencePool(ctx, arm, kbList);
      const base = { fixture, arm, ctx, pool };

      /* 공통 설정 오류로 중단한 뒤 — 보내지 않은 요청은 notAttempted 로 남긴다 */
      if (abort) {
        skipped += 1;
        rows.push(Object.assign(base, Object.assign(notAttemptedRow(abort), {
          doc: null, validation: null, metrics: null,
          engine: arm === 'A' ? 'rule' : 'ai-' + arm.toLowerCase(), model: arm === 'A' ? null : opt.model,
          responseModel: null, label: ARMS[arm].label,
          inputBoundary: ARMS[arm].inputs.join('+'), settings: arm === 'A' ? { effort: null, maxTokens: null } : SETTINGS, prompt: null
        })));
        continue;
      }

      if (arm === 'A') {
        const doc = ruleDoc(ctx, pool);
        const validation = validate(doc, ctx, { arm, pool, policy: POLICY });
        const j = await judge(doc, ctx, validation, { mode: 'stub', arm });
        const metrics = measure(doc, ctx, validation, pool, j.score);
        rows.push(Object.assign(base, {
          doc, validation, metrics, attempts: 0, records: [], ok: validation.violations.length === 0,
          engine: 'rule', model: null, responseModel: null, label: ARMS.A.label,
          inputBoundary: 'chart+analysis+findings+period',
          contentOrigin: doc.meta && doc.meta.contentOrigin ? {
            bySection: doc.meta.contentOrigin,
            byParagraph: doc.meta.contentOriginParagraphs,
            definitions: doc.meta.contentOriginDefinitions
          } : null,
          settings: { effort: null, maxTokens: null }, prompt: null
        }));
        continue;
      }

      /* E 는 유효한 D 초안이 있을 때만 */
      if (arm === 'E') {
        const reason = eSkipReason({ hasD: dAttempted, dOk, dError });
        if (reason) {
          skipped += 1;
          rows.push(Object.assign(base, {
            doc: null, validation: null, metrics: null, attempts: 0, records: [],
            ok: false, skipped: reason, engine: 'ai-e', model: opt.model, responseModel: null,
            label: ARMS.E.label, inputBoundary: ARMS[arm].inputs.join('+'), settings: SETTINGS, prompt: null
          }));
          continue;
        }
      }

      if (!budget.canCall()) {
        skipped += 1;
        rows.push(Object.assign(base, {
          doc: null, validation: null, metrics: null, attempts: 0, records: [],
          ok: false, skipped: 'budget:' + (budget.state.exceeded || 'blocked'),
          engine: 'ai-' + arm.toLowerCase(), model: opt.model, responseModel: null,
          label: ARMS[arm].label, inputBoundary: ARMS[arm].inputs.join('+'), settings: SETTINGS, prompt: null
        }));
        continue;
      }

      const prompt = promptMeta(arm, ctx, { pool, draftDoc: arm === 'E' ? draftD : null });
      const promptFile = 'calls/' + fixture.id + '-' + arm + '-a{attempt}.json';
      let callFn;

      if (live) {
        callFn = async ({ attempt, feedback }) => {
          const entry = {
            fixture: fixture.id, arm, attempt, live: true,
            requestedModel: opt.model, effort: EFFORT, maxTokens: SETTINGS.maxTokens,
            promptHash: prompt.hash,
            promptSystem: prompt.system, promptUser: prompt.user,
            feedback: feedback || []
          };
          try {
            const r = await aiDoc(arm, ctx, {
              pool, draftDoc: arm === 'E' ? draftD : null, feedback, key, dir: APP_DIR,
              effort: EFFORT, model: opt.model, maxTokens: SETTINGS.maxTokens, prompt
            });
            Object.assign(entry, {
              ok: true, usage: r.usage, responseModel: r.responseModel, ms: r.ms,
              stopReason: r.stopReason, truncated: r.truncated, httpStatus: r.httpStatus,
              thinkingBlocks: r.thinkingBlocks == null ? null : r.thinkingBlocks,
              /* 성공 응답도 전문을 남긴다 — 요약·절단은 실패 원인을 숨긴다 */
              rawText: String(r.rawText || ''),
              rawTextPreview: String(r.rawText || '').slice(0, 1200)
            });
            callLog.push(entry);
            return r;
          } catch (e) {
            Object.assign(entry, {
              ok: false, errorType: e.errorType, httpStatus: e.httpStatus == null ? null : e.httpStatus,
              usage: e.usage || null, responseModel: e.responseModel || null, ms: e.ms || 0,
              stopReason: e.stopReason || null, truncated: !!e.truncated, message: e.message,
              rawTextPreview: e.rawText ? String(e.rawText).slice(0, 1200) : null,
              /* 실패·잘림 응답은 원문 전문과 파싱된 부분 객체를 자르지 않고 보존한다 */
              rawText: e.rawText ? String(e.rawText) : null,
              partialDoc: e.partialDoc || null,
              parseError: e.parseError || null
            });
            callLog.push(entry);
            throw e;
          }
        };
      } else {
        callFn = ({ attempt }) => {
          const doc = stubDoc(arm, ctx, { pool, draftDoc: arm === 'E' ? draftD : null, attempt });
          const usage = estimateUsage(prompt.system + prompt.user, JSON.stringify(doc));
          const entry = {
            fixture: fixture.id, arm, attempt, live: false,
            requestedModel: opt.model, responseModel: opt.model, promptHash: prompt.hash,
            promptSystem: prompt.system, promptUser: prompt.user, feedback: [],
            ok: true, usage, ms: 0, stopReason: 'end_turn', truncated: false, httpStatus: null,
            rawText: JSON.stringify(doc), rawTextPreview: JSON.stringify(doc).slice(0, 1200)
          };
          callLog.push(entry);
          return { doc, usage, ms: 0, requestedModel: opt.model, responseModel: opt.model, model: opt.model, estimated: true };
        };
      }

      const res = await runArm({
        arm, ctx, pool, policy: POLICY, callFn,
        maxRetries: opt.maxRetries, budget, model: opt.model,
        effort: EFFORT, maxTokens: SETTINGS.maxTokens,
        prompt: prompt.system + prompt.user,
        promptHash: prompt.hash,
        promptFile,
        estimateUsd: (attempt) => {
          const est = estimateMaxUsd({ promptText: prompt.system + prompt.user, maxTokens: SETTINGS.maxTokens, model: opt.model });
          return { usd: est.usd, inputTokens: est.inputTokens, maxOutputTokens: est.maxOutputTokens, attempt };
        }
      });

      /* 첫 실호출이 공통 설정 오류(HTTP 400·401·403·404)면 남은 호출을 멈춘다. */
      if (!abort && shouldAbortOn(res.error)) {
        abort = abortInfo(res.error);
        console.error('\n공통 설정 오류로 중단합니다 — HTTP ' + abort.httpStatus + ' (' + (abort.errorType || 'http') + '): ' +
          (abort.message || '').slice(0, 200));
        console.error('  · 남은 요청은 보내지 않고 ' + NOT_ATTEMPTED + ' 로 기록합니다. 요청 파라미터·키·모델을 확인한 뒤 다시 실행하세요.');
      }

      /* 호출 이력에 그 시도의 검증 결과·비용을 붙인다 */
      (res.records || []).forEach((rec) => {
        const entry = callLog.filter((c) => c.fixture === fixture.id && c.arm === arm && c.attempt === rec.attempt).slice(-1)[0];
        if (!entry) return;
        entry.cost = { usd: rec.usd, krw: rec.krw, pricingKnown: rec.pricingKnown, costStatus: rec.costStatus };
        entry.validation = { ok: rec.ok, violations: rec.violations, phase: rec.phase };
      });

      if (arm === 'D') {
        dAttempted = true;
        dOk = !!res.ok;
        draftD = res.ok ? res.doc : null;
        dError = res.ok ? null : (res.error && res.error.errorType) || (res.stopped || 'invalid');
      }

      const doc = res.doc;
      if (!doc) {
        skipped += 1;
        rows.push(Object.assign(base, {
          doc: null, validation: null, metrics: null, attempts: res.attempts || 0, records: res.records || [],
          ok: false, stopped: res.stopped || 'no_doc', error: res.error || null,
          budgetBlocked: res.budgetBlocked || null,
          /* 문서가 없어도 원문·부분 파싱 객체를 버리지 않는다(JSON 파싱 실패·잘림) */
          rawText: (res.error && res.error.rawText) || null,
          partialDoc: (res.error && res.error.partialDoc) || null,
          truncated: !!(res.error && res.error.truncated),
          engine: 'ai-' + arm.toLowerCase(), model: opt.model, responseModel: null,
          label: ARMS[arm].label, inputBoundary: ARMS[arm].inputs.join('+'), settings: SETTINGS, prompt
        }));
        continue;
      }

      const validation = res.validation || validate(doc, ctx, { arm, pool, policy: POLICY });
      const j = await judge(doc, ctx, validation, { mode: 'stub', arm });
      const metrics = measure(doc, ctx, validation, pool, j.score);
      const lastRec = (res.records || []).filter((r) => r.phase !== 'blocked').slice(-1)[0] || null;
      rows.push(Object.assign(base, {
        doc, validation, metrics, attempts: res.attempts, records: res.records || [],
        ok: res.ok, stopped: res.stopped || null, error: res.error || null, budgetBlocked: res.budgetBlocked || null,
        engine: (doc && doc.engine) || ('ai-' + arm.toLowerCase()),
        model: opt.model, responseModel: lastRec ? lastRec.responseModel : null,
        label: ARMS[arm].label, inputBoundary: ARMS[arm].inputs.join('+'),
        settings: SETTINGS, prompt, truncated: !!(lastRec && lastRec.truncated)
      }));
    }
  }

  /* 호출별 프롬프트·이력 보존 (리뷰 P0-3-8) */
  const callIndex = [];
  callLog.forEach((c) => {
    const file = 'calls/' + c.fixture + '-' + c.arm + '-a' + c.attempt + '.json';
    const record = {
      fixture: c.fixture, arm: c.arm, attempt: c.attempt, live: c.live,
      requestedModel: c.requestedModel, responseModel: c.responseModel || null,
      /* 실제 요청 설정 — 모든 AI 실험군 동일(모델·effort·max_tokens). 샘플링 파라미터는 보내지 않는다. */
      request: {
        model: c.requestedModel,
        max_tokens: c.maxTokens == null ? SETTINGS.maxTokens : c.maxTokens,
        output_config: { effort: c.effort || EFFORT },
        samplingParamsSent: []
      },
      promptHash: c.promptHash, feedback: c.feedback,
      prompt: { system: c.promptSystem, user: c.promptUser },
      result: {
        ok: c.ok, errorType: c.errorType || null, httpStatus: c.httpStatus == null ? null : c.httpStatus,
        stopReason: c.stopReason || null, truncated: !!c.truncated, ms: c.ms || 0,
        usage: c.usage || null, message: c.message || null,
        thinkingBlocks: c.thinkingBlocks == null ? null : c.thinkingBlocks,
        /* 성공·실패 모두 응답 전문을 남긴다(잘림·파싱 실패·검증 실패도 절단하지 않는다) */
        rawText: c.rawText || null, rawTextPreview: c.rawTextPreview || null,
        partialDoc: c.partialDoc || null, parseError: c.parseError || null,
        cost: c.cost || null, validation: c.validation || null
      }
    };
    writeFileSync(resolve(outDir, file), JSON.stringify(record, null, 1), 'utf8');
    callIndex.push({
      fixture: c.fixture, arm: c.arm, attempt: c.attempt, file,
      ok: c.ok, errorType: c.errorType || null, httpStatus: c.httpStatus == null ? null : c.httpStatus,
      stopReason: c.stopReason || null, truncated: !!c.truncated,
      inputTokens: c.usage ? c.usage.input_tokens : 0, outputTokens: c.usage ? c.usage.output_tokens : 0,
      requestedModel: c.requestedModel, responseModel: c.responseModel || null,
      costUsd: c.cost ? c.cost.usd : null, pricingKnown: c.cost ? c.cost.pricingKnown : null,
      validation: c.validation || null
    });
  });
  writeFileSync(resolve(outDir, 'calls/index.json'), JSON.stringify(callIndex, null, 1), 'utf8');

  /* ---------------- 검증기 자기시험 ---------------- */
  const probeCtx = contexts.get(picked[0].id) || Array.from(contexts.values())[0];
  const poolFor = (c, arm) => evidencePool(c, arm, kbList);
  const probeSet = probeDocs(probeCtx, poolFor(probeCtx, 'C'), { ctxs: contexts, kb: kbList, poolFor });
  const probes = [];
  Object.keys(probeSet).forEach((name) => {
    const entry = probeSet[name];
    const c = entry.ctxOverride || probeCtx;
    const arm = entry.arm || 'C';
    const pool = entry.poolOverride || poolFor(c, arm);
    const v = validate(entry.doc, c, { arm, pool, policy: POLICY });
    const caught = Array.from(new Set(v.violations.map((x) => x.rule)));
    const ok = entry.expect ? caught.indexOf(entry.expect) >= 0 : caught.length === 0;
    probes.push({ name, expect: entry.expect || '무위반', caught, ok, note: entry.note || null });
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
    const missingIds = KB_EVIDENCE.filter((e) => text.indexOf(e.id) < 0).map((e) => e.id);
    assert(!missingIds.length, '문서에 없는 항목: ' + missingIds.join(', '));
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

  st('단가 미등록 모델 — 0원으로 계산하지 않는다', () => {
    const c = costOf({ input_tokens: 1000000, output_tokens: 1000 }, 'ghost-model-9');
    assert(c.usd === null && c.krw === null, '미등록 모델 비용이 숫자로 나왔습니다: ' + c.usd);
    assert(c.pricingKnown === false && c.costStatus === 'unknown_pricing', 'pricingKnown/costStatus 가 틀렸습니다.');
    const rec = costRecord({ arm: 'X', fixture: 'T', usage: { input_tokens: 10, output_tokens: 10 }, requestedModel: 'ghost-model-9' });
    const s = summarize([rec]);
    assert(s.totalUsd === null, '합계가 0원으로 보고됐습니다.');
    assert(s.unknownPricingCalls === 1, '미상 호출 수가 기록되지 않았습니다.');
    return 'usd=null · costStatus=unknown_pricing · 합계 미상';
  });

  st('호출 전 예산 가드 — 예상 초과·단가 미등록이면 호출하지 않는다', () => {
    const b1 = createBudget({ maxUsd: 1 });
    const c1 = b1.checkEstimate(1.5);
    assert(!c1.ok && c1.reason === 'max-cost-usd', '예상 초과를 막지 못했습니다.');
    const b2 = createBudget({ maxUsd: 1 });
    const c2 = b2.checkEstimate(null);
    assert(!c2.ok && c2.reason === 'unknown-pricing', '단가 미등록을 막지 못했습니다.');
    const b3 = createBudget({ maxUsd: 1 });
    assert(b3.checkEstimate(0.4).ok, '예산 안쪽 호출을 막았습니다.');
    return '초과·미등록 차단 · 예산 안쪽 허용';
  });

  st('프롬프트 JSON 직렬화', () => {
    const p = userPrompt('D', probeCtx, { pool: poolFor(probeCtx, 'D') });
    const parsed = JSON.parse(p);
    assert(parsed.analysisData && parsed.knowledgeBase && parsed.evidenceRefs.length, 'D 프롬프트에 analysisData·KB·근거가 빠졌습니다.');
    ['B', 'C', 'E'].forEach((arm) => {
      const q = JSON.parse(userPrompt(arm, probeCtx, { pool: poolFor(probeCtx, arm), draftDoc: arm === 'E' ? ruleDoc(probeCtx, poolFor(probeCtx, 'A')) : null }));
      assert(Array.isArray(q.sections) && q.sections.length === 8, arm + ' 섹션 과제가 8개가 아닙니다.');
    });
    return 'B/C/D/E 8섹션 · 근거 ' + poolFor(probeCtx, 'D').size + '개';
  });

  st('B 는 analysisData·KB 없이 명식+대운·세운을 받는다', () => {
    const b = JSON.parse(userPrompt('B', probeCtx, { pool: poolFor(probeCtx, 'B') }));
    assert(!b.analysisData, 'B 프롬프트에 analysisData 가 들어갔습니다.');
    assert(!b.knowledgeBase, 'B 프롬프트에 knowledgeBase 가 들어갔습니다.');
    assert(b.period && b.period.seun, 'B 프롬프트에 대운·세운이 없습니다.');
    const refs = b.evidenceRefs.map((x) => x.ref);
    assert(refs.length && refs.every((r) => r.indexOf('chart.') === 0 || r.indexOf('period.') === 0), 'B 근거에 analysis/KB 가 섞였습니다.');
    const c = JSON.parse(userPrompt('C', probeCtx, { pool: poolFor(probeCtx, 'C') }));
    assert(c.analysisData && !c.knowledgeBase, 'C 프롬프트 경계가 틀렸습니다.');
    return 'B=chart+period(' + refs.length + ') · C=+analysis';
  });

  st('C·D 경계 — D 는 C + knowledgeBase 뿐', () => {
    const c = JSON.parse(userPrompt('C', probeCtx, { pool: poolFor(probeCtx, 'C') }));
    const d = JSON.parse(userPrompt('D', probeCtx, { pool: poolFor(probeCtx, 'D') }));
    assert(d.knowledgeBase && !c.knowledgeBase, 'D 에만 knowledgeBase 가 있어야 합니다.');
    delete c.knowledgeBase; delete d.knowledgeBase;
    delete c.arm; delete d.arm;
    c.evidenceRefs = []; d.evidenceRefs = [];
    assert(JSON.stringify(c) === JSON.stringify(d), 'C/D 차이가 knowledgeBase 외에 있습니다.');
    return 'analysisData·period 동일 · KB 만 추가';
  });

  st('E 실행 조건 — 유효한 D 초안이 없으면 건너뛴다', () => {
    assert(eSkipReason({ hasD: false, dOk: false }) === 'skipped_no_d', 'D 미실행인데 E 사유가 없습니다.');
    assert(/^skipped_no_valid_d/.test(eSkipReason({ hasD: true, dOk: false, dError: 'json_parse' })), 'D 실패인데 E 사유가 없습니다.');
    assert(eSkipReason({ hasD: true, dOk: true }) === null, '유효한 D 인데 E 가 막힙니다.');
    return 'skipped_no_d · skipped_no_valid_d · 통과';
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

  st('파일럿 기본 안전장치 — 직접 지정하지 않으면 12회·재시도 0회', () => {
    const a = applySafetyDefaults({ mode: 'pilot', maxCalls: 0, maxRetries: 1, given: {} });
    assert(a.maxCalls === 12, '파일럿 기본 최대 호출이 12가 아닙니다: ' + a.maxCalls);
    assert(a.maxRetries === 0, '파일럿 기본 재시도가 0이 아닙니다: ' + a.maxRetries);
    assert(a.applied.length === 2, '적용한 기본값이 기록되지 않았습니다.');
    const b = applySafetyDefaults({ mode: 'pilot', maxCalls: 30, maxRetries: 1, given: { maxCalls: true, maxRetries: true } });
    assert(b.maxCalls === 30 && b.maxRetries === 1, '직접 지정한 값을 덮어썼습니다: ' + b.maxCalls + '/' + b.maxRetries);
    const c = applySafetyDefaults({ mode: 'full', maxCalls: 0, maxRetries: 1, given: {} });
    assert(c.maxCalls === 0 && c.maxRetries === 1, '파일럿이 아닌 모드에 기본값을 적용했습니다.');
    return 'pilot 12/0 · 명시 지정 유지 · full 무변경';
  });

  st('품질·성공률 집계 — 실패·스킵을 요청 모수에서 빼지 않는다', () => {
    const metricRow = (ok) => ({ metrics: { ea1: 1, ea2: 1, ca: null, caHit: 0, caTotal: 0, hz: 0, ga: 0, sc: 0, cr: 0, gn: 0, gnChartOnly: 0, kb: 0, judge: 5, violations: 0, warnings: 0, sectionsOk: 8, sectionsUnavailable: 0 }, ok });
    const rows = [
      Object.assign(metricRow(true), { arm: 'C', attempts: 1 }),
      Object.assign(metricRow(true), { arm: 'C', attempts: 2 }),          // 재시도로 성공
      Object.assign(metricRow(false), { arm: 'C', attempts: 2 }),         // 최종 실패 + 문서 있음
      { arm: 'C', attempts: 0, ok: false, skipped: 'skipped_no_d', doc: null }  // 미시도
    ];
    const m = aggregate(rows);
    assert(m.requestedCount === 4, '요청 건수가 4가 아닙니다: ' + m.requestedCount);
    assert(m.attemptedCount === 3 && m.notAttemptedCount === 1, '시도/미시도 집계가 틀렸습니다.');
    assert(m.firstAttemptSuccess === 1, '1차 성공이 1이 아닙니다: ' + m.firstAttemptSuccess);
    assert(Math.abs(m.firstAttemptSuccessRate - 0.25) < 1e-9, '1차 성공률 모수가 요청 건수가 아닙니다: ' + m.firstAttemptSuccessRate);
    assert(m.retriedSuccess === 1 && m.finalSuccess === 2, '재시도 후 성공 집계가 틀렸습니다.');
    assert(m.finalFailure === 2 && Math.abs(m.finalFailureRate - 0.5) < 1e-9, '최종 실패율이 틀렸습니다: ' + m.finalFailureRate);
    assert(m.qualityItems === 3 && m.qualityExcluded === 1, '품질 모수(문서가 나온 응답) 집계가 틀렸습니다.');
    return '요청 4 · 1차 1(25%) · 최종 실패 2(50%) · 품질 모수 3';
  });

  st('스키마 검사기 — 8섹션 그릇', () => {    const good = stubDoc('C', probeCtx, { pool: poolFor(probeCtx, 'C') });
    assert(checkSchema(good).length === 0, checkSchema(good).join(', '));
    const bad = JSON.parse(JSON.stringify(good));
    bad.sections.pop();
    assert(checkSchema(bad).length > 0, '섹션 누락을 잡지 못했습니다.');
    return '통과 문서 1 · 누락 문서 반려';
  });

  st('비교쌍 3종 — 전체 세트에 있고 명식 조건이 맞는다', () => {
    const pc = pairChecks(contexts);
    const bad = pc.filter((p) => p.present && !p.ok);
    assert(!bad.length, '비교쌍 조건 불일치: ' + bad.map((p) => p.id + JSON.stringify(p.checks)).join(', '));
    return COMPARISON_PAIRS.map((p) => p.id + '(' + p.fixtures.join('/') + ')').join(' · ');
  });

  /* 비동기 자기시험 — 재시도 */
  try {
    const stride = { n: 0 };
    const res = await runArm({
      arm: 'C', ctx: probeCtx, pool: poolFor(probeCtx, 'C'), policy: POLICY, maxRetries: 1, model: 'stub-C',
      callFn: ({ attempt }) => {
        stride.n = attempt;
        const doc = stubDoc('C', probeCtx, { pool: poolFor(probeCtx, 'C') });
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

  /* 비동기 자기시험 — 파싱 실패에도 토큰·비용 기록 */
  try {
    const res = await runArm({
      arm: 'C', ctx: probeCtx, pool: poolFor(probeCtx, 'C'), policy: POLICY, maxRetries: 0, model: 'claude-opus-5-5',
      callFn: async () => {
        const e = new Error('JSON 파싱 실패');
        e.errorType = 'json_parse'; e.httpStatus = 200;
        e.usage = { input_tokens: 12000, output_tokens: 3000 };
        e.responseModel = 'claude-opus-5-5'; e.ms = 900;
        throw e;
      }
    });
    const rec = res.records[0];
    assert(rec && rec.usage.input_tokens === 12000 && rec.usage.output_tokens === 3000, '실패 호출의 토큰이 사라졌습니다.');
    assert(rec.usd !== null && rec.usd > 0, '실패 호출의 비용이 기록되지 않았습니다.');
    assert(rec.errorType === 'json_parse' && rec.httpStatus === 200, '오류 상태가 기록되지 않았습니다.');
    selfTests.push({ name: 'JSON 파싱 실패 — 토큰·비용·상태를 잃지 않는다', ok: true, detail: '12,000/3,000 · ' + formatUsd(rec.usd) + ' · json_parse' });
  } catch (e) {
    selfTests.push({ name: 'JSON 파싱 실패 — 토큰·비용·상태를 잃지 않는다', ok: false, detail: e.message });
  }

  st('Opus 5.5 요청 body — temperature·top_p·top_k 없음 · output_config.effort 명시', () => {
    const b = requestBody({ model: 'claude-opus-5-5', system: 's', user: 'u' });
    const banned = REJECTED_SAMPLING_PARAMS.filter((k) => Object.prototype.hasOwnProperty.call(b, k));
    assert(!banned.length, '400 을 부르는 파라미터가 body 에 있습니다: ' + banned.join(', '));
    assert(b.output_config && b.output_config.effort === 'medium', 'effort 가 medium 으로 명시되지 않았습니다: ' + JSON.stringify(b.output_config));
    assert(b.model === 'claude-opus-5-5', '모델이 다릅니다: ' + b.model);
    assert(b.max_tokens === MAX_TOKENS && MAX_TOKENS >= 12000, 'max_tokens 가 thinking+본문을 담을 만큼 크지 않습니다: ' + b.max_tokens);
    const keys = Object.keys(b).sort().join(',');
    assert(keys === 'max_tokens,messages,model,output_config,system', '예상 밖 파라미터가 있습니다: ' + keys);
    const d = requestBody({ model: 'x', effort: 'low', system: 's', user: 'u' });
    assert(d.output_config.effort === 'low', 'effort 지정이 무시됐습니다.');
    return 'model·max_tokens ' + b.max_tokens + '·effort ' + b.output_config.effort + ' · 샘플링 파라미터 0';
  });

  st('응답 텍스트 — thinking 블록을 건너뛰고 type==="text" 블록만 읽는다', () => {
    const first = extractText([{ type: 'thinking', thinking: '' }, { type: 'thinking', thinking: '…' }, { type: 'text', text: '{"a":1}' }]);
    assert(first === '{"a":1}', '첫 블록이 thinking 이면 텍스트를 못 읽습니다: ' + JSON.stringify(first));
    const multi = extractText([{ type: 'text', text: 'a' }, { type: 'thinking', thinking: '' }, { type: 'text', text: 'b' }]);
    assert(multi === 'a\nb', '여러 text 블록 결합이 틀렸습니다: ' + JSON.stringify(multi));
    assert(countThinkingBlocks([{ type: 'thinking' }, { type: 'text', text: 'x' }]) === 1, 'thinking 블록 수 기록이 틀렸습니다.');
    return 'thinking 2 + text 1 → 본문만 · 다중 text 결합';
  });

  /* 비동기 자기시험 — 잘림(max_tokens)은 성공이 아니고 E 초안으로도 못 쓴다 */
  try {
    const truncatedErr = (() => {
      const e = new Error('출력이 max_tokens 에서 잘렸습니다(stop_reason: max_tokens)');
      e.errorType = 'truncated'; e.code = 'MAX_TOKENS'; e.httpStatus = 200; e.truncated = true;
      e.usage = { input_tokens: 24000, output_tokens: 16000 };
      e.responseModel = 'claude-opus-5-5';
      e.rawText = '{"sections":[{"id":"01","paragraphs":[{"text":"잘린 문장';   /* 일부러 미완성 */
      e.partialDoc = null;
      return e;
    })();
    const res = await runArm({
      arm: 'D', ctx: probeCtx, pool: poolFor(probeCtx, 'D'), policy: POLICY, maxRetries: 0, model: 'claude-opus-5-5',
      effort: EFFORT, maxTokens: MAX_TOKENS,
      callFn: async () => { throw truncatedErr; }
    });
    assert(res.ok === false, '잘린 응답이 성공으로 기록됐습니다.');
    assert(res.error && res.error.errorType === 'truncated' && res.records[0].truncated === true, '잘림 표시가 호출 기록에 없습니다.');
    assert(res.error.rawText && res.error.rawText.indexOf('잘린 문장') >= 0, '잘린 응답 원문이 전달되지 않았습니다.');
    assert(Object.prototype.hasOwnProperty.call(res.error, 'partialDoc'), '부분 파싱 객체 자리가 없습니다.');
    assert(res.records[0].effort === 'medium' && res.records[0].maxTokens === MAX_TOKENS, '호출 기록에 effort·max_tokens 가 없습니다.');
    const stage = successStage({ arm: 'D', attempts: res.attempts, records: res.records, ok: res.ok });
    assert(!stage.firstOk && !stage.finalOk && stage.attempted, '잘림이 성공 단계로 집계됐습니다: ' + JSON.stringify(stage));
    assert(/^skipped_no_valid_d/.test(eSkipReason({ hasD: true, dOk: res.ok, dError: res.error.errorType })), 'E 가 잘린 D 초안을 유효 초안으로 받았습니다.');

    /* 엔진이 던지지 못하고 truncated:true 만 돌려준 경우도 성공이 아니다(방어) */
    const res2 = await runArm({
      arm: 'D', ctx: probeCtx, pool: poolFor(probeCtx, 'D'), policy: POLICY, maxRetries: 0, model: 'stub-D',
      callFn: async () => ({ doc: stubDoc('D', probeCtx, { pool: poolFor(probeCtx, 'D') }), usage: estimateUsage('x', 'y'), ms: 1, model: 'stub-D', truncated: true, stopReason: 'max_tokens', estimated: true })
    });
    assert(res2.ok === false && res2.stopped === 'truncated', 'truncated 결과가 성공으로 끝났습니다.');
    selfTests.push({ name: '잘림(max_tokens) — 성공 아님 · E 초안으로도 못 씀', ok: true, detail: 'ok:false · truncated · ' + formatUsd(res.records[0].usd) + ' · skipped_no_valid_d' });
  } catch (e) {
    selfTests.push({ name: '잘림(max_tokens) — 성공 아님 · E 초안으로도 못 씀', ok: false, detail: e.message });
  }

  /* 자기시험 — 첫 실호출이 공통 설정 오류면 남은 호출을 멈춘다 */
  try {
    const calls = [];
    const items = [['QA02', 'B'], ['QA02', 'C'], ['QA04', 'B'], ['QA04', 'C']];
    const rec = [];
    let ab = null;
    for (const pair of items) {
      const fid = pair[0], armName = pair[1];
      if (ab) { rec.push(Object.assign({ fixture: fid, arm: armName }, notAttemptedRow(ab))); continue; }
      try {
        calls.push(fid + armName);
        if (fid === 'QA02' && armName === 'C') {
          const e = new Error('모델 호출 실패: HTTP 400 — temperature: Extra inputs are not permitted');
          e.errorType = 'http'; e.httpStatus = 400;
          throw e;
        }
      } catch (e) {
        rec.push({ fixture: fid, arm: armName, ok: false, errorType: e.errorType, httpStatus: e.httpStatus });
        if (shouldAbortOn(e)) ab = abortInfo(e);
      }
    }
    assert(calls.length === 2, '중단 뒤에도 호출을 보냈습니다: ' + calls.join(', '));
    const na = rec.filter((r) => r.skipped === NOT_ATTEMPTED);
    assert(na.length === 2, '미시도 기록이 2건이 아닙니다: ' + na.length);
    assert(na.every((r) => r.attempts === 0 && r.ok === false), '미시도가 시도·성공으로 기록됐습니다.');
    assert(ab && ab.httpStatus === 400 && ab.reason === 'common-config-error' && ab.message, '중단 사유가 남지 않았습니다.');
    assert(shouldAbortOn({ httpStatus: 401 }) && shouldAbortOn({ httpStatus: 403 }) && shouldAbortOn({ httpStatus: 404 }), '인증·모델 설정 오류를 중단 대상으로 보지 않습니다.');
    assert(!shouldAbortOn({ httpStatus: 500 }) && !shouldAbortOn({ httpStatus: 429 }) && !shouldAbortOn({ errorType: 'network' }) && !shouldAbortOn(null), '다음 호출이 성공할 수 있는 오류까지 중단합니다.');
    selfTests.push({ name: '공통 설정 오류 — 남은 호출 중단 · 미시도 notAttempted', ok: true, detail: 'HTTP 400 뒤 호출 0회 · 미시도 2건 · 401/403/404 중단 · 5xx/429/네트워크 계속' });
  } catch (e) {
    selfTests.push({ name: '공통 설정 오류 — 남은 호출 중단 · 미시도 notAttempted', ok: false, detail: e.message });
  }

  /* ---------------- 집계 ---------------- */
  const agg = {};
  /* 요청 건수(스킵·실패 포함)를 모수로 넘긴다 — 성공한 것만 모아 재지 않는다. */
  arms.forEach((k) => { agg[k] = aggregate(rows.filter((r) => r.arm === k)); });
  /* 차단된 호출은 호출 수·비용에 세지 않는다(호출 전에 막혔으므로) */
  const costSummary = summarize(rows.flatMap((r) => (r.records || []).filter((x) => x.phase !== 'blocked')));
  costSummary.blockedCalls = rows.reduce((n, r) => n + (r.records || []).filter((x) => x.phase === 'blocked').length, 0);

  /* ---------------- 블라인드 자료 3종 ---------------- */
  const blindItems = rows.filter((r) => r.doc).map((r) => ({
    ctx: r.ctx, arm: r.arm, doc: r.doc, validation: r.validation, metrics: r.metrics,
    attempts: r.attempts, ok: r.ok, records: r.records, prompt: r.prompt, settings: r.settings,
    model: r.model, responseModel: r.responseModel, engine: r.engine, label: r.label,
    inputBoundary: r.inputBoundary, pool: r.pool, contentOrigin: r.contentOrigin || null
  }));
  const built = buildBlind({
    runId, createdAt, items: blindItems, seed: BLIND_SEED, name: POLICY.name,
    cost: { totalUsdKnown: costSummary.totalUsdKnown, unknownPricingCalls: costSummary.unknownPricingCalls },
    preflight,
    /* 요청 건수 모수 성공률·실패율 + 실패한 요청(삭제하지 않고 기술 평가에 남긴다) */
    successByArm: agg,
    settings: Object.assign({ model: live ? opt.model : null }, RUN_SETTINGS),
    abort: abort || null,
    failures: rows.filter((r) => r.ok !== true).map((r) => ({
      fixture: r.fixture.id, arm: r.arm, skipped: r.skipped || null, stopped: r.stopped || null,
      error: r.error || null, attempts: r.attempts || 0, hasDoc: !!r.doc,
      validation: r.validation ? { violations: r.validation.violations.length, byRule: r.validation.stats ? r.validation.stats.byRule : null } : null,
      records: (r.records || []).map((x) => ({
        attempt: x.attempt, phase: x.phase, ok: x.ok, errorType: x.errorType || null,
        httpStatus: x.httpStatus == null ? null : x.httpStatus, stopReason: x.stopReason || null,
        truncated: !!x.truncated, usage: x.usage, usd: x.usd, krw: x.krw,
        pricingKnown: x.pricingKnown, costStatus: x.costStatus,
        promptFile: x.promptFile || null
      }))
    })),
    safety
  });
  const blindDir = writeBlind(outDir, built);

  const customerText = JSON.stringify(built.customer);
  const myeongriText = JSON.stringify(built.myeongri);
  const techText = JSON.stringify(built.tech);
  const ranArms = Array.from(new Set(blindItems.map((it) => it.arm)));

  st('블라인드 — 고객용에 실험군·모델·비용·근거 ID가 새지 않는다', () => {
    const leaks = ['"arm"', 'Model-', 'stub-', 'ai-a', 'ai-b', 'ai-c', 'ai-d', 'ai-e',
      'analysis.', 'chart.', 'period.', 'KB-', '"costUsd"', '"tokens"', '프롬프트', '비용'];
    const found = leaks.filter((w) => customerText.indexOf(w) >= 0);
    assert(!found.length, '고객용에 샌 것: ' + found.join(', '));
    assert(customerText.indexOf(POLICY.name) < 0, '고객용에 실명이 남았습니다.');
    assert(customerText.indexOf('critique') < 0, '고객용에 E 의 비평 기록이 남았습니다.');
    return '해석 전문만 · 이름 마스킹';
  });

  st('블라인드 — 명리용에 실험군·모델·비용이 없고 근거·출처가 있다', () => {
    const leaks = ['"arm"', 'Model-', 'stub-', 'ai-a', 'ai-b', 'ai-c', 'ai-d', 'ai-e', '"costUsd"', '"tokens"', '프롬프트', '비용'];
    const found = leaks.filter((w) => myeongriText.indexOf(w) >= 0);
    assert(!found.length, '명리용에 샌 것: ' + found.join(', '));
    assert(myeongriText.indexOf('"facts"') >= 0, '명리용에 근거 사실이 없습니다.');
    assert(myeongriText.indexOf('KB-') >= 0 || ranArms.indexOf('D') < 0, '명리용에 지식베이스 출처가 없습니다.');
    return '명식+근거 사실+KB 출처 · 실험군 은닉';
  });

  st('블라인드 — 기술용에 실험군·요청/응답 모델·비용이 있다', () => {
    assert(techText.indexOf('"arm"') >= 0, '기술용에 실험군이 없습니다.');
    assert(techText.indexOf('"modelRequested"') >= 0, '기술용에 요청 모델이 없습니다.');
    assert(techText.indexOf('"costStatus"') >= 0 || techText.indexOf('"costUsd"') >= 0, '기술용에 비용 상태가 없습니다.');
    return ranArms.length + '개 실험군 기록';
  });

  st('블라인드 — 사례마다 표시 순서가 다르다(대응표는 키에만)', () => {
    const orders = Object.keys(built.key.displayOrder).map((f) => built.key.displayOrder[f].map((x) => x.arm).join(''));
    const distinct = new Set(orders).size;
    if (orders.length > 1) assert(distinct > 1, '모든 사례의 표시 순서가 같습니다: ' + orders[0]);
    Object.keys(built.key.displayOrder).forEach((f) => {
      assert(built.key.displayOrder[f].length === ranArms.length, f + ' 표시 항목 수가 실험군 수와 다릅니다.');
    });
    assert(Object.keys(built.key.arms).length === ranArms.length, '키의 실험군 수가 다릅니다.');
    return '사례 ' + orders.length + ' · 순서 ' + distinct + '종';
  });

  st('산출물 기록 — 블라인드 키가 모델·effort를 남기고 temperature 를 쓰지 않는다', () => {
    const armsAi = Object.keys(built.key.arms).filter((a) => a !== 'A');
    armsAi.forEach((a) => {
      const s = built.key.arms[a].settings || {};
      assert(s.effort === 'medium', a + ' 의 effort 기록이 medium 이 아닙니다: ' + JSON.stringify(s));
      assert(!Object.prototype.hasOwnProperty.call(s, 'temperature'), a + ' 에 temperature 설정이 남았습니다.');
      assert(s.maxTokens === MAX_TOKENS, a + ' 의 max_tokens 기록이 다릅니다.');
    });
    const techSettings = JSON.stringify(built.tech);
    assert(techSettings.indexOf('"effort":"medium"') >= 0, 'tech-eval 에 effort 기록이 없습니다.');
    const runSettings = JSON.stringify(RUN_SETTINGS);
    assert(runSettings.indexOf('temperature·top_p·top_k') >= 0, '실행 설정에 샘플링 파라미터 제거가 적히지 않았습니다.');
    assert(runSettings.indexOf('"effort":"medium"') >= 0, '실행 설정에 effort medium 이 없습니다.');
    return 'AI 실험군 ' + armsAi.length + '개 · effort medium · max_tokens ' + MAX_TOKENS + ' · temperature 미기록';
  });

  st('자동 검증의 경계 — 리포트에 명리 품질 보증 아님을 적는다', () => {
    const score = buildScore({
      runId: 't', mode: 'stub', set: 't', model: 't', createdAt: 't', gateDef: GATE, agg: {},
      costSummary: {}, rows: [], probes: [], selfTests: [], determinism: true, kbStats: {}, blindInfo: null
    });
    assert(score.validationModel && score.validationModel.notVerified.indexOf('보증하지 않는다') >= 0, 'score.json 에 한계 문구가 없습니다.');
    return '구조·참조 검증 / 내용 검증(자동) / 해석 품질은 미검증';
  });

  /* ---------------- 산출물 ---------------- */
  /* 문서가 있는 실패(검증 실패)도 그 응답의 원문을 docs.json 에 남긴다 */
  const rawTextOf = (r) => {
    if (r.rawText) return r.rawText;
    const last = callLog.filter((c) => c.fixture === r.fixture.id && c.arm === r.arm).slice(-1)[0];
    return last && last.rawText ? last.rawText : null;
  };
  writeFileSync(resolve(outDir, 'docs.json'), JSON.stringify(rows.map((r) => ({
    fixture: r.fixture.id, arm: r.arm, skipped: r.skipped || null, stopped: r.stopped || null,
    abort: r.abort || null,
    error: r.error || null, attempts: r.attempts, ok: r.ok, truncated: !!r.truncated,
    doc: r.doc,
    /* 문서가 없거나 잘렸어도 응답 원문·파싱된 부분 객체를 그대로 남긴다 */
    rawText: rawTextOf(r), partialDoc: r.partialDoc || null,
    validation: r.validation ? { violations: r.validation.violations, byRule: r.validation.stats.byRule } : null
  })), null, 1));
  const allRecords = rows.flatMap((r) => (r.records || []).map((x) => Object.assign({ fixture: r.fixture.id }, x)));
  writeFileSync(resolve(outDir, 'cost.json'), JSON.stringify({
    disclaimer: COST_ESTIMATE_DISCLAIMER,
    settings: Object.assign({ runMode: opt.mode, live, model: live ? opt.model : null }, RUN_SETTINGS),
    safety: { maxCalls: opt.maxCalls, maxRetries: opt.maxRetries, maxCostUsd: opt.maxCostUsd, defaulted: safetyApplied.applied },
    summary: costSummary, records: allRecords, preflight
  }, null, 1));

  const aRow = rows.filter((r) => r.arm === 'A' && r.contentOrigin)[0];
  const run = {
    runId,
    mode: opt.mode + (live ? '' : (opt.mode === 'stub' ? '' : '+stub')),
    set: opt.set + ' (' + picked.map((f) => f.id).join(',') + ')',
    fixtureCount: picked.length,
    model: live ? opt.model : 'stub (결정적 오프라인 응답 · 모델 호출 없음)',
    settings: Object.assign({ model: live ? opt.model : null }, RUN_SETTINGS),
    abort: abort || null,
    createdAt, gateDef: GATE, agg, costSummary,
    rows, probes, selfTests, determinism,
    pairs: pairChecks(contexts),
    preflight,
    kbStats: Object.assign({ version: KB_VERSION, promptVersion: PROMPT_VERSION }, kbStats()),
    kbProblems: validateKB(),
    contentOrigin: aRow ? aRow.contentOrigin : null,
    blindInfo: { dir: blindDir, displayOrder: built.key.displayOrder, seed: BLIND_SEED },
    safety,
    budget: budget.state, skipped
  };
  writeFileSync(resolve(outDir, 'score.json'), JSON.stringify(buildScore(run), null, 1));
  const md = writeReport(outDir, run);
  console.log(md);
  console.log('\n산출물: ' + outDir);
  console.log('블라인드: ' + blindDir + ' (blind-customer · blind-myeongri · tech-eval · 키는 blind-key.json)');
  console.log('비용 고지: ' + COST_ESTIMATE_DISCLAIMER);
  if (budget.state.exceeded) console.log('예산/호출 상한으로 건너뜀: ' + skipped + '건 (' + budget.state.exceeded + ')');
  Object.keys(agg).forEach((k) => {
    const m = agg[k];
    if (!m || !m.requestedCount) return;
    console.log(k + ' 성공률: 요청 ' + m.requestedCount + ' · 1차 ' + m.firstAttemptSuccess + ' (' + Math.round(m.firstAttemptSuccessRate * 1000) / 10 + '%)' +
      ' · 재시도 후 ' + m.finalSuccess + ' (' + Math.round(m.afterRetrySuccessRate * 1000) / 10 + '%)' +
      ' · 최종 실패 ' + m.finalFailure + ' (' + Math.round(m.finalFailureRate * 1000) / 10 + '%)' +
      ' · 품질 모수 ' + m.qualityItems);
  });

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
  /* 공통 설정 오류로 멈췄으면 오류 요약과 함께 비정상 종료로 끝낸다 */
  if (abort) {
    const notAttemptedCount = rows.filter((r) => r.abort).length;
    console.error('\n공통 설정 오류로 실행을 중단했습니다 — HTTP ' + (abort.httpStatus == null ? '—' : abort.httpStatus) +
      ' (' + (abort.errorType || 'http') + ')');
    console.error('  · 오류: ' + (abort.message || '(메시지 없음)'));
    console.error('  · 미시도 ' + notAttemptedCount + '건(' + NOT_ATTEMPTED + ') — 요청 파라미터(temperature 등)·키·모델을 확인한 뒤 다시 실행하세요.');
    console.error('  · 산출물에 남은 호출 기록과 docs.json 은 보존했습니다: ' + outDir);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
