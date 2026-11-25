# 냥도사 결제 서버 (Cloudflare Worker + D1)

1,900원 실결제와 **유료 본문 서버 분리**를 담당하는 Worker다.
이 폴더의 파일은 정적 배포(GitHub Pages / Cloudflare Pages)에 **절대 올리지 않는다.**
`src/paid-copy.js`가 공개되면 1,900원 상품의 본문이 그대로 공짜가 된다.

```
정적 사이트 (index.html·app.js·copy.js — 유료 문장 없음)
        │ ① POST /api/order  {name, gender, year, month, day, calendar, isLeap, hourIdx, focus}
        ▼
[Worker] ── D1(orders·tokens·webhooks) ── Worker secret
        │ ② {orderId, amount:1900, payUrl}
        ▼
[페이앱 결제창]  카드·계좌이체 등 선택 → 결제
        │ ③ feedbackurl(웹훅) → [Worker] 검증 후 orders.status='paid'
        │    returnurl(?orderId=…) → 브라우저 복귀
        ▼
        │ ④ GET /api/order/:id/status → {paid:true, token}
        │ ⑤ GET /api/reading?token=…  → 유료 본문 JSON (Cache-Control: no-store)
        ▼
[브라우저] 유료 화면 렌더
```

## 지금 상태 (2026-11-24)

- 코드·테스트 완료, **실결제는 꺼져 있다.**
  - `wrangler.toml` 의 `PAYMENTS = "off"` → `/api/order` 가 503 `payments_disabled` 를 돌려주고
    페이앱에 아무 요청도 보내지 않는다.
  - 프런트는 `index.html` 의 `window.NYANG_PAY_API = ''` (빈 값) → 결제 버튼이 "연결 전" 안내만 한다.
    **데모로 결제된 척하지 않는다** (기존 `doDemoPay` 제거).
- live(GitHub Pages `main`)는 v2 그대로다. 이 폴더와 프런트 변경은 `v3-payapp` 브랜치에만 있다.

## 실결제 켜는 순서 (민지님)

1. **페이앱 가입** — https://payapp.kr · 개인(비사업자) 판매자
   - 준비물: 신분증 앞뒤 사본, 통장 사본, 계약서(전자계약서 가능)
   - 가입 직후 결제 수령은 되지만 **정산은 서류 심사 후**부터다 (영업일 2~5일).
   - 사주·운세는 페이앱 불가업종 목록에 없다. 다만 **비실물(콘텐츠)은 가입 전 상담 필수**
     (1544-7191). 상품명에 "부적"이 들어가면 **리스크업종**으로 분류될 수 있으니
     `GOODNAME`은 "냥도사의 천기누설 전체 풀이"로 두고, 상담 때 상품 성격을 먼저 설명한다.
2. **연동 정보 확인** — 페이앱 관리자 → 설정 → 연동 정보
   - `가맹점 ID(userid)`, `연동 KEY(linkkey)`, `연동 VALUE(linkval)`, `결제 KEY(requestkey)`
3. **Cloudflare** — 계정 생성 → `npm i -g wrangler` → `wrangler login`
4. **D1 만들기**
   ```bash
   cd apps/nyang-saju/worker
   wrangler d1 create nyang-saju          # 결과의 database_id 를 wrangler.toml 에 붙인다
   wrangler d1 execute nyang-saju --remote --file=schema.sql
   ```
5. **시크릿 넣기** (git에 남기지 않는다)
   ```bash
   wrangler secret put PAYAPP_USERID
   wrangler secret put PAYAPP_LINKKEY
   wrangler secret put PAYAPP_LINKVAL
   wrangler secret put PAYAPP_REQUESTKEY
   wrangler secret put PAYAPP_RECVPHONE   # 페이앱 필수값. 판매자(민지님) 번호를 넣는다
   wrangler secret put TOKEN_SECRET       # openssl rand -hex 32
   wrangler secret put ADMIN_TOKEN        # openssl rand -hex 16
   ```
6. **배포**
   ```bash
   wrangler deploy
   ```
7. **켜기** — `wrangler.toml` 의 `PAYMENTS = "on"` 으로 바꾸고 다시 배포,
   프런트 `index.html` 의 `window.NYANG_PAY_API = 'https://nyang-saju-api.<계정>.workers.dev'` 입력.
8. **1,900원 실결제 1건 테스트** → D1에서 확인
   ```bash
   wrangler d1 execute nyang-saju --remote --command "SELECT id,status,amount,pg_ref FROM orders ORDER BY created_at DESC LIMIT 5"
   ```
   웹훅이 안 오면 `wrangler tail` 로 `/api/hooks/payapp` 로그를 본다 (응답은 반드시 `SUCCESS`).

