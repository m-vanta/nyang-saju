---
title: "냥도사 · 원본 QA01~12 analysisData 추출"
kind: data
target: apps/nyang-saju @ v2.5 (exp/ai-engine)
date: 2026-11-26
---

# 원본 QA01~12 · analysisData 추출

> 이 문서는 **실제 앱 엔진이 계산한 사실**을 그대로 옮긴 것이다. 손으로 채운 값이 없다.
> 기계용 전문은 [`qa-original-analysis-data.json`](./qa-original-analysis-data.json) 에 있고,
> `node tests/ai-compare/tools/extract-qa-analysis.mjs` 로 언제든 다시 만들 수 있다.
> run.mjs 는 이 JSON 과 엔진 결과가 12건 모두 같은지 자기시험에서 확인한다.

| 항목 | 값 |
|---|---|
| 생성 시각 | 2026-11-26T23:57:54.530Z |
| 조회 시점(asOf) | 2026-11-25T10:00:00+09:00 |
| 엔진 | chart → analysis → period (vm 샌드박스, 브라우저와 같은 순서) |
| analysisData 스키마 | analysis/1.0 · 판정 필드 없음(lint 통과 12/12) |

## 대표 명식 3건 (파일럿 세트)

`--mode pilot` 은 아래 3건만 실제 모델로 돈다. 3건에 월령 유형·시주 유무·성별·격 후보 일치/불일치를 나눠 담았다.

| id | 일간 | 월지(유형) | 시주 | 성별 | 초점 | 이 건으로 보는 것 |
|---|---|---|---|---|---|---|
| QA02 | 무토(토) | 자(왕지) | 미상 | 여성 | love | 시주 미상(여섯 글자) · 왕지월(子) · 여성 · 戊土 일간 — 시주가 없을 때 무엇을 말할 수 없는지 보는 기준 |
| QA04 | 정화(화) | 축(잡기) | 있음 | 여성 | love | 잡기월(丑) · 본기(식신)와 투출(편관)이 다른 격을 가리킴(agreement: differs) · 여성 · 丁火 일간 — 상충 설명력의 핵심 |
| QA09 | 을목(목) | 신(생지) | 있음 | 남성 | work | 생지월(申) · 남성 · 乙木 일간 · 대운·세운이 모두 있는 명식 — 구간 해석과 성별에 따른 대운 순역을 함께 보는 기준 |

선정 이유: 왕지·잡기·생지 세 월령 유형, 시주 있음/없음, 남/녀, 격 후보 일치/불일치를 3건에 나눠 담았다.

교체 후보: QA01 — 화3·토3 동률(단독 최강 서술 금지) 확인용 · QA05 — 생지월에서 본기·중기 동시 투출(兼透) 확인용 · QA10 — 조회연도 초점(year) 확인용

## 전체 실험 비교쌍 (--mode full 필수)

전체 실험은 아래 세 쌍을 반드시 포함한다. run.mjs 가 빠진 픽스처를 발견하면 실행을 중단한다.

| id | 픽스처 | 비교 축 | 무엇을 보는가 |
|---|---|---|---|
| CP1 | QA01·QA02·QA03 | 동일 출생일 · 출생시간 차이(시주 유무 포함) | 같은 날 태어났고 시주만 다를 때, 시주가 있는 해석과 없는 해석이 무엇을 달리 말하는가 |
| CP2 | QA07·QA08 | 동일 명식의 음력·양력 입력 | 입력 달력 표기만 다르고 명식이 같을 때, 같은 문서가 나오는가(엔진·해석의 입력 둔감성) |
| CP3 | QA07·QA12 | 동일 일간, 다른 전체 명식 | 일간이 같아도 나머지 일곱 글자가 다르면 해석이 일간 일반론으로 흐르지 않는가 |

## 12건 요약

| id | 사주명식 | 일간 | 월령 | 통근 | 득령(계절/운성/본기) | 격 후보 일치 | 상충 축 | 대운 | 세운 |
|---|---|---|---|---|---|---|---|---|---|
| QA01 | 己卯 丙子 戊午 戊午 | 무토(토) | 子·왕지·겨울 | 2 | 수/태/정재 | none (2후보) | — | 己卯(21~30) | 丙午(편인/정인) |
| QA02 | 己卯 丙子 戊午 | 무토(토) | 子·왕지·겨울 | 1 | 수/태/정재 | none (2후보) | O6 | 己卯(21~30) | 丙午(편인/정인) |
| QA03 | 己卯 丙子 戊午 壬子 | 무토(토) | 子·왕지·겨울 | 1 | 수/태/정재 | none (2후보) | — | 己卯(21~30) | 丙午(편인/정인) |
| QA04 | 癸卯 乙丑 丁酉 丙午 | 정화(화) | 丑·잡기·겨울 | 1 | 사/묘/식신 | differs (5후보) | O2,O3 | 丙寅(0~9) | 丙午(겁재/비견) |
| QA05 | 甲辰 丙寅 己亥 庚午 | 기토(토) | 寅·생지·봄 | 3 | 사/사/정관 | partial (5후보) | O2,O3 | 乙丑(0~9) | 丙午(정인/편인) |
| QA06 | 丙子 庚寅 丙申 壬辰 | 병화(화) | 寅·생지·봄 | 1 | 상/장생/편인 | differs (5후보) | O2,O3 | 癸巳(21~30) | 丙午(비견/겁재) |
| QA07 | 甲辰 丙寅 甲辰 庚午 | 갑목(목) | 寅·생지·봄 | 3 | 왕/건록/비견 | partial (6후보) | O2,O3,O4 | 乙丑(1~10) | 丙午(식신/상관) |
| QA08 | 甲辰 丙寅 甲辰 庚午 | 갑목(목) | 寅·생지·봄 | 3 | 왕/건록/비견 | partial (6후보) | O2,O3,O4 | 乙丑(1~10) | 丙午(식신/상관) |
| QA09 | 戊辰 庚申 乙未 丁亥 | 을목(목) | 申·생지·가을 | 3 | 사/태/정관 | partial (5후보) | O2 | 癸亥(29~38) | 丙午(상관/식신) |
| QA10 | 乙卯 戊子 辛亥 辛卯 | 신금(금) | 子·왕지·겨울 | 0 | 휴/장생/식신 | none (4후보) | O3 | 癸巳(42~51) | 丙午(정관/편관) |
| QA11 | 辛巳 癸巳 己卯 壬申 | 기토(토) | 巳·생지·여름 | 3 | 상/제왕/정인 | none (4후보) | — | 庚寅(23~32) | 丙午(정인/편인) |
| QA12 | 己卯 癸酉 甲子 癸酉 | 갑목(목) | 酉·왕지·가을 | 1 | 사/태/정관 | none (2후보) | O3 | 乙亥(19~28) | 丙午(식신/상관) |

