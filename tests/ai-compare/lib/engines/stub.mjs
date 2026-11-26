/* ==========================================================================
   lib/engines/stub.mjs — 오프라인 응답 (네트워크 없음)
   --------------------------------------------------------------------------
   목적: 실험 배선(프롬프트→검증기→채점→블라인드)을 키 없이 끝까지 돌린다.
        실제 모델의 품질을 흉내 내려는 것이 아니라, 각 실험군이 '볼 수 있는 것'만
        써서 8섹션 문서를 만든다는 계약을 지키는 결정적 응답이다.

     B  명식 기본표만 → 대운·세운 섹션은 비운다
     C  + analysisData → 네 판독·통근·격 후보·상충 의무를 모두 쓴다
     D  + 지식베이스   → 섹션마다 KB 근거를 1개 이상 붙인다
     E  D + 비평        → critique 를 남기고, 바넘·누락을 고친 문장으로 바꾼다

   probeDocs() 는 일부러 규칙을 어긴 문서다. 검증기가 실제로 무는지 확인하는 데만 쓴다.
   ========================================================================== */
import { DOC_VERSION, SECTIONS } from '../schema.mjs';
import { conflictObligations } from '../facts.mjs';

const PILLAR_KO = { year: '년', month: '월', day: '일', hour: '시' };
const RANK_KO = { 왕: '왕', 상: '상', 휴: '휴', 수: '수', 사: '사' };
const GROUP_KO = { peer: '비겁', output: '식상', wealth: '재성', power: '관성', resource: '인성' };

function refsFrom(pool, prefixes) {
  const out = [];
  pool.forEach((v) => {
    if (prefixes.some((p) => v.ref.indexOf(p) === 0)) out.push(v.ref);
  });
  return out;
}

function has(pool, ref) { return pool.has(ref); }

function take(pool, prefixes, n) {
  return refsFrom(pool, prefixes).slice(0, n || 1);
}

function poolText(pool, ref) {
  const v = pool.get(ref);
  return v ? v.value : null;
}

/* 문단 하나를 만든다. 근거가 하나도 없으면 만들지 않는다(없는 근거 문단 금지). */
function para(pool, text, prefixes, kbRefs, extra) {
  let refs = take(pool, prefixes, 3);
  if (!refs.length) refs = take(pool, ['chart.'], 1);
  if (!refs.length) return null;
  const p = { text, evidenceRefs: refs, analysisRefs: refs.filter((r) => r.indexOf('analysis.') === 0) };
  if (kbRefs && kbRefs.length) p.kbRefs = kbRefs.filter((k) => has(pool, 'kb.' + k)).map((k) => k);
  return Object.assign(p, extra || {});
}

function topGroup(a) {
  const g = a.deukse.groupCountsByHiddenAll;
  return Object.keys(g).sort((x, y) => g[y] - g[x])[0];
}

function topGodOf(a) {
  const s = a.tenGodFacts.bySurface;
  return Object.keys(s).sort((x, y) => (s[y] - s[x]))[0];
}

