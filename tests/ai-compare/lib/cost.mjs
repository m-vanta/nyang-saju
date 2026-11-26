/* ==========================================================================
   lib/cost.mjs — 단가표·토큰·비용·지연 기록
   --------------------------------------------------------------------------
   · 실호출에서는 프로바이더가 돌려준 usage 를 그대로 쓴다(estimated:false).
   · stub 모드에서는 프롬프트/출력 글자 수로 추정한다(estimated:true) — 비용 표의
     계산 경로를 검증하려는 것이지, 실제 청구액을 주장하려는 것이 아니다.
   · 단가·환율은 전부 여기 한 곳에 모은다. 바뀌면 이 파일만 고친다.

   단가 미등록 모델 (리뷰 P0-3-3)
     단가표에 없는 모델은 **0원으로 계산하지 않는다.** usd/krw 를 null 로 두고
     pricingKnown:false · costStatus:'unknown_pricing' 로 기록한다. 합계에서도
     0으로 섞지 않고 '미상'으로 따로 센다(totalUsd:null, unknownPricingCalls).

   호출 전 최대 예상 비용 (리뷰 P0-3-4)
     estimateMaxUsd() 는 프롬프트 입력 토큰 추정치 + max_tokens 출력 상한으로 그
     호출의 **최대** 비용을 낸다. 단가 미등록이면 null(계산 불가)이다.
   ========================================================================== */

/* 단가: USD / 1M tokens. 출처 = 사용자 지시(2026-11-26). 프로바이더 공지로 재확인 필요. */
export const PRICING = {
  'claude-opus-5-5': {
    label: 'Claude Opus 5.5',
    input: 4,
    output: 20,
    cacheRead: 0.2,
    /* 캐시 쓰기 단가표는 지시에 없었다. Anthropic 관행(입력×1.25)을 가정값으로 둔다. */
    cacheWrite: 5,
    source: '사용자 지시 2026-11-26 · 캐시쓰기는 가정값'
  }
};

export const DEFAULT_MODEL = 'claude-opus-5-5';

/* 비용 상태 값 — 리포트·산출물이 이 문자열을 그대로 쓴다. */
export const COST_STATUS = {
  PRICED: 'priced',                 // 단가표에 있고 계산됨
  UNKNOWN: 'unknown_pricing'        // 단가 미등록 — 비용 미상(0원 아님)
};

/* 환율: 표시용 고정값. 실시간 환율이 아니다. */
export const FX_KRW_PER_USD = Number(process.env.NYANG_USD_KRW || 1390);
export const FX_SOURCE = '고정 표시 환율(정책값) · NYANG_USD_KRW 로 바꿀 수 있다';

export function priceOf(model) {
  return PRICING[model || DEFAULT_MODEL] || null;
}

export function pricingKnown(model) {
  return !!priceOf(model);
}

/* 글자 수 → 토큰 추정. 한국어는 글자당 토큰이 많아 2.2자/토큰으로 보수적으로 잡는다. */
export function estimateTokens(text) {
  const n = String(text || '').length;
  return Math.max(1, Math.ceil(n / 2.2));
}

export function estimateUsage(promptText, outputText) {
  return {
    input_tokens: estimateTokens(promptText),
    output_tokens: estimateTokens(outputText),
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    estimated: true
  };
}

export function normalizeUsage(usage) {
  const u = usage || {};
  return {
    input_tokens: Number(u.input_tokens || u.inputTokens || 0),
    output_tokens: Number(u.output_tokens || u.outputTokens || 0),
    cache_creation_input_tokens: Number(u.cache_creation_input_tokens || u.cacheCreationInputTokens || 0),
    cache_read_input_tokens: Number(u.cache_read_input_tokens || u.cacheReadInputTokens || 0),
    estimated: !!u.estimated
  };
}

/**
 * usage → 비용. 단가 미등록이면 usd/krw 는 null 이다(0원으로 두지 않는다).
 * @returns {{usd:number|null, krw:number|null, pricingKnown:boolean, costStatus:string, ...}}
 */
export function costOf(usage, model) {
  const p = priceOf(model);
  const u = normalizeUsage(usage);
  if (!p) {
    return {
      usd: null, krw: null, breakdown: null,
      pricingKnown: false, costStatus: COST_STATUS.UNKNOWN,
      model: model || null, price: null, fx: FX_KRW_PER_USD
    };
  }
  const per = 1 / 1000000;
  const input = u.input_tokens * p.input * per;
  const output = u.output_tokens * p.output * per;
  const cacheRead = u.cache_read_input_tokens * p.cacheRead * per;
  const cacheWrite = u.cache_creation_input_tokens * p.cacheWrite * per;
  const usd = input + output + cacheRead + cacheWrite;
  return {
    usd: round6(usd),
    krw: Math.round(usd * FX_KRW_PER_USD),
    breakdown: {
      input: round6(input), output: round6(output),
      cacheRead: round6(cacheRead), cacheWrite: round6(cacheWrite)
    },
    pricingKnown: true,
    costStatus: COST_STATUS.PRICED,
    model: model || DEFAULT_MODEL,
    price: p,
    fx: FX_KRW_PER_USD
  };
}

