/* ==========================================================================
   lib/prompts.mjs — 실험군 B/C/D/E 프롬프트 설계
   --------------------------------------------------------------------------
   실험의 축은 '무엇을 주는가' 하나뿐이다. 모델·temperature·출력 형식은 고정한다.

     B  명식 기본표 + 대운·세운   (계산된 해석·지식베이스 없음. 모델의 명리 지식은 허용)
     C  + analysisData           (사실은 다 주지만 명리 지식은 주지 않음)
     D  + 지식베이스             (문헌 확인 / 현대적 해석 / 제품 규약을 구분해 줌)
     E  D 의 초안 + 비평기       (명리 오류·논리 비약·상충 누락·바넘·개인화 부족을 지적하고 재작성)

   8개 섹션은 다섯 실험군이 공유하는 그릇이다(lib/schema.mjs).
   ========================================================================== */
import { SECTIONS, DOC_VERSION } from './schema.mjs';
import { kbPromptBlock } from './knowledge-base.mjs';

export const PROMPT_VERSION = 'p/1.1';

/* ---------------- 8개 섹션 과제 ---------------- */
export const SECTION_TASKS = [
  {
    id: '01', key: 'cheongi', title: '천기팩폭',
    goal: '한 번에 찌르는 한두 문장. 이 사람의 명식에서 가장 강하게 반복되는 사실 하나를 골라 냉정하게 말한다.',
    rules: ['문단 1개', '가장 강한 사실 1~2개만', '냥도사 말투(~냥)는 이 섹션에서만 1회 허용', '위로·일반론 금지']
  },
  {
    id: '02', key: 'trait', title: '대표 성향',
    goal: '일간·십성·오행 분포로 이 사람이 기본값처럼 쓰는 방식을 2~3문단으로 설명한다.',
    rules: ['문단 2~3개', '십성 이름 + 실제 행동 장면을 붙인다', '표면 집계와 지장간 집계를 섞지 않는다']
  },
  {
    id: '03', key: 'conflict', title: '내면의 상충하는 성향',
    goal: '명식 안에 실제로 양립하는 두 판독이 있을 때만 쓴다. 어느 쪽이 언제 드러나는지(조건)를 말한다.',
    rules: ['상충 축이 없으면 status:"unavailable" + reason', '양쪽 근거를 모두 인용', '한쪽만 골라 단정 금지']
  },
  {
    id: '04', key: 'pattern', title: '반복되는 행동 패턴',
    goal: '같은 축(십성·일지·대운)이 인생에서 되풀이되는 방식을 2~3문단으로 쓴다. 단순 나열이 아니라 "왜 반복되는가"를 잇는다.',
    rules: ['문단 2~3개', '문단마다 서로 다른 축', '같은 문장 구조의 반복 금지']
  },
  {
    id: '05', key: 'love', title: '연애운',
    goal: '관계에서 쓰는 방식과 끌리는 상대의 결을 사실에서 읽어 1~2문단으로 쓴다.',
    rules: ['문단 1~2개', '상대를 실명으로 부르지 않는다', '결혼·시기 단정 금지']
  },
  {
    id: '06', key: 'money', title: '재물운',
    goal: '재성·식상·비겁의 배치로 돈이 들어오고 나가는 방식을 1~2문단으로 쓴다.',
    rules: ['문단 1~2개', '금액·수익률·확률을 만들지 않는다', '투자 종목을 권하지 않는다']
  },
  {
    id: '07', key: 'work', title: '직업운',
    goal: '관성·인성·식상의 배치로 일하는 방식과 맞는 환경을 1~2문단으로 쓴다.',
    rules: ['문단 1~2개', '특정 회사·직업을 단정하지 않는다', '이직·퇴사 시기를 확정하지 않는다']
  },
  {
    id: '08', key: 'period', title: '대운 및 올해 운세',
    goal: '지금 대운과 올해 세운을 "지나는 구간"으로 설명한다. 10년·1년의 방식이 어떻게 다른지 말한다.',
    rules: ['문단 1~2개', 'period 사실만 인용', '대운·세운과 명식의 합·충을 새로 만들지 않는다', 'period 가 없으면 status:"unavailable"']
  }
];

/* ---------------- E 비평 축 ---------------- */
export const CRITIQUE_DIMENSIONS = [
  { key: 'myeongri', label: '명리 오류', check: '없는 간지·십성·합충을 말했는가, 지장간/표면을 섞었는가, 후보를 확정했는가' },
  { key: 'logic', label: '논리 비약', check: '근거 A에서 결론 B로 건너뛰었는가, 조건 없이 인과를 말했는가' },
  { key: 'conflict', label: '상충 해석 누락', check: '명식 안의 양립 판독을 한쪽만 말했는가, 조건 설명이 빠졌는가' },
  { key: 'barnum', label: '바넘 효과', check: '다른 명식에도 그대로 맞는 문장인가, 근거 없는 위로인가' },
  { key: 'personal', label: '개인화 부족', check: '그 사람의 간지·십성·관계를 하나도 인용하지 않은 문단인가' },
  { key: 'level', label: '수위·톤', check: '단정·공포 조장·민감 주제 판정이 있는가, 호칭과 말투가 규칙에 맞는가' }
];