/* ---------------- B — 명식 기본표만 ---------------- */
function docB(ctx, pool) {
  const c = ctx.chart;
  const dm = ctx.analysis.dayMaster;
  const counts = Object.keys(c.counts).sort((x, y) => c.counts[y] - c.counts[x]);
  const strong = counts[0];
  const weak = counts[counts.length - 1];
  const tl = Object.keys(c.tenCount).filter((g) => c.tenCount[g] > 0).sort((x, y) => c.tenCount[y] - c.tenCount[x]);
  const top = tl[0] || '비견';

  const sec01 = [para(pool,
    '민지 님은 ' + dm.stem + '(' + dm.elem + ') 일간이에요. 여덟 글자에서 ' + strong + ' 기운이 가장 많고 ' + weak +
    ' 기운이 가장 적어요. 겉으로 드러난 십성은 ' + top + '이 앞에 서는 구성이라, 판단할 때 그 결이 먼저 나오기 쉬워요.',
    ['chart.day.stem', 'chart.element.' + strong + '.count', 'chart.tenGod.' + top + '.surface'])];

  const monthP = c.pillars.month;
  const sec02 = [
    para(pool,
      '월지는 ' + ctx.analysis.monthCommand.branch + '(' + ctx.analysis.monthCommand.branchElem + ')이고 ' +
      ctx.analysis.monthCommand.season + '에 태어난 명식이에요. 월지의 결이 ' + dm.elem + ' 일간과 어떻게 만나는지가 성향의 바탕을 만들어요. ' +
      PILLAR_KO.month + ' 자리는 사람을 대하는 기본 태도로 드러나는 자리예요.',
      ['chart.month.ganzhi', 'chart.month.branchElem', 'chart.month.season']),
    para(pool,
      '일지 ' + c.pillars.day.hanja + '는 12운성으로 ' + c.pillars.day.stage + ' 자리예요. 이 자리는 가까운 사람에게 보이는 모습과 혼자 있을 때의 리듬을 보여 줘요. ' +
      '표면 십성에서는 ' + tl.slice(0, 2).join('·') + '이 눈에 들어와요.',
      ['chart.day.branch', 'chart.day.stage'])
  ];

  const sec04 = [
    para(pool,
      dm.stem + ' 일간에 ' + top + '이 반복되는 구성이라, 같은 방식이 되풀이되기 쉬워요. 일이 몰릴 때도 새 방식을 만들기보다 익숙한 방식으로 밀어붙이는 쪽이에요.',
      ['chart.day.stem', 'chart.tenGod.' + top + '.surface', 'chart.element.' + strong + '.count'])
  ];

  const sec05 = (c.tenCount['정관'] || c.tenCount['편관'])
    ? [para(pool, '관성 자리가 겉으로 보이는 명식이라, 관계에서도 상대의 태도와 약속을 먼저 확인하는 편이에요. 마음이 앞서기보다 기준이 먼저 서는 쪽이에요.', ['chart.tenGod.' + ((c.tenCount['정관'] ? '정관' : '편관')) + '.surface'])]
    : [];
  const sec06 = (c.tenCount['정재'] || c.tenCount['편재'])
    ? [para(pool, '재성 자리가 겉으로 보여서, 돈과 성과를 눈에 보이는 단위로 확인하려는 편이에요. 들어오는 것보다 남는 것을 세는 쪽에 익숙해요.', ['chart.tenGod.' + (c.tenCount['정재'] ? '정재' : '편재') + '.surface'])]
    : [];
  const sec07 = (c.tenCount['정인'] || c.tenCount['편인'])
    ? [para(pool, '인성 자리가 겉으로 보여서, 일을 배우는 방식이 먼저 서는 편이에요. 새 일도 재료를 모으고 나서 움직이는 쪽이에요.', ['chart.tenGod.' + (c.tenCount['정인'] ? '정인' : '편인') + '.surface'])]
    : [];

  return {
    docVersion: DOC_VERSION,
    engine: 'stub-B',
    grounding: 'evidence',
    sections: [
      { id: '01', status: sec01.filter(Boolean).length ? 'ok' : 'unavailable', reason: sec01.filter(Boolean).length ? null : '명식 기본 근거가 없어요.', paragraphs: sec01.filter(Boolean) },
      { id: '02', status: 'ok', paragraphs: sec02.filter(Boolean) },
      { id: '03', status: 'unavailable', reason: '명식 기본표만으로는 양립하는 두 판독을 확인할 수 없어요.', paragraphs: [] },
      { id: '04', status: sec04.filter(Boolean).length ? 'ok' : 'unavailable', reason: '반복 패턴을 만들 근거가 없어요.', paragraphs: sec04.filter(Boolean) },
      { id: '05', status: sec05.length ? 'ok' : 'unavailable', reason: '관계를 볼 표면 십성이 없어요.', paragraphs: sec05 },
      { id: '06', status: sec06.length ? 'ok' : 'unavailable', reason: '재물을 볼 표면 십성이 없어요.', paragraphs: sec06 },
      { id: '07', status: sec07.length ? 'ok' : 'unavailable', reason: '직업을 볼 표면 십성이 없어요.', paragraphs: sec07 },
      { id: '08', status: 'unavailable', reason: '대운·세운 정보가 입력에 없어요.', paragraphs: [] }
    ],
    cautions: [],
    meta: { role: 'stub', arm: 'B', inputBoundary: 'chart-only' }
  };
}

