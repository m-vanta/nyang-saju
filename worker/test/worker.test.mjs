/* ==========================================================================
   Worker 통합 테스트 (test/worker.test.mjs)
   --------------------------------------------------------------------------
   실행: cd apps/nyang-saju/worker && node --test test/
   진짜 D1·페이앱 없이 돈다. 페이앱 응답은 FETCH 목으로 바꿔 끼운다.

   검사하는 것 (plan.md 2단계 3항 + 대표 지시 2항)
     · 주문 생성: 금액 1,900 서버 고정, payrequest 파라미터, payurl 반환
     · 중복 결제 방지: 같은 inputHash 재요청 시 새 주문·새 payrequest 없음
     · 같은 mul_no 중복 방지
     · 금액 변조 거부 (본문 amount 무시, 웹훅 price 1,900 외 거부)
     · 웹훅 linkkey/linkval/hash 불일치 거부, pay_state=4만 결제 처리
     · 웹훅 멱등 (같은 통보 두 번 → 한 번만 처리)
     · 토큰 위조·만료·환불 후 열람 거부
     · 유료 본문 클라이언트 미포함 (copy.js 누출 검사)
   ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import worker from '../src/index.js';
import { MemoryD1 } from './memory-d1.mjs';
import { SQL } from '../src/db.js';
import { PAID_MASTER_FIELDS, MASTER_PAID, THEME, PATTERN } from '../src/paid-copy.js';
import { PAY_AMOUNT } from '../src/payapp.js';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, '../..');

const BIRTH = {
  name: '민지', gender: '여성', year: 1990, month: 1, day: 23,
  calendar: 'solar', isLeap: false, hourIdx: 6, focus: 'love'
};

/* ---------- 테스트용 환경 ---------- */
function makeEnv(overrides = {}) {
  const calls = [];
  const env = {
    DB: new MemoryD1(),
    PAYMENTS: 'on',
    PAYAPP_USERID: 'nyangdo',
    PAYAPP_LINKKEY: 'LINKKEY_TEST',
    PAYAPP_LINKVAL: 'LINKVAL_TEST',
    PAYAPP_REQUESTKEY: 'REQKEY_TEST',
    PAYAPP_RECVPHONE: '01012345678',
    TOKEN_SECRET: 'test-secret-0123456789abcdef',
    ADMIN_TOKEN: 'admin-test',
    RETURN_URL: 'https://m-vanta.github.io/nyang-saju/',
    ALLOWED_ORIGINS: 'https://m-vanta.github.io',
    GOODNAME: '냥도사의 천기누설 전체 풀이',
    FETCH: async (url, init) => {
      calls.push({ url, init });
      const body = new URLSearchParams(String(init.body));
      const mulNo = 'MUL' + (calls.length * 1111);
      return new Response(
        'state=1&errorMessage=&mul_no=' + mulNo +
        '&payurl=' + encodeURIComponent('https://payapp.kr/pay/' + mulNo),
        { status: 200 }
      );
    },
    ...overrides
  };
  env.calls = calls;
  return env;
}

function post(path, body, headers) {
  return new Request('https://api.example.com' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://m-vanta.github.io', ...(headers || {}) },
    body: JSON.stringify(body)
  });
}

function get(path, headers) {
  return new Request('https://api.example.com' + path, {
    method: 'GET',
    headers: { Origin: 'https://m-vanta.github.io', ...(headers || {}) }
  });
}

