/* ==========================================================================
   lib/engines/ai.mjs — 실호출 엔진 (Anthropic Messages API)
   --------------------------------------------------------------------------
   · 키는 환경변수 ANTHROPIC_API_KEY 또는 저장소 밖 로컬 .env.local 에서만 읽는다.
     코드·로그·산출물에 키를 남기지 않는다(블라인드 패키지에도 안 들어간다).
   · 이 저장소의 실험 실행은 --mode pilot / --mode full 에서만 이 파일을 부른다.
     --mode stub 과 그 자기시험은 네트워크를 쓰지 않는다.
   · 반환: { doc, usage, ms, requestedModel, responseModel, stopReason, truncated, httpStatus, prompt, rawText }

   Claude Opus 5.5 요청 규격 (platform.claude.com/docs/en/models/opus-5-5/migration-guide)
     · temperature · top_p · top_k 는 보내면 HTTP 400 이다 → 요청 body 에 넣지 않는다.
     · thinking 은 항상 켜져 있다. thinking 설정을 보내지 않고 깊이는 output_config.effort 로만
       정한다(모든 AI 실험군 B·C·D·E 동일: 'medium'). effort 기본값도 medium 이지만 명시한다.
     · 응답 content 는 thinking 블록으로 시작할 수 있다 → 위치(content[0])가 아니라
       type === 'text' 블록만 모아 텍스트를 얻는다.
     · max_tokens 는 thinking + 본문의 합산 상한이다 → 8000 으로는 thinking 이 본문 자리를
       먹고 잘릴 수 있어 16000 으로 둔다(여유분).

   실패 처리 (리뷰 P0-3-6)
     HTTP 4xx/5xx · 네트워크 · 응답 본문 파싱 · 빈 응답 · 출력 잘림(stop_reason:'max_tokens')
     을 각각 errorType 으로 구분해 던진다. 응답 본문을 받은 뒤의 실패(JSON 파싱 등)는
     usage·ms·responseModel 을 오류 객체에 붙여서 던진다 — 실행기가 토큰·비용을
     잃지 않고 기록할 수 있게 하기 위해서다(리뷰 P0-3-5).

     출력 잘림은 성공이 아니다 (Opus 5.5 반영)
       stop_reason === 'max_tokens' 이면 본문이 우연히 JSON 으로 파싱되더라도 성공으로
       돌려주지 않고 errorType 'truncated' 로 던진다. 파싱된 부분 객체(partialDoc)와
       rawText 전문을 오류에 실어, 잘린 응답도 삭제·절단 없이 보존한다.
   ========================================================================== */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_MODEL } from '../cost.mjs';
import { buildPrompt } from '../prompts.mjs';

const API_URL = 'https://api.anthropic.com/v1/messages';
/* Opus 5.5 문서의 요청 예시와 같은 버전. output_config.effort 를 쓰는 요청 규격이다. */
const ANTHROPIC_VERSION = '2026-10-21';
/* thinking + 본문 합산 상한. 문서: 8000 은 thinking 이 본문 자리를 먹으면 잘린다. */
export const MAX_TOKENS = 16000;
/* 모든 AI 실험군(B·C·D·E) 공통 — 실험 축은 '무엇을 주는가' 하나뿐이다. */
export const EFFORT = 'medium';

/* 보내면 400 이 되는 샘플링 파라미터 — 요청 body 에 절대 넣지 않는다. */
export const REJECTED_SAMPLING_PARAMS = ['temperature', 'top_p', 'top_k'];

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

/**
 * 요청 body — 여기 한 곳에서만 만든다(자기시험이 이 함수를 직접 검사한다).
 * temperature·top_p·top_k 는 넣지 않는다. effort 는 항상 명시한다.
 */
export function requestBody(p) {
  const o = p || {};
  return {
    model: o.model || modelId(),
    max_tokens: o.maxTokens || MAX_TOKENS,
    output_config: { effort: o.effort || EFFORT },
    system: o.system,
    messages: [{ role: 'user', content: o.user }]
  };
}