> 결제를 켠 뒤에는 도메인을 Cloudflare Pages로 옮기는 것을 권한다. GitHub Pages 약관은
> 상업(이커머스) 용도 호스팅을 금지한다. 같은 폴더를 Cloudflare Pages에 그대로 올리면 된다.

## API

| 메서드 | 경로 | 하는 일 |
|---|---|---|
| POST | `/api/order` | 주문 생성(금액 1,900 서버 고정) → 페이앱 `payrequest` → `payUrl` |
| GET | `/api/order/:id/status` | 결제 상태 폴링. `paid`면 열람 토큰 발급 |
| POST | `/api/hooks/payapp` | 페이앱 웹훅. 검증 후 `SUCCESS` |
| GET | `/api/reading?token=` | 유료 본문 JSON (`no-store`) |
| POST | `/api/preview` | 무료 티저 3줄 (결제 불필요) |
| POST | `/api/admin/cancel` | 취소·환불 (`X-Admin-Token`) |
| GET | `/api/health` | 결제 스위치·페이앱 설정 여부 |

## 중복 결제 방지 (요청하신 항목)

세 겹으로 막는다.

| 겹 | 장치 | 막는 것 |
|---|---|---|
| 1 | `orders_paid_input_unique` (UNIQUE, status='paid') | 같은 사주로 두 번 결제 |
| 2 | `orders_created_input_unique` (UNIQUE, status='created') | 같은 사주로 대기 주문 두 개 → 두 개의 결제창 |
| 3 | `orders_pg_ref_unique` (UNIQUE, mul_no) | 한 결제요청번호가 두 주문에 붙는 것 |
| 4 | `webhooks UNIQUE(mul_no, pay_state)` | 같은 웹훅 재처리 (멱등) |

동작:
- 이미 결제한 사주로 `/api/order` 를 다시 부르면 **페이앱을 부르지 않고** 기존 주문의 토큰을 돌려준다
  (`{status:'paid', reused:true}`).
- 30분 안에 만든 대기 주문이 있으면 그 `payUrl` 을 재사용한다.
- 웹훅이 두 번 와도 `paid_at` 은 한 번만 기록된다.
- 프런트도 결제 토큰을 localStorage에 두고, 같은 입력이면 결제창을 열지 않는다.

## 검증 (테스트 24건, 전부 통과)

```bash
cd apps/nyang-saju/worker
node tools/sync-engine.mjs            # 클라이언트 엔진 → worker/src/engine 복사
node tools/split-paid-copy.mjs --check # 유료 문장이 클라이언트에 없는지 검사
node --test test/
```

검사 항목: 주문 생성·파라미터, 금액 변조 거부, 중복 결제 3종, mul_no 충돌,
웹훅 인증(linkkey·linkval·hash·price·mul_no·var1)과 멱등, 토큰 위조·만료·환불 후 차단,
유료 본문 `no-store`, 클라이언트 문장 누출, 엔진 복사본 동기화.

프런트엔드 통합은 Playwright로 확인했다(무료 화면·결제 모달·법정 고지·유료 화면 렌더, 콘솔 오류 0).

## 보안 경계

- `src/paid-copy.js` 는 서버 전용. 정적 배포에 포함되면 상품 가치가 사라진다.
- 금액은 `payapp.js` 의 `PAY_AMOUNT = 1900` 상수. 클라이언트가 보낸 금액은 쓰지 않는다.
- 웹훅은 `userid·linkkey·linkval·hash·price·mul_no·var1` 전부 대조한 뒤에만 결제 처리.
- 열람 토큰은 `HMAC-SHA256` 서명 + DB 회수(`tokens.revoked`). DB에는 토큰 원문이 아니라 sha256만 둔다.
- `input_json`(이름·생년월일)은 90일 뒤 파기 배치를 둔다 — `schema.sql` 끝의 메모 참고.

## 알려진 한계

- Workers 무료 플랜은 요청당 CPU 10ms다. 유료 본문 조립(만세력 재계산)이 그 근처라
  결제가 붙으면 Workers Paid($5/월)로 올리는 편이 안전하다.
- 요청 빈도 제한(rate limit)은 아직 없다. 결제를 켜기 전에 Cloudflare Rate Limiting
  룰을 `/api/preview`, `/api/order` 에 걸어 두는 것을 권한다.
- 페이앱은 카카오페이를 사업자만 허용한다. 비사업자 계정에서는 카드·계좌이체 위주로 열린다.