/* ---------------- 상충 문단 (C/D/E 공용) ---------------- */
function obligationParas(ctx, pool, level) {
  const a = ctx.analysis;
  const obs = conflictObligations(ctx, pool).filter((ob) => ob.reachable);
  return obs.map((ob) => {
    let text = '';
    if (ob.id === 'O1') {
      text = '월지 표로는 ' + RANK_KO[a.deukryeong.bySeasonRank.rank] + ' 자리라 힘을 받는 판독이 나오는데, 통근은 ' + a.roots.length +
        '개예요. 두 판독이 반대를 가리킬 때는 표 쪽은 겉으로 드러나는 기세로, 뿌리 쪽은 오래 버티는 힘으로 나눠서 봐요.';
    } else if (ob.id === 'O2') {
      const b = a.geokguk.candidates.filter((c) => c.id.indexOf('GEOK.BONGGI.') === 0)[0];
      const t = a.geokguk.candidates.filter((c) => c.id.indexOf('GEOK.TUTUL.') === 0 && c.transparent);
      text = '월지 하나에서 ' + (b ? '본기 후보 ' + b.god : '본기 후보') + '와 ' + t.map((x) => '투출 후보 ' + x.god).join('·') +
        '가 같이 나와요. 한쪽은 타고난 바탕, 다른 쪽은 겉으로 드러난 방식이라, 상황에 따라 다른 얼굴이 나오는 경우예요.';
    } else if (ob.id === 'O3') {
      text = '합과 충이 한 명식에 같이 있어요. 합은 붙잡는 힘, 충은 방향을 바꾸는 힘이라, 두 힘이 같이 걸리는 때에는 결정이 늦어지고 대신 오래 끌고 가는 쪽이 돼요.';
    } else if (ob.id === 'O4') {
      const e = a.elementFacts.hiddenOnly[0];
      text = '표면 여덟 글자에는 ' + e + ' 기운이 한 개도 없지만, 지장간에는 남아 있어요. 겉으로 안 쓰는 결이 안쪽에 있는 경우라, "' + e + '이 없다"고 말하면 틀려요.';
    } else if (ob.id === 'O5') {
      text = '시진 안에 절입이 걸려 있어 월주가 갈릴 수 있어요. 그 경우에는 두 월주를 나란히 두고, 양쪽에서 공통으로 성립하는 말만 확정해요.';
    } else if (ob.id === 'O6') {
      text = '시주를 몰라 여섯 글자로 봐요. 시주가 있어야 성립하는 판정은 빼고, 있는 글자에서 확인되는 것만 말해요. 그만큼 범위가 좁다는 것이 한계예요.';
    }
    const kb = level === 'D' ? [ob.id === 'O2' ? 'KB-GEOK-02' : (ob.id === 'O1' ? 'KB-ROOT-01' : 'KB-GUARD-02')] : [];
    return para(pool, text, ob.requires, kb, { analysisRefs: ob.requires.filter((r) => r.indexOf('analysis.') === 0) });
  }).filter(Boolean);
}

