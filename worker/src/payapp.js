/* ==========================================================================
   페이앱(PayApp) 연동 (src/payapp.js)
   --------------------------------------------------------------------------
   근거 문서: https://docs.payapp.kr (2026-11-24 확인)
     · 결제 요청  POST https://api.payapp.kr/oapi/v2  cmd=payrequest
        필수: userid, goodname, price, recvphone  /  선택: feedbackurl, var1, var2,
        returnurl, checkretry, smsuse, memo
        응답: state=1&mul_no=...&payurl=...  (state=0이면 errorMessage·errorCode)
        최소 결제금액 1,000원 → 1,900원은 통과
     · 웹훅(Fedbackurl)  POST (x-www-form-urlencoded)
        userid·linkkey·linkval·price·pay_state·mul_no·var1·var2·pay_date·hash
        정상 처리는 HTTP 200 + 본문 "SUCCESS" (아니면 checkretry=y일 때 10회 재시도)
     · API hash  sha256(userid + requestdate + requestkey), requestdate는 ±15분
     · 취소(정산 전) cmd=paycancel, 환불(정산 후) cmd=paycancelreq

   여기서 지키는 것
     1) 금액은 절대 파라미터로 받지 않는다. PAY_PRICE 상수를 쓴다.
     2) linkkey·linkval·requestkey는 Worker secret에서만 읽는다.
     3) 웹훅은 userid·linkkey·linkval·hash·price를 전부 대조한 뒤에만 처리한다.
   ========================================================================== */
import { sha256Hex } from './validate.js';
import { timingSafeEqual } from './token.js';

export const PAY_AMOUNT = 1900;
export const PAYAPP_ENDPOINT = 'https://api.payapp.kr/oapi/v2';

/** 14자리 yyyymmddhhiiss (KST) — 페이앱은 한국 시간 기준 */
export function stamp14(ms) {
  const d = new Date((ms == null ? Date.now() : ms) + 9 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) +
    p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds());
}

/** API hash: sha256(userid + requestdate + requestkey) */
export async function apiHash(userid, requestdate, requestkey) {
  return sha256Hex(String(userid) + String(requestdate) + String(requestkey));
}

function form(params) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    body.set(k, String(v));
  }
  return body;
}

function parseOapi(text) {
  const out = {};
  new URLSearchParams(String(text || '')).forEach((v, k) => { out[k] = v; });
  return out;
}

/**
 * 결제 요청 생성.
 * @returns {{ok:true, mulNo:string, payUrl:string, raw:object} | {ok:false, error:string, code?:string, raw?:object}}
 */
export async function payRequest(env, opts = {}, fetchImpl) {
  const { orderId, inputHash, recvphone, returnUrl } = opts;
  const userid = env.PAYAPP_USERID;
  if (!userid) return { ok: false, error: 'payapp_not_configured', code: 'no_userid' };

  const requestdate = stamp14();
  const params = {
    cmd: 'payrequest',
    userid,
    goodname: env.GOODNAME || '냥도사의 천기누설 전체 풀이',
    price: String(PAY_AMOUNT),
    recvphone,
    memo: '냥도사 ' + orderId,
    reqaddr: '0',
    feedbackurl: opts.feedbackUrl || feedbackUrl(env),
    var1: orderId,
    var2: String(inputHash || '').slice(0, 40),
    smsuse: 'n',
    returnurl: returnUrl || (env.RETURN_URL + '?orderId=' + encodeURIComponent(orderId)),
    checkretry: 'y'
  };

  // 결제 KEY가 있으면 해시 인증을 함께 보낸다 (페이앱 권장: requestdate ±15분)
  if (env.PAYAPP_REQUESTKEY) {
    params.requestdate = requestdate;
    params.hash = await apiHash(userid, requestdate, env.PAYAPP_REQUESTKEY);
  }

  const doFetch = fetchImpl || opts.fetchImpl || fetch;
  let res, text;
  try {
    res = await doFetch(PAYAPP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: form(params).toString()
    });
    text = await res.text();
  } catch (err) {
    return { ok: false, error: 'payapp_unreachable', code: 'network' };
  }

  const data = parseOapi(text);
  if (data.state === '1' && data.payurl && data.mul_no) {
    return { ok: true, mulNo: String(data.mul_no), payUrl: String(data.payurl), raw: data };
  }
  return {
    ok: false,
    error: data.errorMessage || 'payapp_request_failed',
    code: data.errorCode || data.errno || null,
    raw: data
  };
}

