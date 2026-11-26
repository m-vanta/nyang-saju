/* ==========================================================================
   lib/validate.mjs — 해석 검증기 (V1~V21)
   --------------------------------------------------------------------------
   두 가지를 **분리해서** 낸다(리뷰 P0-2-1).

     [구조·참조 검증]  V1 스키마 · V2 근거 존재 · V3 근거 범위 · V13 KB 참조
        → "이 문단이 실재하는 근거 ID를 달았는가"만 본다. 계산으로 100% 판정 가능.

     [내용 검증(자동)] V4 간지 · V5 십성 · V6 합충 · V7 금지 판정어 · V8 단정 ·
        V9 민감 · V10 호칭 · V11 개인정보 · V15 상충 조건 · V16 근거-내용 불일치 ·
        V17 기둥 배치 · V18 십성 층위 · V19 원국·대운 혼동 · V20 시주 미상 해석 ·
        V21 섹션 비움 회피
        → 결정적으로 잡히는 정합성만 본다. **해석의 명리학적 타당성을 보증하지 않는다.**
          (문장이 근거와 이어지는지, 사실을 뒤집지 않는지는 보지만, 그 해석이 좋은
           해석인지는 사람·모델 평가의 몫이다. 리포트와 docs 에 이 한계를 적는다.)

   검증기는 arm 과 pool 을 받아 '그 실험군이 볼 수 있었던 근거'만 유효로 센다.
   실패하면 feedback(사람이 읽는 고칠 점)을 돌려주고, 실행기는 그 feedback 을 붙여
   같은 입력을 다시 부른다(lib/retry.mjs).
   ========================================================================== */
import { SECTIONS, DOC_VERSION, LEGACY_DOC_VERSION, flattenSections, groundingOfParagraph } from './schema.mjs';
import { conflictObligations, GROUP_KO, PILLAR_KO, ELEM_KO } from './facts.mjs';

const STEMS = '甲乙丙丁戊己庚辛壬癸';
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';

const TEN_GODS = ['비견', '겁재', '식신', '상관', '편재', '정재', '편관', '정관', '편인', '정인'];
const NUM_KO = { '한': 1, '두': 2, '세': 3, '네': 4, '다섯': 5 };

/* 격국 확정·강약 점수·용신 — 근거 없이 쓰면 반려 */
const BANNED_VERDICTS = ['신강', '신약', '용신', '희신', '희기신', '양인격', '건록격', '월겁격',
  '정관격', '편관격', '식신격', '상관격', '재격', '인성격', '조후', '억부', '%', '점수'];

const CERTAINTY = ['반드시', '틀림없이', '100%', '확실히', '절대로'];
const SENSITIVE_SINGLE = ['죽', '암', '수술', '주식', '코인', '원금', '소송', '투자'];
const REL_WORDS = ['천간합', '천간충', '육합', '육충', '삼합', '반합'];
const REL_KIND = {
  천간합: ['천간합'], 육합: ['육합'], 삼합: ['삼합'], 반합: ['반합'],
  천간충: ['천간충'], 육충: ['육충'], 합: ['천간합', '육합', '삼합', '반합'], 충: ['천간충', '육충']
};

/* 십성별 속성 낱말 — '근거-내용 불일치'를 잡는 데만 쓴다(보수적으로) */
const TEN_GOD_ATTR = {
  비견: ['자립', '주관', '독립', '동료', '자기'],
  겁재: ['경쟁', '승부', '지출', '욕심', '빼앗'],
  식신: ['표현', '여유', '요리', '낭만', '소박', '창작'],
  상관: ['비판', '재치', '반항', '말재주', '털어놓'],
  편재: ['거래', '유동', '확장', '사업', '큰돈'],
  정재: ['저축', '근면', '관리', '안정', '꾸준', '살림'],
  편관: ['압박', '결단', '추진', '강제', '투쟁', '위기'],
  정관: ['규칙', '질서', '책임', '약속', '조직', '기준', '공인'],
  편인: ['직관', '탐구', '기발', '특수', '비정형', '몰입'],
  정인: ['학습', '수용', '보호', '문서', '배움']
};