/* ---------------- 공통 문체·정책 ---------------- */
export function policyBlock(policy) {
  const p = policy || {};
  return [
    '- 호칭: ' + (p.name || '민지') + ' 님. 2인칭은 전부 이 호칭. "당신" 금지.',
    '- 말투: 예의 바른 해요체(~예요/~해요). 문장 끝을 "~다"로 끊는 반말체 금지.',
    '- 냥도사 말투(~냥)는 §01 천기팩폭에서만, 문서 전체 2회 이하.',
    '- 이름·생년월일·전화번호·지역을 출력에 쓰지 않는다.',
    '- 의료·법률·투자·생사(수술·암·죽음·주식·코인·소송)를 판정하지 않는다.',
    '- 확률·점수·퍼센트·개월 수를 만들지 않는다. 사실에 있는 숫자만 인용한다.',
    '- 미래를 확정하지 않는다("반드시", "100%", "틀림없이", "확실히", "절대로" 금지).'
  ].join('\n');
}

/* ---------------- 시스템 프롬프트 ---------------- */
const CORE = [
  "너는 '냥도사'의 종합 해석 엔진이다. 명리 계산은 코드가 이미 끝냈다.",
  '너의 일은 계산된 사실을 사람의 언어로 엮는 것이고, 계산을 다시 하는 것이 아니다.',
  '',
  '[엔진 원칙]',
  '1. 사실 계산은 코드가 한다. 입력에 없는 간지·십성·지장간·합충을 만들지 않는다.',
  '2. 여러 요소의 상호작용을 종합해 해석한다. 요소를 하나씩 나열하고 끝내지 않는다.',
  '3. 두 요소가 다른 방향을 가리키면 양쪽을 말하고, 어느 조건에서 어느 쪽이 드러나는지 설명한다.',
  '4. 모든 문단은 근거를 단다. evidenceRefs 에 입력으로 받은 근거 ID를 1개 이상 쓴다.',
  '5. 근거가 부족하면 단정하지 않는다. 섹션을 비우고(status:"unavailable") 이유를 적는다.',
  '6. 신강·신약·용신·격국 확정을 하지 않는다. 근거 없는 점수·가중치를 만들지 않는다.',
  '7. 문단마다 그 사람의 사실을 최소 하나 붙인다. 누구에게나 맞는 문장(바넘)은 쓰지 않는다.',
  '8. 같은 근거를 여러 섹션에서 반복하지 않는다.',
  '9. 명리 용어를 쓰면 바로 뒤에 생활 언어를 붙인다.',
  '10. JSON 만 출력한다. 머리말·설명·코드펜스를 붙이지 않는다.'
];

const ARM_INPUT_NOTE = {
  B: '너에게는 기본 명식(간지·오행 개수·표면 십성·12운성·지장간 표)과 대운·세운이 주어진다. analysisData(코드가 계산한 상세 사실)와 지식베이스는 없다. 네가 아는 명리 지식을 활용해 종합 해석해도 된다 — 다만 계산된 사실과 네 해석을 구분해 말하고, 입력에 없는 간지·합충·십성 개수를 만들지 않는다. 대운·세운의 간지와 십성은 입력에 있으니 §08 에 쓸 수 있다.',
  C: '너에게는 analysisData(코드가 계산한 사실)와 대운·세운이 주어진다. 명리 지식베이스와 규칙 엔진의 판정은 주어지지 않는다. 사실 사이의 관계는 네가 종합하되, 입력에 없는 규칙을 새로 만들지 않는다.',
  D: '너에게는 analysisData 와 대운·세운, 그리고 지식베이스가 주어진다. 지식베이스 항목은 [문헌 확인]·[현대적 해석]·[제품 규약]으로 표기돼 있다. 표기를 구분해 인용하고, 문헌 확인이 아닌 것을 원문 근거처럼 말하지 않는다.',
  E: '너는 비평자 겸 재작성자다. 먼저 초안을 비평 축으로 검사하고, 지적한 것을 모두 고친 최종본을 쓴다. 초안에 없는 사실을 더하지 않고, 초안의 근거 ID 범위 안에서만 고친다.'
};