## 지표 설명

- **사주명식**: 년·월·일·시 간지. 시주가 없으면 6글자.
- **십성**: 천간·지지(본기) 기준 표면 십성. 지장간 전체 집계는 `analysisData.tenGodFacts.byHiddenAll`.
- **12운성**: 일간 기준 각 지지의 운성(음양순역표 `twelve-stages-yinyang/1`).
- **지장간**: 藏遁歌 표(`cangdun-ge/1`) + 제품 가중치(`product/1`).
- **대운·세운**: `period.js` — 세운은 입춘 절입, 대운은 3일=1년·성별 순역.
- **상충 축**: O1 월령↔통근, O2 본기↔투출, O3 합↔충, O4 표면0·지장간만, O5 시진 내 절입, O6 시주 미상.

---

## QA02 — 己卯 丙子 戊午 · 무토(토) 일간

- 입력: 2000-1-1 · solar · 시 미상 · 여성 · 관심 love

### 사주명식

| 기둥 | 간지 | 천간(십성) | 지지(십성) | 12운성 | 지장간 |
|---|---|---|---|---|---|
| 년 | 己卯(기묘) | 기(겁재) | 묘(정관) | 목욕 | 乙 정관 100 |
| 월 | 丙子(병자) | 병(편인) | 자(정재) | 태 | 癸 정재 100 |
| 일 | 戊午(무오) | 무(일간) | 오(정인) | 제왕 | 丁 정인 70 · 己 겁재 30 |
| 시 | — | — | — | — | — |

- 오행 표면: 목 1(16.7%) · 화 2(33.3%) · 토 2(33.3%) · 금 0(0%) · 수 1(16.7%)
- 표면 십성: 겁재 1 · 정재 1 · 정관 1 · 편인 1 · 정인 1
- 지장간 전체 십성: 겁재 2 · 정재 1 · 정관 1 · 편인 1 · 정인 1
- 득령 4판독: 오행 controlled-by-me · 계절 수 · 12운성 태 · 본기 정재
- 통근 1개: day.午 己(중)
- 격 후보: GEOK.BONGGI.정재 · GEOK.TUTUL.癸.정재 → agreement none
- 합충: 형 卯子(year,month) · 파 卯午(year,day) · 육충 子午(month,day)
- 대운: 순행 · 시작 1세 8개월 · 현재 己卯 (21~30세)
- 세운: 丙午 · 천간 편인 / 지지 정인
- 상충 의무: O6 시주 미상(여섯 글자)

<details><summary>analysisData 전문 (펼치기)</summary>

