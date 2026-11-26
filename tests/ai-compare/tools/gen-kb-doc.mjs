#!/usr/bin/env node
/* ==========================================================================
   tests/ai-compare/tools/gen-kb-doc.mjs
   --------------------------------------------------------------------------
   lib/knowledge-base.mjs 를 사람이 읽는 문서로 만든다.
   항목을 손으로 옮겨 적지 않는다 — 문서와 코드가 어긋나는 순간 run.mjs 자기시험이
   '문서에 없는 id'로 잡는다.

   실행: node tests/ai-compare/tools/gen-kb-doc.mjs
   ========================================================================== */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ENTRIES, CATEGORIES, KB_LABELS, KB_VERSION, kbStats, validateKB } from '../lib/knowledge-base.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/myeongri-knowledge-base.md');
const stats = kbStats();
const problems = validateKB();

const L = [];
L.push('---');
L.push('title: "냥도사 · 명리학 지식베이스 (실험군 D/E 입력)"');
L.push('kind: reference');
L.push('version: ' + KB_VERSION);
L.push('date: ' + new Date().toISOString().slice(0, 10));
L.push('source: tests/ai-compare/lib/knowledge-base.mjs');
L.push('---');
L.push('');
L.push('# 명리학 지식베이스');
L.push('');
L.push('> 이 문서는 `tests/ai-compare/lib/knowledge-base.mjs` 에서 **자동 생성**된다. 손으로 고치지 않는다.');
L.push('> 고칠 것은 모듈이고, 문서는 `node tests/ai-compare/tools/gen-kb-doc.mjs` 로 다시 만든다.');
L.push('');
L.push('## 0. 무엇을 하는 문서인가');
L.push('');
L.push('AI 종합 해석 실험에는 다섯 실험군이 있다.');
L.push('');
L.push('| 실험군 | 받는 것 | 이 지식베이스 |');
L.push('|---|---|---|');
L.push('| A 규칙 기반 | 명식·analysisData·Finding | 쓰지 않음(앱 문장 카탈로그) |');
L.push('| B 명식만 | 간지·오행 개수·표면 십성 | **없음** |');
L.push('| C +analysisData | 위 + 득령·통근·격 후보·합충·대운·세운 | **없음** |');
L.push('| D +지식베이스 | 위 + 이 문서의 항목 | **있음** |');
L.push('| E +비평 | D 와 같음 + D 초안 비평·재작성 | **있음** |');
L.push('');
L.push('즉 이 문서는 **"C 와 D 의 차이"** 를 만드는 입력이다. C 는 명리 개념을 모델의 기억에서 꺼내 쓰고,');
L.push('D·E 는 여기 적힌 문장만 근거로 쓴다. 그래서 이 문서의 품질이 곧 D·E 의 상한이다.');
L.push('');
L.push('## 1. 표기 3단계');
L.push('');
L.push('| 표기 | 뜻 | 이 문서에서의 예 | 검사 방법 |');
L.push('|---|---|---|---|');
L.push('| **[' + KB_LABELS.LIT + ']** | 원문에 그 문장이 있거나 원문 표에서 직접 읽힌다 | 『자평진전』論雜氣如何取用 「一透則一用，兼透則兼用」 | `source.quote` 필수 |');
L.push('| **[' + KB_LABELS.MODERN + ']** | 고전에 그 문장이 없다. 오늘의 언어로 옮긴 해석 관행 | "합은 묶임, 충은 전환으로 읽는다" | `source` 금지 |');
L.push('| **[' + KB_LABELS.PRODUCT + ']** | 냥도사가 정한 계산·표기 규칙. 문헌 근거가 아니다 | 지장간 가중치 100/70·30/60·30·10 | `source` 금지 |');
L.push('');
L.push('이 구분이 무너지면 AI 는 "우리가 정한 규칙"을 "옛 책이 그랬다"고 말하게 된다. 그게 이 실험이 막으려는 첫 번째 실패다.');
L.push('');
L.push('## 2. 분포');
L.push('');
L.push('| 표기 | 항목 수 |');
L.push('|---|---|');
Object.keys(stats.byStatus).forEach((k) => L.push('| ' + k + ' | ' + stats.byStatus[k] + ' |'));
L.push('| **합계** | **' + stats.total + '** |');
L.push('');
L.push('| 분류 | 항목 수 |');
L.push('|---|---|');
CATEGORIES.forEach((c) => L.push('| ' + c.ko + ' | ' + (stats.byCat[c.key] || 0) + ' |'));
L.push('');
L.push('## 3. 항목');
L.push('');

CATEGORIES.forEach((cat) => {
  const list = ENTRIES.filter((e) => e.cat === cat.key);
  if (!list.length) return;
  L.push('### ' + cat.ko);
  L.push('');
  list.forEach((e) => {
    L.push('#### `' + e.id + '` — ' + e.title);
    L.push('');
    L.push('- **표기**: ' + e.status);
    L.push('- **내용**: ' + e.statement);
    if (e.source) {
      L.push('- **근거**: 『' + e.source.book + '』 ' + e.source.chapter);
      L.push('  > ' + e.source.quote);
      if (e.source.url) L.push('  > 출처: ' + e.source.url);
    }
    L.push('- **쓰는 법**: ' + e.use);
    L.push('- **금지**: ' + e.guard);
    L.push('- **연결 사실**: ' + e.appliesTo.map((x) => '`' + x + '`').join(' · '));
    L.push('');
  });
});