export function systemPrompt(arm, opts) {
  const o = opts || {};
  const lines = CORE.slice();
  lines.push('');
  lines.push('[이번 실행의 입력 경계]');
  lines.push(ARM_INPUT_NOTE[arm] || ARM_INPUT_NOTE.C);
  lines.push('');
  lines.push('[8개 섹션 — 순서와 제목을 바꾸지 않는다]');
  SECTION_TASKS.forEach((s) => {
    lines.push('§' + s.id + ' ' + s.title + ' — ' + s.goal);
    lines.push('   · ' + s.rules.join(' / '));
  });
  lines.push('');
  lines.push('[문체·정책]');
  lines.push(policyBlock(o.policy));
  lines.push('');
  lines.push('[출력 JSON]');
  lines.push('{');
  lines.push('  "docVersion": "' + DOC_VERSION + '",');
  lines.push('  "sections": [ { "id": "01", "status": "ok"|"unavailable", "reason": null|"…", "paragraphs": [ { "text": "…", "evidenceRefs": ["…"], "analysisRefs": ["…"], "kbRefs": ["KB-…"] } ] } ]');
  lines.push('}');
  lines.push('- status 가 "ok" 인 섹션은 문단이 1개 이상이어야 한다.');
  lines.push('- status 가 "unavailable" 이면 reason 을 반드시 적는다.');
  if (arm === 'E') {
    lines.push('  "critique": [ { "dimension": "myeongri|logic|conflict|barnum|personal|level", "where": "§01", "issue": "…", "fix": "…" } ]');
  }
  if (arm === 'D' || arm === 'E') {
    lines.push('- kbRefs 에는 지식베이스 ID(KB-…)를 쓴다. 각 섹션마다 최소 1개.');
  }
  return lines.join('\n');
}

/* ---------------- 사용자 프롬프트 ---------------- */
function evidenceList(pool) {
  const out = [];
  pool.forEach((v) => out.push({ ref: v.ref, value: v.value }));
  return out;
}

function chartBasicsForPrompt(ctx) {
  const c = ctx.chart;
  const pillars = {};
  ['year', 'month', 'day', 'hour'].forEach((k) => {
    const p = c.pillars[k];
    if (!p) return;
    pillars[k] = {
      ganzhi: p.hanja, stem: p.hanja.slice(0, 1), branch: p.hanja.slice(1),
      stemKo: p.stemKo, branchKo: p.branchKo,
      stemElem: p.stemElem, branchElem: p.branchElem,
      stemTenGod: k === 'day' ? '일간' : p.ten.stem, branchTenGod: p.ten.branch,
      stage: p.stage,
      hidden: p.hidden.map((h) => ({ stem: h.hanja, elem: h.elem, tenGod: h.ten, weight: h.weight }))
    };
  });
  return {
    hourKnown: !c.flags.hourUnknown,
    dayMaster: { stem: ctx.analysis.dayMaster.stem, elem: ctx.analysis.dayMaster.elem, yinYang: ctx.analysis.dayMaster.yinYang },
    pillars,
    monthCommand: ctx.analysis.monthCommand,
    elementCounts: c.counts,
    elementShare: c.share,
    tenGodSurface: c.tenCount
  };
}

/**
 * @param {string} arm
 * @param {object} ctx buildContext 결과
 * @param {object} opts { pool, kb, draftDoc }
 */
export function userPrompt(arm, ctx, opts) {
  const o = opts || {};
  const pool = o.pool || new Map();
  const payload = {
    arm,
    promptVersion: PROMPT_VERSION,
    policy: { name: (ctx.policy && ctx.policy.name) || '민지' },
    sections: SECTION_TASKS.map((s) => ({ id: s.id, title: s.title, goal: s.goal, rules: s.rules })),
    chartBasics: chartBasicsForPrompt(ctx),
    evidenceRefs: evidenceList(pool)
  };
  if (arm !== 'B') {
    payload.analysisData = ctx.analysis;
  }
  /* 대운·세운은 B 도 받는다 — 코드가 계산한 기본 사실이다(리뷰 P0-1-1). */
  payload.period = {
    asOf: ctx.period && ctx.period.asOf,
    seun: ctx.period && ctx.period.seun,
    daewoon: ctx.period && ctx.period.daewoon,
    daewoonStart: ctx.period && ctx.period.daewoonStart,
    beforeFirstDaewoon: ctx.period && ctx.period.beforeFirstDaewoon
  };
  if (arm === 'D' || arm === 'E') {
    payload.knowledgeBase = kbPromptBlock({});
  }
  if (arm === 'E') {
    payload.draft = o.draftDoc || null;
    payload.critiqueChecklist = CRITIQUE_DIMENSIONS;
    payload.instructions = '초안의 각 섹션을 비평 축으로 검사해 critique 배열을 채우고, 지적을 모두 반영한 최종본을 sections 에 쓴다. 초안에서 인용한 근거 ID만 쓴다.';
  }
  return JSON.stringify(payload, null, 1);
}

export function buildPrompt(arm, ctx, opts) {
  const o = opts || {};
  const policy = (ctx && ctx.policy) || o.policy || {};
  const system = systemPrompt(arm, { policy });
  const user = userPrompt(arm, ctx, o);
  return { arm, promptVersion: PROMPT_VERSION, system, user };
}

/* 프롬프트 해시 — 블라인드 패키지에서 프롬프트를 ID로만 가리킨다 */
export function promptHash(text) {
  let h = 2166136261;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return ('0000000' + h.toString(16)).slice(-8);
}

export function promptMeta(arm, ctx, opts) {
  const p = buildPrompt(arm, ctx, opts);
  return {
    arm,
    promptVersion: PROMPT_VERSION,
    hash: promptHash(p.system + '\n---\n' + p.user),
    systemHash: promptHash(p.system),
    system: p.system,
    user: p.user
  };
}

export { SECTIONS };
