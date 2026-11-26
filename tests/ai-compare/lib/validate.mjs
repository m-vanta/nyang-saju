/* ==========================================================================
   lib/validate.mjs — G1~G12 검증기 (모든 엔진 공용)
   --------------------------------------------------------------------------
   결정적으로 판정할 수 있는 것만 '반려'로 만든다. 사람 취향이 갈리는 것(수위·톤의
   미묘함)은 경고로 두고 judge 가 본다.
   ========================================================================== */

const STEMS = '甲乙丙丁戊己庚辛壬癸';
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';

const BANNED_CLAIMS = ['신강', '신약', '용신', '희신', '희기신', '양인격', '건록격', '월겁격',
  '정관격', '편관격', '식신격', '상관격', '재격', '인성격', '조후', '억부', '%', '점수'];

const CERTAINTY = ['반드시', '틀림없이', '100%', '확실히', '절대로'];
const SENSITIVE = ['죽', '암', '수술', '주식', '코인', '원금', '소송', '투자'];
const STRONG_ADVERB = ['최고', '최악', '위험', '엄청', '절대', '완벽'];

function paragraphsOf(doc) {
  const out = [];
  (doc.sections || []).forEach((s) => {
    (s.paragraphs || []).forEach((p, i) => out.push({ section: s.id, index: i, text: String(p.text || ''), refs: p.findingRefs || [], raw: p }));
  });
  return out;
}

function allText(doc) {
  return paragraphsOf(doc).map((p) => p.text).join('\n');
}

function findingText(ctx) {
  return JSON.stringify(ctx.findings.map((f) => ({ id: f.id, claim: f.claim, display: f.display })));
}

function numbersIn(text) {
  return (String(text).match(/[0-9][0-9,.]*/g) || []).map((s) => s.replace(/[.,]$/, ''));
}