function hook(fields) {
  const body = new URLSearchParams(fields).toString();
  return new Request('https://api.example.com/api/hooks/payapp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
}

function hookFields(env, order, extra = {}) {
  return {
    userid: env.PAYAPP_USERID,
    linkkey: env.PAYAPP_LINKKEY,
    linkval: env.PAYAPP_LINKVAL,
    mul_no: order.pg_ref || 'MUL1111',
    goodname: env.GOODNAME,
    price: String(PAY_AMOUNT),
    pay_state: '4',
    pay_date: '20261124225900',
    var1: order.id,
    var2: order.input_hash.slice(0, 40),
    ...extra
  };
}

async function createPaidOrder(env) {
  const res = await worker.fetch(post('/api/order', BIRTH), env);
  const data = await res.json();
  const order = await env.DB.prepare(SQL.getOrder).bind(data.orderId).first();
  return { data, order };
}

/* ---------------------------------------------------------------- 1단계: 주문 */

test('주문 생성: 금액은 서버 상수 1,900원, payrequest 파라미터가 정확하다', async () => {
  const env = makeEnv();
  const res = await worker.fetch(post('/api/order', { ...BIRTH, amount: 100 }), env);
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.amount, 1900);
  assert.equal(data.status, 'created');
  assert.match(data.payUrl, /^https:\/\/payapp\.kr\/pay\//);
  assert.match(data.orderId, /^ord_/);

  // 금액 변조(amount:100)는 무시되고 페이앱에도 1900만 나간다
  assert.equal(env.calls.length, 1);
  const body = new URLSearchParams(String(env.calls[0].init.body));
  assert.equal(body.get('cmd'), 'payrequest');
  assert.equal(body.get('price'), '1900');
  assert.equal(body.get('userid'), 'nyangdo');
  assert.equal(body.get('goodname'), '냥도사의 천기누설 전체 풀이');
  assert.equal(body.get('recvphone'), '01012345678');
  assert.equal(body.get('var1'), data.orderId);
  assert.equal(body.get('feedbackurl'), 'https://api.example.com/api/hooks/payapp',
    '웹훅 주소는 Worker 자신의 오리진에서 만든다');
  assert.match(body.get('returnurl'), /orderId=ord_/);
  assert.equal(body.get('smsuse'), 'n');
  assert.equal(body.get('checkretry'), 'y');
  assert.ok(body.get('hash'), 'requestkey가 있으면 hash를 함께 보낸다');
  assert.match(body.get('requestdate'), /^\d{14}$/);

  const order = await env.DB.prepare(SQL.getOrder).bind(data.orderId).first();
  assert.equal(order.amount, 1900);
  assert.equal(order.status, 'created');
  assert.equal(order.pg_ref, 'MUL1111');
});

test('실결제 스위치가 꺼져 있으면 주문도 페이앱 호출도 없다', async () => {
  const env = makeEnv({ PAYMENTS: 'off' });
  const res = await worker.fetch(post('/api/order', BIRTH), env);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'payments_disabled');
  assert.equal(env.calls.length, 0);
});

test('잘못된 생년월일은 400, 페이앱 호출 없음', async () => {
  const env = makeEnv();
  const res = await worker.fetch(post('/api/order', { ...BIRTH, month: 13 }), env);
  assert.equal(res.status, 400);
  assert.equal(env.calls.length, 0);
});

test('중복 결제 방지: 같은 사주로 다시 요청하면 새 주문·새 payrequest가 없다', async () => {
  const env = makeEnv();
  const first = await (await worker.fetch(post('/api/order', BIRTH), env)).json();
  const second = await (await worker.fetch(post('/api/order', BIRTH), env)).json();

  assert.equal(env.calls.length, 1, '페이앱은 한 번만 호출된다');
  assert.equal(second.orderId, first.orderId);
  assert.equal(second.reused, true);
  assert.equal(second.payUrl, first.payUrl);
});

test('결제 완료된 사주는 다시 결제시키지 않고 토큰만 발급한다', async () => {
  const env = makeEnv();
  const { data, order } = await createPaidOrder(env);

  const hookRes = await worker.fetch(hook(hookFields(env, order)), env);
  assert.equal(await hookRes.text(), 'SUCCESS');

  const again = await worker.fetch(post('/api/order', BIRTH), env);
  const data2 = await again.json();
  assert.equal(again.status, 200);
  assert.equal(data2.status, 'paid');
  assert.equal(data2.reused, true);
  assert.ok(data2.token);
  assert.equal(env.calls.length, 1, '두 번째 결제 요청이 나가지 않는다');
  assert.equal(data.orderId, data2.orderId);
});

