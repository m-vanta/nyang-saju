/* ==========================================================================
   lib/engines/rule.mjs — 실험군 A (규칙 기반 해석)
   --------------------------------------------------------------------------
   · 문장은 앱의 문장 카탈로그(src/content)에서 고른 것을 그대로 쓴다.
   · 8섹션 그릇(lib/schema.mjs)에 담는다. 앱에 없는 섹션은 status:'unavailable' 로
     이유를 적는다 — 없는 것을 있는 척 채우지 않는다.
   · 상충 섹션은 lib/facts.mjs 의 상충 의무(O1~O6)에서 만든다. 그래야 문단이
     인용한 근거와 채점 기준(CA)이 같은 출처를 본다.
   ========================================================================== */
import { DOC_VERSION, SECTIONS } from '../schema.mjs';
import { conflictObligations } from '../facts.mjs';

const RANK_KO = { 왕: '왕', 상: '상', 휴: '휴', 수: '수', 사: '사' };

/* --------------------------------------------------------------------------
   A 콘텐츠 출처 (리뷰 P0-1-4)
   A 는 앱의 문장 카탈로그를 쓰지만, 8섹션 그릇에 담으면서 **앱 화면에 없는 문단을
   실험이 새로 만드는 경우**가 있다. 그것을 숨기면 A 만 실제 서비스와 같은 것으로
   읽히므로, 섹션·문단마다 출처를 붙여 메타데이터와 리포트에 드러낸다.

     service                 앱 화면의 문장을 그대로
     service-mapped          앱 문장을 8섹션 자리로 옮겨 담음
     experimental-generated  앱에 없는 문단을 실험이 새로 만듦
   -------------------------------------------------------------------------- */
export const A_CONTENT_ORIGIN = {
  '01': { origin: 'service', label: '서비스 문장 그대로', note: '무료 결과의 천기팩폭(FREE.BOMB)을 그대로 옮겼다.' },
  '02': { origin: 'service', label: '서비스 문장 그대로', note: '무료 대표 성향(FREE.TRAIT)과 유료 상세(PAID.TRAIT) 문장을 그대로 옮겼다.' },
  '03': { origin: 'experimental-generated', label: '실험용 생성', note: '앱에는 상충 섹션이 없다. rule.mjs 가 상충 의무(O1~O6)로 이 문단을 새로 만들었다.' },
  '04': { origin: 'service-mapped', label: '서비스 문장 · 8섹션 매핑', note: '유료 화면의 반복 패턴(PAID.PATTERN) 문장을 §04 자리로 옮겨 담았다.' },
  '05': { origin: 'service-mapped', label: '서비스 문장 · 8섹션 매핑', note: '유료 화면의 연애운(themes love) 문장을 §05 자리로 옮겨 담았다.' },
  '06': { origin: 'service-mapped', label: '서비스 문장 · 8섹션 매핑', note: '유료 화면의 재물운(themes money) 문장을 §06 자리로 옮겨 담았다.' },
  '07': { origin: 'service-mapped', label: '서비스 문장 · 8섹션 매핑', note: '유료 화면의 직업운(themes work) 문장을 §07 자리로 옮겨 담았다.' },
  '08': { origin: 'experimental-generated', label: '실험용 생성', note: '앱의 흐름 설명(flowNarration)과 별개로, period 판정 문장을 이어 붙이고 고정 문장을 더해 만들었다.' }
};

function okRef(ctx, pool, id) {
  if (!id) return false;
  if (ctx.ids.has(id)) return true;
  return !!(pool && pool.has(id));
}

function refsOf(ctx, ids, pool) {
  return (ids || []).filter((id) => okRef(ctx, pool, id)).filter((id, i, a) => a.indexOf(id) === i);
}

/* 후보 중 실재하는 것만, 없으면 명식 핵심 근거로 대체한다(근거 없는 문단을 만들지 않는다) */
function refsOrCore(ctx, ids, fallbacks, pool) {
  const hit = refsOf(ctx, ids, pool);
  if (hit.length) return hit;
  return refsOf(ctx, fallbacks || ctx.free.findings || [], pool);
}

function pick(ctx, pred) {
  return ctx.findings.filter(pred);
}

