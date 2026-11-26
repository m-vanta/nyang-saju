/* ==========================================================================
   lib/engines/stub.mjs — 오프라인 응답 (네트워크 없음) + 검증기 probe
   --------------------------------------------------------------------------
   목적: 실험 배선(프롬프트→검증기→채점→블라인드)을 키 없이 끝까지 돌린다.
        실제 모델의 품질을 흉내 내려는 것이 아니라, 각 실험군이 '볼 수 있는 것'만
        써서 8섹션 문서를 만든다는 계약을 지키는 결정적 응답이다.

     B  명식 기본표 + 대운·세운 → §08 은 기간 사실로 쓴다. analysisData·KB 는 없다
     C  + analysisData → 네 판독·통근·격 후보·상충 의무를 모두 쓴다
     D  + 지식베이스   → 섹션마다 KB 근거를 1개 이상 붙인다
     E  D + 비평        → critique 를 남기고, 바넘·누락을 고친 문장으로 바꾼다

   probeDocs() 는 일부러 규칙을 어긴 문서다. 검증기가 실제로 무는지 확인하는 데만 쓴다.
   각 probe 는 **정상 문서(docCD)의 §01 한 곳만 바꿔 끼우는** 방식이라, 다른 섹션의
   잡음(V13·V21 같은)이 결과 표를 흐리지 않는다.
   ========================================================================== */
import { DOC_VERSION, SECTIONS } from '../schema.mjs';
import { conflictObligations, GROUP_KO } from '../facts.mjs';
import { allowedGanzhi, wonkukTenGodSet, periodTenGodSet } from '../validate.mjs';

const PILLAR_KO_EN = { year: '년', month: '월', day: '일', hour: '시' };
const RANK_KO = { 왕: '왕', 상: '상', 휴: '휴', 수: '수', 사: '사' };

const STEMS = '甲乙丙丁戊己庚辛壬癸';
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
const TEN_GODS = ['비견', '겁재', '식신', '상관', '편재', '정재', '편관', '정관', '편인', '정인'];

function refsFrom(pool, prefixes) {
  /* prefix 순서를 지킨다 — 문단이 먼저 말하는 영역의 근거가 먼저 잡히게.
     (pool 순회 순서에 맡기면 'analysis.roots' 가 'analysis.deukji.rootGrade' 를 밀어낸다.) */
  const out = [];
  prefixes.forEach((prefix) => {
    pool.forEach((v) => {
      if (v.ref.indexOf(prefix) === 0 && out.indexOf(v.ref) < 0) out.push(v.ref);
    });
  });
  return out;
}

function has(pool, ref) { return pool.has(ref); }

