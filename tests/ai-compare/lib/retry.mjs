/* ==========================================================================
   lib/retry.mjs — 검증 실패 → 오류 피드백 → 재시도, 그리고 호출 전 예산 가드
   --------------------------------------------------------------------------
   시도 1 → 검증 실패 → feedback(고칠 점)을 붙여 같은 입력으로 다시 부른다.
   maxRetries 회를 다 쓰면 '가장 위반이 적은 문서'를 남기고 실패로 기록한다
   (화면에서는 규칙 출력으로 폴백하는 것이 제품 규칙 — 여기서는 판정만 한다).

   예산 (리뷰 P0-3-4)
     callFn 을 부르기 **직전**에 estimateUsd(attempt) 로 그 호출의 최대 예상 비용을
     받아 budget.checkEstimate() 로 검사한다. 넘으면 호출하지 않고 stopped 로 남긴다.
     단가 미등록(estimate null)이면 --max-cost-usd 를 지킬 수 없으므로 역시 막는다.

   실패도 기록한다 (리뷰 P0-3-5·6)
     callFn 이 던진 오류에 usage·ms·model·httpStatus·errorType·truncated 가 붙어 있으면
     그대로 비용 기록에 남긴다. JSON 파싱이 실패해도 토큰·비용이 사라지지 않는다.

   출력 잘림은 성공이 아니다
     결과에 truncated:true 가 실려 오면(엔진이 던지지 못한 경우의 방어) 검증을 통과했더라도
     ok:false · stopped:'truncated' 로 끝낸다. 잘린 문서는 '유효한 초안'이 아니다.
   ========================================================================== */
import { validate } from './validate.mjs';
import { costRecord } from './cost.mjs';

function errorRecord(p, attempt, e) {
  return costRecord({
    arm: p.arm,
    fixture: p.ctx.fixture.id,
    attempt,
    phase: 'error',
    requestedModel: (e && e.requestedModel) || p.model,
    responseModel: (e && e.responseModel) || null,
    usage: (e && e.usage) || {},
    ms: (e && e.ms) || 0,
    ok: false,
    errorType: (e && e.errorType) || (e && e.code) || 'unknown',
    httpStatus: e && e.httpStatus != null ? e.httpStatus : null,
    stopReason: (e && e.stopReason) || null,
    truncated: !!(e && e.truncated),
    effort: p.effort || null,
    maxTokens: p.maxTokens || null,
    promptHash: p.promptHash || null,
    promptFile: p.promptFile || null,
    note: 'error: ' + ((e && e.code) || (e && e.errorType) || 'unknown')
  });
}