function deukParagraph(ctx, pool) {
  const a = ctx.analysis;
  const ids = refsOf(ctx, [
    'AN.DEUKRYEONG.ELEMENT.' + (a.deukryeong.byElementCycle.supported ? 'YES' : 'NO'),
    'AN.DEUKRYEONG.SEASON.' + a.deukryeong.bySeasonRank.rank,
    'AN.DEUKRYEONG.STAGE.' + a.deukryeong.byStage.stage,
    'AN.DEUKRYEONG.TENGOD.' + a.deukryeong.byMainQiTenGod.tenGod,
    'AN.DEUKJI.STAGE.' + a.deukji.byStage.stage,
    'AN.DEUKJI.ROOT.' + (a.deukji.rootGrade.value || 'NONE'),
    'AN.MONTH.TYPE.' + a.monthCommand.monthType,
    'AN.ROOTS.COUNT.' + a.roots.length
  ], pool);
  const text = '월지에서는 ' + a.monthCommand.monthType + '이고, 일간은 계절 표에서 ' + a.deukryeong.bySeasonRank.rank +
    ' 자리예요. 월지 12운성은 ' + a.deukryeong.byStage.stage + ', 월지 본기는 ' + a.deukryeong.byMainQiTenGod.tenGod +
    '이고, 일지 12운성은 ' + a.deukji.byStage.stage + '예요. 네 판독은 서로 대신하지 않아서 하나로 합치지 않아요.';
  return { text, findingRefs: ids.length ? ids : refsOrCore(ctx, [], ctx.free.findings, pool) };
}

function traitParagraphs(ctx, pool) {
  return (ctx.free.traits || [])
    .filter((t) => t.text)
    .map((t) => ({
      text: (t.label ? t.label + '. ' : '') + t.text,
      findingRefs: refsOrCore(ctx, t.refs || [], ctx.free.findings, pool)
    }));
}

function paidTraitParagraphs(ctx, pool) {
  return (ctx.paidTraits || [])
    .filter((t) => t.text)
    .map((t) => ({
      text: (t.label ? t.label + '. ' : '') + t.text,
      findingRefs: refsOrCore(ctx, t.refs || [], ctx.free.findings, pool)
    }));
}

function obligationParagraph(ctx, ob, pool) {
  const a = ctx.analysis;
  let text = '';
  if (ob.id === 'O1') {
    text = '월지 쪽에서 보면 ' + RANK_KO[a.deukryeong.bySeasonRank.rank] + ' 자리라 기세를 받는 판독이 나오는데, 통근은 하나도 없어요. 표 판독과 뿌리는 다른 축이라, 한쪽만 골라 세다가 강하다고 단정하지 않아요.';
  } else if (ob.id === 'O2') {
    const bonggi = a.geokguk.candidates.filter((c) => c.id.indexOf('GEOK.BONGGI.') === 0)[0];
    const tutul = a.geokguk.candidates.filter((c) => c.id.indexOf('GEOK.TUTUL.') === 0 && c.transparent);
    text = '월지 하나에서 ' + (bonggi ? '본기 후보 ' + bonggi.god : '본기 후보') +
      (tutul.length ? '와 ' + tutul.map((c) => '투출 후보 ' + c.god).join('·') : '') +
      '가 같이 나와요. 문헌은 하나를 고르라고 정해 주지 않으니, 격을 확정하지 않고 후보를 나란히 둡니다.';
  } else if (ob.id === 'O3') {
    text = '합과 충이 같은 명식에 같이 있어요. 어느 한쪽이 이겼다고 하지 않고, 끌리는 자리와 부딪히는 자리를 나눠서 말해요. 그 두 힘이 한꺼번에 걸리는 때에는 판단이 늦어지기 쉬워요.';
  } else if (ob.id === 'O4') {
    const e = a.elementFacts.hiddenOnly[0];
    text = '표면 여덟 글자에는 ' + e + ' 기운이 없지만, 지장간에는 숨어 있어요. 그래서 "' + e + '이 아예 없다"고 단정하지 않아요. 겉으로 안 쓰는 결이 안쪽에 남아 있는 경우예요.';
  } else if (ob.id === 'O5') {
    text = '태어난 시진 안에 절입이 걸려 있어요. 만세력마다 월주가 갈릴 수 있으니, 월주를 확정으로 말하지 않아요. 그 경우에는 두 경우를 나란히 두고 봐요.';
  } else if (ob.id === 'O6') {
    text = '시주를 몰라 여섯 글자로 봐요. 시주가 있어야 하는 판정은 빼고, 있는 글자만으로 말해요. 그만큼 말할 수 있는 범위가 좁다는 것이 이 풀이의 한계예요.';
  } else {
    text = ob.topic + '을(를) 함께 봐요.';
  }
  return { text, findingRefs: refsOrCore(ctx, ob.requires, ctx.free.findings, pool) };
}