test('같은 mul_no로 두 주문이 붙지 않는다 (페이앱이 같은 번호를 돌려준 경우)', async () => {
  const env = makeEnv({
    FETCH: async () => new Response('state=1&errorMessage=&mul_no=SAME&payurl=https%3A%2F%2Fpayapp.kr%2Fpay%2FSAME', { status: 200 })
  });
  const a = await (await worker.fetch(post('/api/order', BIRTH), env)).json();
  const resB = await worker.fetch(post('/api/order', { ...BIRTH, year: 1991 }), env);
  const b = await resB.json();

  assert.equal(resB.status, 500);
  assert.equal(b.error, 'order_attach_failed');
  const orderB = await env.DB.prepare(SQL.getOrder).bind(b.orderId || '').first();
  assert.ok(!orderB || orderB.status === 'expired', '충돌한 주문은 결제 대기로 남지 않는다');
  const orderA = await env.DB.prepare(SQL.getOrder).bind(a.orderId).first();
  assert.equal(orderA.pg_ref, 'SAME');
});

/* ---------------------------------------------------------------- 2단계: 웹훅 */

test('웹훅 pay_state=4: 주문이 paid가 되고 SUCCESS를 돌려준다', async () => {
  const env = makeEnv();
  const { order } = await createPaidOrder(env);
  const res = await worker.fetch(hook(hookFields(env, order)), env);

  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'SUCCESS');
  const after = await env.DB.prepare(SQL.getOrder).bind(order.id).first();
  assert.equal(after.status, 'paid');
  assert.ok(after.paid_at);
});

test('웹훅 멱등: 같은 통보가 두 번 와도 한 번만 처리된다', async () => {
  const env = makeEnv();
  const { order } = await createPaidOrder(env);
  await worker.fetch(hook(hookFields(env, order)), env);
  const first = await env.DB.prepare(SQL.getOrder).bind(order.id).first();

  const second = await worker.fetch(hook(hookFields(env, order)), env);
  assert.equal(await second.text(), 'SUCCESS');
  const after = await env.DB.prepare(SQL.getOrder).bind(order.id).first();
  assert.equal(after.paid_at, first.paid_at, '두 번째 통보는 상태를 건드리지 않는다');
  assert.equal(env.DB.webhooks.filter((w) => w.pay_state === '4').length, 1);
});

test('웹훅 거부: linkval·linkkey 불일치', async () => {
  const env = makeEnv();
  const { order } = await createPaidOrder(env);

  const bad = await worker.fetch(hook(hookFields(env, order, { linkval: 'HACKED' })), env);
  assert.equal(bad.status, 400);
  assert.equal(await bad.text(), 'FAIL');

  const badKey = await worker.fetch(hook(hookFields(env, order, { linkkey: 'HACKED' })), env);
  assert.equal(await badKey.text(), 'FAIL');

  const still = await env.DB.prepare(SQL.getOrder).bind(order.id).first();
  assert.equal(still.status, 'created', '검증 실패한 통보는 결제로 만들지 않는다');
});

test('웹훅 거부: 금액 변조 (1,900 → 1,000)', async () => {
  const env = makeEnv();
  const { order } = await createPaidOrder(env);
  const res = await worker.fetch(hook(hookFields(env, order, { price: '1000' })), env);
  assert.equal(res.status, 400);
  const still = await env.DB.prepare(SQL.getOrder).bind(order.id).first();
  assert.equal(still.status, 'created');
});

test('웹훅 거부: hash 위조', async () => {
  const env = makeEnv();
  const { order } = await createPaidOrder(env);
  const res = await worker.fetch(hook(hookFields(env, order, { responsedate: '20261124225900', hash: 'deadbeef' })), env);
  assert.equal(res.status, 400);
});

test('웹훅 거부: 다른 주문의 mul_no로 남의 주문을 결제 처리할 수 없다', async () => {
  const env = makeEnv();
  const a = await createPaidOrder(env);
  const b = await (await worker.fetch(post('/api/order', { ...BIRTH, year: 1991 }), env)).json();
  const orderB = await env.DB.prepare(SQL.getOrder).bind(b.orderId).first();

  // b의 mul_no를 a의 var1에 실어 보낸다
  const res = await worker.fetch(hook(hookFields(env, orderB, { mul_no: a.order.pg_ref, var1: orderB.id })), env);
  assert.equal(res.status, 400, 'var1과 mul_no가 서로 다른 주문이면 거부');
  const stillB = await env.DB.prepare(SQL.getOrder).bind(orderB.id).first();
  assert.equal(stillB.status, 'created');
});

