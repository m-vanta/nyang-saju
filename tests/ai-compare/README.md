# AI 종합 해석 실험 — 규칙 기반 vs AI 다섯 실험군 (A~E)

만세력·`analysisData`·Finding 은 100% 코드가 만든다. 이 폴더는 **AI 가 그 사실을 얼마나
정확하게, 얼마나 개인화해서, 얼마의 비용으로 해석하는가**를 같은 자로 재는 하네스다.
설계 배경은 `docs/orbit-finding-and-ai-hybrid-design.md` §6~7, 검토용 요약은
`docs/ai-experiment-review-pack.md` 에 있다.

## 다섯 실험군

| 실험군 | 받는 입력 | 이 실험군으로 보는 것 |
|---|---|---|
| **A** rule | 명식 + analysisData + Finding | 현행 앱(규칙 문장)의 기준선 |
| **B** chart | 명식 기본표만 | AI 가 명리 지식만으로 어디까지 가는가 |
| **C** analysis | + analysisData·대운·세운 | 사실을 다 줘도 지식베이스가 없으면 어떤가 |
| **D** knowledge | + 지식베이스 35항목 | 검증된 명리 문장을 주면 달라지는가 |
| **E** critic | D + D 초안 비평·재작성 | 자기 검토 한 번이 품질을 올리는가 |

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
node tests/ai-compare/run.mjs --mode pilot --max-calls 30 --max-cost-usd 5
node tests/ai-compare/run.mjs --mode full

# 실호출 배선을 스텁으로 예행
node tests/ai-compare/run.mjs --mode full --stub

