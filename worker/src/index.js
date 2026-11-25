/* ==========================================================================
   냥도사 결제·유료 본문 Worker (src/index.js)
   --------------------------------------------------------------------------
   이 Worker 하나가 세 가지를 지킨다.
     1) 1,900원은 서버 상수다. 클라이언트가 보낸 금액은 쓰지 않는다.
     2) 유료 본문은 결제 완료 주문의 서명 토큰으로만 나간다 (Cache-Control: no-store).
     3) 같은 사주·같은 결제요청번호로 두 번 결제되지 않는다 (D1 UNIQUE + 멱등 처리).

   경로
     POST /api/preview            무료 티저 3줄 (결제 없음)
     POST /api/order              주문 생성 → 페이앱 payurl
     GET  /api/order/:id/status   결제 상태 폴링 (+ 토큰)
     POST /api/hooks/payapp       페이앱 웹훅 (200 + "SUCCESS")
     GET  /api/reading?token=…    유료 본문
     POST /api/admin/cancel       취소·환불 (ADMIN_TOKEN)
     GET  /api/health
   ========================================================================== */
import * as db from './db.js';
import { normalizeInput, inputHashOf, InputError } from './validate.js';
import { signToken, verifyToken, hashToken } from './token.js';
import { PAY_AMOUNT, payRequest, verifyFeedback, payCancel, feedbackUrl } from './payapp.js';
import { paidPayload, previewPayload } from './reading.js';

const ORDER_REUSE_MS = 30 * 60 * 1000;     // 대기 주문 재사용 창 (30분)
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      return await route(request, env, url, cors);
    } catch (err) {
      if (err instanceof InputError) {
        return json({ error: 'invalid_input', message: err.message, field: err.field }, 400, cors);
      }
      console.error('unhandled', err && err.stack ? err.stack : err);
      return json({ error: 'server_error' }, 500, cors);
    }
  }
};

async function route(request, env, url, cors) {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;

  if (path === '/api/health' && method === 'GET') {
    let orders = null;
    try { orders = (await env.DB.prepare(db.SQL.health).first()).n; } catch (e) { orders = null; }
    return json({
      ok: true,
      payments: env.PAYMENTS === 'on' ? 'on' : 'off',
      payapp: env.PAYAPP_USERID ? 'configured' : 'missing',
      orders
    }, 200, cors);
  }

  if (path === '/api/preview' && method === 'POST') {
    const body = await readJson(request);
    const input = normalizeInput(body);
    return json(previewPayload(input), 200, { ...cors, 'Cache-Control': 'no-store' });
  }

  if (path === '/api/order' && method === 'POST') {
    return createOrder(request, env, cors);
  }

  const statusMatch = path.match(/^\/api\/order\/([\w-]{4,64})\/status$/);
  if (statusMatch && method === 'GET') {
    return orderStatus(statusMatch[1], url, env, cors);
  }

  if (path === '/api/hooks/payapp' && method === 'POST') {
    return payappHook(request, env, cors);
  }

  if (path === '/api/reading' && method === 'GET') {
    return reading(url, request, env, cors);
  }

  if (path === '/api/admin/cancel' && method === 'POST') {
    return adminCancel(request, env, cors);
  }

  /* ---------- 공유 코드 (/r/{code}) ---------- */
  if (path === '/api/share' && method === 'POST') {
    return createShare(request, env, cors);
  }

  const shareRevoke = path.match(/^\/api\/share\/([A-Z2-7]{6,32})\/revoke$/);
  if (shareRevoke && method === 'POST') {
    return revokeShareCode(request, env, shareRevoke[1], cors);
  }

  const sharePath = path.match(/^\/r\/([A-Z2-7]{6,32})$/);
  if (sharePath && method === 'GET') {
    return readShare(sharePath[1], request, env, url, cors);
  }

  const shareApi = path.match(/^\/api\/share\/([A-Z2-7]{6,32})$/);
  if (shareApi && method === 'GET') {
    return readShare(shareApi[1], request, env, url, cors);
  }

  return json({ error: 'not_found' }, 404, cors);
}

/* ==========================================================================
   공유 코드
   --------------------------------------------------------------------------
   저장하는 값은 일간 index(ds)와 일지 index(db) 둘뿐이다. 생년월일·출생시각·
   이름·성별·달력은 받지도 저장하지도 않는다. 코드는 CSPRNG 60bit, TTL 30일,
   발급 시 준 revoke token 으로만 폐기할 수 있다.
   ========================================================================== */
const SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SHARE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function randomCode(len) {
  const n = len || 12;
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < n; i++) out += SHARE_ALPHABET[bytes[i] % 32];
  return out;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createShare(request, env, cors) {
  if (!env.DB) return json({ error: 'db_unavailable' }, 503, cors);
  const body = await readJson(request);
  const ds = Number(body && body.ds);
  const dbi = Number(body && body.db);
  if (!Number.isInteger(ds) || ds < 0 || ds > 9 || !Number.isInteger(dbi) || dbi < 0 || dbi > 11) {
    return json({ error: 'invalid_input', message: 'ds(0~9)와 db(0~11)만 받아요.' }, 400, cors);
  }
  const now = Date.now();
  const code = randomCode(12);
  const revoke = randomToken();
  const revokeHash = await hashToken(revoke);
  const expiresAt = now + SHARE_TTL_MS;
  try {
    await db.insertShare(env.DB, { code, ds, db: dbi, revokeHash, createdAt: now, expiresAt });
    try { await db.purgeExpiredShares(env.DB, now - SHARE_TTL_MS); } catch (e) { /* 청소는 실패해도 된다 */ }
  } catch (e) {
    return json({ error: 'share_failed' }, 500, cors);
  }
  return json({
    ok: true, code, expiresAt,
    revokeToken: revoke,
    note: '서버에는 일간·일지 index만 저장합니다. 생년월일·시각·이름·성별은 저장하지 않아요.'
  }, 201, { ...cors, 'Cache-Control': 'no-store' });
}

async function readShare(code, request, env, url, cors) {
  if (!env.DB) return json({ error: 'db_unavailable' }, 503, cors);
  const row = await db.getShare(env.DB, code).catch(() => null);
  if (!row) return json({ error: 'not_found' }, 404, cors);
  if (row.revoked_at) return json({ error: 'revoked' }, 410, cors);
  if (Number(row.expires_at) <= Date.now()) return json({ error: 'expired' }, 410, cors);

  const accept = request.headers.get('Accept') || '';
  if (accept.includes('text/html') && url.pathname.startsWith('/r/')) {
    // 사람이 링크로 들어온 경우 앱으로 넘긴다. 코드만 넘기고 개인정보는 없다.
    return new Response(null, {
      status: 302,
      headers: { ...cors, Location: '/?r=' + encodeURIComponent(code), 'Cache-Control': 'no-store' }
    });
  }
  return json({ v: 1, ds: row.ds, db: row.db, expiresAt: Number(row.expires_at) },
    200, { ...cors, 'Cache-Control': 'no-store' });
}

async function revokeShareCode(request, env, code, cors) {
  if (!env.DB) return json({ error: 'db_unavailable' }, 503, cors);
  const body = await readJson(request);
  const token = body && body.token;
  if (!token || typeof token !== 'string') return json({ error: 'invalid_input' }, 400, cors);
  const hash = await hashToken(token);
  const ok = await db.revokeShare(env.DB, code, hash, Date.now());
  return json({ ok }, ok ? 200 : 404, { ...cors, 'Cache-Control': 'no-store' });
}

/* ---------------------------------------------------------------- 주문 생성 */

