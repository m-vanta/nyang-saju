# AI 종합 해석 실험 — 규칙 기반 vs AI 다섯 실험군 (A~E)

만세력·`analysisData`·Finding 은 100% 코드가 만든다. 이 폴더는 **AI 가 그 사실을 얼마나
정확하게, 얼마나 개인화해서, 얼마의 비용으로 해석하는가**를 같은 자로 재는 하네스다.
설계 배경은 `docs/orbit-finding-and-ai-hybrid-design.md` §6~7, 검토용 요약은
`docs/ai-experiment-review-pack.md` 에 있다.

## 다섯 실험군

| 실험군 | 받는 입력 | 이 실험군으로 보는 것 |
|---|---|---|
| **A** rule | 명식 + analysisData + Finding(앱 카탈로그) | 현행 앱(규칙 문장)의 기준선 |
| **B** chart+period | 기본 명식 + 대운·세운 | 모델 자체의 명리 지식만으로 어디까지 가는가 |
| **C** analysis | + analysisData | 사실을 다 줘도 지식베이스가 없으면 어떤가 |
| **D** knowledge | + 지식베이스 35항목 | 검증된 명리 문장을 주면 달라지는가 |
| **E** critic | D + D 초안 비평·재작성 | 자기 검토 한 번이 품질을 올리는가 |

- B 도 **대운·세운**을 받는다(코드가 계산한 기본 사실). 예전 B(명식만)는 §08 을 쓸 수 없고
  `chart.*` 인용이 일반론으로 채점돼 구조적으로 불리했다 — 리뷰 P0-1 반영.
- C 와 D 의 차이는 **지식베이스 하나뿐**이다(자기시험이 확인).
- A 문단은 `contentOrigin`(service / service-mapped / experimental-generated)으로 출처를 구분한다.

출력은 다섯 실험군 모두 **8섹션 그릇**(`lib/schema.mjs`, `reading/2.0`)에 담는다.
① 천기팩폭 ② 대표 성향 ③ 내면의 상충하는 성향 ④ 반복되는 행동 패턴 ⑤ 연애운 ⑥ 재물운 ⑦ 직업운 ⑧ 대운 및 올해 운세.
앱에 없는 섹션은 `status:"unavailable"` + 이유로 비운다.

## 실행

```bash
# 오프라인 (CI · 네트워크 없음) — 항상 돈다
node tests/ai-compare/run.mjs --mode stub

# 파일럿 3건만 오프라인 (QA02·QA04·QA09)
node tests/ai-compare/run.mjs --mode stub --set pilot

# 실호출 — 파일럿 3건 / 전체 12건 (ANTHROPIC_API_KEY 필요)
# pilot 기본값: 최대 12회 호출 · 재시도 0회 (QA02·QA04·QA09 × B·C·D·E = 12회, A 는 API 0회)
node tests/ai-compare/run.mjs --mode pilot --max-cost-usd 10
node tests/ai-compare/run.mjs --mode full --max-cost-usd 40

# 실호출 배선을 스텁으로 예행
node tests/ai-compare/run.mjs --mode full --stub

# 일부 실험군만
node tests/ai-compare/run.mjs --mode stub --arms A,C,D
```

| 옵션 | 뜻 |
|---|---|
| `--mode stub` | 결정적 오프라인 응답. 네트워크·키 없음 |
| `--mode pilot` | 파일럿 3건 실호출. `--max-calls`·`--max-retries` 를 명시하지 않으면 **12회·0회** 를 적용한다 |
| `--mode full` | QA01~12 실호출 (**비교쌍 3종 필수**) |
| `--set pilot\|all` | 픽스처 부분집합 |
| `--fixtures <path>` | 다른 픽스처 파일(`profiles` 또는 `charts` 배열) |
| `--arms A,B,C,D,E` | 일부 실험군 |
| `--max-calls N` | 모델 호출 총 횟수 상한(재시도 포함) |
| `--max-retries N` | 검증 실패 재시도 횟수(기본 1 · **pilot 기본 0**) |
| `--max-cost-usd X` | 누적 비용 상한. **실행 전 최대 예상 비용**과 **호출 직전 시도별 예상 비용**으로 검사해 넘으면 호출하지 않는다 |
| `--model <id>` | 기본 `claude-opus-5-5` (실제 API 호출까지 전달) |
| `--out <dir>` | 산출물 경로(기본 `out/<runId>`) |
| `--stub` | pilot/full 배선을 스텁으로 |

종료 코드: 하네스·검증기 자기시험이 실패하면 1, 예산·비교쌍 설정 오류는 2.