function take(pool, prefixes, n) {
  return refsFrom(pool, prefixes).slice(0, n || 1);
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

/* ---------------- B — 명식 기본표 + 대운·세운 ---------------- */
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
      PILLAR_KO_EN.month + ' 자리는 사람을 대하는 기본 태도로 드러나는 자리예요.',
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

  /* §08 — 대운·세운은 코드가 계산한 기본 사실이므로 B 도 쓴다(리뷰 P0-1-1) */
  const sec08 = [];
  const pd = ctx.period;
  if (pd && pd.seun) {
    const dw = pd.daewoon;
    sec08.push(para(pool,
      '올해는 ' + pd.seun.hanja + ' 세운으로, 천간은 ' + pd.seun.stemTen + ', 지지는 ' + pd.seun.branchTen + '이에요. ' +
      (dw
        ? '지금은 ' + dw.hanja + ' 대운(' + (dw.ageRange || []).join('~') + '세) 구간이라, 대운의 ' + dw.stemTen + '과 ' + dw.branchTen + '이 올해의 결 위에 겹쳐요.'
        : '첫 대운이 열리기 전이라, 주변에서 오는 기운이 대운 자리를 대신하는 구간이에요.') +
      ' 기본표만으로도 구간의 간지와 십성은 읽을 수 있어서, 그 결이 앞에서 본 성향의 어느 축과 맞물리는지를 봐요.',
      ['period.seun', 'period.daewoon']));
  }

  return {
    docVersion: DOC_VERSION,
    engine: 'stub-B',
    grounding: 'evidence',
    sections: [
      { id: '01', status: sec01.filter(Boolean).length ? 'ok' : 'unavailable', reason: sec01.filter(Boolean).length ? null : '명식 기본 근거가 없어요.', paragraphs: sec01.filter(Boolean) },
      { id: '02', status: 'ok', paragraphs: sec02.filter(Boolean) },
      { id: '03', status: 'unavailable', reason: '상충 판독에 필요한 analysisData(합충·통근·격 후보)가 입력에 없어요.', paragraphs: [] },
      { id: '04', status: sec04.filter(Boolean).length ? 'ok' : 'unavailable', reason: '반복 패턴을 만들 근거가 없어요.', paragraphs: sec04.filter(Boolean) },
      { id: '05', status: sec05.length ? 'ok' : 'unavailable', reason: '관계를 볼 표면 십성이 없어요.', paragraphs: sec05 },
      { id: '06', status: sec06.length ? 'ok' : 'unavailable', reason: '재물을 볼 표면 십성이 없어요.', paragraphs: sec06 },
      { id: '07', status: sec07.length ? 'ok' : 'unavailable', reason: '직업을 볼 표면 십성이 없어요.', paragraphs: sec07 },
      { id: '08', status: sec08.length ? 'ok' : 'unavailable', reason: '대운·세운 정보가 입력에 없어요.', paragraphs: sec08 }
    ],
    cautions: [],
    meta: { role: 'stub', arm: 'B', inputBoundary: 'chart+period' }
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
      ['analysis.deukryeong.bySeasonRank.rank', 'analysis.deukryeong.byMainQiTenGod.tenGod', 'analysis.roots.count', 'analysis.deukji.byStage.stage'], kbFor ? ['KB-MON-04'] : [])
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
      ['analysis.tenGodFacts.groupsByHiddenAll.' + g, 'analysis.deukse.groupCountsByHiddenAll.' + g], kbFor ? ['KB-TEN-04'] : []),
    para(pool,
      '일지 ' + c.pillars.day.hanja + '가 ' + c.pillars.day.stage + ' 자리에 있어서, 가까운 자리에서 쓰는 리듬도 같은 방식으로 굳어요. 혼자 있을 때와 사람 앞에 있을 때의 속도 차이가 이 자리에서 나와요.',
      ['chart.day.branch', 'analysis.deukji.byStage'], kbFor ? ['KB-ROOT-02'] : [])
  ];

  const hasJeonggwan = tg['정관'] > 0;
  const hasPyeongwan = tg['편관'] > 0;
  const hasPower = hasJeonggwan || hasPyeongwan;
  const s05 = [para(pool,
    '관계에서는 ' + (hasJeonggwan ? '기준과 약속을 먼저 확인하는 쪽' : (hasPyeongwan ? '결단과 추진을 먼저 보는 쪽' : top + '의 결을 먼저 읽는 쪽')) +
    '이에요. 가까워질 때도 상대의 속도를 재면서 들어가고, 한번 정하면 오래 끄는 편이에요.',
    ['analysis.tenGodFacts.bySurface.' + (hasJeonggwan ? '정관' : (hasPyeongwan ? '편관' : top)), 'analysis.hapchong'], kbFor ? ['KB-HAP-03'] : [])];

  const wealthG = a.deukse.groupCountsByHiddenAll.wealth || 0;
  const s06 = [para(pool,
    '돈은 ' + (wealthG > 0 ? '재성 자리를 통해' : '식상으로 만든 것을 통해') +
    ' 들어오고 나가는 구조예요. 크게 한 번보다 여러 번 들어오는 쪽이 맞고, 남는 것을 세는 습관이 성과를 만들어요.',
    ['analysis.deukse.groupCountsByHiddenAll.' + (wealthG > 0 ? 'wealth' : 'output'), 'analysis.elementFacts.share'], kbFor ? ['KB-TEN-03'] : [])];

  const powerG = a.deukse.groupCountsByHiddenAll.power || 0;
  const resG = a.deukse.groupCountsByHiddenAll.resource || 0;
  const s07 = [para(pool,
    '일하는 방식은 ' + (powerG > 0 ? '규칙과 책임이 분명한 자리에서' : '표현과 창작이 살아나는 자리에서') +
    ' 힘이 나요. ' + (resG > 0 ? '배움의 시간이 성과로 바뀌는 구조' : '경쟁과 승부 속에서 익히는 구조') + '라서, 새 일을 시작할 때 그 순서를 지키면 덜 지쳐요.',
    ['analysis.tenGodFacts.groupsByHiddenAll.' + (powerG > 0 ? 'power' : 'output'), 'analysis.tenGodFacts.groupsByHiddenAll.' + (resG > 0 ? 'resource' : 'peer')], kbFor ? ['KB-GEOK-08'] : [])];

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

/* ---------------- 검증기 자기시험용 probe 문서 ----------------
   정상 문서(docCD)의 §01(또는 지정 섹션)만 바꿔 끼운다. 그래야 잡음 없이
   '주입한 오류를 잡았는가'만 본다. */
