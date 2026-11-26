/* ==========================================================================
   lib/cost.mjs — 단가표·토큰·비용·지연 기록
   --------------------------------------------------------------------------
   · 실호출에서는 프로바이더가 돌려준 usage 를 그대로 쓴다(estimated:false).
   · stub 모드에서는 프롬프트/출력 글자 수로 추정한다(estimated:true) — 비용 표의
     계산 경로를 검증하려는 것이지, 실제 청구액을 주장하려는 것이 아니다.
   · 단가·환율은 전부 여기 한 곳에 모은다. 바뀌면 이 파일만 고친다.
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

/* 환율: 표시용 고정값. 실시간 환율이 아니다. */
export const FX_KRW_PER_USD = Number(process.env.NYANG_USD_KRW || 1390);
export const FX_SOURCE = '고정 표시 환율(정책값) · NYANG_USD_KRW 로 바꿀 수 있다';

export function priceOf(model) {
  return PRICING[model || DEFAULT_MODEL] || null;
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

export function costOf(usage, model) {
  const p = priceOf(model);
  const u = normalizeUsage(usage);
  if (!p) return { usd: 0, krw: 0, breakdown: null, unknownModel: true };
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
    model: model || DEFAULT_MODEL,
    price: p,
    fx: FX_KRW_PER_USD
  };
}

function round6(n) { return Math.round(n * 1e6) / 1e6; }

/** 호출 1건 기록 */
export function costRecord(input) {
  const usage = normalizeUsage(input.usage);
  const cost = costOf(usage, input.model);
  return {
    arm: input.arm,
    fixture: input.fixture,
    phase: input.phase || 'call',
    attempt: input.attempt || 1,
    model: input.model || DEFAULT_MODEL,
    usage,
    usd: cost.usd,
    krw: cost.krw,
    breakdown: cost.breakdown,
    ms: Math.max(0, Math.round(input.ms || 0)),
    estimated: usage.estimated,
    ok: input.ok !== false,
    violations: input.violations || 0,
    note: input.note || null
  };
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  const idx = Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1));
  return a[idx];
}

export function summarize(records) {
  const list = records || [];
  const byArm = {};
  list.forEach((r) => {
    const b = byArm[r.arm] = byArm[r.arm] || {
      calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
      usd: 0, krw: 0, ms: [], retries: 0, failures: 0, estimated: 0
    };
    b.calls += 1;
    b.inputTokens += r.usage.input_tokens;
    b.outputTokens += r.usage.output_tokens;
    b.cacheReadTokens += r.usage.cache_read_input_tokens;
    b.cacheWriteTokens += r.usage.cache_creation_input_tokens;
    b.usd += r.usd;
    b.krw += r.krw;
    b.ms.push(r.ms);
    if (r.attempt > 1) b.retries += 1;
    if (!r.ok) b.failures += 1;
    if (r.estimated) b.estimated += 1;
  });
  Object.keys(byArm).forEach((k) => {
    const b = byArm[k];
    b.usd = round6(b.usd);
    b.p50ms = percentile(b.ms, 50);
    b.p95ms = percentile(b.ms, 95);
    delete b.ms;
  });
  const totalUsd = round6(list.reduce((s, r) => s + r.usd, 0));
  return {
    calls: list.length,
    totalUsd,
    totalKrw: Math.round(totalUsd * FX_KRW_PER_USD),
    fx: FX_KRW_PER_USD,
    byArm,
    estimated: list.every((r) => r.estimated)
  };
}

export function formatUsd(n) { return '$' + (Math.round(n * 1e4) / 1e4).toFixed(4); }
export function formatKrw(n) { return '₩' + Math.round(n).toLocaleString('ko-KR'); }

/* 예산 가드 — 호출 전에 남은 예산으로 가능한지 본다 */
export function budgetAllows(spentUsd, nextUsd, maxUsd) {
  if (!maxUsd || maxUsd <= 0) return true;
  return spentUsd + nextUsd <= maxUsd;
}
