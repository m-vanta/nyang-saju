# 냥도사 900원 결제 · 서버 분리 설계 (2026-11-24)

비사업자(개인) 상태에서 900원 단건 결제를 받고, 유료 본문을 서버에서만 내려주기 위한 최소 구조.
조사 근거와 PG 비교는 이 문서 말미의 표에 정리했다. (금액·요율은 2026-11-24 확인 기준)

---

## 0. 지금 구조에서 새는 곳 (반드시 먼저 고칠 것)

| # | 문제 | 근거 | 결과 |
|---|---|---|---|
| 1 | **유료 문장 전체가 공개 정적 파일에 있음** | `copy.js` 217행 `MASTER` 10종 × 15필드(gift·money·focus·timing·selfSee·selfBlind·firstMet·closer·love·keep·avoidEnergy·talisman·avoid·tags) | 주소창에 `copy.js`만 열면 900원 안 내고 10종 전부 읽힘 |
| 2 | **잠금이 CSS 블러일 뿐** | `app.js` 763행 `renderLockedSections()`가 `#locked-inner`에 실제 문장을 넣고 `.locked__inner`가 blur | 개발자도구에서 텍스트 복사 가능 |
| 3 | **결제 상태가 클라이언트 변수** | `app.js` 21행 `state.paid`, 1204행 `state.paid = true` — 그런데 이 값을 읽는 곳이 없음(사실상 죽은 플래그) | 우회보다 구조 자체가 무의미 |
| 4 | **요약 복사에 유료 전문 포함** | `app.js` 715행 `buildSummary()`가 본편·보너스·부적 문장을 전부 조립 | 결제자 1명이 전문을 텍스트로 뿌리면 끝 (상품 설계상 허용할지 결정 필요) |
| 5 | **사업자 정보·약관·환불 고지 없음** | `index.html` 463·660·771행 footer는 문구만 | PG 심사 반려 1순위 |

---

## 1. 서버로 옮길 것 / 클라이언트에 남길 것

### 옮긴다 (서버 전용 모듈로)
| 파일 | 대상 | 비고 |
|---|---|---|
| `copy.js` | `MASTER` (217행~) 전체 | `C.FOCUS`(40행) 라벨, `C.ui`(48행), `C.orbit`(165행)은 공개 유지 |
| `app.js` | `buildReading()` 686행, `buildSummary()` 715행 | 문장 조립을 서버에서 수행 |
| `app.js` | `renderLockedSections()` 763행 | 제목·문단 수만 받아 자리표시자로 렌더 |
| `app.js` | `doDemoPay()` 1177행 | 실제 결제 요청으로 교체, 성공 시 `/api/reading` 호출 |
| `app.js` | `drawAmulet()`의 유료 필드 입력 | 부적 문구(`talisman`·`avoid`·`bomb`)는 서버 응답에서 받음 (`bomb`은 무료) |

### 남긴다 (클라이언트)
- `vendor/manseryeok.js` + `saju.js` — 무료 명식·오행 계산. 티저는 지금처럼 브라우저에서 계산.
- `renderPillars`·`renderOheng`·`renderCycle`·`myeongFoot` — 전부 무료 영역.
- **인연 궤도**(`orbitData`·`renderOrbit`·`compatibility`) — 친구 생년월일을 서버로 보내지 않기 위해 로컬 유지. 유료 잠금 대상에서 빼고 "무료·바이럴" 기능으로 승격하는 것을 권장(초대 링크가 성장 장치이므로).
- `copy.js`의 `C.ui`·`C.FOCUS`·`C.orbit` — UI 문자열·일반 템플릿(비밀 아님).

> 서버는 **클라이언트가 보낸 명식을 믿지 않는다.** 생년월일 입력값만 받아 `saju.js`로 다시 세운다. `saju.js`는 DOM 의존이 없고 `globalThis`에 붙으므로 Worker에서 `import './vendor/manseryeok.js'; import './saju.js';` 만으로 그대로 재사용된다.

---

## 2. 권장 아키텍처 — Cloudflare Worker + D1 (월 0원)

```
[Cloudflare Pages]  index.html·app.js·styles.css·saju.js·vendor  (정적, 상업 이용 허용)
        │  ① POST /api/order {생년월일…}
        ▼
[Cloudflare Worker] ── D1(orders, tokens) ── Worker secret(키)
        │  ② {orderId, amount:900, guideUrl}
        ▼
[페이싱크 주문페이지]  계좌·금액·기한 안내 → 고객 계좌이체
        │  ③ 입금 감지 → invoice.paid 웹훅(HMAC)
        ▼
[Worker] 결제 확인 → 서명 토큰 발급
        │  ④ GET /api/reading?token=…  → 유료 본문 JSON
        ▼
[브라우저] 결과 렌더 (본문은 이 시점에 처음 도착)
```