/**
 * @param {object} p
 *   arm, ctx, pool, policy, callFn, maxRetries, budget, model
 *   callFn({attempt, feedback}) -> { doc, usage, ms, model|responseModel, requestedModel, stopReason, truncated, httpStatus }
 *   estimateUsd(attempt) -> { usd: number|null, inputTokens, maxOutputTokens }  (선택)
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
        stopped: p.budget.state.exceeded || 'blocked',
        feedback
      };
    }

    /* 호출 전 최대 예상 비용 검사 */
    if (p.estimateUsd && p.budget) {
      const est = p.estimateUsd(attempt);
      const chk = p.budget.checkEstimate(est ? est.usd : null);
      if (!chk.ok) {
        records.push(costRecord({
          arm: p.arm, fixture: p.ctx.fixture.id, attempt, phase: 'blocked',
          requestedModel: p.model, usage: {}, ms: 0, ok: false,
          estimatedMaxUsd: est ? est.usd : null,
          effort: p.effort || null, maxTokens: p.maxTokens || null,
          promptHash: p.promptHash || null, promptFile: p.promptFile || null,
          note: '호출 전 예상 비용 초과 차단: ' + chk.reason
        }));
        return {
          doc: best ? best.doc : null,
          validation: best ? best.validation : null,
          attempts: attempt - 1,
          records,
          ok: false,
          stopped: chk.reason,
          budgetBlocked: Object.assign({ attempt }, chk, est || {}),
          feedback
        };
      }
      p.budget.noteEstimate(est ? est.usd : null);
    }

    let result;
    try {
      result = await p.callFn({ attempt, feedback });
    } catch (e) {
      const rec = errorRecord(p, attempt, e);
      records.push(rec);
      /* 단가를 아는 호출이면 실패해도 사용 토큰만큼 비용을 센다 */
      if (p.budget) p.budget.spend(rec.pricingKnown ? rec.usd : null);
      return {
        doc: best ? best.doc : null,
        validation: best ? best.validation : null,
        attempts: attempt,
        records,
        ok: false,
        /* 잘린 응답·파싱 실패 응답도 실행기가 보존할 수 있게 원문과 부분 객체를 넘긴다 */
        error: {
          errorType: rec.errorType, httpStatus: rec.httpStatus, truncated: rec.truncated,
          message: e && e.message,
          rawText: e && e.rawText ? String(e.rawText) : null,
          partialDoc: (e && e.partialDoc) || null
        },
        feedback
      };
    }

    const validation = validate(result.doc, p.ctx, { arm: p.arm, pool: p.pool, policy: p.policy });
    const rec = costRecord({
      arm: p.arm,
      fixture: p.ctx.fixture.id,
      attempt,
      requestedModel: result.requestedModel || p.model,
      responseModel: result.responseModel || result.model || null,
      usage: result.usage,
      ms: result.ms,
      ok: validation.violations.length === 0,
      violations: validation.violations.length,
      errorType: result.errorType || null,
      httpStatus: result.httpStatus == null ? null : result.httpStatus,
      stopReason: result.stopReason || null,
      truncated: !!result.truncated,
      effort: result.effort || p.effort || null,
      maxTokens: result.maxTokens || p.maxTokens || null,
      promptHash: p.promptHash || null,
      promptFile: p.promptFile || null,
      note: result.estimated ? 'estimated-usage' : null
    });
    records.push(rec);
    if (p.budget) p.budget.spend(rec.pricingKnown ? rec.usd : null);

    if (!best || validation.violations.length < best.validation.violations.length) {
      best = { doc: result.doc, validation, attempt };
    }
    /* 잘린 출력은 파싱·검증을 통과해도 성공이 아니다 — 초안으로도 쓰지 않는다. */
    if (result.truncated) {
      return {
        doc: result.doc || null, validation, attempts: attempt, records, ok: false,
        stopped: 'truncated',
        error: { errorType: 'truncated', httpStatus: result.httpStatus == null ? null : result.httpStatus, truncated: true, message: '출력이 max_tokens 에서 잘렸습니다.' },
        feedback
      };
    }
    if (!validation.violations.length) {
      return { doc: result.doc, validation, attempts: attempt, records, ok: true, feedback: [], truncated: !!result.truncated };
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
    usdUnknown: false,
    estimatedUsd: 0,
    estimates: [],
    skipped: 0,
    exceeded: null,
    exceededDetail: null
  };
  return {
    get state() { return state; },
    canCall() {
      if (state.maxCalls && state.calls >= state.maxCalls) {
        state.exceeded = 'max-calls';
        state.exceededDetail = state.calls + '회 >= --max-calls ' + state.maxCalls;
        return false;
      }
      if (state.maxUsd && state.usdUnknown) {
        state.exceeded = 'unknown-pricing';
        state.exceededDetail = '단가 미등록 호출이 있어 남은 예산을 보장할 수 없다';
        return false;
      }
      if (state.maxUsd && state.usd >= state.maxUsd) {
        state.exceeded = 'max-cost-usd';
        state.exceededDetail = '누적 $' + state.usd + ' >= --max-cost-usd ' + state.maxUsd;
        return false;
      }
      return true;
    },
    /* 호출 전 최대 예상 비용 검사 — est 가 null 이면 단가 미등록 */
    checkEstimate(est) {
      if (!state.maxUsd) return { ok: true };
      if (est === null || est === undefined) {
        return { ok: false, reason: 'unknown-pricing', detail: '단가 미등록 — 최대 예상 비용을 계산할 수 없어 호출하지 않는다' };
      }
      if (state.usd + est > state.maxUsd) {
        return {
          ok: false, reason: 'max-cost-usd',
          detail: '누적 $' + state.usd + ' + 이번 최대 예상 $' + est + ' > --max-cost-usd ' + state.maxUsd,
          projected: Math.round((state.usd + est) * 1e6) / 1e6, est
        };
      }
      return { ok: true, est };
    },
    noteEstimate(est) {
      if (est === null || est === undefined) return;
      state.estimates.push(est);
      state.estimatedUsd = Math.round((state.estimatedUsd + est) * 1e6) / 1e6;
    },
    spend(usd) {
      state.calls += 1;
      if (usd === null || usd === undefined) {
        state.usdUnknown = true;
        return;
      }
      state.usd = Math.round((state.usd + usd) * 1e6) / 1e6;
    }
  };
}