/* 호출 1건의 최대 예상 비용 — 입력 토큰 추정 + max_tokens 전량 출력 가정 */
export function estimateMaxUsd(input) {
  const o = input || {};
  const model = o.model || DEFAULT_MODEL;
  const p = priceOf(model);
  const inputTokens = estimateTokens(o.promptText);
  const maxOutput = Number(o.maxTokens || o.max_tokens || 0);
  if (!p) {
    return {
      usd: null, pricingKnown: false, costStatus: COST_STATUS.UNKNOWN,
      inputTokens, maxOutputTokens: maxOutput, model
    };
  }
  const per = 1 / 1000000;
  const usd = inputTokens * p.input * per + maxOutput * p.output * per;
  return {
    usd: round6(usd), pricingKnown: true, costStatus: COST_STATUS.PRICED,
    inputTokens, maxOutputTokens: maxOutput, model,
    breakdown: { input: round6(inputTokens * p.input * per), output: round6(maxOutput * p.output * per) }
  };
}

function round6(n) { return Math.round(n * 1e6) / 1e6; }

/** 호출 1건 기록 */
export function costRecord(input) {
  const usage = normalizeUsage(input.usage);
  const requestedModel = input.requestedModel || input.model || DEFAULT_MODEL;
  const responseModel = input.responseModel || null;
  const cost = costOf(usage, requestedModel);
  return {
    arm: input.arm,
    fixture: input.fixture,
    phase: input.phase || 'call',
    attempt: input.attempt || 1,
    /* 요청 모델과 응답 모델을 모두 남긴다(리뷰 P0-3-2). 응답 model 필드가 다를 수 있다. */
    model: requestedModel,
    requestedModel,
    responseModel,
    usage,
    usd: cost.usd,
    krw: cost.krw,
    pricingKnown: cost.pricingKnown,
    costStatus: cost.costStatus,
    breakdown: cost.breakdown,
    ms: Math.max(0, Math.round(input.ms || 0)),
    estimated: usage.estimated,
    ok: input.ok !== false,
    violations: input.violations || 0,
    /* 실패·잘림·상태 기록(리뷰 P0-3-6) */
    errorType: input.errorType || null,
    httpStatus: input.httpStatus == null ? null : input.httpStatus,
    stopReason: input.stopReason || null,
    truncated: !!input.truncated,
    promptHash: input.promptHash || null,
    promptFile: input.promptFile || null,
    estimatedMaxUsd: input.estimatedMaxUsd == null ? null : input.estimatedMaxUsd,
    note: input.note || null
  };
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  const idx = Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1));
  return a[idx];
}

/**
 * 호출 기록 합계. 단가 미등록 호출이 하나라도 있으면 totalUsd 는 null 이고
 * totalUsdKnown(계산된 것만)을 따로 낸다 — 미상을 0원으로 보고하지 않는다.
 */
export function summarize(records) {
  const list = records || [];
  const byArm = {};
  list.forEach((r) => {
    const b = byArm[r.arm] = byArm[r.arm] || {
      calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
      usd: 0, krw: 0, usdKnown: 0, krwKnown: 0, unknownPricing: 0, pricedCalls: 0,
      ms: [], retries: 0, failures: 0, estimated: 0, truncated: 0, errors: 0
    };
    b.calls += 1;
    b.inputTokens += r.usage.input_tokens;
    b.outputTokens += r.usage.output_tokens;
    b.cacheReadTokens += r.usage.cache_read_input_tokens;
    b.cacheWriteTokens += r.usage.cache_creation_input_tokens;
    if (r.pricingKnown && r.usd !== null && r.usd !== undefined) {
      b.usdKnown += r.usd;
      b.krwKnown += r.krw;
      b.pricedCalls += 1;
    } else {
      b.unknownPricing += 1;
    }
    b.ms.push(r.ms);
    if (r.attempt > 1) b.retries += 1;
    if (!r.ok) b.failures += 1;
    if (r.estimated) b.estimated += 1;
    if (r.truncated) b.truncated += 1;
    if (r.errorType) b.errors += 1;
  });
  let anyUnknown = false;
  Object.keys(byArm).forEach((k) => {
    const b = byArm[k];
    b.usd = b.unknownPricing ? null : round6(b.usdKnown);
    b.krw = b.unknownPricing ? null : Math.round(b.krwKnown);
    b.usdKnown = round6(b.usdKnown);
    b.p50ms = percentile(b.ms, 50);
    b.p95ms = percentile(b.ms, 95);
    delete b.ms;
    if (b.unknownPricing) anyUnknown = true;
  });
  const knownUsd = round6(list.reduce((s, r) => s + (r.pricingKnown && r.usd ? r.usd : 0), 0));
  return {
    calls: list.length,
    totalUsd: anyUnknown ? null : knownUsd,
    totalUsdKnown: knownUsd,
    totalKrw: anyUnknown ? null : Math.round(knownUsd * FX_KRW_PER_USD),
    totalKrwKnown: Math.round(knownUsd * FX_KRW_PER_USD),
    unknownPricingCalls: list.filter((r) => !r.pricingKnown).length,
    truncatedCalls: list.filter((r) => r.truncated).length,
    failedCalls: list.filter((r) => !r.ok).length,
    fx: FX_KRW_PER_USD,
    byArm,
    estimated: list.length > 0 && list.every((r) => r.estimated)
  };
}

export function formatUsd(n) {
  if (n === null || n === undefined) return '미상(단가 미등록)';
  return '$' + (Math.round(n * 1e4) / 1e4).toFixed(4);
}
export function formatKrw(n) {
  if (n === null || n === undefined) return '미상';
  return '₩' + Math.round(n).toLocaleString('ko-KR');
}

/* 예산 가드 — 호출 전에 남은 예산으로 가능한지 본다 */
export function budgetAllows(spentUsd, nextUsd, maxUsd) {
  if (!maxUsd || maxUsd <= 0) return true;
  if (nextUsd === null || nextUsd === undefined) return false;
  return spentUsd + nextUsd <= maxUsd;
}
