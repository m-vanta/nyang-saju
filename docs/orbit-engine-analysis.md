---
title: "냥도사 v2.3 · 인연 궤도(궁합 엔진) 분석과 /r/{code} 스키마 확정"
kind: analysis
target: apps/nyang-saju @ v2.3
date: 2026-11-25
---

# 인연 궤도(궁합 엔진) 분석

분석 대상은 v2.3 작업 전후의 같은 코드다. 계산은 `src/domain/period.js`의 `compatibility()`, 화면 조립은 `app.js`의 6번 구역(인연 궤도), 문장은 `copy.js`의 `ORBIT_TYPE`이 맡는다.

---

## 1. 궁합 점수는 무엇으로 정해지는가

### 1.1 입력 — 명식 두 개 중 딱 두 글자만 쓴다

`compatibility(mine, theirs)`가 실제로 읽는 값은 다음 네 개뿐이다.

| 값 | 쓰는 곳 | 코드 |
|---|---|---|
| 나의 일간 index | 오행 생극 관계, 천간합·충 | `src/domain/period.js:112` |
| 상대의 일간 index | 위와 같음 | `src/domain/period.js:113` |
| 나의 일지 index | 육합·육충 | `src/domain/period.js:126` |
| 상대의 일지 index | 위와 같음 | `src/domain/period.js:126` |

연·월·시주, 대운, 세운, 성별, 생년월일, 출생시각은 **점수에 들어가지 않는다**. 즉 궤도는 “일주(日柱) 한 기둥 대 일주” 비교다. 이는 궁합을 얕게 만드는 대신, 서버에 저장할 데이터를 두 정수로 줄여 준다(§4).

### 1.2 관계 유형 — 일간 오행 생극 5종

```js
if (meE === youE)                     { relation='same';   base=68; }
else if (ELEM_MAKES[youE] === meE)    { relation='gwiin';  base=84; } // 상대가 나를 살림
else if (ELEM_KILLS[youE] === meE)    { relation='drain';  base=36; } // 상대가 나를 누름
else if (ELEM_KILLS[meE] === youE)    { relation='press';  base=54; } // 내가 상대를 누름
else                                  { relation='give';   base=60; } // 내가 상대를 살림
```

### 1.3 가중치 — 제품이 정한 값이지 고전 점수표가 아니다

| 조건 | 가감 | 코드 |
|---|---|---|
| 천간합(갑기·을경·병신·정임·무계) | +13 | `period.js:119,131` |
| 천간충(갑경·을신·병임·정계) | −8 | `period.js:120,132` |
| 일지 육합 | +8 | `period.js:126,133` |
| 일지 육충 | −8 | `period.js:127,134` |

점수는 18~98로 자르고(`period.js:136`), 궤도는 76 이상 1궤도, 56 이상 2궤도, 나머지 3궤도다(`period.js:137`).

**명시해야 할 한계**: 68·84·36·54·60과 ±13/±8은 자평명리 문헌의 궁합 점수표가 아니다. v2.3은 이 값을 “제품 규약”으로 라벨링하고(`scoreNote`), 문서·화면에서 고전 판정처럼 말하지 않는다. 고전 궁합(연지·일지 삼합, 오행 상생상극의 강약, 용신 상보)을 점수화하려면 별도 문헌 근거와 검수가 필요하다.

### 1.4 관계 유형 문장·상세 해석의 결정 경로

| 화면 | 결정 함수 | 문장 출처 |
|---|---|---|
| 무료 한 줄 | `orbitLine()` (`app.js:1246`) | `ORBIT_TYPE[relation].line` + 천간합이면 `hapLine` |
| 유료 상세 | `orbitDetailParts()` (`app.js:1254`) | `ORBIT_TYPE[relation].detail` + `hapLine`/`yukhapLine`/`chungLine` |
| 조언 | `typeFill(T.advice)` | `ORBIT_TYPE[relation].advice` |
| 범례 | `renderOrbit()` (`app.js:1270`) | `ORBIT_TYPE[k].short` |
| 칩 | `tags` | `천간합·천간충·육합·육충` |

`ORBIT_TYPE`은 `copy.js:492`에 다섯 유형(충전냥·불꽃냥·거울냥·동료냥·티격태격냥)으로 정의되어 있다.

---

