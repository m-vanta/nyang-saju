-- 냥도사 D1 스키마 (Cloudflare D1 / SQLite)
-- 적용: wrangler d1 execute nyang-saju --remote --file=schema.sql
--
-- 중복 결제 방지의 뼈대는 세 개의 UNIQUE 제약이다.
--   1) orders.pg_ref            : 페이앱 결제요청번호(mul_no) 하나에 주문 하나
--   2) orders_active_input      : 같은 사주(input_hash)로 대기 중인 주문은 하나
--   3) webhooks(mul_no,pay_state): 같은 결제 통보는 상태별로 한 번만 기록

CREATE TABLE IF NOT EXISTS orders (
  id           TEXT PRIMARY KEY,          -- ord_<uuid>
  input_hash   TEXT NOT NULL,             -- sha256(정규화된 입력)
  input_json   TEXT NOT NULL,             -- 재계산용 최소 입력 (90일 뒤 파기)
  amount       INTEGER NOT NULL,          -- 서버 상수 1900
  status       TEXT NOT NULL,             -- created | paid | refunded | expired
  pg           TEXT NOT NULL DEFAULT 'payapp',
  pg_ref       TEXT,                      -- 페이앱 mul_no
  payurl       TEXT,                      -- 페이앱 결제 페이지 (재사용)
  created_at   INTEGER NOT NULL,
  paid_at      INTEGER,
  refunded_at  INTEGER
);

-- 페이앱 결제요청번호 중복 금지 (한 mul_no로 두 주문이 결제될 수 없다)
CREATE UNIQUE INDEX IF NOT EXISTS orders_pg_ref_unique
  ON orders(pg_ref) WHERE pg_ref IS NOT NULL;

-- 같은 입력으로 동시에 두 번 결제하지 못하게 한다 (결제 완료 주문도 포함해 막는다)
CREATE UNIQUE INDEX IF NOT EXISTS orders_paid_input_unique
  ON orders(input_hash) WHERE status = 'paid';

-- 대기 중 주문은 입력당 하나
CREATE UNIQUE INDEX IF NOT EXISTS orders_created_input_unique
  ON orders(input_hash) WHERE status = 'created';

CREATE INDEX IF NOT EXISTS orders_payurl_lookup ON orders(id, status);

CREATE TABLE IF NOT EXISTS tokens (
  token_hash TEXT PRIMARY KEY,            -- sha256(토큰 문자열)
  order_id   TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE INDEX IF NOT EXISTS tokens_order ON tokens(order_id);

-- 웹훅 통보 기록: 같은 (mul_no, pay_state) 통보는 한 번만 처리한다
CREATE TABLE IF NOT EXISTS webhooks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  mul_no       TEXT NOT NULL,
  pay_state    TEXT NOT NULL,
  order_id     TEXT,
  price        INTEGER,
  pay_date     TEXT,
  received_at  INTEGER NOT NULL,
  UNIQUE (mul_no, pay_state)
);

CREATE INDEX IF NOT EXISTS webhooks_order ON webhooks(order_id);

-- 운영 메모: input_json에는 이름·생년월일·시간이 들어간다.
--   개인정보 최소 수집 원칙에 따라 90일 뒤 파기하는 배치를 둔다:
--   DELETE FROM orders WHERE created_at < (unixepoch()-7776000) AND status != 'paid';
--   UPDATE orders SET input_json = '{}' WHERE status = 'paid' AND paid_at < (unixepoch()-7776000)*1000;

-- 공유 코드 (/r/{code}) — 궁합에 필요한 최소값만 저장한다.
--   ds = 일간 index(0~9), db = 일지 index(0~11). 생년월일·시각·이름·성별·달력은
--   저장하지 않는다. 코드는 CSPRNG 60bit, TTL 30일, 폐기(revoke) 가능.
CREATE TABLE IF NOT EXISTS shares (
  code         TEXT PRIMARY KEY,          -- base32 (A-Z2-7) 12자
  ds           INTEGER NOT NULL,          -- 일간 index
  db           INTEGER NOT NULL,          -- 일지 index
  revoke_hash  TEXT NOT NULL,             -- sha256(revoke token)
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  revoked_at   INTEGER
);

CREATE INDEX IF NOT EXISTS shares_expiry ON shares(expires_at);