`--max-cost-usd` 는 **호출 전 최대 예상 비용**(프롬프트 입력 토큰 추정 + `max_tokens` 전량 출력)으로 검사한다 — 실제 청구보다 훨씬 큰 보수적 상한이다. `max_tokens` 16000 기준 파일럿 12회 ≈ $4.82, 전체 48회 ≈ $19.45(재시도 1회 기본값 포함 ≈ $38.90)이므로 위 예시는 그 위로 잡았다.

## 모델 요청 규격 (Claude Opus 5.5)

`platform.claude.com/docs/en/models/opus-5-5/migration-guide` 기준. AI 실험군 B·C·D·E 는 **모델·effort·max_tokens 가 모두 같다** — 실험 축은 '무엇을 주는가' 하나뿐이다.

| 항목 | 값 | 이유 |
|---|---|---|
| model | `claude-opus-5-5` | 고정 ID(날짜 접미사 없음) |
| temperature · top_p · top_k | **보내지 않음** | Opus 5.5 는 보내면 HTTP 400 |
| output_config.effort | `medium` (명시) | thinking 깊이를 정하는 유일한 파라미터. 기본값도 medium 이지만 기록·재현을 위해 명시한다 |
| max_tokens | `16000` | **thinking + 본문 합산** 상한. 8000 은 thinking 이 본문 자리를 먹으면 잘린다 |
| thinking | 보내지 않음(항상 켜짐) | `thinking: {type:'disabled'}`·수동 budget 은 400 |

- 응답 `content` 의 첫 블록이 `thinking` 일 수 있다 → 위치(`content[0].text`)로 읽지 않고 `type === 'text'` 블록만 모아 읽는다(`lib/engines/ai.mjs` `extractText`).
- `stop_reason: 'max_tokens'` 는 **정상 생성 성공으로 세지 않는다** — 파싱이 돼도 `ok:false`·`truncated:true`·최종 실패로 집계하고, E 는 그 D 초안을 유효 초안으로 받지 않는다. 잘린 응답의 `rawText` 전문과 파싱된 부분 객체(`partialDoc`)는 자르지 않고 `calls/*.json`·`docs.json` 에 보존한다.
- 첫 실호출이 HTTP 400·401·403·404(요청·인증·모델 설정 오류)로 실패하면 남은 호출을 보내지 않고 멈춘다(`lib/abort.mjs`). 미시도 건은 `skipped:'notAttempted'` 로 기록하고 오류 요약과 함께 종료 코드 2로 끝난다. 5xx·429·네트워크 오류는 다음 호출이 성공할 수 있으므로 계속한다.
- 기록 위치: `calls/<픽스처>-<실험군>-a<시도>.json` 의 `request`, `cost.json`·`score.json` 의 `settings`, `blind-key.json`·`tech-eval.md` 의 실험군 설정.

## 무엇을 재는가

| 지표 | 정의 | 계산 | gate |
|---|---|---|---|
| **요청 건수** | 그 실험군에 요청한 건수(스킵·실패 포함) | 계측 | — |
| **1차 성공률** | 재시도 없이 1차에서 파싱+유효성 통과 / 요청 건수 | 결정적 | — |
| **재시도 후 성공률** | 최종 통과 / 요청 건수 | 결정적 | — |
| **최종 실패율** | 1 − 재시도 후 성공률 | 결정적 | 0 |
| **품질 평가 모수** | 문서가 나온 응답 / 요청 건수 | 계측 | 요청과 같아야 함 |
| EA-1 인용 유효율 | 유효 근거 / 전체 근거 | 결정적 | 100% |
| EA-2 문단 근거율 | 근거 ≥1 문단 / 전체 문단 | 결정적 | 100% |
| CA 상충 설명률 | 상충 의무를 **한 문단에서** 양쪽 인용 + 조건까지 설명 | 결정적 | ≥90% |
| HZ 환각 | 없는 간지·십성·합충·층위 혼동 (V4·V5·V6·V18) | 결정적 | 0 |
| GA 금지 판정 | 신강·신약·용신·격국 확정·단정·민감 (V7·V8·V9) | 결정적 | 0 |
| SC 스키마 | 8섹션 그릇 위반 | 결정적 | 0 |
| CR 모순률 | 사실과 반대되는 주장 문단 | 결정적 | ≤2% |
| GN 일반론률 | 개인 사실(analysis·period·finding·**chart**) 미인용 문단 | 결정적 | 참고 |
| GN(구정의) | `chart.*` 만 인용한 문단 비율 | 결정적 | 참고(게이트 미적용) |
| 구조/내용 위반 | V1·V2·V3·V13 / 나머지 규칙 위반 수 | 결정적 | 참고 |
| KB/문단 | 지식베이스 인용 밀도(D·E) | 결정적 | 참고 |
| judge | 루브릭 5점 근사 | 결정적 근사 | ≥4.5 |
| 비용·지연 | 입력/출력 토큰, USD/KRW, p50/p95, 재시도·잘림·오류 | 계측 | 상한 내 |