function patternParagraphs(ctx, pool) {
  const a = ctx.analysis;
  const topGod = ctx.free.topGod;
  const group = ctx.free.group;
  const out = [];
  (ctx.patterns || []).forEach((pt, i) => {
    if (!pt || !pt.text) return;
    let refs;
    if (i === 0) {
      refs = refsOrCore(ctx, ['TEN.TOP.' + topGod + '.' + (ctx.chart.tenCount[topGod] || 0), 'GOD.GROUP.' + group + '.' + (a.deukse.groupCountsByHiddenAll[group] || 0)], ctx.free.findings, pool);
    } else if (i === 1) {
      refs = refsOrCore(ctx, ['DAY.STAGE.' + ctx.chart.pillars.day.stage, 'FLAG.DOHWA', 'DAY.MASTER.' + ctx.chart.dayMaster], ctx.free.findings, pool);
    } else {
      refs = refsOrCore(ctx, pick(ctx, (f) => f.id.indexOf('PERIOD.') === 0).map((f) => f.id), ctx.free.findings, pool);
    }
    out.push({
      text: pt.label + '. ' + pt.text + (pt.cut ? ' ' + pt.cut : ''),
      findingRefs: refs
    });
  });
  return out;
}

function themeParagraph(ctx, key, pool) {
  const t = (ctx.themes || []).filter((x) => x.key === key)[0];
  if (!t) return null;
  return {
    text: t.body + (t.why ? ' ' + t.why : ''),
    findingRefs: refsOrCore(ctx, t.refs || [], pick(ctx, (f) => f.id.indexOf('PERIOD.') === 0 || f.id.indexOf('TEN.') === 0).map((f) => f.id), pool)
  };
}

function periodParagraphs(ctx, pool) {
  const pf = pick(ctx, (f) => f.id.indexOf('PERIOD.') === 0);
  if (!pf.length) return [];
  return [{
    text: pf.map((f) => f.display.long).join(' ') + ' 대운은 십 년, 세운은 한 해 단위로 흐르는 구간이라 지금 어느 구간에 서 있는지를 먼저 봐요.',
    findingRefs: refsOf(ctx, pf.map((f) => f.id), pool)
  }];
}

/* 문단 길이 목표에 맞춰 짧은 문단을 이웃과 묶는다. 인용은 합집합. */
function pack(paras) {
  const out = [];
  paras.filter(Boolean).forEach((p) => {
    if (!out.length) { out.push({ text: p.text, findingRefs: p.findingRefs.slice() }); return; }
    const last = out[out.length - 1];
    if (last.text.length < 120 && last.text.length + 1 + p.text.length <= 520) {
      last.text = last.text + ' ' + p.text;
      p.findingRefs.forEach((r) => { if (last.findingRefs.indexOf(r) < 0) last.findingRefs.push(r); });
      return;
    }
    out.push({ text: p.text, findingRefs: p.findingRefs.slice() });
  });
  return out;
}

function sectionOf(id, paragraphs, reason) {
  const meta = SECTIONS.filter((s) => s.id === id)[0];
  const origin = A_CONTENT_ORIGIN[id] || { origin: 'experimental-generated', label: '실험용 생성', note: null };
  const paras = (paragraphs || []).map((p) => Object.assign({}, p, { contentOrigin: origin.origin }));
  if (!paras.length) {
    return { id, key: meta.key, title: meta.title, status: 'unavailable', reason: reason || '이 명식에는 이 섹션에 쓸 근거가 없어요.', paragraphs: [], contentOrigin: origin.origin, contentOriginNote: origin.note };
  }
  return { id, key: meta.key, title: meta.title, status: 'ok', reason: null, paragraphs: paras, contentOrigin: origin.origin, contentOriginNote: origin.note };
}