- **왜 Cloudflare인가**: Workers Free = 하루 10만 요청·호출당 CPU 10ms, D1 Free = 하루 10만 행 쓰기/500만 행 읽기, 상업 이용 제한 문구 없음. **Vercel Hobby는 약관상 상업 이용 금지**(결제를 받는 배포는 명시적 상업 이용)라 실서비스에 쓰면 안 된다. Supabase Free는 한도는 넉넉하지만 **7일 무활동 시 프로젝트 정지**가 치명적.
- **프런트를 GitHub Pages에서 옮기는 이유**: GitHub Pages 약관이 "온라인 비즈니스·이커머스 사이트 용도의 무료 호스팅"을 명시적으로 금지한다. 무료 배포·데모는 무관하지만 **돈을 받는 순간 약관 위반**이 된다. 같은 저장소를 Cloudflare Pages에 그대로 올리면 빌드 없이 이전된다.

### D1 스키마
```sql
CREATE TABLE orders (
  id           TEXT PRIMARY KEY,      -- ord_<uuid>
  input_hash   TEXT NOT NULL,         -- sha256(정규화된 입력)
  input_json   TEXT NOT NULL,         -- 계산용 최소 필드, 90일 후 파기
  amount       INTEGER NOT NULL,      -- 항상 900 (서버 상수)
  status       TEXT NOT NULL,         -- created | paid | refunded | expired
  pg           TEXT NOT NULL,         -- paysync | paynt | toss
  pg_ref       TEXT,                  -- invoice id / paymentKey
  created_at   INTEGER NOT NULL,
  paid_at      INTEGER
);
CREATE TABLE tokens (
  token_hash TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked    INTEGER NOT NULL DEFAULT 0
);
```

### API
| 메서드 | 경로 | 하는 일 |
|---|---|---|
| POST | `/api/order` | 입력 검증 → 명식 재계산 → 주문 생성(금액 900 고정) → PG 주문 생성 |
| GET | `/api/order/:id/status` | 결제 대기 화면 폴링용 (`created`/`paid`/`expired`) |
| POST | `/api/hooks/paysync` | HMAC 검증 → `metadata.orderId`로 주문 찾기 → `paid` + 토큰 발급 (멱등) |
| GET | `/api/reading?token=` | 토큰 검증 → 유료 본문 JSON 반환, `Cache-Control: no-store` |
| POST | `/api/confirm` | (사업자 전환 후) 토스 승인 — 시크릿 키는 Worker에만 |
| POST | `/api/redeem` | (수동 검증용) 코드 → 토큰. 대시보드에서 발급한 코드만 통과 |

토큰은 `t1.<base64url({o:orderId,e:exp,h:inputHash})>.<HMAC-SHA256>` 형태의 **서명 토큰**으로 두면 검증에 DB 읽기가 필요 없다. D1은 환불·회수(`revoked`)와 주문 상태에만 쓴다. TTL 30일, 재조회는 `localStorage[nyangsaJu.token.<inputHash>]`로.

---

## 3. 막아야 할 우회 경로 체크리스트

| 우회 | 차단 |
|---|---|
| `copy.js` 직접 열람 | 유료 필드를 프런트 번들에서 제거 (가장 중요) |
| 블러 DOM에서 텍스트 추출 | 잠금 영역엔 제목·문단 수만. 실문장은 결제 후 API 응답으로만 |
| `state.paid = true` 조작 | 결제 판정을 서버 토큰으로만. 클라이언트 플래그 삭제 |
| 금액 변조(900→100) | 금액은 서버 상수. 승인 API에 보내는 amount도 서버 값. 클라이언트 amount는 비교용으로만 |
| `orderId` 재사용·승인 API 직접 호출 | 주문은 1회용(`status` 전이), 시크릿 키는 Worker secret, 승인은 서버에서만 |
| 남의 결제로 내 결과 열기 | 토큰 payload의 `inputHash`와 요청 입력 해시 일치 확인 |
| 결제 취소 후 계속 열람 | 환불 웹훅/배치에서 `tokens.revoked=1` |
| 무료 명식 변조로 다른 일간 받기 | 서버가 입력값으로 재계산 (클라이언트 명식 무시) |
| 공유 카드로 유료 문장 유출 | 카드·요약에 넣을 문장을 상품 정책으로 제한 (부적 한마디·팩폭만) |
| 캐시·리퍼러로 토큰 노출 | `no-store`, 토큰은 쿼리 대신 헤더 우선, `Referrer-Policy: no-referrer` |
| 웹훅 위조 | HMAC 서명 + 타임스탬프 5분 + 이벤트 ID 멱등 |