function probeDoc(base, sectionId, paragraphs) {
  const doc = JSON.parse(JSON.stringify(base));
  doc.sections = doc.sections.map((s) => {
    if (s.id !== sectionId) return s;
    return Object.assign({}, s, { status: 'ok', reason: null, paragraphs });
  });
  return doc;
}

function anyPairNotInChart(ctx) {
  for (let i = 0; i < STEMS.length; i++) {
    for (let j = 0; j < BRANCHES.length; j++) {
      const pair = STEMS[i] + BRANCHES[j];
      if (!allowedGanzhi(ctx).has(pair)) return pair;
    }
  }
  return null;
}

function godDiffSurfaceHidden(ctx) {
  const tv = ctx.analysis.tenGodFacts;
  let best = null;
  TEN_GODS.forEach((g) => {
    const s = (tv.bySurface || {})[g] || 0;
    const h = (tv.byHiddenAll || {})[g] || 0;
    if (s !== h && h > 0 && (!best || h > best.h)) best = { god: g, surface: s, hidden: h };
  });
  return best;
}

/**
 * 검증기 probe — 기대 규칙별로 일부러 어긋난 문서를 만든다.
 * @param {object} ctx 기본 문맥
 * @param {Map} pool C 근거 풀
 * @param {object} opts { ctxs: Map<id, ctx>, kb: {entries}, poolFor: (ctx,arm)=>Map }
 */
