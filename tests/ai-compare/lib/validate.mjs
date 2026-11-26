/* ==========================================================================
   lib/validate.mjs — 해석 검증기 (V1~V15)
   --------------------------------------------------------------------------
   결정적으로 판정할 수 있는 것만 '반려'로 만든다. 사람 취향이 갈리는 것(수위·톤의
   미묘함)은 경고로 두고 judge 가 본다.

   실험군마다 '인용할 수 있는 근거'가 다르므로(pool), 검증기는 arm 을 받아
     · 근거 누락        (문단마다 근거 1개 이상)
     · 근거 범위 밖     (pool 에 없는 ID)
     · 간지 환각        (명식·대운·세운에 없는 干支)
     · 십성 환각        (그 명식에 없는 십성, 틀린 개수)
     · 합충 환각        (성립하지 않은 천간합·육합·삼합·반합·천간충·육충)
     · 금지 판정어      (신강·신약·용신·격국 확정·점수)
     · 단정 표현
     · 민감 주제 단정
     · 지식베이스 근거  (D/E 는 섹션마다 KB 인용 1개 이상)
     · 상충 조건 설명   (양쪽을 인용했는데 '언제'가 없으면 반려)
   를 검사한다. 실패하면 feedback(사람이 읽는 고칠 점)을 돌려주고, 실행기는 그
   feedback 을 붙여 같은 입력을 다시 부른다(lib/retry.mjs).
   ========================================================================== */
import { SECTIONS, DOC_VERSION, LEGACY_DOC_VERSION, flattenSections, groundingOfParagraph } from './schema.mjs';
import { conflictObligations } from './facts.mjs';

const STEMS = '甲乙丙丁戊己庚辛壬癸';
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';

const TEN_GODS = ['비견', '겁재', '식신', '상관', '편재', '정재', '편관', '정관', '편인', '정인'];
const NUM_KO = { '한': 1, '두': 2, '세': 3, '네': 4, '다섯': 5 };

/* 격국 확정·강약 점수·용신 — 근거 없이 쓰면 반려 */
const BANNED_VERDICTS = ['신강', '신약', '용신', '희신', '희기신', '양인격', '건록격', '월겁격',
  '정관격', '편관격', '식신격', '상관격', '재격', '인성격', '조후', '억부', '%', '점수'];

const CERTAINTY = ['반드시', '틀림없이', '100%', '확실히', '절대로'];
const SENSITIVE_SINGLE = ['죽', '암', '수술', '주식', '코인', '원금', '소송', '투자'];
const STRONG_ADVERB = ['최고', '최악', '위험', '엄청', '절대', '완벽'];
const REL_WORDS = ['천간합', '천간충', '육합', '육충', '삼합', '반합'];
const REL_KIND = {
  천간합: ['천간합'], 육합: ['육합'], 삼합: ['삼합'], 반합: ['반합'],
  천간충: ['천간충'], 육충: ['육충'], 합: ['천간합', '육합', '삼합', '반합'], 충: ['천간충', '육충']
};

function paragraphsOf(doc) {
  const out = [];
  (doc.sections || []).forEach((s) => {
    (s.paragraphs || []).forEach((p, i) => out.push({ section: s.id, index: i, text: String(p.text || ''), raw: p, refs: groundingOfParagraph(p) }));
  });
  return out;
}

function numbersIn(text) {
  return (String(text).match(/[0-9][0-9,.]*/g) || []).map((s) => s.replace(/[.,]$/, ''));
}

/* 명식·대운·세운에 실재하는 干支 쌍 */
export function allowedGanzhi(ctx) {
  const pairs = new Set();
  ['year', 'month', 'day', 'hour'].forEach((k) => {
    const p = ctx.chart.pillars[k];
    if (p) pairs.add(p.hanja);
  });
  if (ctx.period && ctx.period.seun) pairs.add(ctx.period.seun.hanja);
  if (ctx.period && ctx.period.daewoon) pairs.add(ctx.period.daewoon.hanja);
  return pairs;
}