---

## 4. 공수 (1인 기준)

| 단계 | 내용 | 예상 |
|---|---|---|
| A | `copy.js` 공개/유료 분리, 잠금 DOM 정리, `state.paid` 제거 | 3~4h |
| B | Worker + D1 스키마 + `/api/order`·`/api/reading`·토큰 | 6~8h |
| C | 프런트 결제 플로우 교체(주문→안내→폴링→렌더), 토큰 재조회 | 4~6h |
| D | 페이싱크 웹훅 연동(HMAC·멱등) 또는 페인트 웹훅 | 3~4h (페이싱크) / 4~6h (페인트, 문서 비공개) |
| E | 보안 회귀(개발자도구로 유료문장 0건, 금액변조·재사용 테스트) | 2~3h |
| F | 사업자 정보·이용약관·환불 고지, PG 심사용 상품 페이지 | 3~4h |
| | **합계** | **21~29h (집중 3~4일)** |
| | 검증용 최소(A+B축소+C+D+E) | 12~16h (1.5~2일) |

검증만 먼저 할 경우 A + 코드 입력(`/api/redeem`)만으로도 4~6h에 "유료 문장 비노출 + 결제 확인 후 열림"이 성립한다.

---

## 5. PG 비교 (비사업자 900원 기준, 2026-11-24 확인)

| 서비스 | 비사업자 가입 | 900원 가능 | 요율 | 900원 실수령 | 자동 잠금해제 | 비고 |
|---|---|---|---|---|---|---|
| 토스페이먼츠 직계약 | ✗ (사업자만) | ○ (카드 100원~) | 3.4%+VAT (영세 0.65~1.9%) | 866원 | ○ (승인 API) | 가입비 22만+연관리비 11만 |
| 토스 비사업자(식스샵 경유) | △ | ○ | 3.4% 고정 | 866원 | △ | **실물 재화만**, 월 200만 한도, 3개월 내 사업자 전환 |
| 카카오페이 직계약 | ✗ ("사업자등록 없는 개인" 입점 제한 명시) | ○ (100원~) | 최대 3.2% (영세 0.9%) | 868원 | ○ | 단독 PG 불가 |
| 포트원 | ✗ (PG 계약 필요) | PG 따름 | 플랫폼 무료(월 5천만 미만) | PG와 동일 | ○ | 가입비 면제 혜택 |
| 스텝페이 | ✗ (사업자등록증) | PG 따름 | 1.3~3.0% | — | ○ | Free 플랜 |
| 페이앱 | ○ (신분증+통장) | **✗ 최소 1,000원** | 4.0%+VAT | (1,000원 기준 956원) | ○ (feedbackurl) | 카카오페이 불가 |
| 타이쿤 | ○ | 미확인 | 2.4%+VAT | 877원 | ✗ (링크·QR만) | 수동 확인 |
| **페이싱크** | ○ (개인 계좌 지원) | ○ (금액>0) | **0%** (무료 30건/월) | **900원** | **○ (HMAC 웹훅)** | 계좌이체만 |
| 페인트(Paynt) | ○ (토스 판매자로 등록) | 미확인(토스 100원이라 가능성 높음) | 3.0% (프로 1.9%) | 873원 | ○ (웹훅·embed) | 카드·카카오·토스·네이버 |
| Lemon Squeezy | — | — | — | — | — | **2026-11-16 신규 가입 종료, 2027-03-31 서비스 종료** |
| Polar | ○ (Stripe Connect KR) | $0.99 | 5%+$0.50 | ≈620~640원 | ○ (라이선스 키·웹훅) | KRW 정산 최소 $40 |
| Gumroad | ○ | $0.99 | 10%+$0.50+2.9%+$0.30 | **≈87원** | △ | 고정수수료 $0.80로 소액 불가 |
| Buy Me a Coffee | ○ (KR Stripe Express) | $0.99 | 5%+2.9%+$0.30 | ≈870원 | △ | 후원 프레임 |
| Ko-fi | ○ (PayPal KR) | $1 내외 | 0%+PayPal 4.4%+$0.30 | ≈940원 | ○ (웹훅) | 해외결제·환전 |