export function ruleDoc(ctx, pool) {
  const a = ctx.analysis;
  const obligations = conflictObligations(ctx, null);

  /* §01 천기팩폭 */
  const bomb = [{ text: ctx.free.bomb, findingRefs: refsOrCore(ctx, ctx.free.findings, [], pool) }];
  /* §02 대표 성향 */
  const traits = pack([deukParagraph(ctx, pool)].concat(traitParagraphs(ctx, pool), paidTraitParagraphs(ctx, pool)));
  /* §03 내면의 상충 */
  const conflicts = pack(obligations.map((ob) => obligationParagraph(ctx, ob, pool)));
  /* §04 반복 패턴 */
  const patterns = pack(patternParagraphs(ctx, pool));
  /* §05~07 */
  const love = pack([themeParagraph(ctx, 'love', pool)]);
  const money = pack([themeParagraph(ctx, 'money', pool)]);
  const work = pack([themeParagraph(ctx, 'work', pool)]);
  /* §08 */
  const period = pack(periodParagraphs(ctx, pool));

  const sections = [
    sectionOf('01', bomb.filter((p) => p.text && p.text.length)),
    sectionOf('02', traits, '명식 핵심 근거가 없어 대표 성향 문장을 만들지 못했어요.'),
    sectionOf('03', conflicts, '이 명식에는 양립하는 두 판독이 없어 상충 섹션을 비워요.'),
    sectionOf('04', patterns, '반복 패턴 문장을 만들 근거가 없어요.'),
    sectionOf('05', love, '관계 주제 문장을 만들 근거가 없어요.'),
    sectionOf('06', money, '재물 주제 문장을 만들 근거가 없어요.'),
    sectionOf('07', work, '직업 주제 문장을 만들 근거가 없어요.'),
    sectionOf('08', period, a.flags.hourUnknown ? '대운·세운 문장을 만들 근거가 없어요.' : '대운·세운 문장을 만들 근거가 없어요.')
  ];

  const used = [];
  sections.forEach((s) => s.paragraphs.forEach((p) => p.findingRefs.forEach((id) => { if (used.indexOf(id) < 0) used.push(id); })));
  const skipped = ctx.findings.map((f) => f.id).filter((id) => used.indexOf(id) < 0);

  /* 출처 집계 — 섹션 수와 문단 수를 모두 낸다 */
  const originBySection = { service: [], 'service-mapped': [], 'experimental-generated': [] };
  const originByParagraph = { service: 0, 'service-mapped': 0, 'experimental-generated': 0 };
  sections.forEach((s) => {
    if (!originBySection[s.contentOrigin]) originBySection[s.contentOrigin] = [];
    originBySection[s.contentOrigin].push(s.id);
    s.paragraphs.forEach(() => { originByParagraph[s.contentOrigin] = (originByParagraph[s.contentOrigin] || 0) + 1; });
  });

  return {
    docVersion: DOC_VERSION,
    engine: 'rule',
    grounding: 'findings',
    sections,
    cautions: [],
    meta: {
      usedFindings: used,
      skippedFindings: skipped,
      sectionsOk: sections.filter((s) => s.status === 'ok').length,
      sectionsUnavailable: sections.filter((s) => s.status === 'unavailable').length,
      contentOrigin: originBySection,
      contentOriginParagraphs: originByParagraph,
      contentOriginDefinitions: A_CONTENT_ORIGIN,
      note: '규칙 엔진은 앱의 문장 카탈로그만 쓴다. 없는 섹션은 이유와 함께 비운다. §03·§08 처럼 앱에 없는 자리는 실험이 만든 문장이며 contentOrigin 으로 구분한다.'
    }
  };
}

export function ruleMeta(ctx) {
  return { engine: 'rule', model: null, provider: 'catalog', params: { temperature: 0 } };
}