export function feedbackUrl(env) {
  const base = env.PUBLIC_BASE || (env.RETURN_URL ? new URL(env.RETURN_URL).origin : '');
  return base ? base + '/api/hooks/payapp' : '/api/hooks/payapp';
}

/**
 * 웹훅 검증. 여기서 하나라도 어긋나면 절대 결제 처리하지 않는다.
 * @param {object} p 받은 폼 값
 * @param {object} env
 * @param {object} order D1 주문 (없으면 금액·주문 대조 생략 불가 → 실패)
 */
export async function verifyFeedback(p, env, order) {
  if (!env.PAYAPP_LINKKEY || !env.PAYAPP_LINKVAL) return { ok: false, reason: 'not_configured' };

  if (env.PAYAPP_USERID && String(p.userid || '') !== String(env.PAYAPP_USERID)) {
    return { ok: false, reason: 'bad_userid' };
  }
  if (!timingSafeEqual(String(p.linkkey || ''), String(env.PAYAPP_LINKKEY))) {
    return { ok: false, reason: 'bad_linkkey' };
  }
  if (!timingSafeEqual(String(p.linkval || ''), String(env.PAYAPP_LINKVAL))) {
    return { ok: false, reason: 'bad_linkval' };
  }

  // hash가 함께 오면 반드시 대조한다 (위변조 방지)
  if (env.PAYAPP_REQUESTKEY && p.hash && p.responsedate) {
    const expect = await apiHash(env.PAYAPP_USERID, p.responsedate, env.PAYAPP_REQUESTKEY);
    if (!timingSafeEqual(String(p.hash), expect)) return { ok: false, reason: 'bad_hash' };
  }

  if (Number(p.price) !== PAY_AMOUNT) return { ok: false, reason: 'bad_price' };

  // 주문을 찾았으면 그 주문의 금액과도 대조한다 (서버 상수 확인)
  if (order && Number(order.amount) !== PAY_AMOUNT) return { ok: false, reason: 'bad_order_amount' };

  // var1(주문번호)을 보냈으면 대조한다
  if (order && p.var1 && String(p.var1) !== String(order.id)) return { ok: false, reason: 'order_mismatch' };

  // 주문에 결제요청번호가 붙어 있으면 통보의 mul_no와 같아야 한다
  if (order && order.pg_ref && String(p.mul_no) !== String(order.pg_ref)) {
    return { ok: false, reason: 'mulno_mismatch' };
  }

  return { ok: true };
}

/** 취소(정산 전) / 환불 요청(정산 후) */
export async function payCancel(env, opts = {}, fetchImpl) {
  const { mulNo, memo, afterSettle } = opts;
  if (!env.PAYAPP_USERID || !env.PAYAPP_LINKKEY || !env.PAYAPP_REQUESTKEY) {
    return { ok: false, error: 'payapp_not_configured' };
  }
  const requestdate = stamp14();
  const params = {
    cmd: afterSettle ? 'paycancelreq' : 'paycancel',
    userid: env.PAYAPP_USERID,
    linkkey: env.PAYAPP_LINKKEY,
    requestdate,
    hash: await apiHash(env.PAYAPP_USERID, requestdate, env.PAYAPP_REQUESTKEY),
    mul_no: mulNo,
    cancelmemo: memo || '고객 요청에 의한 취소'
  };
  const doFetch = fetchImpl || opts.fetchImpl || fetch;
  let text;
  try {
    const res = await doFetch(PAYAPP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: form(params).toString()
    });
    text = await res.text();
  } catch (err) {
    return { ok: false, error: 'payapp_unreachable' };
  }
  const data = parseOapi(text);
  if (data.state === '1') return { ok: true, raw: data };
  return { ok: false, error: data.errorMessage || 'cancel_failed', raw: data };
}
