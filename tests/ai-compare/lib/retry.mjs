/* ==========================================================================
   lib/retry.mjs — 검증 실패 → 오류 피드백 → 재시도
   --------------------------------------------------------------------------
   시도 1 → 검증 실패 → feedback(고칠 점)을 붙여 같은 입력으로 다시 부른다.
   maxRetries 회를 다 쓰면 '가장 위반이 적은 문서'를 남기고 실패로 기록한다
   (화면에서는 규칙 출력으로 폴백하는 것이 제품 규칙 — 여기서는 판정만 한다).
   ========================================================================== */
import { validate } from './validate.mjs';
import { costRecord } from './cost.mjs';

/**
 * @param {object} p
 *   arm, ctx, pool, policy, callFn, maxRetries, budget, model
 *   callFn({attempt, feedback}) -> { doc, usage, ms, model, estimated }
 */
export async function runArm(p) {
  const maxRetries = p.maxRetries == null ? 1 : p.maxRetries;
  const records = [];
  let feedback = [];
  let best = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    if (p.budget && !p.budget.canCall()) {
      return {
        doc: best ? best.doc : null,
        validation: best ? best.validation : null,
        attempts: attempt - 1,
        records,
        ok: false,
        stopped: 'max-calls',
        feedback
      };
    }
    let result;
    try {
      result = await p.callFn({ attempt, feedback });
    } catch (e) {
      if (p.budget) p.budget.spend(0);
      records.push(costRecord({
        arm: p.arm, fixture: p.ctx.fixture.id, attempt, model: p.model,
        usage: {}, ms: 0, ok: false, note: 'error: ' + (e && e.code ? e.code : 'unknown')
      }));
      return {
        doc: best ? best.doc : null,
        validation: best ? best.validation : null,
        attempts: attempt,
        records, ok: false, error: e, feedback
      };
    }

    const validation = validate(result.doc, p.ctx, { arm: p.arm, pool: p.pool, policy: p.policy });
    const rec = costRecord({
      arm: p.arm,
      fixture: p.ctx.fixture.id,
      attempt,
      model: result.model || p.model,
      usage: result.usage,
      ms: result.ms,
      ok: validation.violations.length === 0,
      violations: validation.violations.length,
      note: result.estimated ? 'estimated-usage' : null
    });
    if (result.estimated) rec.estimated = true;
    records.push(rec);
    if (p.budget) p.budget.spend(rec.usd);

    if (!best || validation.violations.length < best.validation.violations.length) {
      best = { doc: result.doc, validation, attempt };
    }
    if (!validation.violations.length) {
      return { doc: result.doc, validation, attempts: attempt, records, ok: true, feedback: [] };
    }
    feedback = validation.feedback;
  }

  return {
    doc: best.doc, validation: best.validation,
    attempts: records.length, records, ok: false, feedback,
    note: 'maxRetries 초과 — 위반이 가장 적은 시도를 남긴다.'
  };
}

/* 예산·호출 수 가드 */
export function createBudget(opts) {
  const o = opts || {};
  const state = {
    maxCalls: o.maxCalls || 0,
    maxUsd: o.maxUsd || 0,
    calls: 0,
    usd: 0,
    skipped: 0,
    exceeded: null
  };
  return {
    get state() { return state; },
    canCall() {
      if (state.maxCalls && state.calls >= state.maxCalls) { state.exceeded = 'max-calls'; return false; }
      if (state.maxUsd && state.usd >= state.maxUsd) { state.exceeded = 'max-cost-usd'; return false; }
      return true;
    },
    spend(usd) { state.calls += 1; state.usd += usd || 0; }
  };
}