/* ---------------- C/D 공용 8섹션 ---------------- */
function docCD(ctx, pool, level) {
  const a = ctx.analysis;
  const dm = a.dayMaster;
  const c = ctx.chart;
  const g = topGroup(a);
  const tg = a.tenGodFacts.bySurface;
  const top = topGodOf(a);
  const kbFor = (level === 'D');

  const s01 = [
    para(pool,
      '민지 님은 ' + dm.stem + '(' + dm.elem + ') 일간으로 ' + a.monthCommand.branch + '월 ' + a.monthCommand.monthType + ' 자리에 섰어요. ' +
      '계절 표로는 ' + RANK_KO[a.deukryeong.bySeasonRank.rank] + ' 자리, 월지 본기는 ' + a.deukryeong.byMainQiTenGod.tenGod +
      ', 통근은 ' + a.roots.length + '개, 일지 운성은 ' + a.deukji.byStage.stage + '예요. 네 판독이 한 방향이 아닐 때가 많아서, 어떤 축은 힘을 주고 어떤 축은 비어 있는 상태로 읽어요.',
      ['analysis.deukryeong', 'analysis.roots', 'analysis.deukji'], kbFor ? ['KB-MON-04'] : [])
  ];

  const s02 = [
    para(pool,
      '지장간까지 세면 ' + GROUP_KO[g] + ' 쪽이 가장 두꺼워요. 겉으로 드러난 십성은 ' + top + '이 앞서고요. ' +
      '그래서 이 사람은 ' + GROUP_KO[g] + '의 방식으로 먼저 움직이되, 겉으로는 ' + top + '의 얼굴을 쓰는 구성이에요. 두 층이 다르면 같은 사람이 장면에 따라 다르게 보여요.',
      ['analysis.deukse.groupCountsByHiddenAll', 'analysis.tenGodFacts.bySurface'], kbFor ? ['KB-TEN-04', 'KB-TEN-03'] : []),
    para(pool,
      a.deukji.rootGrade.value
        ? '일지에는 ' + a.deukji.rootGrade.value + ' 등급의 뿌리가 있어요. 가까운 사람에게는 이 뿌리가 버티는 힘으로 드러나고, 낯선 자리에서는 겉의 ' + top + '이 먼저 나와요.'
        : '일지에 뿌리가 없어서, 가까운 자리에서도 기대기보다 직접 만드는 쪽으로 움직여요.',
      ['analysis.deukji.rootGrade', 'analysis.roots'], kbFor ? ['KB-ROOT-01', 'KB-ROOT-02'] : [])
  ];

  const s03 = obligationParas(ctx, pool, level);

  const s04 = [
    para(pool,
      '같은 결이 반복되는 자리는 ' + GROUP_KO[g] + '이에요. 일이 커질수록 이 방식이 더 세게 나오고, 반대로 지칠 때는 같은 방식이 과해져서 사람을 피곤하게 만들어요. 반복을 끊으려면 강도를 낮추는 쪽보다 순서를 바꾸는 쪽이 쉬워요.',
      ['analysis.deukse.groupCountsByHiddenAll', 'analysis.tenGodFacts.byHiddenAll'], kbFor ? ['KB-TEN-04'] : []),
    para(pool,
      '일지 ' + c.pillars.day.hanja + '가 ' + c.pillars.day.stage + ' 자리에 있어서, 가까운 자리에서 쓰는 리듬도 같은 방식으로 굳어요. 혼자 있을 때와 사람 앞에 있을 때의 속도 차이가 이 자리에서 나와요.',
      ['chart.day.branch', 'analysis.deukji.byStage'], kbFor ? ['KB-ROOT-02'] : [])
  ];

  const s05 = [para(pool,
    '관계에서는 ' + (tg['정관'] || tg['편관'] ? '기준과 약속을 먼저 확인하는 쪽' : '분위기와 감정의 결을 먼저 읽는 쪽') +
    '이에요. 가까워질 때도 상대의 속도를 재면서 들어가고, 한번 정하면 오래 끄는 편이에요.',
    ['analysis.tenGodFacts.bySurface', 'analysis.hapchong'], kbFor ? ['KB-HAP-03'] : [])];

  const s06 = [para(pool,
    '돈은 ' + (a.deukse.groupCountsByHiddenAll.wealth > 0 ? '재성 자리를 통해' : '식상으로 만든 것을 통해') +
    ' 들어오고 나가는 구조예요. 크게 한 번보다 여러 번 들어오는 쪽이 맞고, 남는 것을 세는 습관이 성과를 만들어요.',
    ['analysis.deukse.groupCountsByHiddenAll', 'analysis.elementFacts.share'], kbFor ? ['KB-TEN-03'] : [])];

  const s07 = [para(pool,
    '일하는 방식은 ' + (a.deukse.groupCountsByHiddenAll.power > 0 ? '규칙과 책임이 분명한 자리에서' : '내가 만든 것을 직접 굴리는 자리에서') +
    ' 힘이 나요. ' + (a.deukse.groupCountsByHiddenAll.resource > 0 ? '배우는 시간이 성과로 바뀌는 구조' : '직접 부딪혀 익히는 구조') + '라서, 새 일을 시작할 때 그 순서를 지키면 덜 지쳐요.',
    ['analysis.deukse.groupCountsByHiddenAll', 'analysis.tenGodFacts.groupsByHiddenAll'], kbFor ? ['KB-GEOK-08'] : [])];

  const s08 = [];
  if (ctx.period && ctx.period.seun) {
    s08.push(para(pool,
      '올해는 ' + ctx.period.seun.hanja + ' 세운으로, 천간은 ' + ctx.period.seun.stemTen + ', 지지는 ' + ctx.period.seun.branchTen + '이에요. ' +
      (ctx.period.daewoon
        ? '지금은 ' + ctx.period.daewoon.hanja + ' 대운(' + (ctx.period.daewoon.ageRange || []).join('~') + '세) 구간이라, 대운의 ' + ctx.period.daewoon.stemTen + '과 ' + ctx.period.daewoon.branchTen + '이 올해 ' + ctx.period.seun.stemTen + '과 겹치는 방식을 먼저 봐요.'
        : '첫 대운이 열리기 전이라, 주변의 기운이 대운을 대신하는 구간이에요.') +
      ' 구간은 방향을 확정하는 때가 아니라 방식이 반복되는 때로 읽어요.',
      ['period.seun', 'period.daewoon'], kbFor ? ['KB-PER-03', 'KB-PER-04'] : []));
  }

  const sections = [
    { id: '01', paragraphs: s01 },
    { id: '02', paragraphs: s02 },
    { id: '03', paragraphs: s03, reason: '이 명식에는 양립하는 두 판독이 확인되지 않아요.' },
    { id: '04', paragraphs: s04 },
    { id: '05', paragraphs: s05 },
    { id: '06', paragraphs: s06 },
    { id: '07', paragraphs: s07 },
    { id: '08', paragraphs: s08, reason: '대운·세운 정보가 입력에 없어요.' }
  ].map((s) => {
    const ps = s.paragraphs.filter(Boolean);
    return { id: s.id, status: ps.length ? 'ok' : 'unavailable', reason: ps.length ? null : (s.reason || '근거가 없어요.'), paragraphs: ps };
  });

  return {
    docVersion: DOC_VERSION,
    engine: level === 'D' ? 'stub-D' : 'stub-C',
    grounding: 'evidence',
    sections,
    cautions: [],
    meta: { role: 'stub', arm: level, inputBoundary: level === 'D' ? 'analysis+period+kb' : 'analysis+period' }
  };
}