```json
{
 "schemaVersion": "analysis/1.0",
 "chartVersion": "natal/2.3",
 "tables": {
  "hiddenStems": "cangdun-ge/1",
  "hiddenWeights": "product/1",
  "season": "wangxiang/1",
  "stage": "twelve-stages-yinyang/1",
  "tenGods": "ten-gods/1",
  "relations": "relation-set/1"
 },
 "chart": {
  "chartId": "기묘 병자 무오 --|natal/2.3",
  "hourKnown": false,
  "pillars": {
   "year": {
    "stem": "己",
    "branch": "卯",
    "stemIdx": 5,
    "branchIdx": 3
   },
   "month": {
    "stem": "丙",
    "branch": "子",
    "stemIdx": 2,
    "branchIdx": 0
   },
   "day": {
    "stem": "戊",
    "branch": "午",
    "stemIdx": 4,
    "branchIdx": 6
   }
  }
 },
 "dayMaster": {
  "stem": "戊",
  "elem": "토",
  "yinYang": "양"
 },
 "monthCommand": {
  "branch": "子",
  "monthType": "왕지",
  "season": "겨울",
  "branchElem": "수",
  "wangXiang": {
   "목": "상",
   "화": "사",
   "토": "수",
   "금": "휴",
   "수": "왕"
  },
  "daysFromTerm": 24.6,
  "daysFromTermUse": "reference-only",
  "term": {
   "name": "대설",
   "at": "1999.12.07 22:47"
  }
 },
 "hiddenStems": [
  {
   "pillar": "year",
   "branch": "卯",
   "entries": [
    {
     "stem": "乙",
     "elem": "목",
     "tenGod": "정관",
     "rank": "정기",
     "weight": 100
    }
   ],
   "table": "cangdun-ge/1",
   "weightSource": "product/1"
  },
  {
   "pillar": "month",
   "branch": "子",
   "entries": [
    {
     "stem": "癸",
     "elem": "수",
     "tenGod": "정재",
     "rank": "정기",
     "weight": 100
    }
   ],
   "table": "cangdun-ge/1",
   "weightSource": "product/1"
  },
  {
   "pillar": "day",
   "branch": "午",
   "entries": [
    {
     "stem": "丁",
     "elem": "화",
     "tenGod": "정인",
     "rank": "정기",
     "weight": 70
    },
    {
     "stem": "己",
     "elem": "토",
     "tenGod": "겁재",
     "rank": "중기",
     "weight": 30
    }
   ],
   "table": "cangdun-ge/1",
   "weightSource": "product/1"
  }
 ],
 "earlyQiCandidates": [
  {
   "branch": "子",
   "stem": "壬",
   "days": 10,
   "basis": "rendivision/1",
   "use": "reference-only",
   "reason": "삼명통회 論人元司事가 일수 방식을 부정하고 판본마다 값이 다르다"
  }
 ],
 "roots": [
  {
   "pillar": "day",
   "branch": "午",
   "stem": "己",
   "elem": "토",
   "rank": "중기",
   "relationToDayMaster": "겁재",
   "rootGrade": "중",
   "basis": "jijanggan+cangdun-ge/1",
   "stage": "제왕"
  }
 ],
 "deukryeong": {
  "target": "month",
  "byElementCycle": {
   "supported": false,
   "how": "none",
   "relation": "controlled-by-me"
  },
  "bySeasonRank": {
   "rank": "수"
  },
  "byStage": {
   "stage": "태",
   "inTableStrongSet": true,
   "table": "twelve-stages-yinyang/1"
  },
  "byMainQiTenGod": {
   "tenGod": "정재",
   "group": "wealth",
   "supportive": false
  },
  "note": "네 판독은 서로 대체하지 않는다. 합산하지 않는다."
 },
 "deukji": {
  "target": "day",
  "byElementCycle": {
   "supported": true,
   "how": "generates-me",
   "relation": "generates-me"
  },
  "byStage": {
   "stage": "제왕",
   "inTableStrongSet": true,
   "table": "twelve-stages-yinyang/1"
  },
  "rootGrade": {
   "value": "중",
   "from": "roots.day.己"
  },
  "note": "통근 유무와 득지는 다른 축이다."
 },
 "deukse": {
  "stemFacts": [
   {
    "pillar": "year",
    "stem": "己",
    "group": "peer"
   },
   {
    "pillar": "month",
    "stem": "丙",
    "group": "resource"
   }
  ],
  "branchRoots": [
   {
    "pillar": "day",
    "branch": "午",
    "group": "peer",
    "rootGrade": "중"
   }
  ],
  "groupCountsByHiddenAll": {
   "peer": 2,
   "output": 0,
   "wealth": 1,
   "power": 1,
   "resource": 2
  },
  "note": "개수는 사실이다. 이 개수로 강약을 판정하지 않는다."
 },
 "elementFacts": {
  "surface": {
   "목": 1,
   "화": 2,
   "토": 2,
   "금": 0,
   "수": 1
  },
  "share": {
   "목": 16.7,
   "화": 33.3,
   "토": 33.3,
   "금": 0,
   "수": 16.7
  },
  "weighted": {
   "목": 16.7,
   "화": 28.3,
   "토": 38.3,
   "금": 0,
   "수": 16.7
  },
  "tiedMax": [
   "화",
   "토"
  ],
  "lacking": [
   "금"
  ],
  "hiddenOnly": [],
  "basis": {
   "surface": "eight-chars/1",
   "weighted": "product/1"
  }
 },
 "tenGodFacts": {
  "bySurface": {
   "비견": 0,
   "겁재": 1,
   "식신": 0,
   "상관": 0,
   "편재": 0,
   "정재": 1,
   "편관": 0,
   "정관": 1,
   "편인": 1,
   "정인": 1
  },
  "byHiddenAll": {
   "비견": 0,
   "겁재": 2,
   "식신": 0,
   "상관": 0,
   "편재": 0,
   "정재": 1,
   "편관": 0,
   "정관": 1,
   "편인": 1,
   "정인": 1
  },
  "absentSurface": [
   "비견",
   "식신",
   "상관",
   "편재",
   "편관"
  ],
  "groupsByHiddenAll": {
   "peer": 2,
   "output": 0,
   "wealth": 1,
   "power": 1,
   "resource": 2
  },
  "basis": {
   "bySurface": "stems+mainQi/1",
   "byHiddenAll": "stems+allHidden/1"
  },
  "note": "두 집계를 더하거나 평균하지 않는다."
 },
 "saenggeuk": [
  {
   "from": "丙",
   "to": "己",
   "kind": "생",
   "elemFrom": "화",
   "elemTo": "토",
   "positions": [
    "month.stem",
    "year.stem"
   ],
   "tenGod": "정인",
   "relation": "화생토"
  },
  {
   "from": "丙",
   "to": "戊",
   "kind": "생",
   "elemFrom": "화",
   "elemTo": "토",
   "positions": [
    "month.stem",
    "day.stem"
   ],
   "tenGod": "정인",
   "relation": "화생토"
  },
  {
   "from": "卯",
   "to": "戊",
   "kind": "극",
   "elemFrom": "목",
   "elemTo": "토",
   "positions": [
    "year.branch",
    "day.stem"
   ],
   "tenGod": null,
   "relation": "목극토",
   "basis": "branch-elem/1"
  },
  {
   "from": "子",
   "to": "戊",
   "kind": "극",
   "elemFrom": "수",
   "elemTo": "토",
   "positions": [
    "month.branch",
    "day.stem"
   ],
   "tenGod": null,
   "relation": "토극수",
   "basis": "branch-elem/1"
  },
  {
   "from": "午",
   "to": "戊",
   "kind": "생",
   "elemFrom": "화",
   "elemTo": "토",
   "positions": [
    "day.branch",
    "day.stem"
   ],
   "tenGod": null,
   "relation": "화생토",
   "basis": "branch-elem/1"
  }
 ],
 "hapchong": [
  {
   "id": "HYEONG.branch.卯子.yearmonth",
   "kind": "형",
   "chars": [
    "卯",
    "子"
   ],
   "between": [
    "year",
    "month"
   ],
   "basis": "relation-set/1"
  },
  {
   "id": "PA.branch.卯午.yearday",
   "kind": "파",
   "chars": [
    "卯",
    "午"
   ],
   "between": [
    "year",
    "day"
   ],
   "basis": "relation-set/1"
  },
  {
   "id": "CHUNG.branch.子午.monthday",
   "kind": "육충",
   "chars": [
    "子",
    "午"
   ],
   "between": [
    "month",
    "day"
   ],
   "basis": "relation-set/1"
  }
 ],
 "geokguk": {
  "monthType": "왕지",
  "candidates": [
   {
    "id": "GEOK.BONGGI.정재",
    "basis": "월지 子 본기 癸 = 정재",
    "transparent": false,
    "god": "정재",
    "decided": false
   },
   {
    "id": "GEOK.TUTUL.癸.정재",
    "basis": "월지 정기 癸 — 천간에 없음 = 정재",
    "transparent": false,
    "god": "정재",
    "decided": false
   }
  ],
  "agreement": "none",
  "agreementScope": "본기 후보와 투출 후보의 십성 비교만",
  "unresolved": [
   "격 확정 보류: 후보만 기록한다(사용자 지시)"
  ],
  "decided": false
 },
 "flags": {
  "hourUnknown": true,
  "termEdge": false,
  "termEdgeTerm": null,
  "ziEdge": false,
  "dstApplied": false,
  "monthIsJabgi": false
 }
}
```