**해석**
- 900원이라는 가격은 **국내 카드 최소금액(100원)에서는 문제가 없지만, 비사업자가 쓸 수 있는 유일한 국내 PG인 페이앱의 최소금액(1,000원)에서 막힌다.** 이게 핵심 제약이다.
- 해외 MoR은 900원 상당에서 **고정 수수료($0.30~$0.80)가 가격의 30~80%**를 먹는다. Polar·BMC·Ko-fi는 그나마 60~70%가 남지만, 해외결제 표시·환전·외화 수입 신고 부담이 붙는다.
- **국내 비사업자 + 900원 + 자동화**를 동시에 만족하는 조합은 현재 ①페이싱크(계좌이체, 0%, 웹훅) ②페인트(카드, 3%, 웹훅) 둘이다.

---

## 6. 사업자 전환 후 전환 경로

1. 간이과세자 개인사업자 등록 (홈택스, 무료) → 연매출 1억 400만원 미만이면 부가세 납부 면제, **통신판매업 신고도 면제**(공정위 고시: 간이과세자 또는 직전연도 거래 50회 미만).
2. 토스페이먼츠 또는 포트원 추천패키지(가입비 면제)로 직계약. 카드 최소 100원이므로 900원 유지 가능.
3. 최초 등급은 '일반'(3.4%) → 국세청 매출 자료 반영 후 영세(0.65~1.9%)로 내려가고 차액 환급.
4. `pg` 컬럼만 `toss`로 바꾸고 `/api/confirm`을 켜면 프런트는 그대로 쓴다.

---

## 7. 남은 확인 항목 (사람이 해야 하는 것)

- [ ] 페이싱크 가입 + 계좌 연결(1원 인증) + 웹훅 URL 등록
- [ ] 페인트 개인 셀러 승인 후 **900원 상품 테스트 결제 1건**으로 최소금액 확인
- [ ] 페인트에서 '사주/운세' 상품 등록이 허용되는지(토스 유의업종) 확인
- [ ] 카카오뱅크·토스뱅크 계좌는 페이싱크 지원 은행이 아님 → 국민·신한·하나·농협 계좌 필요
- [ ] Cloudflare 계정 + `wrangler` 배포

---

## 8. 구현 완료 (2026-11-24 · v3-payapp)

이 설계는 `apps/nyang-saju/worker/` 로 구현됐고, 실결제는 **꺼 둔 상태**다.
운영 방법·배포 순서는 `apps/nyang-saju/worker/README.md` 를 본다.

| 설계 항목 | 구현 |
|---|---|
| 유료 문장 서버 분리 | `worker/src/paid-copy.js` (일간 10종 × 14필드 + THEME + PATTERN). 클라이언트 `copy.js` 는 33KB → 유료 필드 0건. `tools/split-paid-copy.mjs` 로 경계를 자르고 `--check` 로 회귀 검사 |
| 잠금이 CSS 블러일 뿐 | 유료 화면은 `/api/reading` 응답으로만 그린다. 클라이언트에 유료 문장이 없으므로 블러 DOM 추출 자체가 불가능 |
| 결제 상태가 클라이언트 변수 | `state.paid` 는 **서버 응답 객체**만 담는다. 결제 판정은 토큰(서명 + `tokens.revoked`) |
| 요약 복사에 전문 포함 | 요약 문자열도 서버가 만들어 `/api/reading` 으로만 내려간다 |
| 사업자·약관·환불 고지 | `index.html` `#legal-modal` — 판매자 정보(자리표시), 상품·가격, 청약철회, 개인정보 처리 |
| PG | 페이앱 `payrequest` + `feedbackurl` 웹훅. 최소금액 1,000원이라 1,900원은 통과 |
| 자동 잠금해제 | 복귀 `?orderId=` → `/api/order/:id/status` 폴링 → 토큰 → `/api/reading` |
| 금액 변조 | `PAY_AMOUNT = 1900` 서버 상수. 본문 `amount` 무시, 웹훅 `price` 대조 |
| 남의 결제로 열람 | 토큰 payload의 `inputHash` + 주문 `input_hash` + `orderId` 3중 대조 |
| 환불 후 열람 | `pay_state` 9/64/70/71 → `status=refunded` + `tokens.revoked=1` |
| 웹훅 위조 | `userid·linkkey·linkval·hash(sha256(userid+responsedate+requestkey))·price·mul_no·var1` 대조 |
| 캐시·리퍼러 | `Cache-Control: no-store`, `Referrer-Policy: no-referrer` |
| 중복 결제 | UNIQUE 3종(`paid`/`created` input, `pg_ref`) + `webhooks(mul_no,pay_state)` 멱등 + 프런트 토큰 재사용 |

남은 사람 작업: 페이앱 가입·서류 심사(비실물 상담 필수), Cloudflare 계정·D1 생성·시크릿 입력,
1,900원 실결제 1건 확인, 판매자 정보 자리표시 채우기.