`judge` 는 `--mode stub` 에서 **결정적 근사**다(모델 채점이 아니다). 같은 루브릭(§7.6)을
근거·개인화·상충·위반으로 근사하고 리포트에 그 사실을 명시한다.

**성공률·실패율의 모수는 요청 건수다.** 실패·스킵을 빼고 품질을 재면 "잘 쓴 것만 남은 평균"이 되어
우열이 뒤집힌다. 그래서 리포트·`score.json`·`tech-eval` 에 `requestedCount` · `firstAttemptSuccessRate` ·
`afterRetrySuccessRate` · `finalFailureRate` 를 실험군별로 따로 내고 품질 지표와 나란히 놓는다.
품질 지표의 모수(문서가 나온 응답 수)도 항상 같이 적는다. 실패한 응답의 raw output·오류 사유·
usage·비용은 삭제하지 않고 `calls/` · `docs.json` · `cost.json` · `score.json` · `tech-eval` 에 보존한다.

> **API 비용 추정치는 사전 추정치일 뿐 절대적인 과금 상한이 아니며, 실제 과금은 API 제공자의 청구 기준을 따릅니다.**
> `report.md`·`cost.json`(`disclaimer`)·CLI 출력·`tech-eval` 에 같이 적힌다.

## 상충 의무 (O1~O6)

우연히 생긴 상충을 기다리지 않고, **명식 안에 양립하는 두 판독이 실제로 있을 때만** 의무를 만든다.

| id | 축 |
|---|---|
| O1 | 월령 표 판독은 돕는데 통근 0개 |
| O2 | 본기 후보와 투출 후보가 다른 격을 가리킴 |
| O3 | 합과 충의 동시 성립 |
| O4 | 표면 0개 · 지장간에만 있는 오행 |
| O5 | 시진 안 절입 — 월주가 갈릴 수 있음 |
| O6 | 시주 미상(여섯 글자) |

의무 = "그 축을 말하려면 **한 문단에서 양쪽을 인용**하고, 언제 어느 쪽이 드러나는지(조건)를 말해야 한다".
실험군이 그 근거를 볼 수 없으면 `reachable:false` 로 남기고 CA 분모에서 뺀다(못 본 것을 못 봤다고 적는다).

## 검증기 — 구조·참조 / 내용 분리

- **구조·참조**: V1(스키마)·V2(근거 존재)·V3(입력 범위)·V13(KB 참조). 계산으로 100% 판정.
- **내용(자동)**: V4~V12·V14~V21. 결정적으로 잡히는 사실·정합성 위반만 본다.

**자동 통과는 명리학적 해석 품질을 보증하지 않는다.** 이 문장은 리포트·score.json 에 매번 적힌다.

새로 추가된 내용 규칙(리뷰 P0-2):

| 규칙 | 잡는 것 |
|---|---|
| V15(강화) | 상충 근거를 서로 다른 문단에 나눠 조건 없이 통과시키는 우회 |
| V16 | 유효한 근거 ID를 붙였지만 문단이 그 사실을 하나도 쓰지 않음 |
| V17 | 실재하는 글자를 틀린 기둥(년/월/일/시)에 배치 |
| V18 | 표면 십성과 지장간 십성 개수 층위 혼동 |
| V19 | 원국과 대운·세운의 십성 혼동 |
| V20 | 시주 미상인데 시주 해석 |
| V21 | `unavailable` 로 검사 회피(사유 없음·근거 있는 섹션 비움·절반 이상 비움) |

### 검증기 자기시험 (매 실행)

`lib/engines/stub.mjs` 의 `probeDocs()` 가 정상 문서의 한 섹션만 바꿔 끼워 오류를 주입한다
(없는 간지 · 없는 십성 · 없는 합충 · 근거 없음 · 입력 범위 밖 근거 · 단정 · 민감 · 금지 판정어 ·
KB 누락 · 상충 한쪽만 · **상충 문단 분리** · **무관 근거** · **기둥 오배치** · **층위 혼동** ·
**원국/대운 혼동** · **시주 미상 해석** · **섹션 비움 회피** · 정상).
런 중에 검증기가 이것을 잡지 못하면 하네스가 실패한다(exit 1). 결과는 리포트 표에 남는다.

## 블라인드 평가 자료 3종