/* ---------------- E — D 초안 비평·재작성 ---------------- */
function docE(ctx, pool, draft) {
  const base = draft || docCD(ctx, pool, 'D');
  const critique = [
    { dimension: 'personal', where: '§02', issue: '두 번째 문단이 뿌리 유무만 말하고 그 사람의 구체 자리를 붙이지 않았다.', fix: '일지 간지와 운성 자리를 함께 붙였다.' },
    { dimension: 'barnum', where: '§04', issue: '“지칠 때는 과해진다”가 어느 명식에나 맞는 문장이었다.', fix: '반복되는 십성 묶음과 연결해 조건을 붙였다.' },
    { dimension: 'conflict', where: '§03', issue: '양쪽 근거는 인용했지만 어느 조건에서 갈리는지가 약했다.', fix: '겉으로 드러나는 기세와 오래 버티는 힘으로 나눠 조건을 붙였다.' },
    { dimension: 'logic', where: '§07', issue: '“힘이 나요”에서 “덜 지쳐요”로 건너뛰어 인과가 비었다.', fix: '배우는 시간과 성과의 순서를 근거로 이었다.' }
  ];
  const sections = base.sections.map((s) => {
    if (s.status !== 'ok') return s;
    const paragraphs = s.paragraphs.map((p, i) => {
      if (s.id === '02' && i === 0) {
        return Object.assign({}, p, {
          text: p.text + ' 이 두 층이 같은 방향이면 판단이 빠르고, 반대면 같은 사람이 장면마다 다르게 보이는 경우예요.',
          kbRefs: (p.kbRefs || []).concat(pool.has('kb.KB-TEN-03') ? ['KB-TEN-03'] : []).filter((x, j, arr2) => arr2.indexOf(x) === j)
        });
      }
      return p;
    });
    return Object.assign({}, s, { paragraphs });
  });
  return {
    docVersion: DOC_VERSION,
    engine: 'stub-E',
    grounding: 'evidence',
    sections,
    cautions: [],
    critique,
    meta: { role: 'stub', arm: 'E', revisedFrom: base.engine, critiqueCount: critique.length }
  };
}

/* ---------------- 진입점 ---------------- */
export function stubDoc(arm, ctx, opts) {
  const o = opts || {};
  const pool = o.pool || new Map();
  if (arm === 'B') return docB(ctx, pool);
  if (arm === 'C') return docCD(ctx, pool, 'C');
  if (arm === 'D') return docCD(ctx, pool, 'D');
  if (arm === 'E') return docE(ctx, pool, o.draftDoc || docCD(ctx, pool, 'D'));
  return docCD(ctx, pool, 'C');
}