const ELEM_TOKENS = { 목: ['목', '나무'], 화: ['화', '불'], 토: ['토', '흙'], 금: ['금', '쇠'], 수: ['수', '물'] };
const GROUP_SEG = { peer: '비겁', output: '식상', wealth: '재성', power: '관성', resource: '인성' };
const PILLAR_SEG = { year: '년', month: '월', day: '일', hour: '시' };
const TEN_GOD_GROUP = {
  비견: 'peer', 겁재: 'peer', 식신: 'output', 상관: 'output', 편재: 'wealth', 정재: 'wealth',
  편관: 'power', 정관: 'power', 편인: 'resource', 정인: 'resource'
};
const GROUP_ATTR = Object.keys(GROUP_SEG).reduce((o, g) => {
  o[g] = [].concat.apply([], TEN_GODS.filter((t) => TEN_GOD_GROUP[t] === g).map((t) => TEN_GOD_ATTR[t]));
  return o;
}, {});
/* analysisData 경로 낱말 — 문단이 그 영역을 말하는지 보는 데만 쓴다 */
const PATH_WORDS = {
  deukryeong: '월령', deukji: '일지', roots: ['통근', '뿌리'], geokguk: '격', hapchong: ['합충', '합', '충'],
  lacking: '없', hiddenOnly: '지장간', hourUnknown: '시주',
  elementFacts: '오행', tenGodFacts: '십성', deukse: '십성', monthCommand: '월지', dayMaster: '일간', saenggeuk: '생극'
};

/* 구조·참조 검증과 내용 검증의 경계 */
export const STRUCTURAL_RULES = ['V1', 'V2', 'V3', 'V13'];
export const CONTENT_RULES = ['V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11', 'V12', 'V14', 'V15',
  'V16', 'V17', 'V18', 'V19', 'V20', 'V21'];
const STRUCTURAL_SET = new Set(STRUCTURAL_RULES);

