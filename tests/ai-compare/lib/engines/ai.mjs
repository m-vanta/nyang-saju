/* ==========================================================================
   lib/engines/ai.mjs — 실호출 엔진 (Anthropic Messages API)
   --------------------------------------------------------------------------
   · 키는 환경변수 ANTHROPIC_API_KEY 또는 저장소 밖 로컬 .env.local 에서만 읽는다.
     코드·로그·산출물에 키를 남기지 않는다(블라인드 패키지에도 안 들어간다).
   · 이 저장소의 실험 실행은 --mode pilot / --mode full 에서만 이 파일을 부른다.
     --mode stub 과 그 자기시험은 네트워크를 쓰지 않는다.
   · 반환: { doc, usage, ms, model, rawText }
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

/**
 * 한 번 호출한다. 검증·재시도는 lib/retry.mjs 가 맡는다.
 * @param {object} p { system, user, model, maxTokens, temperature, key }
 */
export async function callModel(p) {
  if (!p.key) {
    const err = new Error('ANTHROPIC_API_KEY 가 없습니다. 실험 실행에는 키가 필요합니다(오프라인은 --mode stub).');
    err.code = 'NO_API_KEY';
    throw err;
  }
  const t0 = Date.now();
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': p.key,
      'anthropic-version': ANTHROPIC_VERSION
    },
    body: JSON.stringify({
      model: p.model || modelId(),
      max_tokens: p.maxTokens || MAX_TOKENS,
      temperature: p.temperature === undefined ? 0 : p.temperature,
      system: p.system,
      messages: [{ role: 'user', content: p.user }]
    })
  });
  const ms = Date.now() - t0;
  const text = await res.text();
  if (!res.ok) {
    const err = new Error('모델 호출 실패: HTTP ' + res.status + ' — ' + text.slice(0, 300));
    err.code = 'HTTP_' + res.status;
    throw err;
  }
  let body;
  try { body = JSON.parse(text); } catch (e) { throw new Error('응답 본문이 JSON 이 아닙니다.'); }
  const rawText = (body.content || []).map((c) => (c.type === 'text' ? c.text : '')).join('');
  return { rawText, usage: body.usage || {}, ms, model: body.model || p.model || modelId() };
}

/**
 * 실험군 1건 실행. 프롬프트는 lib/prompts.mjs 가 만든다.
 * @param {string} arm 'B'|'C'|'D'|'E'
 * @param {object} ctx buildContext 결과
 * @param {object} o { pool, draftDoc, feedback, key, dir, temperature }
 */
export async function aiDoc(arm, ctx, o) {
  const opt = o || {};
  const prompt = buildPrompt(arm, ctx, { pool: opt.pool, draftDoc: opt.draftDoc });
  const user = opt.feedback && opt.feedback.length
    ? prompt.user + '\n\n[이전 시도에서 검증기가 반려한 항목 — 모두 고쳐서 다시 써라]\n' + opt.feedback.join('\n')
    : prompt.user;
  const r = await callModel({
    system: prompt.system,
    user,
    key: opt.key || apiKey(opt.dir),
    temperature: opt.temperature === undefined ? 0 : opt.temperature
  });
  const doc = parseJsonLoose(r.rawText);
  doc.engine = 'ai-' + arm.toLowerCase();
  doc.grounding = 'evidence';
  return { doc, usage: r.usage, ms: r.ms, model: r.model, prompt, rawText: r.rawText };
}