L.push('## 4. 이 지식베이스가 하지 않는 것');
L.push('');
L.push('| 하지 않는 것 | 이유 | 대신 하는 것 |');
L.push('|---|---|---|');
L.push('| 신강·신약 점수화 | 문헌·규칙 근거 없는 가중치를 정설처럼 쓰지 않는다(사용자 지시 2026-11-25) | 축별 판독을 그대로 말한다(analysisData.deukryeong 4판독) |');
L.push('| 격국 단정("○○격이다") | 문헌은 후보를 함께 보라고만 정한다 | 본기·투출·회국·祿·刃 후보 병기 + agreement |');
L.push('| 용신·희신 임의 판정 | 조건·판본 이견이 커서 확정 불가 | "해석이 갈리는 자리"로 표시 |');
L.push('| 合化 성립 판정 | 문헌마다 조건이 다르다 | `decided:false`, `transform.possible`까지만 |');
L.push('| 지장간 일수(월률분야) 반영 | 편찬자 자신이 일수 방식을 부정(『삼명통회』論人元司事) | `earlyQiCandidates` 참고값, 판정 미사용 |');
L.push('| 대운·세운과 명식 글자의 합·충 생성 | 엔진이 계산하지 않는다 | `period` 사실만 인용, 조건부 문장 |');
L.push('');
L.push('### 미확인으로 남긴 것');
L.push('');
L.push('| 항목 | 상태 | 필요한 것 |');
L.push('|---|---|---|');
L.push('| 古法 羊刃 배속(乙辰·丁未·辛戌·癸丑)의 원출처 | 미확인 | 『오행정기』·『낙록자』 원문 대조 |');
L.push('| 『연해자평』又節氣歌 판본별 일수 차이 | 이견 | 판본 대조(조선 간본·사고전서본) |');
L.push('| 陰刃에 대한 한국 유파 입장 | 미확인 | 국내 교재 2~3종 |');
L.push('| 12운성 중 강약 집합(태·양 포함 여부) | 이견 | 교재 대조 후 `inTableStrongSet` 표기 |');
L.push('| 合化 성립 조건 | 이견 | 별도 검증 과제 |');
L.push('');
L.push('이 항목들은 지식베이스 항목으로 넣지 않았다. 미확인 것을 항목으로 넣으면 AI 가 그것을 근거로 문장을 만들기 때문이다.');
L.push('');
L.push('## 5. 프롬프트에 들어가는 형태');
L.push('');
L.push('D·E 프롬프트에는 다음 형태로 압축돼 들어간다(`kbPromptBlock()`).');
L.push('');
L.push('```text');
L.push('## 투출·격국');
L.push('[' + ENTRIES.filter((e) => e.cat === 'geokguk')[0].id + '] (' + ENTRIES.filter((e) => e.cat === 'geokguk')[0].status + ') ' + ENTRIES.filter((e) => e.cat === 'geokguk')[0].title);
L.push('  - 내용: …');
L.push('  - 근거: 『…』 … 「…」');
L.push('  - 쓰는 법: …');
L.push('  - 금지: …');
L.push('```');
L.push('');
L.push('그리고 문단마다 `kbRefs` 에 `KB-…` id 를 1개 이상 인용해야 한다(검증기 V13).');
L.push('섹션마다 KB 근거가 없으면 반려되고, 실행기는 그 피드백을 붙여 다시 부른다.');
L.push('');
L.push('## 6. 자기검사');
L.push('');
L.push('- 필수 필드·중복 id·알 수 없는 표기·분류 검사');
L.push('- [' + KB_LABELS.LIT + '] 인데 원문 인용이 없으면 실패');
L.push('- [' + KB_LABELS.MODERN + ']·[' + KB_LABELS.PRODUCT + '] 에 문헌 출처가 붙으면 실패');
L.push("- '쓰는 법'에 판정어(신강·신약·용신 등)가 들어가면 실패");
L.push('- 세 표기가 모두 최소 1개씩 있는지 확인');
L.push('');
L.push('현재: ' + (problems.length ? '**실패** — ' + problems.join(' / ') : '**통과** (' + stats.total + '개)'));
L.push('');
L.push('## 7. 참고 문헌');
L.push('');
const books = {};
ENTRIES.forEach((e) => { if (e.source) books['『' + e.source.book + '』 ' + e.source.chapter] = e.source.url; });
Object.keys(books).forEach((k) => L.push('- ' + k + ' — ' + (books[k] || '')));
L.push('- 전문 검증: [`myeongri-literature-verification.md`](./myeongri-literature-verification.md) — 원문 인용과 이견 정리의 출처');
L.push('');
L.push('## 8. 갱신');
L.push('');
L.push('```bash');
L.push('node tests/ai-compare/tools/gen-kb-doc.mjs   # 이 문서 재생성');
L.push('node tests/ai-compare/run.mjs --mode stub   # 문서·코드 동기화 자기시험');
L.push('```');

writeFileSync(OUT, L.join('\n'), 'utf8');
console.log('→ docs/myeongri-knowledge-base.md (' + stats.total + '개 · ' + KB_VERSION + ')');
console.log('자기검사: ' + (problems.length ? '실패 ' + problems.join(' / ') : '통과'));