function paragraphsOf(doc) {
  const out = [];
  (doc.sections || []).forEach((s) => {
    (s.paragraphs || []).forEach((p, i) => out.push({ section: s.id, index: i, text: String(p.text || ''), raw: p, refs: groundingOfParagraph(p) }));
  });
  return out;
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

/* 원국(명식) 안의 십성 집합 — 표면 ∪ 지장간 */
export function wonkukTenGodSet(ctx) {
  const s = new Set();
  const tv = ctx.analysis.tenGodFacts;
  Object.keys(tv.bySurface || {}).forEach((g) => { if (tv.bySurface[g] > 0) s.add(g); });
  Object.keys(tv.byHiddenAll || {}).forEach((g) => { if (tv.byHiddenAll[g] > 0) s.add(g); });
  return s;
}

/* 대운·세운의 십성 집합 */
export function periodTenGodSet(ctx) {
  const s = new Set();
  const p = ctx.period;
  if (p && p.seun) { s.add(p.seun.stemTen); s.add(p.seun.branchTen); }
  if (p && p.daewoon) { s.add(p.daewoon.stemTen); s.add(p.daewoon.branchTen); }
  return s;
}

/* 그 명식에 실제로 있는 십성 집합(원국 ∪ 대운·세운) */
export function tenGodSet(ctx) {
  const s = wonkukTenGodSet(ctx);
  periodTenGodSet(ctx).forEach((g) => s.add(g));
  return s;
}

/* ---------------- 근거-내용 불일치용 토큰 ---------------- */
function refTokens(ref, value) {
  const out = new Set();
  String(ref).split(/[.[\]]+/).filter(Boolean).forEach((seg) => {
    if (TEN_GODS.indexOf(seg) >= 0) {
      out.add(seg);
      (TEN_GOD_ATTR[seg] || []).forEach((k) => out.add(k));
      const g = TEN_GOD_GROUP[seg];
      if (g && GROUP_SEG[g]) out.add(GROUP_SEG[g]);
    }
    if (GROUP_SEG[seg]) {
      out.add(GROUP_SEG[seg]);
      (GROUP_ATTR[seg] || []).forEach((k) => out.add(k));
    }
    if (PILLAR_SEG[seg]) out.add(PILLAR_SEG[seg] + '주');
    if (ELEM_TOKENS[seg]) ELEM_TOKENS[seg].forEach((k) => out.add(k));
    if (PATH_WORDS[seg]) [].concat(PATH_WORDS[seg]).forEach((w) => out.add(w));
  });
  if (typeof value === 'string') {
    value.split(/[\s,.·/()%[\]{}:;'"“”‘’]+/).filter(Boolean).forEach((w) => out.add(w));
  } else if (typeof value === 'number') {
    out.add(String(value));
  }
  return out;
}

const GENERIC_TOKENS = new Set(['개', '주', '년', '월', '일', '시', '점', '때']);

function tokenSeen(text, tok) {
  if (!tok || GENERIC_TOKENS.has(tok)) return false;
  if (/^[0-9]+$/.test(tok)) return new RegExp('(^|[^0-9])' + tok + '([^0-9]|$)').test(text);
  if (new RegExp('^[' + STEMS + BRANCHES + ']$').test(tok)) return text.indexOf(tok) >= 0;
  if (tok.length >= 2) return text.indexOf(tok) >= 0;
  return new RegExp(tok + '(?=[\\s,.)]|은|는|이|가|을|를|의|과|와|도|만|로|기운|자리)').test(text);
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
    return finish({ violations, warnings, paras, ctx, pool });
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

  /* ---------------- V2·V3 근거 추적 (구조·참조) ---------------- */
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

  /* ---------------- V13 지식베이스 근거 (D/E, 구조·참조) ---------------- */
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
    const personal = p.refs.all.filter((r) => /^(analysis\.|period\.|finding\.|chart\.)/.test(r) || (ctx.ids && ctx.ids.has(r)));
    if (!personal.length) w('V14', p.section + '#' + p.index, '개인 사실 인용 없음(일반론 위험)');
  });

  /* ---------------- V15 상충 조건 설명 (강화) ---------------- */
  const obligations = conflictObligations(ctx, pool);
  repairs: {
    obligations.filter((ob) => ob.reachable).forEach((ob) => {
      /* 양쪽 근거는 한 문단 안에서 함께 인용되어야 한다.
         서로 다른 문단에 나눠 두면 '어느 조건에서 어느 쪽이 드러나는가'를 말할 수 없다. */
      const both = paras.filter((p) => ob.requires.every((r) => p.refs.all.indexOf(r) >= 0));
      if (!both.length) {
        v('V15', ob.id, '상충 축의 양쪽 근거를 한 문단에서 함께 인용하지 않았다: ' + ob.topic,
          '양쪽 근거(' + ob.requires.join(', ') + ')를 같은 문단에 인용하고 조건을 말한다.');
        return;
      }
      const marked = both.some((p) => ob.markers.some((k) => p.text.indexOf(k) >= 0));
      if (!marked) {
        v('V15', ob.id, '상충의 발현 조건 설명 없음: ' + ob.topic, '어느 조건에서 어느 쪽이 드러나는지 말한다.');
      }
    });
  }

  /* ---------------- V16 근거-내용 불일치 ----------------
     근거 ID가 실재하고 범위 안이어도, 문단이 그 근거가 말하는 값을 하나도 쓰지 않으면
     '무관한 근거를 붙인 문단'이다. 보수적으로: 인용한 근거들의 값·경로 낱말 중
     하나라도 문단에 보이면 통과시킨다(오탐을 줄이기 위해). */
  if (pool) {
    paras.forEach((p) => {
      if (!p.refs.all.length) return;
      /* A(규칙 엔진)의 findingRefs 는 '문장 선택 조건'이다. 카탈로그 문장이 판정 id 를
         그대로 읽어 주지 않으므로 V16 대상에서 뺀다 — 규칙 기반과 AI 를 같은 자로 재기 위해. */
      const validRefs = p.refs.all.filter((r) => pool.has(r) && /^(analysis\.|chart\.|period\.)/.test(r));
      if (!validRefs.length) return;
      /* 근거를 4개 이상 붙인 문단은 하나라도 이어질 가능성이 높아 보수적으로 통과시킨다 */
      if (validRefs.length >= 4) return;
      const tokens = new Set();
      validRefs.forEach((r) => {
        const entry = pool.get(r);
        refTokens(r, entry ? entry.value : null).forEach((t) => tokens.add(t));
      });
      const hit = Array.from(tokens).some((tok) => tokenSeen(p.text, tok));
      if (!hit) {
        v('V16', p.section + '#' + p.index, '근거 ID는 유효하지만 문단 내용이 그 근거와 이어지지 않는다: ' + validRefs.slice(0, 3).join(', '),
          '인용한 근거가 말하는 사실을 문단에서 실제로 쓴다. 무관한 근거를 붙이지 않는다.');
      }
    });
  }

  /* ---------------- V17 기둥 배치 오류 ----------------
     "월지 午" 처럼 실재하는 글자를 틀린 기둥에 놓은 경우.
     라벨 바로 뒤(조사 하나까지)의 글자만 본다 — "일간으로 戊" 같은 정상 서술을 잡지 않기 위해. */
  const POS_LABEL = { '년': 'year', '월': 'month', '일': 'day', '시': 'hour' };
  const CHAR_CLASS = '[' + STEMS + BRANCHES + ']';
  const posRe = new RegExp('(년|월|일|시)(주|지|간)\\s*(?:은|는|이|가|의|에)?\\s*(' + CHAR_CLASS + ')', 'g');
  const revRe = new RegExp('(' + CHAR_CLASS + ')\\s*(?:은|는|이|가|의)?\\s*(년|월|일|시)(주|지|간)', 'g');
  const allowedFor = (pos, slot) => {
    const pillar = ctx.chart.pillars[pos];
    const allowed = new Set();
    if (!pillar) return allowed;
    if (slot !== '지') allowed.add(pillar.hanja.slice(0, 1));
    if (slot !== '간') allowed.add(pillar.hanja.slice(1));
    return allowed;
  };
  const existsSomewhere = (ch) => ['year', 'month', 'day', 'hour'].some((k) => {
    const x = ctx.chart.pillars[k];
    return x && (x.hanja.slice(0, 1) === ch || x.hanja.slice(1) === ch);
  });
  paras.forEach((p) => {
    const t = p.text;
    let pm;
    posRe.lastIndex = 0;
    while ((pm = posRe.exec(t))) {
      const pos = POS_LABEL[pm[1]];
      const slot = pm[2];
      const ch = pm[3];
      const pillar = ctx.chart.pillars[pos];
      if (!pillar) continue;
      if (allowedFor(pos, slot).has(ch)) continue;
      /* "일지 戊午" 처럼 기둥 전체(간지)를 가리키는 표기는 정상이다 */
      if (t.slice(pm.index, pm.index + pm[0].length + 2).indexOf(pillar.hanja) >= 0) continue;
      if (!existsSomewhere(ch)) continue;
      v('V17', p.section + '#' + p.index, pm[1] + pm[2] + '에 ' + ch + ' 를 놓았지만 그 기둥의 글자가 아니다', '글자는 실제로 있는 기둥에만 배치한다.');
    }
    revRe.lastIndex = 0;
    while ((pm = revRe.exec(t))) {
      const ch = pm[1];
      const pos = POS_LABEL[pm[2]];
      const slot = pm[3];
      const pillar = ctx.chart.pillars[pos];
      if (!pillar) continue;
      if (allowedFor(pos, slot).has(ch)) continue;
      if (!existsSomewhere(ch)) continue;
      v('V17', p.section + '#' + p.index, ch + ' 를 ' + pm[2] + pm[3] + '로 놓았지만 그 기둥의 글자가 아니다', '글자는 실제로 있는 기둥에만 배치한다.');
    }
  });

  /* ---------------- V18 표면/지장간 십성 개수 층위 혼동 ---------------- */
  const levelPatterns = [
    { level: 'surface', re: new RegExp('(겉으로|표면(?:에|으로|상)?|천간(?:에|으로|에서)?|겉에|드러난)[^.!?\\n]{0,12}?(' + TEN_GODS.join('|') + ')\\s*(?:이|가|은|는|의)?\\s*([0-9]+|한|두|세|네|다섯)\\s*개', 'g') },
    { level: 'hidden', re: new RegExp('(지장간|속(?:에|으로)?|안쪽|숨은)[^.!?\\n]{0,12}?(' + TEN_GODS.join('|') + ')\\s*(?:이|가|은|는|의)?\\s*([0-9]+|한|두|세|네|다섯)\\s*개', 'g') }
  ];
  levelPatterns.forEach((lp) => {
    let lm;
    while ((lm = lp.re.exec(text))) {
      const god = lm[2];
      const n = /^[0-9]+$/.test(lm[3]) ? Number(lm[3]) : NUM_KO[lm[3]];
      const surface = (tv.bySurface || {})[god] || 0;
      const hidden = (tv.byHiddenAll || {})[god] || 0;
      if (lp.level === 'surface' && n !== surface) {
        v('V18', 'doc', '표면(천간·원국) ' + god + ' ' + n + '개 — 실제 표면 ' + surface + ' · 지장간 전체 ' + hidden,
          '표면 집계와 지장간 집계를 섞지 않는다.');
      }
      if (lp.level === 'hidden' && n !== hidden) {
        v('V18', 'doc', '지장간 ' + god + ' ' + n + '개 — 실제 지장간 전체 ' + hidden + ' · 표면 ' + surface,
          '표면 집계와 지장간 집계를 섞지 않는다.');
      }
    }
  });

  /* ---------------- V19 원국 ↔ 대운·세운 십성 혼동 ----------------
     인용한 근거가 한쪽(원국/대운)뿐인데, 다른 쪽에만 있는 십성을 그쪽 사실처럼 말한다. */
  const wonkuk = wonkukTenGodSet(ctx);
  const periodGods = periodTenGodSet(ctx);
  paras.forEach((p) => {
    const refs = p.refs.all.filter((r) => pool ? pool.has(r) : true);
    if (!refs.length) return;
    const t = p.text;
    const onlyPeriod = refs.every((r) => r.indexOf('period.') === 0);
    const onlyChart = refs.every((r) => r.indexOf('chart.') === 0 || r.indexOf('analysis.') === 0);
    if (onlyPeriod && /원국|명식|타고난|선천/.test(t)) {
      TEN_GODS.forEach((g) => {
        if (t.indexOf(g) >= 0 && periodGods.has(g) && !wonkuk.has(g)) {
          v('V19', p.section + '#' + p.index, g + ' 은 대운·세운에만 있는 십성인데 원국 사실처럼 말했다', '원국 십성과 대운·세운 십성을 구분한다.');
        }
      });
    }
    if (onlyChart && /대운|세운/.test(t)) {
      TEN_GODS.forEach((g) => {
        if (t.indexOf(g) >= 0 && wonkuk.has(g) && !periodGods.has(g)) {
          v('V19', p.section + '#' + p.index, g + ' 은 원국에만 있는 십성인데 대운·세운 사실처럼 말했다', '원국 십성과 대운·세운 십성을 구분한다.');
        }
      });
    }
  });

  /* ---------------- V20 시주 미상인데 시주 해석 ---------------- */
  if (ctx.analysis.flags.hourUnknown) {
    const HOUR_RE = /(시주|시지|출생\s*시간|태어난\s*시간)/g;
    paras.forEach((p) => {
      let hm;
      HOUR_RE.lastIndex = 0;
      const t = p.text;
      while ((hm = HOUR_RE.exec(t))) {
        const win = t.slice(Math.max(0, hm.index - 25), Math.min(t.length, hm.index + 35));
        if (/(빼고|모르|미상|없|여섯|한계|생략|제외|알 수 없|확인되지)/.test(win)) continue;
        v('V20', p.section + '#' + p.index, '시주가 없는데 시주를 해석했다: ' + win.trim(), '시주가 없으면 시주가 필요한 판정을 빼고 그 한계를 말한다.');
        break;
      }
    });
  }

  /* ---------------- V21 'unavailable' 로 검사 회피 ---------------- */
  const LIMIT_WORDS = /(시주|대운|세운|근거|상충|입력|정보|명식|자료|기준|범위|없|부족|모르|미상|알 수 없|비어)/;
  const unavailable = (doc.sections || []).filter((s) => s.status === 'unavailable');
  const periodInPool = !!pool && (pool.has('period.seun.ganzhi') || pool.has('period.daewoon.ganzhi') || pool.has('period.daewoon.none'));
  const obligationReachable = obligations.some((ob) => ob.reachable);
  unavailable.forEach((s) => {
    if (!s.reason || !LIMIT_WORDS.test(String(s.reason))) {
      v('V21', s.id, '비움 사유가 구체적 한계를 말하지 않는다: ' + (s.reason || '없음'), '왜 쓸 수 없는지 입력의 한계로 적는다.');
    }
    if (s.id === '08' && periodInPool) {
      v('V21', s.id, '대운·세운 근거가 입력에 있는데 §08 을 비웠다', '입력에 있는 기간 사실로 §08 을 쓴다.');
    }
    if (s.id === '03' && obligationReachable) {
      v('V21', s.id, '상충 축이 입력에 있는데 §03 을 비웠다', '양립하는 판독을 조건과 함께 쓴다.');
    }
    if (['01', '02', '04'].indexOf(s.id) >= 0 && pool && pool.has('chart.day.stem')) {
      v('V21', s.id, '일간·명식 근거가 입력에 있는데 §' + s.id + ' 을 비웠다', '입력에 있는 근거로 쓴다.');
    }
  });
  if (unavailable.length >= 5) {
    v('V21', 'doc', '섹션 ' + unavailable.length + '개를 비워 검사 대상에서 빼려는 구성', '입력에 근거가 있는 섹션은 비우지 않는다.');
  }

  return finish({ violations, warnings, paras, ctx, pool, arm, doc, obligations });
}

/* ---------------- 마무리: 구조/내용 분리·통계·피드백 ---------------- */
function finish(s) {
  const violations = s.violations;
  const warnings = s.warnings;
  const paras = s.paras || [];
  const pool = s.pool || null;
  const doc = s.doc || null;
  const refExists = (ref) => (pool ? pool.has(ref) : true);

  const structural = violations.filter((x) => STRUCTURAL_SET.has(x.rule));
  const content = violations.filter((x) => !STRUCTURAL_SET.has(x.rule));

  const stats = {
    paragraphs: paras.length,
    refs: paras.reduce((n, p) => n + p.refs.all.length, 0),
    validRefs: paras.reduce((n, p) => n + p.refs.all.filter(refExists).length, 0),
    paragraphsWithRef: paras.filter((p) => p.refs.all.length && p.refs.all.every(refExists)).length,
    kbRefs: paras.reduce((n, p) => n + (p.raw.kbRefs || []).length, 0),
    sectionsOk: doc ? flattenSections(doc).filter((x) => x.status === 'ok').length : 0,
    sectionsUnavailable: doc ? flattenSections(doc).filter((x) => x.status === 'unavailable').length : 0,
    obligations: (s.obligations || []).length,
    obligationsReachable: (s.obligations || []).filter((ob) => ob.reachable).length,
    byRule: violations.reduce((acc, x) => { acc[x.rule] = (acc[x.rule] || 0) + 1; return acc; }, {})
  };

  const checks = {
    structural: {
      label: '구조·참조 검증',
      rules: STRUCTURAL_RULES,
      violations: structural,
      passed: structural.length === 0,
      note: '근거 ID의 실재·입력 범위·스키마만 본다. 계산으로 100% 판정된다.'
    },
    content: {
      label: '내용 검증(자동)',
      rules: CONTENT_RULES,
      violations: content,
      passed: content.length === 0,
      note: '결정적으로 잡히는 사실·정합성 위반만 본다. 자동 통과가 명리학적 해석 품질을 보증하지 않는다.'
    },
    automaticOnly: true,
    interpretationQuality: 'not_verified_by_automation'
  };

  const feedback = violations.slice(0, 24).map((x) => '- [' + x.rule + (STRUCTURAL_SET.has(x.rule) ? '·참조' : '·내용') + '] ' + x.where + ': ' + x.detail + (x.fix ? ' → ' + x.fix : ''));
  return { violations, warnings, stats, feedback, checks, obligations: s.obligations || [] };
}

export const RULES = { BANNED_VERDICTS, CERTAINTY, SENSITIVE_SINGLE, TEN_GODS, TEN_GOD_ATTR };