test('환불 웹훅(pay_state=9)은 상태를 refunded로 바꾸고 토큰을 회수한다', async () => {
  const env = makeEnv();
  const { order } = await createPaidOrder(env);
  await worker.fetch(hook(hookFields(env, order)), env);

  const status = await (await worker.fetch(get('/api/order/' + order.id + '/status'), env)).json();
  const token = status.token;
  assert.ok(token);

  const refund = await worker.fetch(hook(hookFields(env, order, { pay_state: '9', pay_date: '20261124230100' })), env);
  assert.equal(await refund.text(), 'SUCCESS');

  const after = await env.DB.prepare(SQL.getOrder).bind(order.id).first();
  assert.equal(after.status, 'refunded');

  // 토큰은 회수되고, 환불된 주문은 열리지 않는다
  const stored = await env.DB.prepare(SQL.getToken).bind((await (await import('../src/token.js')).hashToken(token))).first();
  assert.equal(stored.revoked, 1, '환불되면 저장된 토큰이 회수된다');

  const read = await worker.fetch(get('/api/reading?token=' + encodeURIComponent(token)), env);
  assert.equal(read.status, 403);
  assert.ok(['token_revoked', 'not_paid'].includes((await read.json()).error));
});

/* ---------------------------------------------------------------- 3단계: 열람 */

test('결제 후 토큰으로 유료 본문을 받는다 (no-store, 유료 문장 포함)', async () => {
  const env = makeEnv();
  const { order } = await createPaidOrder(env);
  await worker.fetch(hook(hookFields(env, order)), env);

  const status = await (await worker.fetch(get('/api/order/' + order.id + '/status'), env)).json();
  assert.equal(status.status, 'paid');
  assert.ok(status.token);

  const res = await worker.fetch(get('/api/reading?token=' + encodeURIComponent(status.token)), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  const data = await res.json();

  assert.equal(data.orderId, order.id);
  assert.equal(data.themes.length, 3);
  assert.ok(data.themes[0].body.length > 80, '유료 본문이 실제로 담긴다');
  assert.ok(data.paid.talisman.length > 0);
  assert.equal(data.patterns.length, 3);
  assert.ok(data.summary.includes('냥도사의 천기누설'));
});

test('토큰 위조: payload를 바꾸면 401', async () => {
  const env = makeEnv();
  const { order } = await createPaidOrder(env);
  await worker.fetch(hook(hookFields(env, order)), env);
  const status = await (await worker.fetch(get('/api/order/' + order.id + '/status'), env)).json();

  const [p, body, sig] = status.token.split('.');
  const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  payload.o = 'ord_other';
  const forged = p + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.' + sig;

  const res = await worker.fetch(get('/api/reading?token=' + encodeURIComponent(forged)), env);
  assert.equal(res.status, 401);
});

test('토큰 없음·만료·남의 주문 해시', async () => {
  const env = makeEnv();
  const { order } = await createPaidOrder(env);
  await worker.fetch(hook(hookFields(env, order)), env);
  const status = await (await worker.fetch(get('/api/order/' + order.id + '/status'), env)).json();

  assert.equal((await worker.fetch(get('/api/reading'), env)).status, 401);

  // 만료 토큰 직접 만들기
  const { signToken } = await import('../src/token.js');
  const expired = await signToken({ orderId: order.id, inputHash: order.input_hash, expiresAt: Date.now() - 1000 }, env.TOKEN_SECRET);
  const exp = await worker.fetch(get('/api/reading?token=' + encodeURIComponent(expired)), env);
  assert.equal(exp.status, 410);

  const wrongSecretEnv = { ...env, TOKEN_SECRET: 'other-secret' };
  const wrong = await worker.fetch(get('/api/reading?token=' + encodeURIComponent(status.token)), wrongSecretEnv);
  assert.equal(wrong.status, 401);
});

test('결제 전 주문은 열람할 수 없다', async () => {
  const env = makeEnv();
  const { order } = await createPaidOrder(env);
  const { signToken } = await import('../src/token.js');
  const token = await signToken({ orderId: order.id, inputHash: order.input_hash, expiresAt: Date.now() + 60000 }, env.TOKEN_SECRET);

  const res = await worker.fetch(get('/api/reading?token=' + encodeURIComponent(token)), env);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'not_paid');
});