async function createOrder(request, env, cors) {
  if (env.PAYMENTS !== 'on') {
    // 실결제 스위치가 꺼져 있으면 어떤 외부 요청도 만들지 않는다
    return json({ error: 'payments_disabled', message: '아직 실결제가 켜지지 않았습니다.' }, 503, cors);
  }
  if (!env.PAYAPP_USERID || !env.PAYAPP_LINKKEY || !env.PAYAPP_LINKVAL) {
    return json({ error: 'payapp_not_configured' }, 503, cors);
  }

  const body = await readJson(request);
  const input = normalizeInput(body);
  const inputHash = await inputHashOf(input);

  // 1) 이미 결제한 사주 → 새 결제를 만들지 않고 열람 토큰만 다시 준다 (중복 결제 차단)
  const paid = await db.getPaidOrderByHash(env.DB, inputHash);
  if (paid) {
    const token = await issueToken(env, paid);
    return json({
      orderId: paid.id, status: 'paid', amount: PAY_AMOUNT, token, reused: true
    }, 200, cors);
  }

  // 2) 대기 중 주문 → 30분 안이면 같은 결제창을 다시 쓴다
  const open = await db.getCreatedOrderByHash(env.DB, inputHash);
  if (open && open.payurl && Date.now() - open.created_at < ORDER_REUSE_MS) {
    return json({
      orderId: open.id, status: 'created', amount: PAY_AMOUNT,
      payUrl: open.payurl, reused: true
    }, 200, cors);
  }
  if (open) await db.expireOrder(env.DB, open.id);

  // 3) 새 주문 (금액은 서버 상수)
  const orderId = 'ord_' + crypto.randomUUID();
  const createdAt = Date.now();
  const inserted = await db.insertOrder(env.DB, {
    id: orderId,
    inputHash,
    inputJson: JSON.stringify(input),
    amount: PAY_AMOUNT,
    createdAt
  });

  if (!inserted) {
    // 동시 요청에서 진 쪽 — 이긴 주문을 그대로 돌려준다
    const again = await db.getCreatedOrderByHash(env.DB, inputHash);
    if (again && again.payurl) {
      return json({ orderId: again.id, status: 'created', amount: PAY_AMOUNT, payUrl: again.payurl, reused: true }, 200, cors);
    }
    const paidAgain = await db.getPaidOrderByHash(env.DB, inputHash);
    if (paidAgain) {
      const token = await issueToken(env, paidAgain);
      return json({ orderId: paidAgain.id, status: 'paid', amount: PAY_AMOUNT, token, reused: true }, 200, cors);
    }
    return json({ error: 'order_conflict', message: '잠시 뒤 다시 시도해 주세요.' }, 409, cors);
  }

  // 4) 페이앱 결제 요청
  const recvphone = env.PAYAPP_RECVPHONE;
  if (!recvphone) {
    await db.expireOrder(env.DB, orderId);
    return json({ error: 'payapp_recvphone_missing' }, 503, cors);
  }
  const returnUrl = (env.RETURN_URL || '') + '?orderId=' + encodeURIComponent(orderId);
  // 웹훅 주소는 이 Worker 자신의 오리진에서 만든다 (PUBLIC_BASE로 덮어쓸 수 있다)
  const selfBase = env.PUBLIC_BASE || new URL(request.url).origin;
  const res = await payRequest(env, {
    orderId, inputHash, recvphone, returnUrl,
    feedbackUrl: selfBase.replace(/\/+$/, '') + '/api/hooks/payapp'
  }, env.FETCH || fetch);

  if (!res.ok) {
    await db.expireOrder(env.DB, orderId);
    return json({
      error: 'payapp_request_failed',
      message: res.error || '결제창을 열지 못했습니다.',
      code: res.code || null
    }, 502, cors);
  }

  const attached = await db.attachPayApp(env.DB, orderId, res.mulNo, res.payUrl);
  if (!attached) {
    // mul_no UNIQUE 충돌 등 — 결제창은 이미 만들어졌으므로 주문을 되돌리고 알린다
    await db.expireOrder(env.DB, orderId);
    return json({ error: 'order_attach_failed' }, 500, cors);
  }

  return json({
    orderId, status: 'created', amount: PAY_AMOUNT,
    payUrl: res.payUrl, mulNo: res.mulNo,
    returnUrl
  }, 200, cors);
}

/* -------------------------------------------------------------- 상태 폴링 */

async function orderStatus(orderId, url, env, cors) {
  const order = await db.getOrder(env.DB, orderId);
  if (!order) return json({ error: 'not_found' }, 404, cors);

  // 남의 주문을 들여다보지 못하게 입력 해시를 함께 요구한다
  const h = url.searchParams.get('h');
  if (h && h !== order.input_hash) return json({ error: 'forbidden' }, 403, cors);

  const out = {
    orderId: order.id,
    status: order.status,
    amount: order.amount,
    paid: order.status === 'paid'
  };
  if (order.status === 'paid') out.token = await issueToken(env, order);
  return json(out, 200, { ...cors, 'Cache-Control': 'no-store' });
}

/* ------------------------------------------------------------ 페이앱 웹훅 */

