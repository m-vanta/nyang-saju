/* ==========================================================================
   열람 토큰 (src/token.js)
   --------------------------------------------------------------------------
   t1.<base64url(payload)>.<base64url(HMAC-SHA256)>
   payload = { v:1, o:orderId, h:inputHash, e:만료(ms) }

   토큰만으로 서명·만료를 확인하고, 환불·회수는 D1(tokens.revoked)로 확인한다.
   토큰 문자열은 DB에 그대로 저장하지 않고 sha256만 저장한다 — DB가 새도
   남의 유료 본문을 열 수 없게 하기 위해서다.
   ========================================================================== */
import { sha256Hex } from './validate.js';

export const TOKEN_PREFIX = 't1';
export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일

export async function signToken({ orderId, inputHash, expiresAt }, secret) {
  if (!secret) throw new Error('TOKEN_SECRET이 없습니다');
  const payload = { v: 1, o: orderId, h: inputHash, e: expiresAt };
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = await hmac(body, secret);
  return TOKEN_PREFIX + '.' + body + '.' + sig;
}

/** 서명·형식 검증. 실패 사유를 코드로 돌려준다 */
export async function verifyToken(token, secret, nowMs) {
  const now = nowMs == null ? Date.now() : nowMs;
  if (typeof token !== 'string' || token.length > 1024) return { ok: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return { ok: false, reason: 'malformed' };

  const expected = await hmac(parts[1], secret);
  if (!timingSafeEqual(expected, parts[2])) return { ok: false, reason: 'bad_signature' };

  let payload;
  try {
    payload = JSON.parse(b64urlDecode(parts[1]));
  } catch (e) {
    return { ok: false, reason: 'malformed' };
  }
  if (!payload || payload.v !== 1 || !payload.o || !payload.h) return { ok: false, reason: 'malformed' };
  if (typeof payload.e !== 'number' || payload.e <= now) return { ok: false, reason: 'expired' };

  return { ok: true, payload, tokenHash: await sha256Hex(token) };
}

export async function hashToken(token) {
  return sha256Hex(token);
}

export function b64urlEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(text) {
  const pad = text.length % 4 ? '='.repeat(4 - (text.length % 4)) : '';
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmac(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  let bin = '';
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function timingSafeEqual(a, b) {
  const x = String(a), y = String(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
