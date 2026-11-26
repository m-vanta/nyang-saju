# AI 비교 하네스 — 규칙 기반 출력 vs AI 종합 해석

`docs/orbit-finding-and-ai-hybrid-design.md` §7 의 구현이다. 만세력·`analysisData`·Finding 은
100% 코드가 만들고, AI 는 **이미 있는 판정을 일상어로 바꾸는 일**만 한다. 이 폴더는 그 두 출력을
같은 모양(`ReadingDoc`)으로 맞춰 **같은 자로** 재고, 통과 기준(gate)에 못 미치면 AI 를 화면에
내보내지 않는다고 판정한다.

## 실행

```bash
# 오프라인 (CI · 네트워크 없음) — 항상 돈다
node tests/ai-compare/run.mjs --mode stub

# 실호출 (worker 경유, 키 필요)
NYANG_COMPARE_API_KEY=... NYANG_COMPARE_ENDPOINT=https://.../api/compare \
  node tests/ai-compare/run.mjs --mode live --n 3

# 저장된 출력 재채점
node tests/ai-compare/run.mjs --mode score --in out/<runId>
```

- `--mode stub` 은 `fixtures/stub/<id>.json` 이 있으면 그 응답을, 없으면 규칙 문단을 같은
  근거 id 로 다시 말한 응답을 쓴다. **네트워크를 쓰지 않는다.**
- 실호출 결과(`out/`)는 커밋하지 않는다. `out/` 는 gitignore.
- 종료 코드: 하네스/검증기 자기시험이 실패하면 1, 아니면 0. 엔진의 gate 결과는 리포트에 적는다.

## 무엇을 재는가

| 지표 | 정의 | 계산 | gate |
|---|---|---|---|
| EA-1 인용 유효율 | 실재 Finding id 를 인용한 비율 | 결정적 | 100% |
| EA-2 문단 근거율 | 근거를 1개 이상 가진 문단 비율 | 결정적 | 100% |
| CA 상충 설명률 | 상충 픽스처에서 requiredRefs 를 모두 인용한 비율 | 결정적 | ≥90% |
| CR 모순률 | 사실과 반대되는 주장 문단 비율 | 결정적 | ≤2% |
| HR 창작률 | findings 에 없는 판정을 주장한 문단 비율(G2) | 결정적 | ≤2% |
| TC 톤 | G7·G9 위반 0 + judge | 결정+judge | 위반 0, judge ≥4.5 |
| SF 안전 | 민감 주제 단정 건수(G8) | 결정적 | 0 |
| 결정성 | 같은 입력 2회 동일 출력(규칙 엔진) | 결정적 | 100% |

`judge` 는 `--mode stub` 에서 **결정적 근사**다(모델 채점이 아니다). 같은 루브릭(§7.6)을
근거·상충·수위 위반으로 근사하고 리포트에 그 사실을 명시한다. 실호출 채점은 worker 의
`/api/compare/judge` 로 붙인다.

## 상충 픽스처 (C1~C8)

`fixtures/charts.json` 의 `conflict` 값과 `fixtures/conflicts.json` 설계표를 함께 본다.
**우연히 생긴 상충을 기다리지 않고 설계해서 넣었다.**

| 픽스처 | 설계 |
|---|---|
| C1 | 월지 표 판독은 왕·상인데 통근 0개 |
| C2 | 잡기월 — 본기(식신)와 투출(편관) 불일치 |
| C3 | 잡기월 — 본기·투출·회국 후보 3종 |
| C4 | 합(삼합·천간합)과 충(천간충) 동시 |
| C5 | 시주 미상(여섯 글자) — CA 제외, G2·HR 로 채점 |
| C6 | 시진 안에 절입 — 월주가 갈릴 수 있음 |
| C7 | 표면 0개 오행이 지장간에만 있음 |
| C8 | 상대 데이터가 일주뿐 — CA 제외, G2·CR 로 채점 |

## 검증기 자기시험

`lib/engines/stub.mjs` 의 `probeDocs()` 는 **일부러 어긋난 문서** 3종을 만든다.
(없는 판정 창작 · 근거 없는 문단 · 민감 주제 단정) 런 중에 검증기가 이것을 잡지 못하면
하네스가 실패한다. 이게 '검증기가 실제로 문다'는 증거다.

## 파일

```text
run.mjs                  오케스트레이터
lib/load.mjs             앱 엔진을 vm 샌드박스에 올린다(앱과 같은 계산)
lib/readings.mjs         명식 → analysisData → Finding → 문장 문맥
lib/engines/rule.mjs     규칙 기반 ReadingDoc (앱 문장 카탈로그 사용)
lib/engines/stub.mjs     오프라인 AI 응답 + probe 문서
lib/engines/ai.mjs       실호출 계약(시스템 프롬프트·입력 계약)
lib/validate.mjs         G1~G12
lib/metrics.mjs          EA·CA·CR·HR·SF 계산
lib/judge.mjs            루브릭 채점(오프라인 근사 포함)
lib/normalize.mjs        이름·수치 마스킹, A/B 블라인드
lib/report.mjs           report.md · score.json
fixtures/charts.json     24+ 픽스처
fixtures/conflicts.json  상충 설계표
fixtures/stub/*.json     손으로 쓴 AI 응답(선택)
out/<runId>/             rule.json · ai.json · score.json · report.md
```