</details>

---

## QA04 — 癸卯 乙丑 丁酉 丙午 · 정화(화) 일간

- 입력: 2024-2-3 · solar · 시 6번째 · 여성 · 관심 love

### 사주명식

| 기둥 | 간지 | 천간(십성) | 지지(십성) | 12운성 | 지장간 |
|---|---|---|---|---|---|
| 년 | 癸卯(계묘) | 계(편관) | 묘(편인) | 병 | 乙 편인 100 |
| 월 | 乙丑(을축) | 을(편인) | 축(식신) | 묘 | 己 식신 60 · 癸 편관 30 · 辛 편재 10 |
| 일 | 丁酉(정유) | 정(일간) | 유(편재) | 장생 | 辛 편재 100 |
| 시 | 丙午(병오) | 병(겁재) | 오(비견) | 건록 | 丁 비견 70 · 己 식신 30 |

- 오행 표면: 목 2(25%) · 화 3(37.5%) · 토 1(12.5%) · 금 1(12.5%) · 수 1(12.5%)
- 표면 십성: 비견 1 · 겁재 1 · 식신 1 · 편재 1 · 편관 1 · 편인 2
- 지장간 전체 십성: 비견 1 · 겁재 1 · 식신 2 · 편재 2 · 편관 2 · 편인 2
- 득령 4판독: 오행 drains-me · 계절 사 · 12운성 묘 · 본기 식신
- 통근 1개: hour.午 丁(중)
- 격 후보: GEOK.BONGGI.식신 · GEOK.TUTUL.己.식신 · GEOK.TUTUL.癸.편관 [투출] · GEOK.TUTUL.辛.편재 · GEOK.HOEJUK.금 → agreement differs
- 합충: 천간충 癸丁(year,day) · 육충 卯酉(year,day) · 파 卯午(year,hour) · 해 丑午(month,hour) · 반합 酉丑(undefined)
- 대운: 순행 · 시작 0세 5개월 · 현재 丙寅 (0~9세)
- 세운: 丙午 · 천간 겁재 / 지지 비견
- 상충 의무: O2 본기 후보와 투출 후보의 불일치 · O3 합과 충의 동시 성립

<details><summary>analysisData 전문 (펼치기)</summary>