test('상태 폴링: 남의 input_hash로는 토큰이 나오지 않는다', async () => {
  const env = makeEnv();
  const { order } = await createPaidOrder(env);
  await worker.fetch(hook(hookFields(env, order)), env);

  const wrong = await worker.fetch(get('/api/order/' + order.id + '/status?h=deadbeef'), env);
  assert.equal(wrong.status, 403);
  assert.ok(!(await wrong.json()).token);
});

/* ------------------------------------------------------- 4단계: 티저 · 기타 */

test('무료 티저는 결제 없이 3줄을 준다', async () => {
  const env = makeEnv({ PAYMENTS: 'off' });
  const res = await worker.fetch(post('/api/preview', BIRTH), env);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.preview.length, 3);
  assert.deepEqual(data.preview.map((p) => p.key), ['love', 'money', 'work']);
});

test('health: 결제 스위치와 페이앱 설정 상태를 알려 준다', async () => {
  const env = makeEnv({ PAYMENTS: 'off' });
  const res = await worker.fetch(get('/api/health'), env);
  const data = await res.json();
  assert.equal(data.payments, 'off');
  assert.equal(data.payapp, 'configured');
});

/* ------------------------------------------------- 5단계: 유출·동기화 검사 */

test('클라이언트 copy.js 에 유료 문장이 없다', () => {
  const src = readFileSync(resolve(appDir, 'copy.js'), 'utf8');
  const sandbox = {};
  const ctx = vm.createContext({ window: sandbox, console });
  vm.runInContext(src, ctx);
  const C = sandbox.NyangCopy;

  // 1) 구조: 유료 블록이 아예 없다
  assert.equal(C.THEME, undefined, 'THEME 은 서버에만 있어야 한다');
  assert.equal(C.PATTERN, undefined, 'PATTERN 은 서버에만 있어야 한다');
  assert.equal(C.MASTER.length, 10);
  assert.deepEqual(Object.keys(C.MASTER[0]).sort(), ['scene', 'title']);

  // 2) 문장: 유료 본문의 실제 문구가 파일 어디에도 없다 (부분 문자열 대조)
  const leaks = [];
  MASTER_PAID.forEach((m, i) => {
    for (const field of PAID_MASTER_FIELDS) {
      if (field === 'focus') {
        for (const k of Object.keys(m.focus)) {
          const sample = m.focus[k].replace(/\{name\}/g, '').slice(0, 40).trim();
          if (sample.length > 20 && src.includes(sample)) leaks.push('MASTER_PAID[' + i + '].focus.' + k);
        }
      } else {
        const sample = String(m[field]).replace(/\{name\}/g, '').slice(0, 40).trim();
        if (sample.length > 20 && src.includes(sample)) leaks.push('MASTER_PAID[' + i + '].' + field);
      }
    }
  });
  assert.deepEqual(leaks, [], '유료 문장이 클라이언트 파일에 남아 있다: ' + leaks.slice(0, 5).join(', '));

  // 3) THEME·PATTERN 문장도 없다
  const themeSample = THEME.love.elem.same.slice(0, 40);
  assert.ok(!src.includes(themeSample), 'THEME 문장이 클라이언트에 있다');
  const patternSample = PATTERN.god.peer.text.slice(0, 40);
  assert.ok(!src.includes(patternSample), 'PATTERN 문장이 클라이언트에 있다');
});

test('서버 paid-copy.js 에 일간 10종 유료 문장이 다 있다', () => {
  assert.equal(MASTER_PAID.length, 10);
  for (const m of MASTER_PAID) {
    for (const f of PAID_MASTER_FIELDS) {
      assert.ok(m[f] !== undefined, 'MASTER_PAID[' + m.dayMaster + '].' + f + ' 누락');
    }
  }
});

