/* ==========================================================================
   테스트용 메모리 D1 (test/memory-d1.mjs)
   --------------------------------------------------------------------------
   진짜 D1을 띄우지 않고 Worker 코드를 그대로 돌리기 위한 최소 구현이다.
   db.js 의 SQL 상수와 문장이 똑같은 것만 처리하고, 모르는 SQL은 던진다 —
   문장이 바뀌면 테스트가 먼저 깨져서 조용히 지나가지 않는다.
   UNIQUE 제약(중복 결제 방지의 핵심)도 실제처럼 예외를 던진다.
   ========================================================================== */
import { SQL } from '../src/db.js';

function normalize(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

/* db.js 문장 ↔ 이름 */
const BY_SQL = new Map(Object.entries(SQL).map(([name, sql]) => [normalize(sql), name]));
export class MemoryD1 {
  constructor() {
    this.orders = new Map();
    this.tokens = new Map();
    this.webhooks = [];
    this.shares = new Map();
  }

  prepare(sql) {
    return new Statement(this, normalize(sql));
  }
}

class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async first() {
    const rows = await this.#exec('first');
    return rows.length ? rows[0] : null;
  }

  async all() {
    return { results: await this.#exec('all'), success: true };
  }

  async run() {
    const changes = await this.#exec('run');
    return { success: true, meta: { changes: typeof changes === 'number' ? changes : 0 } };
  }

  async #exec() {
    const { db, args } = this;
    const s = BY_SQL.get(this.sql);

    switch (s) {
      case 'insertOrder': {
        const [id, inputHash, inputJson, amount, createdAt] = args;
        for (const o of db.orders.values()) {
          if (o.input_hash === inputHash && (o.status === 'created' || o.status === 'paid')) {
            throw new Error('UNIQUE constraint failed: orders.input_hash');
          }
        }
        db.orders.set(id, {
          id, input_hash: inputHash, input_json: inputJson, amount,
          status: 'created', pg: 'payapp', pg_ref: null, payurl: null,
          created_at: createdAt, paid_at: null, refunded_at: null
        });
        return 1;
      }

      case 'attachPayApp': {
        const [mulNo, payurl, id] = args;
        const o = db.orders.get(id);
        if (!o || o.status !== 'created' || o.pg_ref != null) return 0;
        for (const other of db.orders.values()) {
          if (other.pg_ref === mulNo && other.id !== id) {
            throw new Error('UNIQUE constraint failed: orders.pg_ref');
          }
        }
        o.pg_ref = mulNo;
        o.payurl = payurl;
        return 1;
      }

      case 'getOrder':
        return compact([db.orders.get(args[0])]);

      case 'getOrderByMulNo':
        return compact([[...db.orders.values()].find((o) => o.pg_ref === args[0])]);

      case 'getPaidOrderByHash':
        return compact([sortDesc([...db.orders.values()]
          .filter((o) => o.input_hash === args[0] && o.status === 'paid'), 'paid_at')[0]]);

      case 'getCreatedOrderByHash':
        return compact([sortDesc([...db.orders.values()]
          .filter((o) => o.input_hash === args[0] && o.status === 'created'), 'created_at')[0]]);

      case 'expireOrder': {
        const o = db.orders.get(args[0]);
        if (!o || o.status !== 'created') return 0;
        o.status = 'expired';
        return 1;
      }

      case 'markPaid': {
        const [paidAt, mulNo, id] = args;
        const o = db.orders.get(id);
        if (!o || o.status !== 'created') return 0;
        for (const other of db.orders.values()) {
          if (other.id !== id && other.input_hash === o.input_hash && other.status === 'paid') {
            throw new Error('UNIQUE constraint failed: orders.input_hash');
          }
        }
        o.status = 'paid';
        o.paid_at = paidAt;
        o.pg_ref = o.pg_ref == null ? mulNo : o.pg_ref;
        return 1;
      }

      case 'markRefunded': {
        const [refundedAt, id] = args;
        const o = db.orders.get(id);
        if (!o || !['paid', 'created'].includes(o.status)) return 0;
        o.status = 'refunded';
        o.refunded_at = refundedAt;
        return 1;
      }

      case 'countPaidOrders':
        return [{ n: [...db.orders.values()].filter((o) => o.status === 'paid').length }];

      case 'health':
        return [{ n: db.orders.size }];

      case 'insertWebhook': {
        const [mulNo, payState, orderId, price, payDate, receivedAt] = args;
        const dup = db.webhooks.some((w) => w.mul_no === mulNo && w.pay_state === payState);
        if (dup) return 0;
        db.webhooks.push({ mul_no: mulNo, pay_state: payState, order_id: orderId, price, pay_date: payDate, received_at: receivedAt });
        return 1;
      }

      case 'insertToken': {
        const [tokenHash, orderId, expiresAt, createdAt] = args;
        db.tokens.set(tokenHash, { token_hash: tokenHash, order_id: orderId, expires_at: expiresAt, revoked: 0, created_at: createdAt });
        return 1;
      }

      case 'getToken':
        return compact([db.tokens.get(args[0])]);

      case 'revokeTokens': {
        let n = 0;
        for (const t of db.tokens.values()) {
          if (t.order_id === args[0] && !t.revoked) { t.revoked = 1; n++; }
        }
        return n;
      }

      case 'insertShare': {
        const [code, ds, dbv, revokeHash, createdAt, expiresAt] = args;
        if (db.shares.has(code)) throw new Error('UNIQUE constraint failed: shares.code');
        db.shares.set(code, { code, ds, db: dbv, revoke_hash: revokeHash, created_at: createdAt, expires_at: expiresAt, revoked_at: null });
        return 1;
      }

      case 'getShare':
        return compact([db.shares.get(args[0])]);

      case 'revokeShare': {
        const [now, code, hash] = args;
        const r = db.shares.get(code);
        if (!r || r.revoke_hash !== hash || r.revoked_at) return 0;
        r.revoked_at = now;
        return 1;
      }

      case 'purgeExpiredShares': {
        let n = 0;
        for (const [code, r] of db.shares) {
          if (r.expires_at < args[0]) { db.shares.delete(code); n++; }
        }
        return n;
      }

      default:
        throw new Error('MemoryD1: 처리하지 못한 SQL — ' + (s || this.sql.replace(/\s+/g, ' ').slice(0, 90)));
    }
  }
}

function compact(arr) {
  return arr.filter(Boolean).map((o) => ({ ...o }));
}

function sortDesc(arr, key) {
  return arr.slice().sort((a, b) => (b[key] || 0) - (a[key] || 0));
}
