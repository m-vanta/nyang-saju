/* ==========================================================================
   D1 접근 계층 (src/db.js)
   --------------------------------------------------------------------------
   SQL은 전부 여기 한 곳에 모은다. 문장을 상수로 두면 테스트용 메모리 D1이
   같은 문장을 그대로 흉내 낼 수 있고, 문장이 바뀌면 테스트가 먼저 깨진다.
   ========================================================================== */

export const SQL = {
  insertOrder: `INSERT INTO orders
      (id, input_hash, input_json, amount, status, pg, created_at)
    VALUES (?, ?, ?, ?, 'created', 'payapp', ?)`,

  attachPayApp: `UPDATE orders SET pg_ref = ?, payurl = ?
    WHERE id = ? AND status = 'created' AND pg_ref IS NULL`,

  getOrder: `SELECT * FROM orders WHERE id = ?`,

  getOrderByMulNo: `SELECT * FROM orders WHERE pg_ref = ?`,

  getPaidOrderByHash: `SELECT * FROM orders WHERE input_hash = ? AND status = 'paid'
    ORDER BY paid_at DESC LIMIT 1`,

  getCreatedOrderByHash: `SELECT * FROM orders WHERE input_hash = ? AND status = 'created'
    ORDER BY created_at DESC LIMIT 1`,

  expireOrder: `UPDATE orders SET status = 'expired'
    WHERE id = ? AND status = 'created'`,

  markPaid: `UPDATE orders SET status = 'paid', paid_at = ?, pg_ref = COALESCE(pg_ref, ?)
    WHERE id = ? AND status = 'created'`,

  markRefunded: `UPDATE orders SET status = 'refunded', refunded_at = ?
    WHERE id = ? AND status IN ('paid', 'created')`,

  countPaidOrders: `SELECT COUNT(*) AS n FROM orders WHERE status = 'paid'`,

  insertWebhook: `INSERT OR IGNORE INTO webhooks
      (mul_no, pay_state, order_id, price, pay_date, received_at)
    VALUES (?, ?, ?, ?, ?, ?)`,

  insertToken: `INSERT OR REPLACE INTO tokens
      (token_hash, order_id, expires_at, revoked, created_at)
    VALUES (?, ?, ?, 0, ?)`,

  getToken: `SELECT * FROM tokens WHERE token_hash = ?`,

  revokeTokens: `UPDATE tokens SET revoked = 1 WHERE order_id = ?`,

  health: `SELECT COUNT(*) AS n FROM orders`,

  insertShare: `INSERT INTO shares
      (code, ds, db, revoke_hash, created_at, expires_at, revoked_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL)`,

  getShare: `SELECT code, ds, db, expires_at, revoked_at FROM shares WHERE code = ?`,

  revokeShare: `UPDATE shares SET revoked_at = ?
    WHERE code = ? AND revoke_hash = ? AND revoked_at IS NULL`,

  purgeExpiredShares: `DELETE FROM shares WHERE expires_at < ?`
};

/** 주문 생성. UNIQUE 제약에 걸리면 null (동시 요청에서 진 쪽) */
export async function insertOrder(db, o) {
  try {
    await db.prepare(SQL.insertOrder)
      .bind(o.id, o.inputHash, o.inputJson, o.amount, o.createdAt).run();
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

export async function attachPayApp(db, id, mulNo, payurl) {
  try {
    const res = await db.prepare(SQL.attachPayApp).bind(mulNo, payurl, id).run();
    return changesOf(res) > 0;
  } catch (err) {
    // orders.pg_ref UNIQUE — 같은 결제요청번호가 다른 주문에 이미 붙어 있다
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

export async function getOrder(db, id) {
  return db.prepare(SQL.getOrder).bind(id).first();
}

export async function getOrderByMulNo(db, mulNo) {
  return db.prepare(SQL.getOrderByMulNo).bind(mulNo).first();
}

export async function getPaidOrderByHash(db, inputHash) {
  return db.prepare(SQL.getPaidOrderByHash).bind(inputHash).first();
}

export async function getCreatedOrderByHash(db, inputHash) {
  return db.prepare(SQL.getCreatedOrderByHash).bind(inputHash).first();
}

export async function expireOrder(db, id) {
  const res = await db.prepare(SQL.expireOrder).bind(id).run();
  return changesOf(res) > 0;
}

export async function markPaid(db, id, paidAt, mulNo) {
  const res = await db.prepare(SQL.markPaid).bind(paidAt, mulNo, id).run();
  return changesOf(res) > 0;
}

export async function markRefunded(db, id, refundedAt) {
  const res = await db.prepare(SQL.markRefunded).bind(refundedAt, id).run();
  return changesOf(res) > 0;
}

/** 웹훅 기록. 이미 같은 (mul_no, pay_state)가 있으면 false */
export async function recordWebhook(db, w) {
  const res = await db.prepare(SQL.insertWebhook)
    .bind(w.mulNo, w.payState, w.orderId, w.price, w.payDate, w.receivedAt).run();
  return changesOf(res) > 0;
}

export async function insertToken(db, tokenHash, orderId, expiresAt, createdAt) {
  await db.prepare(SQL.insertToken).bind(tokenHash, orderId, expiresAt, createdAt).run();
}

export async function getToken(db, tokenHash) {
  return db.prepare(SQL.getToken).bind(tokenHash).first();
}

export async function revokeTokens(db, orderId) {
  await db.prepare(SQL.revokeTokens).bind(orderId).run();
}

/* ---------- 공유 코드 (/r/{code}) ---------- */

export async function insertShare(db, s) {
  await db.prepare(SQL.insertShare)
    .bind(s.code, s.ds, s.db, s.revokeHash, s.createdAt, s.expiresAt).run();
}

export async function getShare(db, code) {
  return db.prepare(SQL.getShare).bind(code).first();
}

export async function revokeShare(db, code, revokeHash, nowMs) {
  const res = await db.prepare(SQL.revokeShare).bind(nowMs, code, revokeHash).run();
  return changesOf(res) > 0;
}

export async function purgeExpiredShares(db, nowMs) {
  await db.prepare(SQL.purgeExpiredShares).bind(nowMs).run();
}

function changesOf(res) {
  if (!res) return 0;
  if (typeof res.changes === 'number') return res.changes;
  if (res.meta && typeof res.meta.changes === 'number') return res.meta.changes;
  return res.success === false ? 0 : 1;
}

function isUniqueViolation(err) {
  const msg = String((err && err.message) || err);
  return /UNIQUE constraint failed/i.test(msg);
}
