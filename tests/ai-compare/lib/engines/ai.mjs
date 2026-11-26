/* ==========================================================================
   lib/engines/ai.mjs — 실호출 엔진 (Anthropic Messages API)
   --------------------------------------------------------------------------
   · 키는 환경변수 ANTHROPIC_API_KEY 또는 저장소 밖 로컬 .env.local 에서만 읽는다.
     코드·로그·산출물에 키를 남기지 않는다(블라인드 패키지에도 안 들어간다).
   · 이 저장소의 실험 실행은 --mode pilot / --mode full 에서만 이 파일을 부른다.
     --mode stub 과 그 자기시험은 네트워크를 쓰지 않는다.
   · 반환: { doc, usage, ms, requestedModel, responseModel, stopReason, truncated, httpStatus, prompt, rawText }

   실패 처리 (리뷰 P0-3-6)
     HTTP 4xx/5xx · 네트워크 · 응답 본문 파싱 · 빈 응답 · 출력 잘림(stop_reason:'max_tokens')
     을 각각 errorType 으로 구분해 던진다. 응답 본문을 받은 뒤의 실패(JSON 파싱 등)는
     usage·ms·responseModel 을 오류 객체에 붙여서 던진다 — 실행기가 토큰·비용을
     잃지 않고 기록할 수 있게 하기 위해서다(리뷰 P0-3-5).
   ========================================================================== */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_MODEL } from '../cost.mjs';
import { buildPrompt } from '../prompts.mjs';

const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
export const MAX_TOKENS = 8000;

/* .env.local — KEY=VALUE 줄만 읽는다. 없으면 환경변수만 쓴다. */
export function loadEnvLocal(dir) {
  const path = resolve(dir || process.cwd(), '.env.local');
  const out = {};
  if (!existsSync(path)) return out;
  readFileSync(path, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) return;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
  return out;
}

export function apiKey(dir) {
  return process.env.ANTHROPIC_API_KEY || loadEnvLocal(dir).ANTHROPIC_API_KEY || null;
}

export function modelId() {
  return process.env.NYANG_COMPARE_MODEL || DEFAULT_MODEL;
}

function parseJsonLoose(text) {
  const t = String(text || '').trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : t;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('응답에서 JSON 을 찾지 못했습니다.');
  return JSON.parse(body.slice(start, end + 1));
}

function apiError(message, extra) {
  const err = new Error(message);
  Object.assign(err, extra || {});
  if (!err.errorType) err.errorType = err.code || 'unknown';
  return err;
}

/**
 * 한 번 호출한다. 검증·재시도는 lib/retry.mjs 가 맡는다.
 * @param {object} p { system, user, model, maxTokens, temperature, key }
 */
export async function callModel(p) {
  if (!p.key) {
    throw apiError('ANTHROPIC_API_KEY 가 없습니다. 실험 실행에는 키가 필요합니다(오프라인은 --mode stub).', {
      code: 'NO_API_KEY', errorType: 'no_api_key', requestedModel: p.model || modelId()
    });
  }
  const requestedModel = p.model || modelId();
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': p.key,
        'anthropic-version': ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: requestedModel,
        max_tokens: p.maxTokens || MAX_TOKENS,
        temperature: p.temperature === undefined ? 0 : p.temperature,
        system: p.system,
        messages: [{ role: 'user', content: p.user }]
      })
    });
  } catch (e) {
    throw apiError('모델 호출 네트워크 오류: ' + (e && e.message ? e.message : e), {
      code: 'NETWORK', errorType: 'network', requestedModel, ms: Date.now() - t0
    });
  }
  const ms = Date.now() - t0;
  const text = await res.text();
  if (!res.ok) {
    throw apiError('모델 호출 실패: HTTP ' + res.status + ' — ' + text.slice(0, 300), {
      code: 'HTTP_' + res.status, errorType: 'http', httpStatus: res.status,
      requestedModel, ms
    });
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch (e) {
    throw apiError('응답 본문이 JSON 이 아닙니다.', {
      code: 'BAD_RESPONSE_BODY', errorType: 'bad_response', httpStatus: res.status,
      requestedModel, ms
    });
  }
  const rawText = (body.content || []).map((c) => (c.type === 'text' ? c.text : '')).join('');
  const responseModel = body.model || requestedModel;
  const stopReason = body.stop_reason || null;
  const truncated = stopReason === 'max_tokens';
  const base = {
    rawText, usage: body.usage || {}, ms,
    requestedModel, responseModel, model: responseModel,
    stopReason, truncated, httpStatus: res.status
  };
  if (!rawText.trim()) {
    throw apiError('모델 응답이 비어 있습니다(stop_reason: ' + (stopReason || '—') + ').', Object.assign({
      code: 'EMPTY_RESPONSE', errorType: 'empty_response'
    }, base));
  }
  return base;
}

/**
 * 실험군 1건 실행. 프롬프트는 lib/prompts.mjs 가 만든다(넘겨받은 것을 재사용할 수 있다).
 * @param {string} arm 'B'|'C'|'D'|'E'
 * @param {object} ctx buildContext 결과
 * @param {object} o { pool, draftDoc, feedback, key, dir, temperature, model, maxTokens, prompt }
 */
export async function aiDoc(arm, ctx, o) {
  const opt = o || {};
  const prompt = opt.prompt || buildPrompt(arm, ctx, { pool: opt.pool, draftDoc: opt.draftDoc });
  const user = opt.feedback && opt.feedback.length
    ? prompt.user + '\n\n[이전 시도에서 검증기가 반려한 항목 — 모두 고쳐서 다시 써라]\n' + opt.feedback.join('\n')
    : prompt.user;
  const r = await callModel({
    system: prompt.system,
    user,
    model: opt.model,
    maxTokens: opt.maxTokens,
    key: opt.key || apiKey(opt.dir),
    temperature: opt.temperature === undefined ? 0 : opt.temperature
  });
  let doc;
  try {
    doc = parseJsonLoose(r.rawText);
  } catch (e) {
    /* 응답은 왔는데 JSON 이 아니다 — 토큰·비용은 이미 썼다. 오류에 실어 보낸다. */
    throw apiError('응답 JSON 파싱 실패: ' + e.message, Object.assign({
      code: 'JSON_PARSE', errorType: 'json_parse'
    }, r, { rawText: r.rawText.slice(0, 4000) }));
  }
  doc.engine = 'ai-' + arm.toLowerCase();
  doc.grounding = 'evidence';
  return {
    doc, usage: r.usage, ms: r.ms,
    requestedModel: r.requestedModel, responseModel: r.responseModel, model: r.responseModel,
    stopReason: r.stopReason, truncated: r.truncated, httpStatus: r.httpStatus,
    prompt, user, rawText: r.rawText
  };
}