export function probeDocs(ctx, pool, opts) {
  const o = opts || {};
  const ctxs = o.ctxs || new Map([[ctx.fixture.id, ctx]]);
  const poolFor = o.poolFor || ((c) => pool);
  const kb = o.kb || { entries: [] };
  const all = Array.from(ctxs.values());
  const first = (pred) => all.filter(pred)[0] || ctx;
  const out = {};

  const baseC = (c) => docCD(c || ctx, poolFor(c || ctx, 'C'), 'C');
  const baseD = (c) => docCD(c || ctx, poolFor(c || ctx, 'D'), 'D');

  const c0 = ctx;
  const pair = anyPairNotInChart(c0);
  const p0 = poolFor(c0, 'C');

  /* 1) V4 — 없는 간지 */
  out.hallucinatedGanzhi = {
    doc: probeDoc(baseC(c0), '01', [{ text: '민지 님은 ' + (pair || '갑자') + ' 일주로 태어나 물 기운이 강한 사람이에요. 그 결이 모든 판단에 먼저 나와요.', evidenceRefs: ['chart.day.stem'] }]),
    expect: 'V4',
    note: '명식에 없는 간지 쌍을 일주로 서술'
  };

  /* 2) V5 — 없는 십성 */
  const absentGod = TEN_GODS.filter((g) => !wonkukTenGodSet(c0).has(g) && !periodTenGodSet(c0).has(g))[0] || null;
  if (absentGod) {
    out.hallucinatedTenGod = {
      doc: probeDoc(baseC(c0), '01', [{ text: '민지 님은 ' + absentGod + '이 두드러지는 명식이라 밀어붙이는 힘이 세요. 그 힘이 관계에서도 그대로 나와요.', evidenceRefs: ['chart.day.stem'] }]),
      expect: 'V5',
      note: '이 명식에 없는 십성을 성격 근거로 서술'
    };
  }

  /* 3) V6 — 성립하지 않은 합충 */
  const noHap = !(c0.analysis.hapchong || []).some((h) => ['천간합', '육합', '삼합', '반합'].indexOf(h.kind) >= 0);
  if (noHap) {
    out.hallucinatedRelation = {
      doc: probeDoc(baseC(c0), '01', [{ text: '민지 님은 천간합이 성립하는 명식이라 사람을 붙잡는 힘이 강해요. 그 힘이 일에서도 반복돼요.', evidenceRefs: ['chart.day.stem'] }]),
      expect: 'V6',
      note: '성립하지 않은 천간합을 근거로 서술'
    };
  }

  /* 4) V2 — 근거 없음 */
  out.noEvidence = {
    doc: probeDoc(baseC(c0), '01', [{ text: '민지 님은 흐르는 물처럼 부드럽고, 속은 생각보다 단단한 사람이에요. 그 결이 오래 이어져요.', evidenceRefs: [] }]),
    expect: 'V2',
    note: '근거 ID 없이 성격을 단정'
  };

  /* 5) V3 — 입력 범위 밖 근거 (B 풀) */
  out.outOfPool = {
    doc: probeDoc(docCD(c0, poolFor(c0, 'B'), 'B'), '01', [{ text: '민지 님은 통근이 0개라 기반 없이 밀어붙이는 사람이에요. 그 방식이 오래 반복돼요.', evidenceRefs: ['analysis.roots.count'] }]),
    expect: 'V3',
    arm: 'B',
    note: 'B 가 볼 수 없는 analysisData 근거를 인용'
  };

  /* 6) V8 — 단정 */
  out.certainty = {
    doc: probeDoc(baseC(c0), '01', [{ text: '민지 님은 올해 반드시 좋은 자리로 옮겨 가요. 틀림없이 그렇게 됩니다.', evidenceRefs: ['chart.day.stem'] }]),
    expect: 'V8',
    note: '반드시·틀림없이로 미래를 단정'
  };

  /* 7) V9 — 민감 주제 */
  out.sensitive = {
    doc: probeDoc(baseC(c0), '01', [{ text: '민지 님은 올해 수술을 절대 피해야 해요. 주식은 하지 마세요.', evidenceRefs: ['chart.day.stem'] }]),
    expect: 'V9',
    note: '수술·주식에 대한 판정'
  };

  /* 8) V7 — 금지 판정어 */
  out.bannedVerdict = {
    doc: probeDoc(baseC(c0), '01', [{ text: '민지 님은 신강한 편이라 용신이 화로 잡히는 명식이에요. 그래서 밀어붙이는 힘이 세요.', evidenceRefs: ['chart.day.stem'] }]),
    expect: 'V7',
    note: '신강·용신을 근거 없이 확정'
  };

  /* 9) V13 — D 인데 KB 근거 없음 */
  out.missingKb = {
    doc: probeDoc(baseD(c0), '01', [{ text: '민지 님은 ' + c0.analysis.dayMaster.stem + ' 일간으로 ' + c0.analysis.monthCommand.branch + '월에 태어났어요. 계절의 결이 성향의 바탕을 만들어요.', evidenceRefs: ['chart.day.stem'], analysisRefs: ['analysis.deukryeong'] }]),
    expect: 'V13',
    arm: 'D',
    note: 'D 인데 kbRefs 없이 해석'
  };

  /* 10) V15 — 상충 축 한쪽만 인용 */
  let ob2 = null;
  let obCtx = null;
  all.forEach((c) => {
    conflictObligations(c, poolFor(c, 'C')).filter((x) => x.reachable && x.requires.length >= 2).forEach((x) => {
      if (!ob2) { ob2 = x; obCtx = c; }
    });
  });
  if (ob2) {
    const left = ob2.requires[0];
    out.conflictOneSide = {
      doc: probeDoc(baseC(obCtx), '03', [{
        text: '민지 님은 월지에서 나오는 한쪽 판독이 강하게 서는 사람이에요. 그래서 같은 방식이 반복되고, 그 방식이 관계에서도 그대로 나와요.',
        evidenceRefs: [left]
      }]),
      expect: 'V15',
      note: '상충 축의 한쪽 근거만 인용',
      ctxOverride: obCtx,
      poolOverride: poolFor(obCtx, 'C')
    };

    /* 11) V15(강화) — 상충 근거를 서로 다른 문단에 나눠 배치하고 조건 설명 없이 통과 시도 */
    const right = ob2.requires[1];
    const base2 = baseC(obCtx);
    const docSplit = probeDoc(base2, '02', [{
      text: '민지 님은 첫 번째 근거 쪽 판독만 보면 기세가 강한 사람이에요. 그 기세가 앞에 나서는 방식이에요.',
      evidenceRefs: [left]
    }]);
    docSplit.sections = docSplit.sections.map((s) => (s.id === '03' ? Object.assign({}, s, {
      status: 'ok', reason: null,
      paragraphs: [{ text: '두 번째 근거 쪽 판독은 안쪽에서 버티는 힘이에요. 그래서 오래 가는 방식이 달라요.', evidenceRefs: [right] }]
    }) : s));
    out.splitConflict = {
      doc: docSplit, expect: 'V15', ctxOverride: obCtx, poolOverride: poolFor(obCtx, 'C'),
      note: '양쪽을 §02·§03 에 나눠 두고 조건을 말하지 않음'
    };
  }

  /* 12) V16 — 유효한 근거 ID + 무관한 내용 */
  out.unrelatedEvidence = {
    doc: probeDoc(baseC(c0), '01', [{
      text: '민지 님은 주말마다 빵을 굽고 손님을 초대해 식탁을 차리는 사람이에요. 그 손끝의 시간이 하루의 중심이에요.',
      evidenceRefs: ['analysis.tenGodFacts.bySurface.정관']
    }]),
    expect: 'V16',
    note: '실재하는 십성 근거를 붙였지만 문단이 그 사실을 쓰지 않음'
  };

  /* 13) V17 — 실재하는 글자를 틀린 기둥에 배치 */
  const pc = first((c) => c.chart.pillars.month && c.chart.pillars.day && c.chart.pillars.month.hanja.slice(1) !== c.chart.pillars.day.hanja.slice(1));
  const posPool = poolFor(pc, 'C');
  out.wrongPillarPlacement = {
    doc: probeDoc(baseC(pc), '01', [{
      text: '민지 님은 월지가 ' + pc.chart.pillars.day.hanja.slice(1) + '이고 일지가 ' + pc.chart.pillars.month.hanja.slice(1) +
        '예요. 그 자리에서 오는 기운이 사람을 대하는 기본 태도를 만들어요.',
      evidenceRefs: ['chart.month.branch']
    }]),
    expect: 'V17',
    ctxOverride: pc,
    poolOverride: posPool,
    note: '일지 글자를 월지라고 서술'
  };

  /* 14) V18 — 표면/지장간 십성 개수 층위 혼동 */
  const diff = godDiffSurfaceHidden(c0);
  if (diff) {
    out.surfaceHiddenCount = {
      doc: probeDoc(baseC(c0), '01', [{
        text: '민지 님은 겉으로 드러난 ' + diff.god + '이 ' + diff.hidden + '개예요. 그 결이 사람을 대하는 방식에 그대로 나와요.',
        evidenceRefs: ['analysis.tenGodFacts.bySurface.' + diff.god]
      }]),
      expect: 'V18',
      note: '표면 ' + diff.surface + '개인데 지장간 전체 ' + diff.hidden + '개를 표면처럼 말함'
    };
  }

  /* 15) V19 — 원국과 대운·세운의 십성 혼동 */
  let pdCase = null;
  all.forEach((c) => {
    if (pdCase) return;
    const wk = wonkukTenGodSet(c);
    const pd = periodTenGodSet(c);
    const only = Array.from(pd).filter((g) => g && !wk.has(g))[0];
    if (only && c.period && c.period.daewoon) pdCase = { ctx: c, god: only };
  });
  if (pdCase) {
    out.wonkukDaewoonConfusion = {
      doc: probeDoc(baseC(pdCase.ctx), '01', [{
        text: '민지 님은 원국에 ' + pdCase.god + '이 자리하고 있어서 타고난 성격이 그쪽으로 기울어요. 그래서 어릴 때부터 그 방식이 나왔어요.',
        evidenceRefs: ['period.daewoon.stemTenGod', 'period.seun.stemTenGod']
      }]),
      expect: 'V19',
      ctxOverride: pdCase.ctx,
      poolOverride: poolFor(pdCase.ctx, 'C'),
      note: '대운·세운에만 있는 십성을 원국 사실처럼 서술'
    };
  }

  /* 16) V20 — 시주 미상인데 시주 해석 */
  const hourless = first((c) => c.analysis.flags.hourUnknown);
  if (hourless.analysis.flags.hourUnknown) {
    out.hourUnknownInterpretation = {
      doc: probeDoc(baseC(hourless), '01', [{
        text: '민지 님은 시주가 오후의 기운으로 서 있어서 저녁에 힘이 올라오는 사람이에요. 그 시간대에 결정을 하면 풀리는 편이에요.',
        evidenceRefs: ['chart.day.stem']
      }]),
      expect: 'V20',
      ctxOverride: hourless,
      poolOverride: poolFor(hourless, 'C'),
      note: '시주 미상인데 시주를 해석'
    };
  }

  /* 17) V21 — 필수 섹션을 unavailable 로 검사 회피 */
  const dodge = JSON.parse(JSON.stringify(baseC(c0)));
  dodge.sections = dodge.sections.map((s) => (s.id === '01'
    ? s
    : Object.assign({}, s, { status: 'unavailable', reason: '검사 대상이 아니라 비워요.', paragraphs: [] })));
  out.unavailableDodge = {
    doc: dodge,
    expect: 'V21',
    note: '§02~§08 을 사유 없이 비워 검사에서 빼려는 구성'
  };

  /* 18) 정상 문서 — 검증기를 통과해야 한다(오탐 검사) */
  out.good = { doc: baseD(c0), expect: null, note: '정상 문서 — 검증기가 오탐하지 않는지' };

  return out;
}