/* 응답 content 에서 본문 텍스트만 — thinking 블록이 앞에 와도 위치로 읽지 않는다. */
export function extractText(content) {
  return (content || [])
    .filter((b) => b && b.type === 'text')
    .map((b) => (typeof b.text === 'string' ? b.text : ''))
    .join('\n');
}

export function countThinkingBlocks(content) {
  return (content || []).filter((b) => b && b.type === 'thinking').length;
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

/** 파싱 가능하면 부분 객체를 남긴다 — 잘린 응답도 버리지 않는다. */
function partialOf(rawText) {
  try {
    return { partialDoc: parseJsonLoose(rawText), parseError: null };
  } catch (e) {
    return { partialDoc: null, parseError: e && e.message ? e.message : String(e) };
  }
}

/**
 * 한 번 호출한다. 검증·재시도는 lib/retry.mjs 가 맡는다.
 * @param {object} p { system, user, model, maxTokens, effort, key }
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
      body: JSON.stringify(requestBody({ model: requestedModel, maxTokens: p.maxTokens, effort: p.effort, system: p.system, user: p.user }))
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
      requestedModel, ms, rawText: text
    });
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch (e) {
    throw apiError('응답 본문이 JSON 이 아닙니다.', {
      code: 'BAD_RESPONSE_BODY', errorType: 'bad_response', httpStatus: res.status,
      requestedModel, ms, rawText: text
    });
  }
  const content = body.content || [];
  const rawText = extractText(content);
  const responseModel = body.model || requestedModel;
  const stopReason = body.stop_reason || null;
  const truncated = stopReason === 'max_tokens';
  const base = {
    rawText, usage: body.usage || {}, ms,
    requestedModel, responseModel, model: responseModel,
    stopReason, truncated, thinkingBlocks: countThinkingBlocks(content), httpStatus: res.status
  };
  /* 잘림은 정상 생성이 아니다 — 파싱이 되더라도 성공으로 돌려주지 않는다. */
  if (truncated) {
    const part = partialOf(rawText);
    throw apiError('출력이 max_tokens 에서 잘렸습니다(stop_reason: max_tokens) — 정상 생성으로 처리하지 않습니다. thinking 과 본문이 max_tokens 를 함께 쓰므로 max_tokens 를 늘리거나 effort 를 낮춰야 합니다.', Object.assign({
      code: 'MAX_TOKENS', errorType: 'truncated'
    }, base, part));
  }
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
 * @param {object} o { pool, draftDoc, feedback, key, dir, model, maxTokens, effort, prompt }
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
    effort: opt.effort,
    key: opt.key || apiKey(opt.dir)
  });
  let doc;
  try {
    doc = parseJsonLoose(r.rawText);
  } catch (e) {
    /* 응답은 왔는데 JSON 이 아니다 — 토큰·비용은 이미 썼다. 오류에 실어 보낸다.
       rawText 는 자르지 않고 그대로 넘긴다 — 실패한 응답도 삭제하지 않고 보존한다. */
    throw apiError('응답 JSON 파싱 실패: ' + e.message, Object.assign({
      code: 'JSON_PARSE', errorType: 'json_parse', partialDoc: null, parseError: e.message
    }, r, { rawText: r.rawText }));
  }
  doc.engine = 'ai-' + arm.toLowerCase();
  doc.grounding = 'evidence';
  return {
    doc, usage: r.usage, ms: r.ms,
    requestedModel: r.requestedModel, responseModel: r.responseModel, model: r.responseModel,
    stopReason: r.stopReason, truncated: r.truncated, httpStatus: r.httpStatus,
    thinkingBlocks: r.thinkingBlocks,
    effort: opt.effort || EFFORT, maxTokens: opt.maxTokens || MAX_TOKENS,
    prompt, user, rawText: r.rawText
  };
}