`out/<runId>/blind/` 에 생성된다. 자세한 내용은 `docs/ai-experiment-review-pack.md` §9.

| 파일 | 공개 | 내용 |
|---|---|---|
| `blind-customer.md` / `.json` | 고객 평가자 | 해석 전문만. 실험군·비용·자동 점수·근거 ID·모델명·명식 숨김 |
| `blind-myeongri.md` / `.json` | 명리 검토자 | 명식·해석 전문 + 근거 사실 값 + 규칙/KB 출처 |
| `tech-eval.md` / `.json` | 기술 평가자 | 실험군·요청/응답 모델·토큰·비용·지연·재시도·실패·검증 + 요청 건수 모수 성공률·실패율 + 실패 응답 기록 |
| `blind-key.json` | **비밀** | 표시 id ↔ 실험군 대응표(사례별 순서)·모델·프롬프트 해시·설정 |
| `prompts.md` | **비밀** | 시스템/사용자 프롬프트 전문 |
| `critique.md` | **비밀** | E 의 비평 기록 |

표시 순서는 **사례마다 무작위**(결정적 시드)이고, 대응표는 키에만 있다.
같은 사례 안에서 `QA01-3` 이 무엇인지는 `blind-key.json` 을 열어야 안다.

## 산출물 구조

```text
out/<runId>/
  report.md        리포트(지표·A 콘텐츠 출처·비교쌍·probe·자기시험·한계)
  score.json       기계용 점수·검증 경계
  cost.json        호출별 비용·토큰 + 단가 미등록 표시 + 실행 전 예상 비용
  docs.json        A~E 문서(스킵 포함)
  preflight.json   예산 초과로 중단된 경우에만
  calls/           호출별 프롬프트 전문·재시도 이력·토큰·비용·검증
    index.json
    QA01-D-a1.json
  blind/           3종 패키지 + 비밀 키·프롬프트·비평
```

## 파일

```text
run.mjs                     오케스트레이터(A~E, 자기시험, 블라인드 3종, 비교쌍)
lib/schema.mjs              8섹션 그릇(reading/2.0) · 스키마 검사
lib/facts.mjs               실험군 입력 경계 · 근거 풀 · 상충 의무
lib/pairs.mjs               전체 실험 필수 비교쌍 3종
lib/prompts.mjs             B/C/D/E 시스템·사용자 프롬프트
lib/knowledge-base.mjs      명리 지식베이스 35항목(문헌/현대/제품)
lib/validate.mjs            V1~V21 (구조·참조 / 내용)
lib/metrics.mjs             EA·CA·HZ·GA·SC·CR·GN·KB
lib/judge.mjs               루브릭 근사
lib/gates.mjs               통과 기준
lib/cost.mjs                단가·토큰·비용·최대 예상 비용
lib/retry.mjs               피드백 재시도 · 호출 전 예산 가드
lib/report.mjs              report.md · score.json
lib/blind-export.mjs        블라인드 3종 · 사례별 순서 섞기
lib/engines/rule.mjs        A 규칙 기반(앱 카탈로그) · 콘텐츠 출처 표시
lib/engines/stub.mjs        B~E 오프라인 응답 + 검증기 probe
lib/engines/ai.mjs          Anthropic Messages API 호출(실호출 전용)
tools/extract-qa-analysis.mjs   QA01~12 analysisData 추출 · 비교쌍 기록
tools/gen-kb-doc.mjs        지식베이스 문서 생성
fixtures/charts.json        확장 픽스처(QA01~12 + T01~04 + C1~C8, O1 포함)
```

## 한계

- `stub` 은 문장 품질을 재지 않는다. 배선·검증기·채점·비용 경로만 검증한다.
- **자기시험(검증기 probe + 하네스)과 회귀 122건 통과는 배선·안전장치 검증일 뿐, 사주 해석 품질의 증거가 아니다.**
  품질은 실호출 응답을 블라인드 3종으로 평가해야 판단된다.
- `judge` 는 결정적 근사다. 모델·사람 채점과의 상관은 실호출 라운드에서 확인해야 한다.
- V4(간지 환각)는 한자 쌍만 본다. 한글 표기 오류는 별도 규칙이 필요하다.
- E 의 "초안에 없는 사실 추가" 검사가 없다.
- V16·V19 는 보수적 휴리스틱이다. V16 은 근거 개수와 무관하게 검사한다(예전의 근거 4개 이상 예외는 제거).
- 토큰·비용은 stub 에서 추정치다(글자 수/2.2). 실호출에서 `usage` 로 대체된다.
- O1 은 QA01~12 에서 발동하지 않는다 — `--fixtures fixtures/charts.json` 의 C1 로 확인.