/* 그 명식에 실제로 있는 십성 집합(표면 ∪ 지장간 전체) */
export function tenGodSet(ctx) {
  const s = new Set();
  const tv = ctx.analysis.tenGodFacts;
  Object.keys(tv.bySurface || {}).forEach((g) => { if (tv.bySurface[g] > 0) s.add(g); });
  Object.keys(tv.byHiddenAll || {}).forEach((g) => { if (tv.byHiddenAll[g] > 0) s.add(g); });
  /* 대운·세운의 십성도 그 명식에서 '쓰이는' 십성이다(명식 밖 글자이지만 fact) */
  const p = ctx.period;
  if (p && p.seun) { s.add(p.seun.stemTen); s.add(p.seun.branchTen); }
  if (p && p.daewoon) { s.add(p.daewoon.stemTen); s.add(p.daewoon.branchTen); }
  return s;
}

export function validate(doc, ctx, opts) {
  const o = opts || {};
  const pool = o.pool || null;
  const arm = o.arm || null;
  const policy = o.policy || ctx.policy || {};
  const violations = [];
  const warnings = [];
  const paras = paragraphsOf(doc);
  const text = paras.map((p) => p.text).join('\n');
  const v = (rule, where, detail, fix) => violations.push({ rule, where, detail, fix: fix || null });
  const w = (rule, where, detail) => warnings.push({ rule, where, detail });

  /* ---------------- V1 구조 ---------------- */
  if (!doc || typeof doc !== 'object') {
    v('V1', 'doc', '문서 없음');
    return { violations, warnings, stats: null, feedback: ['문서가 JSON 객체가 아니다.'] };
  }
  if (doc.docVersion !== DOC_VERSION && doc.docVersion !== LEGACY_DOC_VERSION) v('V1', 'doc', 'docVersion ' + doc.docVersion);
  const known = new Set(SECTIONS.map((s) => s.id));
  const seen = new Set();
  (doc.sections || []).forEach((s) => {
    if (!s || !s.id) { v('V1', 'doc', '섹션 id 누락'); return; }
    if (!known.has(s.id)) v('V1', s.id, '알 수 없는 섹션 id');
    if (seen.has(s.id)) v('V1', s.id, '중복 섹션');
    seen.add(s.id);
    if (s.status !== 'ok' && s.status !== 'unavailable') v('V1', s.id, 'status ' + s.status);
    if (s.status === 'unavailable' && !s.reason) v('V1', s.id, 'unavailable 인데 이유 없음');
    if (s.status === 'ok' && !(s.paragraphs || []).length) v('V1', s.id, 'ok 인데 문단 없음');
  });
  SECTIONS.forEach((s) => { if (!seen.has(s.id)) v('V1', s.id, '섹션 빠짐 ' + s.title); });
  paras.forEach((p) => {
    if (p.text.length < 20) v('V1', p.section + '#' + p.index, '문단 텍스트 부족(' + p.text.length + '자)');
  });

  /* ---------------- V2·V3 근거 추적 ---------------- */
  const refExists = (ref) => {
    if (pool) return pool.has(ref);
    return ctx.ids ? ctx.ids.has(ref) : true;
  };
  paras.forEach((p) => {
    const all = p.refs.all;
    if (!all.length) {
      v('V2', p.section + '#' + p.index, '근거 ID 없음', '문단마다 evidenceRefs 를 1개 이상 붙인다.');
      return;
    }
    all.forEach((ref) => {
      if (!refExists(ref)) {
        v('V3', p.section + '#' + p.index, '입력 범위 밖 근거: ' + ref, '입력에 있는 근거 ID만 인용한다.');
      }
    });
  });

  /* ---------------- V4 간지 환각 ---------------- */
  const pairs = allowedGanzhi(ctx);
  const pairRe = new RegExp('([' + STEMS + '])([' + BRANCHES + '])', 'g');
  let m;
  while ((m = pairRe.exec(text))) {
    if (!pairs.has(m[1] + m[2])) v('V4', 'doc', '명식·대운·세운에 없는 간지: ' + m[0], '입력에 있는 간지만 쓴다.');
  }

  /* ---------------- V5 십성 환각 ---------------- */
  const gods = tenGodSet(ctx);
  const tv = ctx.analysis.tenGodFacts;
  TEN_GODS.forEach((g) => {
    if (text.indexOf(g) >= 0 && !gods.has(g)) {
      v('V5', 'doc', '이 명식에 없는 십성: ' + g, '입력에 있는 십성만 말한다.');
    }
  });
  const countRe = new RegExp('(' + TEN_GODS.join('|') + ')\\s*(?:이|가|은|는)?\\s*([0-9]+|한|두|세|네|다섯)\\s*(?:개|명|번)', 'g');
  let cm;
  while ((cm = countRe.exec(text))) {
    const god = cm[1];
    const n = /^[0-9]+$/.test(cm[2]) ? Number(cm[2]) : NUM_KO[cm[2]];
    const surface = (tv.bySurface || {})[god] || 0;
    const hidden = (tv.byHiddenAll || {})[god] || 0;
    if (n !== surface && n !== hidden) {
      v('V5', 'doc', god + ' ' + n + '개 — 실제 표면 ' + surface + ' · 지장간 전체 ' + hidden, '개수는 인용한 집계와 일치해야 한다.');
    }
  }

  /* ---------------- V6 합충 환각 ---------------- */
  const rels = (ctx.analysis.hapchong || []);
  const hasRel = (kinds, chars) => rels.some((r) => {
    if (kinds.indexOf(r.kind) < 0) return false;
    if (!chars) return true;
    const a = r.chars.slice().sort().join('');
    const b = chars.slice().sort().join('');
    return a === b;
  });
  REL_WORDS.forEach((word) => {
    if (text.indexOf(word) < 0) return;
    if (!hasRel(REL_KIND[word])) v('V6', 'doc', '성립하지 않은 ' + word, 'analysisData.hapchong 에 있는 관계만 말한다.');
  });
  const relPairRe = new RegExp('([' + STEMS + BRANCHES + '])([' + STEMS + BRANCHES + '])\\s*(천간합|천간충|육합|육충|삼합|반합|충|합)', 'g');
  let rm;
  while ((rm = relPairRe.exec(text))) {
    const chars = [rm[1], rm[2]];
    const word = rm[3];
    if (!hasRel(REL_KIND[word], chars)) {
      v('V6', 'doc', '성립하지 않은 관계: ' + chars.join('') + ' ' + word, '그 두 글자의 관계가 hapchong 에 있는지 확인한다.');
    }
  }

  /* ---------------- V7 금지 판정어 ---------------- */
  const findingText = JSON.stringify((ctx.findings || []).map((f) => ({ id: f.id, claim: f.claim, display: f.display })));
  BANNED_VERDICTS.forEach((term) => {
    if (text.indexOf(term) < 0) return;
    if (arm === 'A' && findingText.indexOf(term) >= 0) return;
    v('V7', 'doc', '근거 없는 판정어: ' + term, '신강·신약·용신·격국 확정·점수를 쓰지 않는다.');
  });

  /* ---------------- V8 단정 표현 ---------------- */
  CERTAINTY.forEach((term) => {
    if (text.indexOf(term) >= 0) v('V8', 'doc', '단정 표현: ' + term, '경향과 조건으로 말한다.');
  });

  /* ---------------- V9 민감 주제 ---------------- */
  const sensitiveClaim = new RegExp('(' + SENSITIVE_SINGLE.join('|') + ')[^.!?]{0,14}(반드시|하지\\s*마|하세요|사세요|사지\\s*마|금지|절대|확실|틀림없)');
  const mSens = text.match(sensitiveClaim);
  if (mSens) v('V9', 'doc', '민감 주제 단정: ' + mSens[0], '의료·법률·투자·생사를 판정하지 않는다.');
  if (/죽(을|는다|었다|음)/.test(text)) v('V9', 'doc', '죽음 단정');

  /* ---------------- V10 호칭·말투 ---------------- */
  if (text.indexOf('당신') >= 0) v('V10', 'doc', "'당신' 사용", '호칭은 {name} 님 하나만 쓴다.');
  const name = policy.name || '민지';
  if (text.indexOf(name) < 0) w('V10', 'doc', '호칭 없음: ' + name);
  const nyang = (text.match(/냥(?=[\s.!?]|$)/g) || []).length;
  if (nyang > 2) w('V10', 'doc', "'~냥' " + nyang + '회');
  paras.forEach((p) => {
    const t = p.text.trim();
    if (/냐\.$|야\.$/.test(t)) w('V10', p.section + '#' + p.index, '반말 종결');
    else if (t.endsWith('다.') && !t.endsWith('니다.')) w('V10', p.section + '#' + p.index, '반말 종결(~다.)');
  });

  /* ---------------- V11 개인정보 ---------------- */
  if (/\d{4}년/.test(text)) v('V11', 'doc', '연도 표기', '연도를 쓰지 않는다.');
  if (/\d{1,2}월\s*\d{1,2}일/.test(text)) v('V11', 'doc', '생일 표기');
  if (/01\d-?\d{3,4}-?\d{4}/.test(text)) v('V11', 'doc', '전화번호');

  /* ---------------- V12 길이 (경고) ---------------- */
  paras.forEach((p) => {
    const min = p.section === '01' ? 40 : 80;
    if (p.text.length < min) w('V12', p.section + '#' + p.index, '문단이 짧음 ' + p.text.length);
    if (p.text.length > 340) w('V12', p.section + '#' + p.index, '문단이 김 ' + p.text.length);
  });

  /* ---------------- V13 지식베이스 근거 (D/E) ---------------- */
  const kbAllowed = pool ? Array.from(pool.values()).filter((x) => x.kind === 'kb').map((x) => x.ref.replace(/^kb\./, '')) : [];
  const kbIdOf = (r) => String(r || '').replace(/^kb\./, '');
  if (arm === 'D' || arm === 'E') {
    (doc.sections || []).forEach((s) => {
      if (s.status === 'unavailable') return;
      const kbRefs = (s.paragraphs || []).flatMap((p) => (p.kbRefs || []));
      if (!kbRefs.length) v('V13', s.id, '지식베이스 근거 없음', '섹션마다 kbRefs 에 KB-… 를 1개 이상 붙인다.');
      kbRefs.forEach((r) => { if (kbAllowed.length && kbAllowed.indexOf(kbIdOf(r)) < 0) v('V13', s.id, '없는 지식베이스 항목: ' + r); });
    });
  }

  /* ---------------- V14 개인화 (경고) ---------------- */
  paras.forEach((p) => {
    const personal = p.refs.ev.concat(p.refs.cit).filter((r) => /^(analysis\.|period\.|chart\.)/.test(r));
    if (!personal.length) w('V14', p.section + '#' + p.index, '개인 사실 인용 없음(일반론 위험)');
  });

  /* ---------------- V15 상충 조건 설명 ---------------- */
  const obligations = conflictObligations(ctx, pool);
  const cited = new Set(paras.flatMap((p) => p.refs.all));
  obligations.filter((ob) => ob.reachable).forEach((ob) => {
    const allCited = ob.requires.every((r) => cited.has(r));
    if (!allCited) {
      v('V15', ob.id, '상충 축을 한쪽만 인용: ' + ob.topic, '양쪽 근거(' + ob.requires.join(', ') + ')를 함께 인용한다.');
      return;
    }
    const citedParas = paras.filter((p) => p.refs.all.some((r) => ob.requires.indexOf(r) >= 0));
    const marked = citedParas.some((p) => ob.markers.some((k) => p.text.indexOf(k) >= 0));
    if (!marked) v('V15', ob.id, '상충의 발현 조건 설명 없음: ' + ob.topic, '어느 조건에서 어느 쪽이 드러나는지 말한다.');
  });

  const byRule = violations.reduce((acc, x) => { acc[x.rule] = (acc[x.rule] || 0) + 1; return acc; }, {});
  const sections = flattenSections(doc);
  const stats = {
    paragraphs: paras.length,
    refs: paras.reduce((s, p) => s + p.refs.all.length, 0),
    validRefs: paras.reduce((s, p) => s + p.refs.all.filter(refExists).length, 0),
    paragraphsWithRef: paras.filter((p) => p.refs.all.length && p.refs.all.every(refExists)).length,
    kbRefs: paras.reduce((s, p) => s + (p.raw.kbRefs || []).length, 0),
    sectionsOk: sections.filter((s) => s.status === 'ok').length,
    sectionsUnavailable: sections.filter((s) => s.status === 'unavailable').length,
    obligations: obligations.length,
    obligationsReachable: obligations.filter((ob) => ob.reachable).length,
    byRule
  };

  const feedback = violations.slice(0, 24).map((x) => '- [' + x.rule + '] ' + x.where + ': ' + x.detail + (x.fix ? ' → ' + x.fix : ''));
  return { violations, warnings, stats, feedback, obligations };
}

export const RULES = { BANNED_VERDICTS, CERTAINTY, SENSITIVE_SINGLE, TEN_GODS };