async function payappHook(request, env, cors) {
  const text = await request.text();
  const p = {};
  new URLSearchParams(text).forEach((v, k) => { p[k] = v; });

  const mulNo = String(p.mul_no || '');
  const payState = String(p.pay_state || '');
  const receivedAt = Date.now();

  if (!mulNo || !payState) return new Response('FAIL', { status: 400, headers: cors });

  // 주문 찾기: var1(주문번호) 우선, 없으면 mul_no
  let order = null;
  if (p.var1) order = await db.getOrder(env.DB, String(p.var1));
  if (!order) order = await db.getOrderByMulNo(env.DB, mulNo);

  const verified = await verifyFeedback(p, env, order);
  if (!verified.ok) {
    console.warn('payapp hook rejected', verified.reason, mulNo, payState);
    return new Response('FAIL', { status: 400, headers: cors });
  }

  if (!order) {
    // 우리 주문이 아닌 통보 — 기록만 남기고 성공 응답(재시도 폭주 방지)
    await db.recordWebhook(env.DB, { mulNo, payState, orderId: null, price: Number(p.price) || null, payDate: p.pay_date || null, receivedAt });
    console.warn('payapp hook without order', mulNo);
    return new Response('SUCCESS', { status: 200, headers: cors });
  }

  // 같은 통보가 여러 번 온다 — (mul_no, pay_state)로 한 번만 처리한다
  const first = await db.recordWebhook(env.DB, {
    mulNo, payState, orderId: order.id, price: Number(p.price) || null,
    payDate: p.pay_date || null, receivedAt
  });

  if (!first) {
    // 이미 처리한 통보: 상태는 그대로, 성공만 알린다 (멱등)
    return new Response('SUCCESS', { status: 200, headers: cors });
  }

  if (payState === '4') {
    if (order.status === 'paid') {
      return new Response('SUCCESS', { status: 200, headers: cors });
    }
    const ok = await db.markPaid(env.DB, order.id, receivedAt, mulNo);
    if (!ok) {
      // 이미 다른 경로로 상태가 바뀐 경우 — 새 토큰만 정리하고 성공 응답
      console.warn('markPaid skipped', order.id, order.status);
    }
    return new Response('SUCCESS', { status: 200, headers: cors });
  }

  if (['8', '32', '9', '64', '70', '71'].includes(payState)) {
    await db.markRefunded(env.DB, order.id, receivedAt);
    await db.revokeTokens(env.DB, order.id);
    return new Response('SUCCESS', { status: 200, headers: cors });
  }

  // 1(요청), 10(가상계좌 대기) 등은 상태를 바꾸지 않는다
  return new Response('SUCCESS', { status: 200, headers: cors });
}

/* ------------------------------------------------------------ 유료 본문 */

async function reading(url, request, env, cors) {
  const auth = request.headers.get('Authorization') || '';
  const token = url.searchParams.get('token') || (auth.startsWith('Bearer ') ? auth.slice(7) : '');
  const noStore = { ...cors, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

  if (!token) return json({ error: 'token_required' }, 401, noStore);

  const v = await verifyToken(token, env.TOKEN_SECRET);
  if (!v.ok) {
    return json({ error: 'invalid_token', reason: v.reason }, v.reason === 'expired' ? 410 : 401, noStore);
  }

  const order = await db.getOrder(env.DB, v.payload.o);
  if (!order || order.status !== 'paid') return json({ error: 'not_paid' }, 403, noStore);
  if (order.input_hash !== v.payload.h) return json({ error: 'order_mismatch' }, 403, noStore);

  const row = await db.getToken(env.DB, v.tokenHash);
  if (!row || row.revoked) return json({ error: 'token_revoked' }, 403, noStore);

  let input;
  try {
    input = JSON.parse(order.input_json || '{}');
  } catch (e) {
    return json({ error: 'order_corrupt' }, 500, noStore);
  }

  const payload = paidPayload(input, order.id);
  payload.inputHash = order.input_hash;
  payload.expiresAt = v.payload.e;
  return json(payload, 200, noStore);
}

/* -------------------------------------------------------------- 관리(취소) */

async function adminCancel(request, env, cors) {
  const given = request.headers.get('X-Admin-Token') || '';
  if (!env.ADMIN_TOKEN || given !== env.ADMIN_TOKEN) return json({ error: 'forbidden' }, 403, cors);

  const body = await readJson(request);
  const orderId = String(body.orderId || '');
  const order = await db.getOrder(env.DB, orderId);
  if (!order) return json({ error: 'not_found' }, 404, cors);
  if (!order.pg_ref) return json({ error: 'no_payment' }, 409, cors);

  const res = await payCancel(env, {
    mulNo: order.pg_ref,
    memo: body.memo || '고객 요청 취소',
    afterSettle: !!body.afterSettle
  }, env.FETCH || fetch);

  if (!res.ok) return json({ error: 'cancel_failed', message: res.error }, 502, cors);

  await db.markRefunded(env.DB, order.id, Date.now());
  await db.revokeTokens(env.DB, order.id);
  return json({ ok: true, orderId: order.id }, 200, cors);
}

/* ---------------------------------------------------------------- 토큰 발급 */

async function issueToken(env, order) {
  const now = Date.now();
  const token = await signToken({
    orderId: order.id,
    inputHash: order.input_hash,
    expiresAt: now + TOKEN_TTL_MS
  }, env.TOKEN_SECRET);
  await db.insertToken(env.DB, await hashToken(token), order.id, now + TOKEN_TTL_MS, now);
  return token;
}

/* -------------------------------------------------------------------- 유틸 */

async function readJson(request) {
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    try { return await request.json(); } catch (e) { throw new InputError('JSON을 읽지 못했습니다'); }
  }
  const text = await request.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch (e) { throw new InputError('JSON을 읽지 못했습니다'); }
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { ...(cors || {}), 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const okOrigin = allowed.includes(origin) ? origin : (allowed[0] || 'null');
  return {
    'Access-Control-Allow-Origin': okOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}