```json
{
 "schemaVersion": "analysis/1.0",
 "chartVersion": "natal/2.3",
 "tables": {
  "hiddenStems": "cangdun-ge/1",
  "hiddenWeights": "product/1",
  "season": "wangxiang/1",
  "stage": "twelve-stages-yinyang/1",
  "tenGods": "ten-gods/1",
  "relations": "relation-set/1"
 },
 "chart": {
  "chartId": "계묘 을축 정유 병오|natal/2.3",
  "hourKnown": true,
  "pillars": {
   "year": {
    "stem": "癸",
    "branch": "卯",
    "stemIdx": 9,
    "branchIdx": 3
   },
   "month": {
    "stem": "乙",
    "branch": "丑",
    "stemIdx": 1,
    "branchIdx": 1
   },
   "day": {
    "stem": "丁",
    "branch": "酉",
    "stemIdx": 3,
    "branchIdx": 9
   },
   "hour": {
    "stem": "丙",
    "branch": "午",
    "stemIdx": 2,
    "branchIdx": 6
   }
  }
 },
 "dayMaster": {
  "stem": "丁",
  "elem": "화",
  "yinYang": "음"
 },
 "monthCommand": {
  "branch": "丑",
  "monthType": "잡기",
  "season": "겨울",
  "branchElem": "토",
  "wangXiang": {
   "목": "상",
   "화": "사",
   "토": "수",
   "금": "휴",
   "수": "왕"
  },
  "daysFromTerm": 28.3,
  "daysFromTermUse": "reference-only",
  "term": {
   "name": "소한",
   "at": "2024.01.06 05:49"
  }
 },
 "hiddenStems": [
  {
   "pillar": "year",
   "branch": "卯",
   "entries": [
    {
     "stem": "乙",
     "elem": "목",
     "tenGod": "편인",
     "rank": "정기",
     "weight": 100
    }
   ],
   "table": "cangdun-ge/1",
   "weightSource": "product/1"
  },
  {
   "pillar": "month",
   "branch": "丑",
   "entries": [
    {
     "stem": "己",
     "elem": "토",
     "tenGod": "식신",
     "rank": "정기",
     "weight": 60
    },
    {
     "stem": "癸",
     "elem": "수",
     "tenGod": "편관",
     "rank": "중기",
     "weight": 30
    },
    {
     "stem": "辛",
     "elem": "금",
     "tenGod": "편재",
     "rank": "여기",
     "weight": 10
    }
   ],
   "table": "cangdun-ge/1",
   "weightSource": "product/1"
  },
  {
   "pillar": "day",
   "branch": "酉",
   "entries": [
    {
     "stem": "辛",
     "elem": "금",
     "tenGod": "편재",
     "rank": "정기",
     "weight": 100
    }
   ],
   "table": "cangdun-ge/1",
   "weightSource": "product/1"
  },
  {
   "pillar": "hour",
   "branch": "午",
   "entries": [
    {
     "stem": "丁",
     "elem": "화",
     "tenGod": "비견",
     "rank": "정기",
     "weight": 70
    },
    {
     "stem": "己",
     "elem": "토",
     "tenGod": "식신",
     "rank": "중기",
     "weight": 30
    }
   ],
   "table": "cangdun-ge/1",
   "weightSource": "product/1"
  }
 ],
 "earlyQiCandidates": [],
 "roots": [
  {
   "pillar": "hour",
   "branch": "午",
   "stem": "丁",
   "elem": "화",
   "rank": "정기",
   "relationToDayMaster": "비견",
   "rootGrade": "중",
   "basis": "jijanggan+cangdun-ge/1",
   "stage": "건록"
  }
 ],
 "deukryeong": {
  "target": "month",
  "byElementCycle": {
   "supported": false,
   "how": "none",
   "relation": "drains-me"
  },
  "bySeasonRank": {
   "rank": "사"
  },
  "byStage": {
   "stage": "묘",
   "inTableStrongSet": false,
   "table": "twelve-stages-yinyang/1"
  },
  "byMainQiTenGod": {
   "tenGod": "식신",
   "group": "output",
   "supportive": false
  },
  "note": "네 판독은 서로 대체하지 않는다. 합산하지 않는다."
 },
 "deukji": {
  "target": "day",
  "byElementCycle": {
   "supported": false,
   "how": "none",
   "relation": "controlled-by-me"
  },
  "byStage": {
   "stage": "장생",
   "inTableStrongSet": true,
   "table": "twelve-stages-yinyang/1"
  },
  "rootGrade": {
   "value": null,
   "from": null
  },
  "note": "통근 유무와 득지는 다른 축이다."
 },
 "deukse": {
  "stemFacts": [
   {
    "pillar": "year",
    "stem": "癸",
    "group": "power"
   },
   {
    "pillar": "month",
    "stem": "乙",
    "group": "resource"
   },
   {
    "pillar": "hour",
    "stem": "丙",
    "group": "peer"
   }
  ],
  "branchRoots": [
   {
    "pillar": "hour",
    "branch": "午",
    "group": "peer",
    "rootGrade": "중"
   }
  ],
  "groupCountsByHiddenAll": {
   "peer": 2,
   "output": 2,
   "wealth": 2,
   "power": 2,
   "resource": 2
  },
  "note": "개수는 사실이다. 이 개수로 강약을 판정하지 않는다."
 },
 "elementFacts": {
  "surface": {
   "목": 2,
   "화": 3,
   "토": 1,
   "금": 1,
   "수": 1
  },
  "share": {
   "목": 25,
   "화": 37.5,
   "토": 12.5,
   "금": 12.5,
   "수": 12.5
  },
  "weighted": {
   "목": 25,
   "화": 33.8,
   "토": 11.3,
   "금": 13.8,
   "수": 16.3
  },
  "tiedMax": [
   "화"
  ],
  "lacking": [],
  "hiddenOnly": [],
  "basis": {
   "surface": "eight-chars/1",
   "weighted": "product/1"
  }
 },
 "tenGodFacts": {
  "bySurface": {
   "비견": 1,
   "겁재": 1,
   "식신": 1,
   "상관": 0,
   "편재": 1,
   "정재": 0,
   "편관": 1,
   "정관": 0,
   "편인": 2,
   "정인": 0
  },
  "byHiddenAll": {
   "비견": 1,
   "겁재": 1,
   "식신": 2,
   "상관": 0,
   "편재": 2,
   "정재": 0,
   "편관": 2,
   "정관": 0,
   "편인": 2,
   "정인": 0
  },
  "absentSurface": [
   "상관",
   "정재",
   "정관",
   "정인"
  ],
  "groupsByHiddenAll": {
   "peer": 2,
   "output": 2,
   "wealth": 2,
   "power": 2,
   "resource": 2
  },
  "basis": {
   "bySurface": "stems+mainQi/1",
   "byHiddenAll": "stems+allHidden/1"
  },
  "note": "두 집계를 더하거나 평균하지 않는다."
 },
 "saenggeuk": [
  {
   "from": "癸",
   "to": "乙",
   "kind": "생",
   "elemFrom": "수",
   "elemTo": "목",
   "positions": [
    "year.stem",
    "month.stem"
   ],
   "tenGod": "정인",
   "relation": "수생목"
  },
  {
   "from": "癸",
   "to": "丁",
   "kind": "극",
   "elemFrom": "수",
   "elemTo": "화",
   "positions": [
    "year.stem",
    "day.stem"
   ],
   "tenGod": "정인",
   "relation": "수극화"
  },
  {
   "from": "癸",
   "to": "丙",
   "kind": "극",
   "elemFrom": "수",
   "elemTo": "화",
   "positions": [
    "year.stem",
    "hour.stem"
   ],
   "tenGod": "정인",
   "relation": "수극화"
  },
  {
   "from": "乙",
   "to": "丁",
   "kind": "생",
   "elemFrom": "목",
   "elemTo": "화",
   "positions": [
    "month.stem",
    "day.stem"
   ],
   "tenGod": "정인",
   "relation": "목생화"
  },
  {
   "from": "乙",
   "to": "丙",
   "kind": "생",
   "elemFrom": "목",
   "elemTo": "화",
   "positions": [
    "month.stem",
    "hour.stem"
   ],
   "tenGod": "정인",
   "relation": "목생화"
  },
  {
   "from": "卯",
   "to": "丁",
   "kind": "생",
   "elemFrom": "목",
   "elemTo": "화",
   "positions": [
    "year.branch",
    "day.stem"
   ],
   "tenGod": null,
   "relation": "목생화",
   "basis": "branch-elem/1"
  },
  {
   "from": "丑",
   "to": "丁",
   "kind": "생",
   "elemFrom": "토",
   "elemTo": "화",
   "positions": [
    "month.branch",
    "day.stem"
   ],
   "tenGod": null,
   "relation": "화생토",
   "basis": "branch-elem/1"
  },
  {
   "from": "酉",
   "to": "丁",
   "kind": "극",
   "elemFrom": "금",
   "elemTo": "화",
   "positions": [
    "day.branch",
    "day.stem"
   ],
   "tenGod": null,
   "relation": "화극금",
   "basis": "branch-elem/1"
  }
 ],
 "hapchong": [
  {
   "id": "CHUNG.stem.癸丁.yearday",
   "kind": "천간충",
   "chars": [
    "癸",
    "丁"
   ],
   "between": [
    "year",
    "day"
   ],
   "basis": "relation-set/1"
  },
  {
   "id": "CHUNG.branch.卯酉.yearday",
   "kind": "육충",
   "chars": [
    "卯",
    "酉"
   ],
   "between": [
    "year",
    "day"
   ],
   "basis": "relation-set/1"
  },
  {
   "id": "PA.branch.卯午.yearhour",
   "kind": "파",
   "chars": [
    "卯",
    "午"
   ],
   "between": [
    "year",
    "hour"
   ],
   "basis": "relation-set/1"
  },
  {
   "id": "HAE.branch.丑午.monthhour",
   "kind": "해",
   "chars": [
    "丑",
    "午"
   ],
   "between": [
    "month",
    "hour"
   ],
   "basis": "relation-set/1"
  },
  {
   "id": "HAP.samhap.酉丑",
   "kind": "반합",
   "group": "금",
   "chars": [
    "酉",
    "丑"
   ],
   "completeness": "2/3",
   "missing": [
    "巳"
   ],
   "hapType": "拱合",
   "basis": "samhap/1"
  }
 ],
 "geokguk": {
  "monthType": "잡기",
  "candidates": [
   {
    "id": "GEOK.BONGGI.식신",
    "basis": "월지 丑 본기 己 = 식신",
    "transparent": false,
    "god": "식신",
    "decided": false
   },
   {
    "id": "GEOK.TUTUL.己.식신",
    "basis": "월지 정기 己 — 천간에 없음 = 식신",
    "transparent": false,
    "god": "식신",
    "decided": false
   },
   {
    "id": "GEOK.TUTUL.癸.편관",
    "basis": "월지 중기 癸이 년간에 투출 = 편관",
    "transparent": true,
    "god": "편관",
    "decided": false
   },
   {
    "id": "GEOK.TUTUL.辛.편재",
    "basis": "월지 여기 辛 — 천간에 없음 = 편재",
    "transparent": false,
    "god": "편재",
    "decided": false
   },
   {
    "id": "GEOK.HOEJUK.금",
    "basis": "酉丑 반합 금국(巳 缺)",
    "transparent": false,
    "god": null,
    "decided": false
   }
  ],
  "agreement": "differs",
  "agreementScope": "본기 후보와 투출 후보의 십성 비교만",
  "unresolved": [
   "본기와 투출이 다른 격을 가리킨다 — 불일치 자체를 사실로 쓴다",
   "격 확정 보류: 후보만 기록한다(사용자 지시)"
  ],
  "decided": false
 },
 "flags": {
  "hourUnknown": false,
  "termEdge": false,
  "termEdgeTerm": null,
  "ziEdge": false,
  "dstApplied": false,
  "monthIsJabgi": true
 }
}
```