## 2. 개인 사주 엔진과 같은 ‘문장↔근거 분리’ 문제가 있는가 — **있다**

### 2.1 문장은 관계 유형 하나로만 고른다

`typeOf(compat)`는 `relation` 다섯 값 중 하나를 키로 문장 묶음을 고른다. 그런데 실제 판정에는 `relation` 외에 `hap`, `yukhap`, `chung`, `tags`, `score`, `orbit`이 함께 쓰인다. 문장은 이 부가 조건을 **문장 안에 직접 이어 붙이는 방식**으로만 반영한다.

```js
// app.js:1248
var line = typeFill(T.line, item);
if (item.compat.hap) line += ' ' + C.orbit.hapLine;
```

즉 “이 문장이 성립하려면 천간합이어야 한다”는 조건이 문장에 붙어 있지 않고, 호출 코드에 하드코딩되어 있다. 개인 사주에서 `basisFor()`가 문장과 무관하게 근거를 붙이던 것과 **같은 구조적 결함**이다. 다만 궤도에는 근거 칩 자체가 없어서 “문장과 다른 근거”가 눈에 띄지 않았을 뿐이다.

### 2.2 점수에는 근거가 없다

점수 84는 “상대가 나를 살린다”는 오행 관계에서 나오지만, 화면에는 `84`라는 숫자와 유형 이름만 나온다. 어떤 글자 때문에 그 점수가 나왔는지(예: “상대 일간 壬水가 내 丙火를 누름”) 보여 주지 않는다. v2.2의 근거 칩 문제와 같은 종류의 불투명성이다.

### 2.3 v2.3에서 한 조치

- `compatibility()`가 `evidence[]`를 함께 낸다 — `일간 丙(火) ↔ 壬(水)`, `일지 午 ↔ 子`, `천간합 …`처럼 실제 글자와 관계를 담는다(`period.js:128-135`).
- `myTenOfYou`(상대 일간이 나에게 어떤 십성인지)를 추가해, 유형 문장과 별개로 검증 가능한 축을 남겼다.
- 점수에는 `scoreNote: '제품 규약 점수(고전 점수표 아님)'`를 붙였다.
- 문장 조건을 `requires`로 옮기는 완전한 Finding화는 **이번 범위에 넣지 않았다**. 궤도 문장 카탈로그(`ORBIT_TYPE`)가 아직 `copy.js`의 자유 문자열이고, 궁합 판정 자체가 일주 2글자라 Finding을 만들 만큼의 판정 층이 없다. 대신 근거를 데이터로 내보내, 다음 판본에서 문장에 `requires`를 붙일 수 있는 자리를 만들었다.

---

## 3. 현재 궁합이 쓰는 최소 명식 데이터

궤도 계산에 필요한 것은 정확히 다음 두 값이다.

```
{ ds: 0..9,   // 일간 index (STEMS 순서)
  db: 0..11 } // 일지 index (BRANCHES 순서)
```

| 기능 | 필요한 값 | 현재 계산 |
|---|---|---|
| 오행 생극 관계 | 내 일간, 상대 일간 | `ds` 2개 |
| 천간합·충 | 내 일간, 상대 일간 | `ds` 2개 |
| 육합·육충 | 내 일지, 상대 일지 | `db` 2개 |
| 궤도 위치 | 점수(위 값의 함수) | `ds`,`db` |
| 유형 문장 | relation(위 값의 함수) | `ds`,`db` |
| 성별 | 쓰지 않음 | — |
| 생년월일·시각·달력·이름 | 쓰지 않음 | — |

따라서 `/r/{code}`에 저장할 최소 데이터는 **일간·일지 index 두 개**다. 성별·이름·생년월일·시간·달력은 저장하지 않는다.

### 3.1 확장성 검토

| 확장 후보 | 필요한 추가 데이터 | 개인정보 위험 | 판단 |
|---|---|---|---|
| 월지·연지 관계(삼합·방합) | `ms`, `ys` index 2개 | 낮음(여전히 index) | v2 후보 |
| 대운·세운 궁합 | 대운수·조회시점 | 중(생년월일 추정 가능) | 서버 계산으로만, 저장 금지 |
| 납음·신살 | 없음(일주에서 유도) | 없음 | 문장만 확장 |
| 정밀 궁합(용신 상보) | 용신 판정 = 전체 명식 | 높음 | 이번 범위 제외(용신 자동 판정 금지) |