/* ---------------- 검증기 자기시험용 probe 문서 ---------------- */
function blank(paragraphs, sectionId) {
  return {
    docVersion: DOC_VERSION,
    engine: 'probe',
    grounding: 'evidence',
    sections: SECTIONS.map((s) => (s.id === (sectionId || '01')
      ? { id: s.id, status: paragraphs.length ? 'ok' : 'unavailable', reason: paragraphs.length ? null : 'probe', paragraphs }
      : { id: s.id, status: 'unavailable', reason: 'probe: 이 섹션은 비워 둔다', paragraphs: [] })),
    cautions: [],
    meta: { role: 'probe' }
  };
}

export function probeDocs(ctx, pool) {
  const a = ctx.analysis;
  const firstRef = pool ? Array.from(pool.keys())[0] : 'chart.day.stem';
  const tenGodsPresent = Object.keys(a.tenGodFacts.byHiddenAll).filter((g) => a.tenGodFacts.byHiddenAll[g] > 0);
  const absentGod = ['편관', '정관', '편재', '정재', '식신', '상관', '편인', '정인', '비견', '겁재'].filter((g) => tenGodsPresent.indexOf(g) < 0)[0] || null;

  const out = {};

  out.hallucinatedGanzhi = {
    doc: blank([{ text: '민지 님은 갑자(甲子) 일주로 태어나 물 기운이 강한 사람이에요. 그 결이 모든 판단에 먼저 나와요.', evidenceRefs: [firstRef] }]),
    expect: 'V4'
  };

  out.hallucinatedTenGod = {
    doc: blank([{ text: '민지 님은 ' + (absentGod || '편관') + '이 두드러지는 명식이라 밀어붙이는 힘이 세요. 그 힘이 관계에서도 그대로 나와요.', evidenceRefs: [firstRef] }]),
    expect: 'V5'
  };

  out.hallucinatedRelation = {
    doc: blank([{ text: '민지 님은 천간합이 성립하는 명식이라 사람을 붙잡는 힘이 강해요. 그 힘이 일에서도 반복돼요.', evidenceRefs: [firstRef] }]),
    expect: 'V6'
  };

  out.noEvidence = {
    doc: blank([{ text: '민지 님은 흐르는 물처럼 부드럽고, 속은 생각보다 단단한 사람이에요. 그 결이 오래 이어져요.', evidenceRefs: [] }]),
    expect: 'V2'
  };

  out.outOfPool = {
    doc: blank([{ text: '민지 님은 통근이 0개라 기반 없이 밀어붙이는 사람이에요. 그 방식이 오래 반복돼요.', evidenceRefs: ['analysis.roots.count'] }]),
    expect: 'V3'
  };

  out.certainty = {
    doc: blank([{ text: '민지 님은 올해 반드시 좋은 자리로 옮겨 가요. 틀림없이 그렇게 됩니다.', evidenceRefs: [firstRef] }]),
    expect: 'V8'
  };

  out.sensitive = {
    doc: blank([{ text: '민지 님은 올해 수술을 절대 피해야 해요. 주식은 하지 마세요.', evidenceRefs: [firstRef] }]),
    expect: 'V9'
  };

  out.bannedVerdict = {
    doc: blank([{ text: '민지 님은 신강한 편이라 용신이 화로 잡히는 명식이에요. 그래서 밀어붙이는 힘이 세요.', evidenceRefs: [firstRef] }]),
    expect: 'V7'
  };

  out.missingKb = {
    doc: blank([{ text: '민지 님은 ' + a.dayMaster.stem + ' 일간으로 ' + a.monthCommand.branch + '월에 태어났어요. 계절의 결이 성향의 바탕을 만들어요.', evidenceRefs: [firstRef], analysisRefs: ['analysis.deukryeong'] }]),
    expect: 'V13',
    arm: 'D'
  };

  /* 한쪽만 인용한 상충 */
  const ob = conflictObligations(ctx, pool).filter((o) => o.reachable)[0];
  if (ob) {
    out.conflictOneSide = {
      doc: blank([{ text: '민지 님은 월지의 판독만 보면 힘을 받는 자리예요. 그래서 밀어붙이는 힘이 강한 사람이에요.', evidenceRefs: [ob.requires[0]] }]),
      expect: 'V15'
    };
  }

  /* 정상 문서 — 검증기를 통과해야 한다(오탐 검사) */
  out.good = { doc: docCD(ctx, pool, 'D'), expect: null };

  return out;
}