export function validate(doc, ctx, policy) {
  const violations = [];
  const warnings = [];
  const paras = paragraphsOf(doc);
  const text = allText(doc);
  const ftext = findingText(ctx);
  const v = (rule, where, detail) => violations.push({ rule, where, detail });
  const w = (rule, where, detail) => warnings.push({ rule, where, detail });

  /* G1 — 명식 재계산 금지: 출력의 干支 쌍이 명식에 없으면 위반 */
  const pairs = new Set();
  ['year', 'month', 'day', 'hour'].forEach((k) => {
    const p = ctx.chart.pillars[k];
    if (p) pairs.add(p.hanja);
  });
  /* 세운·대운은 명식 밖 글자다. 근거(Finding evidence)에 있는 간지는 허용한다. */
  (ctx.findings || []).forEach((f) => (f.evidence || []).forEach((e) => {
    if (e.char && e.char.length === 2) pairs.add(e.char);
    if (e.pillar === 'year' && e.slot === 'seun' && e.char && e.char.length === 2) pairs.add(e.char);
  }));
  if (ctx.period && ctx.period.seun) pairs.add(ctx.period.seun.hanja);
  if (ctx.period && ctx.period.daewoon) pairs.add(ctx.period.daewoon.hanja);
  const re = new RegExp('([' + STEMS + '])([' + BRANCHES + '])', 'g');
  let m;
  while ((m = re.exec(text))) {
    if (!pairs.has(m[1] + m[2])) v('G1', 'doc', '명식에 없는 간지: ' + m[0]);
  }

  /* G2 — 없는 판정 창작 금지 */
  BANNED_CLAIMS.forEach((term) => {
    if (text.indexOf(term) >= 0 && ftext.indexOf(term) < 0) v('G2', 'doc', '근거 없는 판정어: ' + term);
  });

  /* G3 — 근거 ID 필수 · 실재 id 만 */
  paras.forEach((p) => {
    if (!p.refs.length) v('G3', p.section + '#' + p.index, 'findingRefs 없음');
    p.refs.forEach((id) => { if (!ctx.ids.has(id)) v('G3', p.section + '#' + p.index, '없는 id: ' + id); });
  });

  /* G4 — 수위 유지(경고) */
  paras.forEach((p) => {
    const neutral = p.refs.map((id) => ctx.findings.filter((f) => f.id === id)[0]).filter((f) => f && f.polarity === 'neutral');
    if (neutral.length && STRONG_ADVERB.some((x) => p.text.indexOf(x) >= 0)) {
      w('G4', p.section + '#' + p.index, 'neutral 판정에 강한 어휘');
    }
  });

  /* G6 — 숫자를 만들어 쓰지 않는다.
     반려 대상은 '해석의 숫자'(확률·퍼센트·점수·개월)다. 화폐 예시 같은 생활 숫자는
     근거에 없으면 경고만 남긴다. */
  const allowed = new Set(numbersIn(JSON.stringify(ctx.analysis)).concat(numbersIn(ftext)).concat((policy && policy.allowedNumbers) || []));
  const claimNum = /(\d+(?:\.\d+)?)\s*(%|퍼센트|확률|점수|점|개월)/g;
  let cm;
  while ((cm = claimNum.exec(text))) {
    if (!allowed.has(cm[1])) v('G6', 'doc', '근거에 없는 해석 숫자: ' + cm[0]);
  }
  if (text.indexOf('%') >= 0 && text.indexOf('%') >= 0 && !/[0-9]\s*%/.test(text)) v('G6', 'doc', '퍼센트 표기');
  numbersIn(text).forEach((n) => { if (!allowed.has(n)) w('G6', 'doc', '근거에 없는 숫자(경고): ' + n); });

  /* G7 — 미래 단정 금지 */
  CERTAINTY.forEach((term) => { if (text.indexOf(term) >= 0) v('G7', 'doc', '단정 표현: ' + term); });

  /* G8 — 민감 주제 '단정'만. 언급 자체는 막지 않는다(예: 코인은 안 맞는다는 조언). */
  const sensitiveClaim = new RegExp('(' + SENSITIVE.join('|') + ')[^.!?]{0,14}(반드시|하지\s*마|하세요|사세요|사지\s*마|금지|절대|확실|틀림없)');
  const mSens = text.match(sensitiveClaim);
  if (mSens) v('G8', 'doc', '민감 주제 단정: ' + mSens[0]);
  if (/죽(을|는다|었다|음)/.test(text)) v('G8', 'doc', '죽음 단정');

  /* G9 — 호칭·말투(경고) */
  if (text.indexOf('당신') >= 0) v('G9', 'doc', "'당신' 사용");
  const name = (policy && policy.name) || '민지';
  if (text.indexOf(name) < 0) w('G9', 'doc', '호칭 없음: ' + name);
  const nyang = (text.match(/냥(?=[\s.!?]|$)/g) || []).length;
  if (nyang > 2) w('G9', 'doc', "'~냥' " + nyang + '회');
  paras.forEach((p) => {
    const t = p.text.trim();
    if (/냐\.$|야\.$/.test(t)) w('G9', p.section + '#' + p.index, '반말 종결');
    else if (t.endsWith('다.') && !t.endsWith('니다.')) w('G9', p.section + '#' + p.index, '반말 종결(~다.)');
  });

  /* G10 — 개인정보 */
  if (/\d{4}년/.test(text)) v('G10', 'doc', '연도 표기');
  if (/\d{1,2}월\s*\d{1,2}일/.test(text)) v('G10', 'doc', '생일 표기');
  if (/01\d-?\d{3,4}-?\d{4}/.test(text)) v('G10', 'doc', '전화번호');

  /* G11 — 형식 */
  if (!doc || doc.docVersion !== 'reading/1.0') v('G11', 'doc', 'docVersion 불일치');
  if (!Array.isArray(doc.sections) || !doc.sections.length) v('G11', 'doc', 'sections 없음');
  (doc.sections || []).forEach((s) => {
    if (!s.id || !s.title) v('G11', 'doc', '섹션 id/title 누락');
    if (!Array.isArray(s.paragraphs) || !s.paragraphs.length) v('G11', s.id || '?', '문단 없음');
  });
  if (!doc.meta || !Array.isArray(doc.meta.skippedFindings)) w('G11', 'doc', 'meta.skippedFindings 없음');

  /* G12 — 길이(경고) */
  paras.forEach((p) => {
    if (p.text.length < 120 || p.text.length > 320) w('G12', p.section + '#' + p.index, '문단 길이 ' + p.text.length);
  });

  return {
    violations, warnings,
    stats: {
      paragraphs: paras.length,
      refs: paras.reduce((s, p) => s + p.refs.length, 0),
      validRefs: paras.reduce((s, p) => s + p.refs.filter((id) => ctx.ids.has(id)).length, 0),
      paragraphsWithRef: paras.filter((p) => p.refs.length && p.refs.every((id) => ctx.ids.has(id))).length,
      byRule: violations.reduce((o, x) => { o[x.rule] = (o[x.rule] || 0) + 1; return o; }, {})
    }
  };
}

export const RULES = { BANNED_CLAIMS, CERTAINTY, SENSITIVE };
