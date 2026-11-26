/* [자동 생성] 원본: apps/nyang-saju/src/rules/findings.js — tools/sync-engine.mjs 로 복사됨. 이 파일을 직접 고치지 마세요. */
/* ==========================================================================
   rules/findings.js — 명식 → Finding[] (판정 단위)
   --------------------------------------------------------------------------
   문장은 이 Finding 의 id(requires/forbids)로만 선택되고, 근거 칩은 Finding 의
   display·evidence 에서만 만들어진다. 여기서는 문자열 문장을 만들지 않는다.

   이번 판본의 판정 범위 — 자평명리 기본 체계만:
     일간 · 월령(월지) · 오행 표면 개수 · 지장간 · 십성 · 12운성 ·
     검증된 천간합/충, 지지 육합/삼합/충/형/파/해
   격국·신강신약·용신은 넣지 않는다(docs/gyeokguk-singang-proposal.md 참고).
   ========================================================================== */
(function (global) {
  'use strict';

  var T = global.NyangTables;
  if (!T) throw new Error('rules: tables 가 먼저 로드되어야 합니다.');

  var STEMS = T.STEMS, STEMS_HANJA = T.STEMS_HANJA, BRANCHES = T.BRANCHES, BRANCHES_HANJA = T.BRANCHES_HANJA;
  var ELEM_KO = T.ELEM_KO, ELEM_HANJA = T.ELEM_HANJA, ELEMS = T.ELEMS;
  var BRANCH_ELEM = T.BRANCH_ELEM, STEM_ELEM = T.STEM_ELEM;

  var PILLAR_KO = { year: '년', month: '월', day: '일', hour: '시' };

  function pctText(n) { return (Math.round(n * 10) / 10) + '%'; }

  function evidenceForElem(chart, elem) {
    var out = [];
    chart.list.forEach(function (p) {
      var key = p === chart.pillars.hour ? 'hour' : (p === chart.pillars.year ? 'year' : (p === chart.pillars.month ? 'month' : 'day'));
      if (p.stemElem === elem) out.push({ pillar: key, slot: 'stem', char: STEMS_HANJA[p.stem], elem: elem });
      if (p.branchElem === elem) out.push({ pillar: key, slot: 'branch', char: BRANCHES_HANJA[p.branch], elem: elem });
    });
    return out;
  }

  function relLabel(kind) {
    return { same: '같은 기운', makes: '내가 낳는 기운', kills: '내가 누르는 기운', killed: '나를 누르는 기운', cycle: '나를 낳는 기운' }[kind];
  }

  function coreFindings(chart) {
    var f = [];
    var dm = chart.dayMaster;
    var dmElem = chart.dayMasterElem;

    f.push({
      id: 'DAY.MASTER.' + dm, ruleId: 'DAY-01', domain: 'nature',
      claim: { subject: '일간', value: STEMS[dm] + ELEM_KO[dmElem] },
      display: { short: '일간 ' + chart.dayMasterName, long: '일간이 ' + STEMS_HANJA[dm] + '(' + chart.dayMasterName + ')이에요.' },
      evidence: [{ pillar: 'day', slot: 'stem', char: STEMS_HANJA[dm], elem: dmElem }],
      conditions: [{ field: 'dayMaster', op: '==', value: dm }],
      polarity: 'neutral'
    });

    f.push({
      id: 'MONTH.BRANCH.' + chart.monthBranch, ruleId: 'MON-01', domain: 'nature',
      claim: { subject: '월령', value: BRANCHES[chart.monthBranch] },
      display: { short: '월령 ' + BRANCHES_HANJA[chart.monthBranch] + '(' + ELEM_KO[chart.monthElem] + ')', long: '태어난 달의 지지가 ' + BRANCHES_HANJA[chart.monthBranch] + '(' + BRANCHES[chart.monthBranch] + ')라 계절의 기운은 ' + ELEM_KO[chart.monthElem] + '이에요.' },
      evidence: [{ pillar: 'month', slot: 'branch', char: BRANCHES_HANJA[chart.monthBranch], elem: BRANCH_ELEM[chart.monthBranch] }],
      conditions: [{ field: 'monthBranch', op: '==', value: chart.monthBranch }],
      polarity: 'neutral'
    });

    ELEMS.forEach(function (e) {
      f.push({
        id: 'ELEM.COUNT.' + e + '.' + chart.counts[e], ruleId: 'ELEM-01', domain: 'nature',
        claim: { subject: e, predicate: '표면 개수', value: chart.counts[e] },
        display: { short: ELEM_KO[e] + ' ' + chart.counts[e] + '개(' + pctText(chart.share[e]) + ')', long: ELEM_KO[e] + '이 ' + chart.counts[e] + '개로 ' + pctText(chart.share[e]) + '예요.' },
        evidence: evidenceForElem(chart, e),
        conditions: [{ field: 'counts.' + e, op: '==', value: chart.counts[e] }],
        polarity: 'neutral'
      });
    });

    var tied = chart.tiedMax;
    var joined = tied.join('');
    if (tied.length > 1) {
      f.push({
        id: 'ELEM.TIE.' + joined + '.' + chart.elements.maxCount, ruleId: 'ELEM-02', domain: 'nature',
        claim: { subject: tied.map(function (e) { return ELEM_KO[e]; }).join('·'), predicate: '공동 최다', value: chart.elements.maxCount },
        display: {
          short: tied.map(function (e) { return ELEM_KO[e] + ' ' + chart.counts[e]; }).join(' · '),
          long: tied.map(function (e) { return ELEM_KO[e]; }).join('·') + '이 각각 ' + chart.elements.maxCount + '개(' + pctText(chart.share[tied[0]]) + ')로 같아요.'
        },
        evidence: tied.reduce(function (acc, e) { return acc.concat(evidenceForElem(chart, e)); }, []),
        conditions: [{ field: 'tiedMax', op: 'includes-all', value: tied }],
        polarity: 'neutral'
      });
    } else {
      f.push({
        id: 'ELEM.MAX.' + tied[0] + '.' + chart.elements.maxCount, ruleId: 'ELEM-03', domain: 'nature',
        claim: { subject: ELEM_KO[tied[0]], predicate: '표면 최다', value: chart.elements.maxCount },
        display: { short: ELEM_KO[tied[0]] + ' ' + chart.elements.maxCount + '개(' + pctText(chart.share[tied[0]]) + ')', long: ELEM_KO[tied[0]] + '이 ' + chart.elements.maxCount + '개로 표면에서 가장 많아요.' },
        evidence: evidenceForElem(chart, tied[0]),
        conditions: [{ field: 'counts.' + tied[0], op: '==', value: chart.elements.maxCount }],
        polarity: 'neutral'
      });
    }

    chart.lacking.forEach(function (e) {
      f.push({
        id: 'ELEM.LACK.' + e, ruleId: 'ELEM-04', domain: 'nature',
        claim: { subject: e, predicate: '표면 개수 0', value: 0 },
        display: { short: ELEM_KO[e] + ' 0개', long: '표면 여덟 글자에 ' + ELEM_KO[e] + ' 기운이 하나도 없어요.' },
        evidence: [],
        conditions: [{ field: 'counts.' + e, op: '==', value: 0 }],
        polarity: 'neutral'
      });
    });
    if (chart.lacking.length === 0) {
      var min = chart.elements.minCount;
      chart.tiedMin.forEach(function (e) {
        f.push({
          id: 'ELEM.MIN.' + e + '.' + min, ruleId: 'ELEM-05', domain: 'nature',
          claim: { subject: e, predicate: '표면 최소', value: min },
          display: { short: ELEM_KO[e] + ' ' + min + '개', long: ELEM_KO[e] + '이 ' + min + '개로 가장 얇아요.' },
          evidence: evidenceForElem(chart, e),
          conditions: [{ field: 'counts.' + e, op: '==', value: min }],
          polarity: 'neutral'
        });
      });
    }

    chart.weightedTop.forEach(function (e) {
      f.push({
        id: 'ELEM.WEIGHTED.TOP.' + e, ruleId: 'ELEM-06', domain: 'nature',
        claim: { subject: e, predicate: '지장간 가중', value: chart.weighted[e] },
        display: { short: '지장간 가중 ' + ELEM_KO[e] + ' ' + pctText(chart.weighted[e]), long: '지장간까지 무게를 주면 ' + ELEM_KO[e] + '이 ' + pctText(chart.weighted[e]) + '로 가장 무거워요.' },
        evidence: evidenceForElem(chart, e),
        conditions: [{ field: 'weighted.' + e, op: '==', value: chart.weighted[e] }],
        polarity: 'neutral'
      });
    });

    var topTen = T.TEN_ORDER.map(function (t) { return { god: t, n: chart.tenCount[t] || 0 }; })
      .filter(function (x) { return x.n > 0; })
      .sort(function (a, b) { return b.n - a.n || T.TEN_ORDER.indexOf(a.god) - T.TEN_ORDER.indexOf(b.god); });
    var topN = topTen.length ? topTen[0].n : 0;
    var topGods = topTen.filter(function (x) { return x.n === topN; }).map(function (x) { return x.god; });

    T.TEN_ORDER.forEach(function (god) {
      var n = chart.tenCount[god] || 0;
      if (n > 0) {
        f.push({
          id: 'TEN.COUNT.' + god + '.' + n, ruleId: 'TEN-01', domain: 'nature',
          claim: { subject: god, predicate: '개수', value: n },
          display: { short: god + ' ' + n, long: god + '이 ' + n + '개 보여요.' },
          evidence: [], conditions: [{ field: 'tenCount.' + god, op: '==', value: n }], polarity: 'neutral'
        });
      } else {
        f.push({
          id: 'TEN.ABSENT.' + god, ruleId: 'TEN-02', domain: 'nature',
          claim: { subject: god, predicate: '개수', value: 0 },
          display: { short: god + ' 0', long: god + '은 표면에 없어요.' },
          evidence: [], conditions: [{ field: 'tenCount.' + god, op: '==', value: 0 }], polarity: 'neutral'
        });
      }
    });
    if (topGods.length > 1) {
      f.push({
        id: 'TEN.TIE.' + topGods.join('') + '.' + topN, ruleId: 'TEN-03', domain: 'nature',
        claim: { subject: topGods.join('·'), predicate: '공동 최다', value: topN },
        display: { short: topGods.map(function (g) { return g + ' ' + topN; }).join(' · '), long: topGods.join('과 ') + '이 각각 ' + topN + '개로 같아요.' },
        evidence: [], conditions: [{ field: 'topGods', op: 'includes-all', value: topGods }], polarity: 'neutral'
      });
    } else if (topGods.length) {
      f.push({
        id: 'TEN.TOP.' + topGods[0] + '.' + topN, ruleId: 'TEN-04', domain: 'nature',
        claim: { subject: topGods[0], predicate: '최다', value: topN },
        display: { short: topGods[0] + ' ' + topN, long: topGods[0] + '이 ' + topN + '개로 가장 많아요.' },
        evidence: [], conditions: [{ field: 'tenCount.' + topGods[0], op: '==', value: topN }], polarity: 'neutral'
      });
    }

    var groupCount = { peer: 0, output: 0, wealth: 0, power: 0, resource: 0 };
    T.TEN_ORDER.forEach(function (g) { groupCount[T.GOD_GROUP[g]] += chart.tenCount[g] || 0; });
    var gMax = 0;
    Object.keys(groupCount).forEach(function (k) { if (groupCount[k] > gMax) gMax = groupCount[k]; });
    Object.keys(groupCount).forEach(function (k) {
      if (groupCount[k] === gMax && gMax > 0) {
        f.push({
          id: 'GOD.GROUP.' + k + '.' + gMax, ruleId: 'TEN-05', domain: 'nature',
          claim: { subject: k, predicate: '묶음 최다', value: gMax },
          display: { short: groupLabel(k) + ' ' + gMax, long: groupLabel(k) + ' 기운이 ' + gMax + '개로 가장 많아요.' },
          evidence: [], conditions: [{ field: 'group.' + k, op: '==', value: gMax }], polarity: 'neutral'
        });
      }
    });

    var strongElem = chart.tiedMax[0];
    var rel = relOf(dmElem, strongElem);
    f.push({
      id: 'REL.DAY.' + rel, ruleId: 'REL-01', domain: 'nature',
      claim: { subject: '일간과 최다 오행', value: rel },
      display: { short: '일간 ' + ELEM_KO[dmElem] + ' ↔ ' + ELEM_KO[strongElem] + ' · ' + relLabel(rel), long: '일간 ' + ELEM_HANJA[dmElem] + ' 기준으로 가장 많은 ' + ELEM_KO[strongElem] + '은 ' + relLabel(rel) + '이에요.' },
      evidence: evidenceForElem(chart, strongElem),
      conditions: [{ field: 'rel', op: '==', value: rel }], polarity: 'neutral'
    });

    f.push({
      id: 'DAY.STAGE.' + chart.pillars.day.stage, ruleId: 'DAY-02', domain: 'nature',
      claim: { subject: '일지', value: chart.pillars.day.stage },
      display: { short: '일지 ' + BRANCHES_HANJA[chart.pillars.day.branch] + ' · ' + chart.pillars.day.stage, long: '일지 ' + BRANCHES_HANJA[chart.pillars.day.branch] + '에서 일간의 기세는 ' + chart.pillars.day.stage + '예요.' },
      evidence: [{ pillar: 'day', slot: 'branch', char: BRANCHES_HANJA[chart.pillars.day.branch], elem: chart.pillars.day.branchElem }],
      conditions: [{ field: 'dayStage', op: '==', value: chart.pillars.day.stage }], polarity: 'neutral'
    });

    if (chart.hiddenElems.length) {
      f.push({
        id: 'ELEM.HIDDEN.' + chart.hiddenElems.join(''), ruleId: 'ELEM-07', domain: 'nature',
        claim: { subject: chart.hiddenElems.join('·'), predicate: '지장간에만 있음', value: true },
        display: { short: '지장간 ' + chart.hiddenElems.map(function (e) { return ELEM_KO[e]; }).join('·'), long: '겉으로는 안 보이지만 지장간에 ' + chart.hiddenElems.map(function (e) { return ELEM_KO[e]; }).join('·') + '이 숨어 있어요.' },
        evidence: [], conditions: [{ field: 'hiddenElems', op: 'includes-all', value: chart.hiddenElems }], polarity: 'neutral'
      });
    }

    /* 관계 — 성립한 것만. 길흉 점수는 만들지 않는다. */
    var positions = ['year', 'month', 'day', 'hour'];
    for (var i = 0; i < positions.length; i++) {
      for (var j = i + 1; j < positions.length; j++) {
        var a = chart.pillars[positions[i]], b = chart.pillars[positions[j]];
        if (!a || !b) continue;
        if (T.STEM_HAP[a.stem] === b.stem) f.push(relFinding('HAP.STEM', '천간합', a, b, positions[i], positions[j], STEMS_HANJA[a.stem] + STEMS_HANJA[b.stem]));
        if (T.STEM_CLASH[a.stem] === b.stem) f.push(relFinding('CHUNG.STEM', '천간충', a, b, positions[i], positions[j], STEMS_HANJA[a.stem] + STEMS_HANJA[b.stem]));
        if (T.SIX_HAP[a.branch] === b.branch) f.push(relFinding('HAP.BRANCH', '육합', a, b, positions[i], positions[j], BRANCHES_HANJA[a.branch] + BRANCHES_HANJA[b.branch]));
        if (((a.branch - b.branch) % 12 + 12) % 12 === 6) f.push(relFinding('CHUNG.BRANCH', '육충', a, b, positions[i], positions[j], BRANCHES_HANJA[a.branch] + BRANCHES_HANJA[b.branch]));
        if (pairIn(T.HYEONG, a.branch, b.branch) || (a.branch === b.branch && T.HYEONG.some(function (p) { return p[0] === p[1]; }))) {
          f.push(relFinding('HYEONG.BRANCH', '형', a, b, positions[i], positions[j], BRANCHES_HANJA[a.branch] + BRANCHES_HANJA[b.branch]));
        }
        if (pairIn(T.PA, a.branch, b.branch)) f.push(relFinding('PA.BRANCH', '파', a, b, positions[i], positions[j], BRANCHES_HANJA[a.branch] + BRANCHES_HANJA[b.branch]));
        if (pairIn(T.HAE, a.branch, b.branch)) f.push(relFinding('HAE.BRANCH', '해', a, b, positions[i], positions[j], BRANCHES_HANJA[a.branch] + BRANCHES_HANJA[b.branch]));
      }
    }
    T.SAMHAP.forEach(function (g) {
      var present = g.branches.filter(function (br) {
        return chart.list.some(function (p) { return p.branch === br; });
      });
      if (present.length === 3) {
        f.push({
          id: 'SAMHAP.' + g.name, ruleId: 'REL-02', domain: 'nature',
          claim: { subject: g.name, predicate: '삼합 성립', value: true },
          display: { short: '삼합 ' + g.name, long: BRANCHES_HANJA[g.branches[0]] + BRANCHES_HANJA[g.branches[1]] + BRANCHES_HANJA[g.branches[2]] + ' 삼합이 다 모였어요.' },
          evidence: g.branches.map(function (br) { return { pillar: 'branch', slot: 'branch', char: BRANCHES_HANJA[br], elem: BRANCH_ELEM[br] }; }),
          conditions: [{ field: 'branches', op: 'includes-all', value: g.branches }], polarity: 'neutral'
        });
      }
    });

    /* 도화 — 신살 표시일 뿐 판정이 아니다. 렌더 층에서 만들지 않고 여기서 한 번만 낸다.
       (v2.4: render/select.js 의 FLAG.DOHWA 합성을 이곳으로 옮겼다) */
    if (chart.dohwa) {
      f.push({
        id: 'FLAG.DOHWA', ruleId: 'FLAG-05', domain: 'nature',
        claim: { subject: '도화', predicate: '지지에 앉음', value: true },
        display: { short: '도화', long: '도화가 앉아 있어요.' },
        evidence: [], conditions: [{ field: 'dohwa', op: '==', value: true }], polarity: 'neutral'
      });
    }

    if (chart.flags.hourUnknown) {
      f.push({
        id: 'HOUR.UNKNOWN', ruleId: 'FLAG-01', domain: 'nature',
        claim: { subject: '시주', predicate: '미상', value: true },
        display: { short: '시주 없음 · 여섯 글자', long: '출생시간을 몰라 시주를 빼고 여섯 글자로 봤어요.' },
        evidence: [], conditions: [{ field: 'hourUnknown', op: '==', value: true }], polarity: 'neutral'
      });
    }
    if (chart.flags.termEdge) {
      f.push({
        id: 'FLAG.TERM_EDGE', ruleId: 'FLAG-02', domain: 'timing',
        claim: { subject: '절입', predicate: '시진 안', value: chart.flags.termEdgeTerm },
        display: { short: '절입 경계 ' + (chart.flags.termEdgeTerm || ''), long: '태어난 시진 안에 절입이 있어요. 만세력마다 월주가 갈릴 수 있어요.' },
        evidence: [], conditions: [{ field: 'termEdge', op: '==', value: true }], polarity: 'neutral'
      });
    }
    if (chart.flags.ziEdge) {
      f.push({
        id: 'FLAG.ZI_EDGE', ruleId: 'FLAG-03', domain: 'timing',
        claim: { subject: '자시', predicate: '날짜 경계', value: chart.hour ? chart.hour.side : null },
        display: { short: '자시 경계', long: '자시는 23:00~00:59라 날짜 경계에 걸쳐요.' },
        evidence: [], conditions: [{ field: 'ziEdge', op: '==', value: true }], polarity: 'neutral'
      });
    }
    if (chart.flags.dstApplied) {
      f.push({
        id: 'FLAG.DST', ruleId: 'FLAG-04', domain: 'timing',
        claim: { subject: '서머타임', predicate: '보정', value: true },
        display: { short: '법정 시계 보정', long: '그 시기 한국 법정 시계(서머타임·UTC+8:30)로 보정했어요.' },
        evidence: [], conditions: [{ field: 'dstApplied', op: '==', value: true }], polarity: 'neutral'
      });
    }

    return f;
  }

  function groupLabel(k) {
    return { peer: '비견·겁재', output: '식신·상관', wealth: '편재·정재', power: '편관·정관', resource: '편인·정인' }[k] || k;
  }
  function relOf(me, other) {
    if (me === other) return 'same';
    if (T.ELEM_MAKES[me] === other) return 'makes';
    if (T.ELEM_KILLS[me] === other) return 'kills';
    if (T.ELEM_KILLS[other] === me) return 'killed';
    if (T.ELEM_MAKES[other] === me) return 'cycle';
    return 'same';
  }
  function pairIn(table, a, b) {
    return table.some(function (p) { return (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a); });
  }
  function relFinding(kind, name, a, b, pa, pb, chars) {
    return {
      id: kind + '.' + chars, ruleId: 'REL-03', domain: 'nature',
      claim: { subject: name, value: chars },
      display: { short: name + ' ' + chars, long: PILLAR_KO[pa] + '기둥과 ' + PILLAR_KO[pb] + '기둥에 ' + name + '(' + chars + ')이 성립해요.' },
      evidence: [
        { pillar: pa, slot: 'stem', char: chars.charAt(0), elem: null },
        { pillar: pb, slot: 'stem', char: chars.charAt(1), elem: null }
      ],
      conditions: [{ field: 'relations', op: 'includes', value: kind + '.' + chars }],
      polarity: 'neutral'
    };
  }

  /* ---------------- 조회 시점 판정 ---------------- */

  function periodFindings(period) {
    var f = [];
    if (!period) return f;
    var p = period;
    f.push({
      id: 'PERIOD.SEUN.' + p.seun.ko, ruleId: 'FLOW-01', domain: 'timing',
      claim: { subject: '세운', value: p.seun.ko },
      display: { short: '올해 ' + p.seun.hanja, long: p.seun.fromLabel ? (p.seun.fromLabel + ' 입춘부터 ' + p.seun.hanja + '(' + p.seun.ko + ') 세운이에요.') : ('올해 세운은 ' + p.seun.ko + '이에요.') },
      evidence: [{ pillar: 'year', slot: 'seun', char: p.seun.hanja, elem: null }],
      conditions: [{ field: 'seun', op: '==', value: p.seun.ko }], polarity: 'neutral'
    });
    f.push({
      id: 'PERIOD.SEUN.STEM.' + p.seun.stemTen, ruleId: 'FLOW-02', domain: 'timing',
      claim: { subject: '세운 천간', value: p.seun.stemTen },
      display: { short: '세운 천간 ' + p.seun.stemTen, long: '올해 천간은 일간에게 ' + p.seun.stemTen + '이에요.' },
      evidence: [{ pillar: 'year', slot: 'seun', char: p.seun.hanja.charAt(0), elem: p.seun.stemElem }],
      conditions: [{ field: 'seunStemTen', op: '==', value: p.seun.stemTen }], polarity: 'neutral'
    });
    f.push({
      id: 'PERIOD.SEUN.BRANCH.' + p.seun.branchTen, ruleId: 'FLOW-03', domain: 'timing',
      claim: { subject: '세운 지지', value: p.seun.branchTen },
      display: { short: '세운 지지 ' + p.seun.branchTen, long: '올해 지지는 일간에게 ' + p.seun.branchTen + '이에요.' },
      evidence: [{ pillar: 'year', slot: 'seun', char: p.seun.hanja.charAt(1), elem: p.seun.branchElem }],
      conditions: [{ field: 'seunBranchTen', op: '==', value: p.seun.branchTen }], polarity: 'neutral'
    });

    if (p.daewoon) {
      f.push({
        id: 'PERIOD.DAEWOON.' + p.daewoon.ko, ruleId: 'FLOW-04', domain: 'timing',
        claim: { subject: '대운', value: p.daewoon.ko },
        display: { short: '대운 ' + p.daewoon.hanja, long: '지금 대운은 ' + p.daewoon.hanja + '(' + p.daewoon.ko + ') ' + p.daewoon.ageRange[0] + '~' + p.daewoon.ageRange[1] + '세 구간이에요.' },
        evidence: [{ pillar: 'daewoon', slot: 'pillar', char: p.daewoon.hanja, elem: null }],
        conditions: [{ field: 'daewoon', op: '==', value: p.daewoon.ko }], polarity: 'neutral'
      });
      f.push({
        id: 'PERIOD.DAEWOON.STEM.' + p.daewoon.stemTen, ruleId: 'FLOW-05', domain: 'timing',
        claim: { subject: '대운 천간', value: p.daewoon.stemTen },
        display: { short: '대운 천간 ' + p.daewoon.stemTen, long: '대운 천간은 일간에게 ' + p.daewoon.stemTen + '이에요.' },
        evidence: [{ pillar: 'daewoon', slot: 'stem', char: p.daewoon.hanja.charAt(0), elem: null }],
        conditions: [{ field: 'daewoonStemTen', op: '==', value: p.daewoon.stemTen }], polarity: 'neutral'
      });
      f.push({
        id: 'PERIOD.DAEWOON.BRANCH.' + p.daewoon.branchTen, ruleId: 'FLOW-06', domain: 'timing',
        claim: { subject: '대운 지지', value: p.daewoon.branchTen },
        display: { short: '대운 지지 ' + p.daewoon.branchTen, long: '대운 지지는 일간에게 ' + p.daewoon.branchTen + '이에요.' },
        evidence: [{ pillar: 'daewoon', slot: 'branch', char: p.daewoon.hanja.charAt(1), elem: null }],
        conditions: [{ field: 'daewoonBranchTen', op: '==', value: p.daewoon.branchTen }], polarity: 'neutral'
      });
    } else {
      f.push({
        id: 'PERIOD.NO_DAEWOON', ruleId: 'FLOW-07', domain: 'timing',
        claim: { subject: '대운', predicate: '전 구간', value: true },
        display: { short: '대운 전', long: '아직 첫 대운이 열리기 전이에요.' },
        evidence: [], conditions: [{ field: 'daewoon', op: '==', value: null }], polarity: 'neutral'
      });
    }
    return f;
  }

  /* ---------------- analysisData → 사실 Finding ----------------
     analysisData 는 사실의 묶음이고, 화면·비교 하네스는 Finding 을 통해서만 그것을 인용한다.
     여기서도 판정(격 확정·강약·용신)은 만들지 않는다. 값은 전부 사실 그대로다. */

  var GOD_GROUP_KO = { peer: '비겁', output: '식상', wealth: '재성', power: '관성', resource: '인성' };

  function analysisFindings(a) {
    var f = [];
    if (!a) return f;
    var mc = a.monthCommand, dm = a.dayMaster;

    f.push({
      id: 'AN.MONTH.TYPE.' + mc.monthType, ruleId: 'ANA-01', domain: 'nature',
      claim: { subject: '월지', predicate: '분류', value: mc.monthType },
      display: { short: '월령 ' + mc.branch + ' · ' + mc.monthType, long: '월지는 ' + mc.branch + '로 ' + mc.monthType + '이고 계절은 ' + mc.season + '이에요.' },
      evidence: [{ pillar: 'month', slot: 'branch', char: mc.branch, elem: mc.branchElem }],
      conditions: [{ field: 'monthType', op: '==', value: mc.monthType }], polarity: 'neutral'
    });

    f.push({
      id: 'AN.SEASON.RANK.' + mc.wangXiang[dm.elem], ruleId: 'ANA-02', domain: 'nature',
      claim: { subject: '일간의 계절 자리', value: mc.wangXiang[dm.elem] },
      display: { short: '계절 ' + mc.wangXiang[dm.elem], long: '일간 ' + dm.elem + '은 ' + mc.season + '에 ' + mc.wangXiang[dm.elem] + ' 자리예요.' },
      evidence: [{ pillar: 'month', slot: 'branch', char: mc.branch, elem: mc.branchElem }],
      conditions: [{ field: 'seasonRank', op: '==', value: mc.wangXiang[dm.elem] }], polarity: 'neutral'
    });

    var dr = a.deukryeong;
    f.push({
      id: 'AN.DEUKRYEONG.ELEMENT.' + (dr.byElementCycle.supported ? 'YES' : 'NO'), ruleId: 'ANA-03', domain: 'nature',
      claim: { subject: '득령 · 오행 생조', value: dr.byElementCycle.relation },
      display: { short: '월령 ' + dr.byElementCycle.relation, long: '월지 오행은 일간에게 ' + dr.byElementCycle.relation + '예요.' },
      evidence: [], conditions: [{ field: 'deukryeong.byElementCycle', op: '==', value: dr.byElementCycle.relation }], polarity: 'neutral'
    });
    f.push({
      id: 'AN.DEUKRYEONG.SEASON.' + dr.bySeasonRank.rank, ruleId: 'ANA-04', domain: 'nature',
      claim: { subject: '득령 · 왕상휴수사', value: dr.bySeasonRank.rank },
      display: { short: '왕상휴수사 ' + dr.bySeasonRank.rank, long: '계절 표에서 일간은 ' + dr.bySeasonRank.rank + '예요.' },
      evidence: [], conditions: [{ field: 'deukryeong.bySeasonRank', op: '==', value: dr.bySeasonRank.rank }], polarity: 'neutral'
    });
    f.push({
      id: 'AN.DEUKRYEONG.STAGE.' + dr.byStage.stage, ruleId: 'ANA-05', domain: 'nature',
      claim: { subject: '득령 · 12운성', value: dr.byStage.stage },
      display: { short: '월지 12운성 ' + dr.byStage.stage, long: '월지에서 일간의 12운성은 ' + dr.byStage.stage + '이에요.' },
      evidence: [], conditions: [{ field: 'deukryeong.byStage', op: '==', value: dr.byStage.stage }], polarity: 'neutral'
    });
    f.push({
      id: 'AN.DEUKRYEONG.TENGOD.' + dr.byMainQiTenGod.tenGod, ruleId: 'ANA-06', domain: 'nature',
      claim: { subject: '득령 · 본기 십성', value: dr.byMainQiTenGod.tenGod },
      display: { short: '월령 본기 ' + dr.byMainQiTenGod.tenGod, long: '월지 본기는 일간에게 ' + dr.byMainQiTenGod.tenGod + '(' + GOD_GROUP_KO[dr.byMainQiTenGod.group] + ')이에요.' },
      evidence: [], conditions: [{ field: 'deukryeong.byMainQiTenGod', op: '==', value: dr.byMainQiTenGod.tenGod }], polarity: 'neutral'
    });

    var dj = a.deukji;
    f.push({
      id: 'AN.DEUKJI.ELEMENT.' + (dj.byElementCycle.supported ? 'YES' : 'NO'), ruleId: 'ANA-07', domain: 'nature',
      claim: { subject: '득지 · 오행 생조', value: dj.byElementCycle.relation },
      display: { short: '일지 ' + dj.byElementCycle.relation, long: '일지 오행은 일간에게 ' + dj.byElementCycle.relation + '예요.' },
      evidence: [], conditions: [{ field: 'deukji.byElementCycle', op: '==', value: dj.byElementCycle.relation }], polarity: 'neutral'
    });
    f.push({
      id: 'AN.DEUKJI.STAGE.' + dj.byStage.stage, ruleId: 'ANA-08', domain: 'nature',
      claim: { subject: '득지 · 12운성', value: dj.byStage.stage },
      display: { short: '일지 12운성 ' + dj.byStage.stage, long: '일지에서 일간의 12운성은 ' + dj.byStage.stage + '이에요.' },
      evidence: [], conditions: [{ field: 'deukji.byStage', op: '==', value: dj.byStage.stage }], polarity: 'neutral'
    });
    f.push({
      id: 'AN.DEUKJI.ROOT.' + (dj.rootGrade.value || 'NONE'), ruleId: 'ANA-09', domain: 'nature',
      claim: { subject: '득지 · 통근', value: dj.rootGrade.value },
      display: { short: '일지 통근 ' + (dj.rootGrade.value || '없음'), long: dj.rootGrade.value ? ('일지에 ' + dj.rootGrade.value + ' 통근이 있어요.') : '일지에는 통근이 없어요.' },
      evidence: [], conditions: [{ field: 'deukji.rootGrade', op: '==', value: dj.rootGrade.value }], polarity: 'neutral'
    });

    var roots = a.roots || [];
    f.push({
      id: 'AN.ROOTS.COUNT.' + roots.length, ruleId: 'ANA-10', domain: 'nature',
      claim: { subject: '통근', predicate: '개수', value: roots.length },
      display: { short: '통근 ' + roots.length + '개', long: '일간과 같은 오행의 지장간이 ' + roots.length + '개 있어요.' },
      evidence: [], conditions: [{ field: 'roots', op: 'length', value: roots.length }], polarity: 'neutral'
    });
    var heavy = roots.filter(function (r) { return r.rootGrade === '중'; });
    if (heavy.length) {
      f.push({
        id: 'AN.ROOTS.HEAVY.' + heavy.length, ruleId: 'ANA-11', domain: 'nature',
        claim: { subject: '통근', predicate: '무거운 뿌리', value: heavy.length },
        display: { short: '무거운 뿌리 ' + heavy.length, long: '장생·록·왕 자리의 뿌리가 ' + heavy.length + '개 있어요.' },
        evidence: [], conditions: [{ field: 'roots.heavy', op: '==', value: heavy.length }], polarity: 'neutral'
      });
    }

    Object.keys(a.deukse.groupCountsByHiddenAll).forEach(function (g) {
      var n = a.deukse.groupCountsByHiddenAll[g];
      if (!n) return;
      f.push({
        id: 'AN.DEUKSE.GROUP.' + g + '.' + n, ruleId: 'ANA-12', domain: 'nature',
        claim: { subject: GOD_GROUP_KO[g], predicate: '지장간 전체 개수', value: n },
        display: { short: GOD_GROUP_KO[g] + ' ' + n + '개(지장간 전체)', long: '지장간까지 세면 ' + GOD_GROUP_KO[g] + '이 ' + n + '개예요. 개수는 사실이고 강약 판정이 아니에요.' },
        evidence: [], conditions: [{ field: 'deukse.group.' + g, op: '==', value: n }], polarity: 'neutral'
      });
    });

    var gk = a.geokguk;
    (gk.candidates || []).forEach(function (c) {
      var label = c.id.indexOf('GEOK.BONGGI.') === 0 ? '본기 후보'
        : (c.id.indexOf('GEOK.TUTUL.') === 0 ? (c.transparent ? '투출 후보' : '월지 지장간') : '회국 후보');
      f.push({
        id: 'AN.' + c.id, ruleId: 'ANA-13', domain: 'nature',
        claim: { subject: label, value: c.god || c.basis },
        display: { short: label + ' ' + (c.god || c.id.split('.').pop()), long: c.basis + (c.decided ? '' : ' · 확정하지 않음') },
        evidence: [], conditions: [{ field: 'geokguk.candidates', op: 'includes', value: c.id }], polarity: 'neutral'
      });
    });
    f.push({
      id: 'AN.GEOK.AGREEMENT.' + gk.agreement, ruleId: 'ANA-14', domain: 'nature',
      claim: { subject: '격 후보 일치', value: gk.agreement },
      display: {
        short: '격 후보 ' + ({ same: '일치', partial: '일부 일치', differs: '불일치', none: '투출 없음' }[gk.agreement] || gk.agreement),
        long: '본기 후보와 투출 후보의 십성 비교는 ' + gk.agreement + '예요. 격은 확정하지 않아요.'
      },
      evidence: [], conditions: [{ field: 'geokguk.agreement', op: '==', value: gk.agreement }], polarity: 'neutral'
    });

    var conflict = (a.hapchong || []).filter(function (h) { return h.kind === '천간합' || h.kind === '육합'; }).length &&
      (a.hapchong || []).filter(function (h) { return h.kind === '천간충' || h.kind === '육충'; }).length;
    if (conflict) {
      f.push({
        id: 'AN.HAPCHONG.CONFLICT', ruleId: 'ANA-15', domain: 'nature',
        claim: { subject: '합과 충', predicate: '동시 성립', value: true },
        display: { short: '합·충 동시', long: '합과 충이 같은 명식에 같이 있어요. 어느 한쪽만 골라 말하지 않아요.' },
        evidence: [], conditions: [{ field: 'hapchong.conflict', op: '==', value: true }], polarity: 'neutral'
      });
    }

    (a.earlyQiCandidates || []).forEach(function (e) {
      f.push({
        id: 'AN.EARLYQI.' + e.branch + '.' + e.stem, ruleId: 'ANA-16', domain: 'nature',
        claim: { subject: '월률분야', predicate: '초기 참고값', value: e.stem },
        display: { short: '분야 참고 ' + e.stem + ' ' + e.days + '일', long: e.branch + '월 초기 ' + e.days + '일을 ' + e.stem + '으로 보는 표가 있어요. 참고값이고 판정에 쓰지 않아요.' },
        evidence: [], conditions: [{ field: 'earlyQi', op: 'includes', value: e.stem }], polarity: 'neutral'
      });
    });

    return f;
  }

  global.NyangRules = {
    core: coreFindings,
    period: periodFindings,
    analysis: analysisFindings,
    relOf: relOf,
    groupLabel: groupLabel
  };
})(typeof window !== 'undefined' ? window : globalThis);