</details>

---

## QA09 — 戊辰 庚申 乙未 丁亥 · 을목(목) 일간

- 입력: 1988-8-8 · solar · 시 11번째 · 남성 · 관심 work

### 사주명식

| 기둥 | 간지 | 천간(십성) | 지지(십성) | 12운성 | 지장간 |
|---|---|---|---|---|---|
| 년 | 戊辰(무진) | 무(정재) | 진(정재) | 관대 | 戊 정재 60 · 乙 비견 30 · 癸 편인 10 |
| 월 | 庚申(경신) | 경(정관) | 신(정관) | 태 | 庚 정관 60 · 壬 정인 30 · 戊 정재 10 |
| 일 | 乙未(을미) | 을(일간) | 미(편재) | 양 | 己 편재 60 · 丁 식신 30 · 乙 비견 10 |
| 시 | 丁亥(정해) | 정(식신) | 해(정인) | 사 | 壬 정인 70 · 甲 겁재 30 |

- 오행 표면: 목 1(12.5%) · 화 1(12.5%) · 토 3(37.5%) · 금 2(25%) · 수 1(12.5%)
- 표면 십성: 식신 1 · 편재 1 · 정재 2 · 정관 2 · 정인 1
- 지장간 전체 십성: 비견 2 · 겁재 1 · 식신 2 · 편재 1 · 정재 3 · 정관 2 · 편인 1 · 정인 2
- 득령 4판독: 오행 controls-me · 계절 사 · 12운성 태 · 본기 정관
- 통근 3개: year.辰 乙(경) · day.未 乙(경) · hour.亥 甲(경)
- 격 후보: GEOK.BONGGI.정관 [투출] · GEOK.TUTUL.庚.정관 [투출] · GEOK.TUTUL.壬.정인 · GEOK.TUTUL.戊.정재 [투출] · GEOK.HOEJUK.수 → agreement partial
- 합충: 천간합 庚乙(month,day) · 해 申亥(month,hour) · 반합 申辰(undefined) · 반합 亥未(undefined)
- 대운: 순행 · 시작 10세 · 현재 癸亥 (29~38세)
- 세운: 丙午 · 천간 상관 / 지지 식신
- 상충 의무: O2 본기 후보와 투출 후보의 불일치

<details><summary>analysisData 전문 (펼치기)</summary>