test('worker/src/engine 복사본이 앱 원본과 같다 (문장이 갈라지지 않게)', () => {
  const pairs = [
    ['vendor/manseryeok.js', 'manseryeok.js'],
    ['saju.js', 'saju.js'],
    ['copy.js', 'copy.js'],
    ['palja.js', 'palja.js']
  ];
  for (const [src, copy] of pairs) {
    const a = readFileSync(resolve(appDir, src), 'utf8');
    const b = readFileSync(resolve(here, '../src/engine/' + copy), 'utf8');
    assert.ok(b.endsWith(a), copy + ' 가 원본과 다르다 — node tools/sync-engine.mjs 를 실행하세요');
  }
});

/* ==========================================================================
   공유 코드 (/api/share · /r/{code}) — v2.3
   서버에는 일간·일지 index 두 개만 저장한다. 생년월일·시각·이름·성별·달력은
   요청에도 저장에도 응답에도 없다.
   ========================================================================== */

test('공유 코드: 일간·일지 index만 저장하고 30일 TTL·폐기 토큰을 준다', async () => {
  const env = makeEnv();
  const res = await worker.fetch(post('/api/share', { v: 1, ds: 6, db: 6 }), env, {});
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.match(body.code, /^[A-Z2-7]{12}$/);
  assert.equal(body.expiresAt - Date.now() > 29 * 86400000, true);
  assert.ok(body.revokeToken && body.revokeToken.length >= 40);

  const row = [...env.DB.shares.values()][0];
  assert.equal(row.ds, 6);
  assert.equal(row.db, 6);
  assert.deepEqual(Object.keys(row).sort(), ['code', 'created_at', 'db', 'ds', 'expires_at', 'revoke_hash', 'revoked_at']);
  assert.equal(JSON.stringify(row).includes('1990'), false);
  assert.equal(JSON.stringify(row).includes('민지'), false);
});

test('공유 코드: 잘못된 index는 400, 코드는 매번 새로 만든다', async () => {
  const env = makeEnv();
  const bad = await worker.fetch(post('/api/share', { ds: 10, db: 0 }), env, {});
  assert.equal(bad.status, 400);
  const a = await (await worker.fetch(post('/api/share', { ds: 1, db: 2 }), env, {})).json();
  const b = await (await worker.fetch(post('/api/share', { ds: 1, db: 2 }), env, {})).json();
  assert.notEqual(a.code, b.code);
});

test('공유 코드: /r/{code} 는 일간·일지·만료만 돌려주고 no-store', async () => {
  const env = makeEnv();
  const made = await (await worker.fetch(post('/api/share', { ds: 4, db: 9 }), env, {})).json();
  const res = await worker.fetch(get('/r/' + made.code), env, {});
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  const body = await res.json();
  assert.deepEqual(Object.keys(body).sort(), ['db', 'ds', 'expiresAt', 'v']);
  assert.equal(body.ds, 4);
  assert.equal(body.db, 9);
});

test('공유 코드: 없는 코드 404, 폐기하면 410', async () => {
  const env = makeEnv();
  assert.equal((await worker.fetch(get('/r/AAAAAAAAAAAA'), env, {})).status, 404);

  const made = await (await worker.fetch(post('/api/share', { ds: 2, db: 3 }), env, {})).json();
  const wrong = await worker.fetch(post('/api/share/' + made.code + '/revoke', { token: 'nope' }), env, {});
  assert.equal(wrong.status, 404);

  const ok = await worker.fetch(post('/api/share/' + made.code + '/revoke', { token: made.revokeToken }), env, {});
  assert.equal(ok.status, 200);
  assert.equal((await worker.fetch(get('/r/' + made.code), env, {})).status, 410);
});

test('공유 코드: 만료된 코드는 410', async () => {
  const env = makeEnv();
  const made = await (await worker.fetch(post('/api/share', { ds: 0, db: 0 }), env, {})).json();
  env.DB.shares.get(made.code).expires_at = Date.now() - 1000;
  assert.equal((await worker.fetch(get('/r/' + made.code), env, {})).status, 410);
});