# 일부 실험군만
node tests/ai-compare/run.mjs --mode stub --arms A,C,D
```

| 옵션 | 뜻 |
|---|---|
| `--mode stub` | 결정적 오프라인 응답. 네트워크·키 없음 |
| `--mode pilot` | 파일럿 3건 실호출 |
| `--mode full` | QA01~12 실호출 |
| `--set pilot\|all` | 픽스처 부분집합 |
| `--fixtures <path>` | 다른 픽스처 파일(`profiles` 또는 `charts` 배열) |
| `--arms A,B,C,D,E` | 일부 실험군 |
| `--max-calls N` | 모델 호출 총 횟수 상한(재시도 포함) |
| `--max-retries N` | 검증 실패 재시도 횟수(기본 1) |
| `--max-cost-usd X` | 누적 비용 상한. 넘으면 남은 픽스처를 건너뛴다 |
| `--model <id>` | 기본 `claude-opus-5-5` |
| `--out <dir>` | 산출물 경로(기본 `out/<runId>`) |
| `--stub` | pilot/full 배선을 스텁으로 |

종료 코드: 하네스·검증기 자기시험이 실패하면 1. 실험군 gate 결과는 리포트에 적는다
(B 의 gate 실패는 설계상 예상 — 리포트에 그렇게 표시).

## 무엇을 재는가

| 지표 | 정의 | 계산 | gate |
|---|---|---|---|
| EA-1 인용 유효율 | 유효 근거 / 전체 근거 | 결정적 | 100% |
| EA-2 문단 근거율 | 근거 ≥1 문단 / 전체 문단 | 결정적 | 100% |
| CA 상충 설명률 | 상충 의무를 양쪽 인용 + 조건까지 설명 | 결정적 | ≥90% |
| HZ 환각 | 없는 간지·십성·합충 (V4·V5·V6) | 결정적 | 0 |
| GA 금지 판정 | 신강·신약·용신·격국 확정·단정·민감 (V7·V8·V9) | 결정적 | 0 |
| SC 스키마 | 8섹션 그릇 위반 | 결정적 | 0 |
| CR 모순률 | 사실과 반대되는 주장 문단 | 결정적 | ≤2% |
| GN 일반론률 | 개인 사실(analysis·period·finding) 미인용 문단 | 결정적 | 참고 |
| KB/문단 | 지식베이스 인용 밀도(D·E) | 결정적 | 참고 |
| judge | 루브릭 5점 근사 | 결정적 근사 | ≥4.5 |
| 비용·지연 | 입력/출력 토큰, USD/KRW, p50/p95, 재시도 | 계측 | 상한 내 |

`judge` 는 `--mode stub` 에서 **결정적 근사**다(모델 채점이 아니다). 같은 루브릭(§7.6)을
근거·개인화·상충·위반으로 근사하고 리포트에 그 사실을 명시한다.

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

의무 = "그 축을 말하려면 양쪽을 인용하고, 언제 어느 쪽이 드러나는지(조건)를 말해야 한다".
실험군이 그 근거를 볼 수 없으면 `reachable:false` 로 남기고 CA 분모에서 뺀다(못 본 것을 못 봤다고 적는다).

## 검증기 자기시험

`lib/engines/stub.mjs` 의 `probeDocs()` 는 **일부러 어긋난 문서**를 만든다
(없는 간지 · 없는 십성 · 없는 합충 · 근거 없음 · 입력 범위 밖 근거 · 단정 · 민감 · 금지 판정어 · KB 누락 · 정상).
런 중에 검증기가 이것을 잡지 못하면 하네스가 실패한다. '검증기가 실제로 문다'는 증거다.

## 블라인드 평가 패키지

`out/<runId>/blind/` 에 생성된다.

| 파일 | 공개 | 내용 |
|---|---|---|
| `blind-package.md` / `.json` | 평가자에게 준다 | 원본 입력·사주명식·analysisData·Model-1~5 의 8섹션 전문·참조 근거·토큰·비용·지연·재시도 |
| `blind-key.json` | **비밀** | Model-N ↔ 실험군·모델·프롬프트 해시·설정·경계 |
| `prompts.md` | **비밀** | 시스템/사용자 프롬프트 전문 |
| `critique.md` | **비밀** | E 의 비평 기록(있으면 E 임이 드러나므로 패키지 밖) |

같은 실험군은 픽스처가 달라도 같은 라벨을 쓴다(라벨은 seed 기반으로 섞는다).
이름은 `{name}` 로 마스킹한다. 토큰·비용이 프롬프트 길이를 암시할 수 있어 **완전 블라인드는 아니다** — README 의 한계 절 참조.

## 파일

```text
run.mjs                     오케스트레이터(A~E, 자기시험, 블라인드)
lib/schema.mjs              8섹션 그릇(reading/2.0) · 스키마 검사
lib/facts.mjs               실험군 입력 경계 · 근거 풀 · 상충 의무
lib/prompts.mjs             B/C/D/E 시스템·사용자 프롬프트
lib/knowledge-base.mjs      명리 지식베이스 35항목(문헌/현대/제품)
lib/validate.mjs            V1~V15
lib/metrics.mjs             EA·CA·HZ·GA·SC·CR·GN·KB
lib/judge.mjs               루브릭 근사
lib/gates.mjs               통과 기준(+ 설계상 예상 실패)
lib/cost.mjs                단가·토큰·비용·지연
lib/retry.mjs               피드백 재시도 · 예산 가드
lib/report.mjs              report.md · score.json
lib/blind-export.mjs        블라인드 패키지
lib/engines/rule.mjs        A 규칙 기반(앱 카탈로그)
lib/engines/stub.mjs        B~E 오프라인 응답 + probe
lib/engines/ai.mjs          Anthropic Messages API 호출(실호출 전용)
tools/extract-qa-analysis.mjs   QA01~12 analysisData 추출
tools/gen-kb-doc.mjs        지식베이스 문서 생성
fixtures/charts.json        확장 픽스처(QA01~12 + T01~04 + C1~C8, O1 포함)
out/<runId>/                report.md · score.json · cost.json · docs.json · blind/
```

## 한계

- `stub` 은 문장 품질을 재지 않는다. 배선·검증기·채점·비용 경로만 검증한다.
- `judge` 는 결정적 근사다. 모델·사람 채점과의 상관은 실호출 라운드에서 확인해야 한다.
- V4(간지 환각)는 한자 쌍만 본다. 한글 표기 오류는 별도 규칙이 필요하다.
- E 의 "초안에 없는 사실 추가" 검사가 없다.
- 토큰·비용은 stub 에서 추정치다(글자 수/2.2). 실호출에서 `usage` 로 대체된다.
- O1 은 QA01~12 에서 발동하지 않는다 — `--fixtures fixtures/charts.json` 의 C1 로 확인.