```json
{
 "schemaVersion": "analysis/1.0",
 "chartVersion": "natal/2.3",
 "tables": {
  "hiddenStems": "cangdun-ge/1",
  "hiddenWeights": "product/1",
  "season": "wangxiang/1",
  "stage": "twelve-stages-yinyang/1",
  "tenGods": "ten-gods/1",
  "relations": "relation-set/1"
 },
 "chart": {
  "chartId": "무진 경신 을미 정해|natal/2.3",
  "hourKnown": true,
  "pillars": {
   "year": {
    "stem": "戊",
    "branch": "辰",
    "stemIdx": 4,
    "branchIdx": 4
   },
   "month": {
    "stem": "庚",
    "branch": "申",
    "stemIdx": 6,
    "branchIdx": 8
   },
   "day": {
    "stem": "乙",
    "branch": "未",
    "stemIdx": 1,
    "branchIdx": 7
   },
   "hour": {
    "stem": "丁",
    "branch": "亥",
    "stemIdx": 3,
    "branchIdx": 11
   }
  }
 },
 "dayMaster": {
  "stem": "乙",
  "elem": "목",
  "yinYang": "음"
 },
 "monthCommand": {
  "branch": "申",
  "monthType": "생지",
  "season": "가을",
  "branchElem": "금",
  "wangXiang": {
   "목": "사",
   "화": "수",
   "토": "휴",
   "금": "왕",
   "수": "상"
  },
  "daysFromTerm": 1.2,
  "daysFromTermUse": "reference-only",
  "term": {
   "name": "입추",
   "at": "1988.08.07 16:20"
  }
 },
 "hiddenStems": [
  {
   "pillar": "year",
   "branch": "辰",
   "entries": [
    {
     "stem": "戊",
     "elem": "토",
     "tenGod": "정재",
     "rank": "정기",
     "weight": 60
    },
    {
     "stem": "乙",
     "elem": "목",
     "tenGod": "비견",
     "rank": "중기",
     "weight": 30
    },
    {
     "stem": "癸",
     "elem": "수",
     "tenGod": "편인",
     "rank": "여기",
     "weight": 10
    }
   ],
   "table": "cangdun-ge/1",
   "weightSource": "product/1"
  },
  {
   "pillar": "month",
   "branch": "申",
   "entries": [
    {
     "stem": "庚",
     "elem": "금",
     "tenGod": "정관",
     "rank": "정기",
     "weight": 60
    },
    {
     "stem": "壬",
     "elem": "수",
     "tenGod": "정인",
     "rank": "중기",
     "weight": 30
    },
    {
     "stem": "戊",
     "elem": "토",
     "tenGod": "정재",
     "rank": "여기",
     "weight": 10
    }
   ],
   "table": "cangdun-ge/1",
   "weightSource": "product/1"
  },
  {
   "pillar": "day",
   "branch": "未",
   "entries": [
    {
     "stem": "己",
     "elem": "토",
     "tenGod": "편재",
     "rank": "정기",
     "weight": 60
    },
    {
     "stem": "丁",
     "elem": "화",
     "tenGod": "식신",
     "rank": "중기",
     "weight": 30
    },
    {
     "stem": "乙",
     "elem": "목",
     "tenGod": "비견",
     "rank": "여기",
     "weight": 10
    }
   ],
   "table": "cangdun-ge/1",
   "weightSource": "product/1"
  },
  {
   "pillar": "hour",
   "branch": "亥",
   "entries": [
    {
     "stem": "壬",
     "elem": "수",
     "tenGod": "정인",
     "rank": "정기",
     "weight": 70
    },
    {
     "stem": "甲",
     "elem": "목",
     "tenGod": "겁재",
     "rank": "중기",
     "weight": 30
    }
   ],
   "table": "cangdun-ge/1",
   "weightSource": "product/1"
  }
 ],
 "earlyQiCandidates": [],
 "roots": [
  {
   "pillar": "year",
   "branch": "辰",
   "stem": "乙",
   "elem": "목",
   "rank": "중기",
   "relationToDayMaster": "비견",
   "rootGrade": "경",
   "basis": "jijanggan+cangdun-ge/1",
   "stage": "관대"
  },
  {
   "pillar": "day",
   "branch": "未",
   "stem": "乙",
   "elem": "목",
   "rank": "여기",
   "relationToDayMaster": "비견",
   "rootGrade": "경",
   "basis": "jijanggan+cangdun-ge/1",
   "stage": "양"
  },
  {
   "pillar": "hour",
   "branch": "亥",
   "stem": "甲",
   "elem": "목",
   "rank": "중기",
   "relationToDayMaster": "겁재",
   "rootGrade": "경",
   "basis": "jijanggan+cangdun-ge/1",
   "stage": "사"
  }
 ],
 "deukryeong": {
  "target": "month",
  "byElementCycle": {
   "supported": false,
   "how": "none",
   "relation": "controls-me"
  },
  "bySeasonRank": {
   "rank": "사"
  },
  "byStage": {
   "stage": "태",
   "inTableStrongSet": true,
   "table": "twelve-stages-yinyang/1"
  },
  "byMainQiTenGod": {
   "tenGod": "정관",
   "group": "power",
   "supportive": false
  },
  "note": "네 판독은 서로 대체하지 않는다. 합산하지 않는다."
 },
 "deukji": {
  "target": "day",
  "byElementCycle": {
   "supported": false,
   "how": "none",
   "relation": "controlled-by-me"
  },
  "byStage": {
   "stage": "양",
   "inTableStrongSet": true,
   "table": "twelve-stages-yinyang/1"
  },
  "rootGrade": {
   "value": "경",
   "from": "roots.day.乙"
  },
  "note": "통근 유무와 득지는 다른 축이다."
 },
 "deukse": {
  "stemFacts": [
   {
    "pillar": "year",
    "stem": "戊",
    "group": "wealth"
   },
   {
    "pillar": "month",
    "stem": "庚",
    "group": "power"
   },
   {
    "pillar": "hour",
    "stem": "丁",
    "group": "output"
   }
  ],
  "branchRoots": [
   {
    "pillar": "year",
    "branch": "辰",
    "group": "peer",
    "rootGrade": "경"
   },
   {
    "pillar": "day",
    "branch": "未",
    "group": "peer",
    "rootGrade": "경"
   },
   {
    "pillar": "hour",
    "branch": "亥",
    "group": "peer",
    "rootGrade": "경"
   }
  ],
  "groupCountsByHiddenAll": {
   "peer": 3,
   "output": 2,
   "wealth": 4,
   "power": 2,
   "resource": 3
  },
  "note": "개수는 사실이다. 이 개수로 강약을 판정하지 않는다."
 },
 "elementFacts": {
  "surface": {
   "목": 1,
   "화": 1,
   "토": 3,
   "금": 2,
   "수": 1
  },
  "share": {
   "목": 12.5,
   "화": 12.5,
   "토": 37.5,
   "금": 25,
   "수": 12.5
  },
  "weighted": {
   "목": 21.3,
   "화": 16.3,
   "토": 28.7,
   "금": 20,
   "수": 13.8
  },
  "tiedMax": [
   "토"
  ],
  "lacking": [],
  "hiddenOnly": [],
  "basis": {
   "surface": "eight-chars/1",
   "weighted": "product/1"
  }
 },
 "tenGodFacts": {
  "bySurface": {
   "비견": 0,
   "겁재": 0,
   "식신": 1,
   "상관": 0,
   "편재": 1,
   "정재": 2,
   "편관": 0,
   "정관": 2,
   "편인": 0,
   "정인": 1
  },
  "byHiddenAll": {
   "비견": 2,
   "겁재": 1,
   "식신": 2,
   "상관": 0,
   "편재": 1,
   "정재": 3,
   "편관": 0,
   "정관": 2,
   "편인": 1,
   "정인": 2
  },
  "absentSurface": [
   "비견",
   "겁재",
   "상관",
   "편관",
   "편인"
  ],
  "groupsByHiddenAll": {
   "peer": 3,
   "output": 2,
   "wealth": 4,
   "power": 2,
   "resource": 3
  },
  "basis": {
   "bySurface": "stems+mainQi/1",
   "byHiddenAll": "stems+allHidden/1"
  },
  "note": "두 집계를 더하거나 평균하지 않는다."
 },
 "saenggeuk": [
  {
   "from": "戊",
   "to": "庚",
   "kind": "생",
   "elemFrom": "토",
   "elemTo": "금",
   "positions": [
    "year.stem",
    "month.stem"
   ],
   "tenGod": "정인",
   "relation": "토생금"
  },
  {
   "from": "乙",
   "to": "戊",
   "kind": "극",
   "elemFrom": "목",
   "elemTo": "토",
   "positions": [
    "day.stem",
    "year.stem"
   ],
   "tenGod": "정인",
   "relation": "목극토",
   "controlledBy": "庚",
   "controlledByPositions": [
    "month.stem"
   ],
   "note": "제어 글자의 존재만 기록. 길흉 판정 없음"
  },
  {
   "from": "丁",
   "to": "戊",
   "kind": "생",
   "elemFrom": "화",
   "elemTo": "토",
   "positions": [
    "hour.stem",
    "year.stem"
   ],
   "tenGod": "정인",
   "relation": "화생토"
  },
  {
   "from": "庚",
   "to": "乙",
   "kind": "극",
   "elemFrom": "금",
   "elemTo": "목",
   "positions": [
    "month.stem",
    "day.stem"
   ],
   "tenGod": "정인",
   "relation": "금극목",
   "controlledBy": "丁",
   "controlledByPositions": [
    "hour.stem"
   ],
   "note": "제어 글자의 존재만 기록. 길흉 판정 없음"
  },
  {
   "from": "丁",
   "to": "庚",
   "kind": "극",
   "elemFrom": "화",
   "elemTo": "금",
   "positions": [
    "hour.stem",
    "month.stem"
   ],
   "tenGod": "정인",
   "relation": "화극금"
  },
  {
   "from": "乙",
   "to": "丁",
   "kind": "생",
   "elemFrom": "목",
   "elemTo": "화",
   "positions": [
    "day.stem",
    "hour.stem"
   ],
   "tenGod": "정인",
   "relation": "목생화"
  },
  {
   "from": "辰",
   "to": "乙",
   "kind": "극",
   "elemFrom": "토",
   "elemTo": "목",
   "positions": [
    "year.branch",
    "day.stem"
   ],
   "tenGod": null,
   "relation": "목극토",
   "basis": "branch-elem/1"
  },
  {
   "from": "申",
   "to": "乙",
   "kind": "극",
   "elemFrom": "금",
   "elemTo": "목",
   "positions": [
    "month.branch",
    "day.stem"
   ],
   "tenGod": null,
   "relation": "금극목",
   "basis": "branch-elem/1"
  },
  {
   "from": "未",
   "to": "乙",
   "kind": "극",
   "elemFrom": "토",
   "elemTo": "목",
   "positions": [
    "day.branch",
    "day.stem"
   ],
   "tenGod": null,
   "relation": "목극토",
   "basis": "branch-elem/1"
  },
  {
   "from": "亥",
   "to": "乙",
   "kind": "생",
   "elemFrom": "수",
   "elemTo": "목",
   "positions": [
    "hour.branch",
    "day.stem"
   ],
   "tenGod": null,
   "relation": "수생목",
   "basis": "branch-elem/1"
  }
 ],
 "hapchong": [
  {
   "id": "HAP.stem.庚乙.monthday",
   "kind": "천간합",
   "chars": [
    "庚",
    "乙"
   ],
   "between": [
    "month",
    "day"
   ],
   "transform": {
    "possible": false,
    "condition": "월령 나무"
   },
   "decided": false,
   "basis": "relation-set/1"
  },
  {
   "id": "HAE.branch.申亥.monthhour",
   "kind": "해",
   "chars": [
    "申",
    "亥"
   ],
   "between": [
    "month",
    "hour"
   ],
   "basis": "relation-set/1"
  },
  {
   "id": "HAP.samhap.申辰",
   "kind": "반합",
   "group": "수",
   "chars": [
    "申",
    "辰"
   ],
   "completeness": "2/3",
   "missing": [
    "子"
   ],
   "hapType": "拱合",
   "basis": "samhap/1"
  },
  {
   "id": "HAP.samhap.亥未",
   "kind": "반합",
   "group": "수",
   "chars": [
    "亥",
    "未"
   ],
   "completeness": "2/3",
   "missing": [
    "卯"
   ],
   "hapType": "拱合",
   "basis": "samhap/1"
  }
 ],
 "geokguk": {
  "monthType": "생지",
  "candidates": [
   {
    "id": "GEOK.BONGGI.정관",
    "basis": "월지 申 본기 庚 = 정관",
    "transparent": true,
    "god": "정관",
    "decided": false
   },
   {
    "id": "GEOK.TUTUL.庚.정관",
    "basis": "월지 정기 庚이 월간에 투출 = 정관",
    "transparent": true,
    "god": "정관",
    "decided": false
   },
   {
    "id": "GEOK.TUTUL.壬.정인",
    "basis": "월지 중기 壬 — 천간에 없음 = 정인",
    "transparent": false,
    "god": "정인",
    "decided": false
   },
   {
    "id": "GEOK.TUTUL.戊.정재",
    "basis": "월지 여기 戊이 년간에 투출 = 정재",
    "transparent": true,
    "god": "정재",
    "decided": false
   },
   {
    "id": "GEOK.HOEJUK.수",
    "basis": "申辰 반합 수국(子 缺)",
    "transparent": false,
    "god": null,
    "decided": false
   }
  ],
  "agreement": "partial",
  "agreementScope": "본기 후보와 투출 후보의 십성 비교만",
  "unresolved": [
   "격 확정 보류: 후보만 기록한다(사용자 지시)"
  ],
  "decided": false
 },
 "flags": {
  "hourUnknown": false,
  "termEdge": false,
  "termEdgeTerm": null,
  "ziEdge": false,
  "dstApplied": true,
  "monthIsJabgi": false
 }
}
```

</details>

---

## 다시 만드는 법

```bash
node tests/ai-compare/tools/extract-qa-analysis.mjs
node tests/ai-compare/run.mjs --mode stub        # 12건 일치 자기시험 포함
```

전체 12건의 `analysisData` 전문은 JSON 에 있다. 이 문서는 요약과 대표 3건의 전문만 담는다(문서 길이 때문에).