스키마는 `v` 필드로 버전을 두고, `v:1`은 `{ds, db}`만 저장한다. 필드가 늘어나도 **저장하는 것은 index뿐**이며, 생년월일 원문은 어떤 버전에서도 저장하지 않는다.

---

## 4. `/r/{code}` 서버 저장 스키마 (확정)

### 4.1 코드

- 알파벳: `A-Z2-7` (base32, 혼동 문자 0/O/1/I 제외)
- 길이: 12자 = 60bit
- 생성: `crypto.getRandomValues()` (CSPRNG) — `worker/src/index.js` `randomCode()`
- 추측 불가능성: 60bit면 초당 1만 회 시도로도 1년에 3×10¹¹분의 1 수준

### 4.2 D1 테이블

```sql
CREATE TABLE shares (
  code         TEXT PRIMARY KEY,   -- base32 12자
  ds           INTEGER NOT NULL,   -- 일간 index 0~9
  db           INTEGER NOT NULL,   -- 일지 index 0~11
  revoke_hash  TEXT NOT NULL,      -- sha256(revoke token) — 원문 저장 금지
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,   -- 기본 30일
  revoked_at   INTEGER
);
CREATE INDEX shares_expiry ON shares(expires_at);
```

`worker/schema.sql`에 반영했다.

### 4.3 API

| 경로 | 메서드 | 하는 일 |
|---|---|---|
| `/api/share` | POST | `{ds, db}` 검증 → 코드 발급, `revokeToken` 1회 반환 |
| `/r/{code}` | GET | JSON(`{v,ds,db,expiresAt}`) 또는 브라우저면 `/?r={code}`로 302 |
| `/api/share/{code}` | GET | 위와 같은 JSON (앱 fetch용) |
| `/api/share/{code}/revoke` | POST | `{token}` 검증 후 `revoked_at` 기록 |

응답은 전부 `Cache-Control: no-store`. 만료·폐기 코드는 `410`.

### 4.4 클라이언트

- `ensureShareCode()` (`app.js:1432`): `POST /api/share`로 코드를 받아 `state.shareCode`에 둔다.
- `inviteUrl()` (`app.js:1450`): 코드가 있을 때만 `/r/{code}`를 만든다. **코드가 없으면 `null`** — 생년월일을 URL에 넣는 폴백은 코드에 존재하지 않는다.
- 서버 미연결 시: “공유 코드를 만들지 못했어요. 서버에 연결되지 않아 링크를 만들지 않았어요.” 토스트만 띄우고 링크를 만들지 않는다.
- `parseInvite()` (`app.js:1455`): `/r/{code}` 또는 `?r={code}`만 읽는다. 예전 `?inviter=…&iy=…` 링크는 **읽지 않고** “예전 링크에는 개인정보가 담겨 있어 더 이상 쓰지 않아요” 안내만 띄운다.
- 공유 카드: `shareLink()` (`app.js:2314`)가 코드 URL 또는 서비스 주소만 인쇄한다. 닉네임이 들어간 팩폭은 `bombPublic`(`src/render/select.js`)으로 “이 사람” 치환해 인쇄한다. 생년월일 줄은 카드에 없다.

### 4.5 보관·파기

- TTL 30일. `createShare`가 만료분을 `purgeExpiredShares`로 정리한다(실패해도 발급은 계속).
- 폐기는 발급 시 준 `revokeToken`을 가진 사람만 가능하다. 토큰 원문은 저장하지 않고 sha256만 둔다.
- 저장 값이 index 두 개뿐이므로, DB가 통째로 새도 생년월일·이름은 복원되지 않는다. 다만 일주(日柱)는 60갱 중 하나라 준식별자다 — 코드를 아는 사람에게만 열리고, 30일 뒤 사라진다.

---

## 5. 남은 판단 (사용자 확인 필요)

1. 궁합 점수 가중치를 제품 규약으로 화면에 명시할지, 아니면 점수를 숨기고 유형만 보여 줄지.
2. 궤도 문장까지 `requires` 기반 Finding으로 옮길지(다음 판본 후보).
3. 월지·연지 관계까지 궁합에 넣을지 — 저장 필드가 2개 늘어난다.
