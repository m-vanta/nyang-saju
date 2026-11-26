/* ==========================================================================
   domain/analysis.js — 명식 → analysisData (구조화 사실, 판정 없음)
   --------------------------------------------------------------------------
   설계 근거: docs/myeongri-literature-verification.md §5
   · 사실만 낸다. 판정(격 확정·신강신약·용신)은 만들지 않는다.
   · 합산하지 않는다. 득령·득지·득세는 각각 독립 판독값의 묶음이다.
   · 금지 키: verdict / strength / score / total / grade / 신강 / 신약
     (등급은 rootGrade·inTableStrongSet처럼 이름을 좁혀 쓴다)
   · earlyQiCandidates(月律分野 일수)는 참고값이며 어떤 판정도 참조하지 않는다.

   입력: NyangDomain.chart() 결과
   출력: schemaVersion 'analysis/1.0'
   ========================================================================== */
(function (global) {
  'use strict';

  var T = global.NyangTables;
  var D = global.NyangDomain;
  if (!T || !D) throw new Error('analysis: tables / domain 이 먼저 로드되어야 합니다.');

  var STEMS = T.STEMS, STEMS_HANJA = T.STEMS_HANJA, BRANCHES = T.BRANCHES, BRANCHES_HANJA = T.BRANCHES_HANJA;
  var STEM_ELEM = T.STEM_ELEM, BRANCH_ELEM = T.BRANCH_ELEM, ELEMS = T.ELEMS, ELEM_KO = T.ELEM_KO;
  var HIDDEN = T.HIDDEN, STAGES = T.STAGES, STAGE_START = T.STAGE_START;
  var GOD_GROUP = T.GOD_GROUP, TEN_ORDER = T.TEN_ORDER;

  var POSITIONS = ['year', 'month', 'day', 'hour'];
  var PILLAR_KO = { year: '년', month: '월', day: '일', hour: '시' };
  var RANK_NAME = ['정기', '중기', '여기'];

  /* 월지 분류 — 旺支 子午卯酉 / 生地 寅申巳亥 / 雜氣 辰戌丑未 */
  var MONTH_TYPE = ['왕지', '잡기', '생지', '왕지', '잡기', '생지', '왕지', '잡기', '생지', '왕지', '잡기', '생지'];
  /* 계절 — 寅卯辰 봄, 巳午未 여름, 申酉戌 가을, 亥子丑 겨울 */
  var SEASON = ['겨울', '겨울', '봄', '봄', '봄', '여름', '여름', '여름', '가을', '가을', '가을', '겨울'];
  var SEASON_ELEM = { 봄: '목', 여름: '화', 가을: '금', 겨울: '수' };

  /* 月律分野 통용표 중 왕지의 초기(초후) 글자 — 참고값. 판정 미사용. */
  var EARLY_QI = {
    0: [{ stem: 8, days: 10 }],              // 子: 壬 10일
    3: [{ stem: 0, days: 10 }],              // 卯: 甲 10일
    6: [{ stem: 2, days: 10 }, { stem: 5, days: 9 }], // 午: 丙 10일 · 己 9일
    9: [{ stem: 6, days: 10 }]               // 酉: 庚 10일
  };

  /* 12운성 중 '기세가 서는' 표 기준 집합 — 문헌 이견이 있어 표 이름을 값에 박는다 */
  var TABLE_STRONG_STAGES = ['장생', '관대', '건록', '제왕', '태', '양'];
  /* 通根 등급 — 『적천수』任鐵樵注: 長生祿旺 = 重, 그 밖(중기·여기·묘고) = 輕 */
  var HEAVY_ROOT_STAGES = ['장생', '건록', '제왕'];

  var FORBIDDEN_KEYS = ['verdict', 'strength', 'score', 'total', 'grade', '신강', '신약', 'sum', 'avg', 'combined'];
  var FORBIDDEN_PREFIX = { deukryeong: ['supported'] };

  function rankOf(branch, idx) { return RANK_NAME[Math.min(idx, 2)]; }
  function stageOf(dm, branch) { return D.stageOf(dm, branch); }
  function godOf(dm, stem) { return D.tenGod(dm, stem); }
  function groupOf(god) { return GOD_GROUP[god]; }

  /* 월지 오행이 일간 오행에 무엇을 하는가 — 방향까지 사실로 남긴다 */
  function elemCycle(meElem, otherElem) {
    if (meElem === otherElem) return { supported: true, how: 'same', relation: 'same' };
    if (T.ELEM_MAKES[otherElem] === meElem) return { supported: true, how: 'generates-me', relation: 'generates-me' };
    if (T.ELEM_MAKES[meElem] === otherElem) return { supported: false, how: 'none', relation: 'drains-me' };
    if (T.ELEM_KILLS[otherElem] === meElem) return { supported: false, how: 'none', relation: 'controls-me' };
    return { supported: false, how: 'none', relation: 'controlled-by-me' };
  }

  /* 왕상휴수사 — 계절 오행 기준 */
  function wangXiangOf(season) {
    var s = SEASON_ELEM[season];
    var out = {};
    ELEMS.forEach(function (e) {
      if (e === s) out[e] = '왕';
      else if (e === T.ELEM_MAKES[s]) out[e] = '상';
      else if (e === T.ELEM_CYCLE[s]) out[e] = '휴';
      else if (e === T.ELEM_KILLED[s]) out[e] = '수';
      else out[e] = '사';
    });
    return out;
  }

  function pillarsOf(chart) {
    var out = {};
    POSITIONS.forEach(function (k) {
      var p = chart.pillars[k];
      if (!p) return;
      out[k] = { stem: STEMS_HANJA[p.stem], branch: BRANCHES_HANJA[p.branch], stemIdx: p.stem, branchIdx: p.branch };
    });
    return out;
  }

  function hiddenFacts(chart, dm) {
    var out = [];
    chart.list.forEach(function (p) {
      var key = POSITIONS.filter(function (k) { return chart.pillars[k] === p; })[0];
      var entries = p.hidden.map(function (h, i) {
        return {
          stem: STEMS_HANJA[h.stem], elem: h.elem, tenGod: godOf(dm, h.stem),
          rank: rankOf(p.branch, i), weight: h.weight
        };
      });
      out.push({ pillar: key, branch: BRANCHES_HANJA[p.branch], entries: entries, table: 'cangdun-ge/1', weightSource: 'product/1' });
    });
    return out;
  }

  function earlyQiOf(chart, dm) {
    var list = EARLY_QI[chart.monthBranch];
    if (!list) return [];
    return list.map(function (e) {
      return {
        branch: BRANCHES_HANJA[chart.monthBranch], stem: STEMS_HANJA[e.stem], days: e.days,
        basis: 'rendivision/1', use: 'reference-only',
        reason: '삼명통회 論人元司事가 일수 방식을 부정하고 판본마다 값이 다르다'
      };
    });
  }

  /* 통근 — 일간과 같은 오행의 지장간. 등급은 重/輕 두 단계만. */
  function rootsOf(chart, dm, dmElem) {
    var out = [];
    chart.list.forEach(function (p) {
      var key = POSITIONS.filter(function (k) { return chart.pillars[k] === p; })[0];
      p.hidden.forEach(function (h, i) {
        if (h.elem !== dmElem) return;
        var stage = stageOf(dm, p.branch);
        out.push({
          pillar: key, branch: BRANCHES_HANJA[p.branch], stem: STEMS_HANJA[h.stem], elem: h.elem,
          rank: rankOf(p.branch, i), relationToDayMaster: godOf(dm, h.stem),
          rootGrade: HEAVY_ROOT_STAGES.indexOf(stage) >= 0 ? '중' : '경',
          basis: 'jijanggan+cangdun-ge/1',
          stage
        });
      });
    });
    return out;
  }

  function deukryeongOf(chart, dm, dmElem, wx) {
    var monthBranch = chart.monthBranch;
    var branchElem = BRANCH_ELEM[monthBranch];
    var mainQi = HIDDEN[monthBranch][0][0];
    var cycle = elemCycle(dmElem, branchElem);
    var stage = stageOf(dm, monthBranch);
    return {
      target: 'month',
      byElementCycle: { supported: cycle.supported, how: cycle.how, relation: cycle.relation },
      bySeasonRank: { rank: wx[dmElem] },
      byStage: { stage: stage, inTableStrongSet: TABLE_STRONG_STAGES.indexOf(stage) >= 0, table: 'twelve-stages-yinyang/1' },
      byMainQiTenGod: { tenGod: godOf(dm, mainQi), group: groupOf(godOf(dm, mainQi)), supportive: ['peer', 'resource'].indexOf(groupOf(godOf(dm, mainQi))) >= 0 },
      note: '네 판독은 서로 대체하지 않는다. 합산하지 않는다.'
    };
  }

  function deukjiOf(chart, dm, dmElem, roots) {
    var dayBranch = chart.pillars.day.branch;
    var cycle = elemCycle(dmElem, BRANCH_ELEM[dayBranch]);
    var stage = stageOf(dm, dayBranch);
    var root = roots.filter(function (r) { return r.pillar === 'day'; })[0] || null;
    return {
      target: 'day',
      byElementCycle: { supported: cycle.supported, how: cycle.how, relation: cycle.relation },
      byStage: { stage: stage, inTableStrongSet: TABLE_STRONG_STAGES.indexOf(stage) >= 0, table: 'twelve-stages-yinyang/1' },
      rootGrade: root ? { value: root.rootGrade, from: 'roots.day.' + root.stem } : { value: null, from: null },
      note: '통근 유무와 득지는 다른 축이다.'
    };
  }

  function hiddenAllCounts(chart, dm) {
    var counts = {};
    TEN_ORDER.forEach(function (g) { counts[g] = 0; });
    chart.list.forEach(function (p) {
      if (p !== chart.pillars.day) counts[godOf(dm, p.stem)]++;
      p.hidden.forEach(function (h) { counts[godOf(dm, h.stem)]++; });
    });
    return counts;
  }

  function groupsOf(counts) {
    var g = { peer: 0, output: 0, wealth: 0, power: 0, resource: 0 };
    TEN_ORDER.forEach(function (k) { g[GOD_GROUP[k]] += counts[k] || 0; });
    return g;
  }

  function deukseOf(chart, dm, roots) {
    var stems = [];
    POSITIONS.forEach(function (k) {
      var p = chart.pillars[k];
      if (!p || k === 'day') return;
      stems.push({ pillar: k, stem: STEMS_HANJA[p.stem], group: groupOf(godOf(dm, p.stem)) });
    });
    var branchRoots = roots.map(function (r) {
      return { pillar: r.pillar, branch: r.branch, group: groupOf(r.relationToDayMaster), rootGrade: r.rootGrade };
    });
    return {
      stemFacts: stems,
      branchRoots: branchRoots,
      groupCountsByHiddenAll: groupsOf(hiddenAllCounts(chart, dm)),
      note: '개수는 사실이다. 이 개수로 강약을 판정하지 않는다.'
    };
  }

  function tenGodFactsOf(chart, dm) {
    var surface = {};
    TEN_ORDER.forEach(function (g) { surface[g] = chart.tenCount[g] || 0; });
    var hiddenAll = hiddenAllCounts(chart, dm);
    return {
      bySurface: surface,
      byHiddenAll: hiddenAll,
      absentSurface: TEN_ORDER.filter(function (g) { return (surface[g] || 0) === 0; }),
      groupsByHiddenAll: groupsOf(hiddenAll),
      basis: { bySurface: 'stems+mainQi/1', byHiddenAll: 'stems+allHidden/1' },
      note: '두 집계를 더하거나 평균하지 않는다.'
    };
  }

  /* 생극제화 — 글자 사이의 관계만. 길흉 판정 없음. */
  function saenggeukOf(chart, dm) {
    var chars = [];
    POSITIONS.forEach(function (k) {
      var p = chart.pillars[k];
      if (!p) return;
      chars.push({ pos: k + '.stem', char: STEMS_HANJA[p.stem], elem: STEM_ELEM[p.stem], slot: 'stem' });
      chars.push({ pos: k + '.branch', char: BRANCHES_HANJA[p.branch], elem: BRANCH_ELEM[p.branch], slot: 'branch' });
    });

    var stems = chars.filter(function (c) { return c.slot === 'stem'; });
    var out = [];
    for (var i = 0; i < stems.length; i++) {
      for (var j = i + 1; j < stems.length; j++) {
        var a = stems[i], b = stems[j];
        var kind = null, from = null, to = null, rel = null;
        if (T.ELEM_MAKES[a.elem] === b.elem) { kind = '생'; from = a; to = b; rel = a.elem + '생' + b.elem; }
        else if (T.ELEM_MAKES[b.elem] === a.elem) { kind = '생'; from = b; to = a; rel = b.elem + '생' + a.elem; }
        else if (T.ELEM_KILLS[a.elem] === b.elem) { kind = '극'; from = a; to = b; rel = a.elem + '극' + b.elem; }
        else if (T.ELEM_KILLS[b.elem] === a.elem) { kind = '극'; from = b; to = a; rel = b.elem + '극' + a.elem; }
        if (!kind) continue;
        var entry = {
          from: from.char, to: to.char, kind: kind,
          elemFrom: from.elem, elemTo: to.elem,
          positions: [from.pos, to.pos],
          tenGod: godOf(dm, STEMS.indexOf(from.char)),
          relation: rel
        };
        if (kind === '극') {
          /* 제화 — 극하는 글자를 다시 제어하는 글자가 명식에 있으면 사실로 남긴다 */
          var controller = stems.filter(function (c) {
            return c !== from && c !== to && T.ELEM_KILLS[c.elem] === from.elem;
          })[0];
          if (controller) {
            entry.controlledBy = controller.char;
            entry.controlledByPositions = [controller.pos];
            entry.note = '제어 글자의 존재만 기록. 길흉 판정 없음';
          }
        }
        out.push(entry);
      }
    }

    /* 일간 ↔ 각 지지 오행 */
    var dmChar = chars.filter(function (c) { return c.pos === 'day.stem'; })[0];
    chars.filter(function (c) { return c.slot === 'branch'; }).forEach(function (b) {
      var kind = null, rel = null;
      if (T.ELEM_MAKES[b.elem] === dmChar.elem) { kind = '생'; rel = b.elem + '생' + dmChar.elem; }
      else if (T.ELEM_MAKES[dmChar.elem] === b.elem) { kind = '생'; rel = dmChar.elem + '생' + b.elem; }
      else if (T.ELEM_KILLS[b.elem] === dmChar.elem) { kind = '극'; rel = b.elem + '극' + dmChar.elem; }
      else if (T.ELEM_KILLS[dmChar.elem] === b.elem) { kind = '극'; rel = dmChar.elem + '극' + b.elem; }
      if (!kind) return;
      out.push({
        from: b.char, to: dmChar.char, kind: kind,
        elemFrom: b.elem, elemTo: dmChar.elem,
        positions: [b.pos, dmChar.pos],
        tenGod: null, // 지지 한 글자는 십성 하나로 정해지지 않는다
        relation: rel, basis: 'branch-elem/1'
      });
    });
    return out;
  }

  /* 합충 — 성립한 것만. 合化 성립 여부는 decided:false 로 남긴다. */
  function hapchongOf(chart) {
    var out = [];
    var monthElem = BRANCH_ELEM[chart.monthBranch];
    for (var i = 0; i < POSITIONS.length; i++) {
      for (var j = i + 1; j < POSITIONS.length; j++) {
        var ka = POSITIONS[i], kb = POSITIONS[j];
        var a = chart.pillars[ka], b = chart.pillars[kb];
        if (!a || !b) continue;
        if (T.STEM_HAP[a.stem] === b.stem) {
          var target = STEM_ELEM[T.STEM_HAP[a.stem]];
          out.push({
            id: 'HAP.stem.' + STEMS_HANJA[a.stem] + STEMS_HANJA[b.stem] + '.' + ka + kb, kind: '천간합',
            chars: [STEMS_HANJA[a.stem], STEMS_HANJA[b.stem]], between: [ka, kb],
            transform: { possible: monthElem === target, condition: '월령 ' + ELEM_KO[target] },
            decided: false, basis: 'relation-set/1'
          });
        }
        if (T.STEM_CLASH[a.stem] === b.stem) {
          out.push({
            id: 'CHUNG.stem.' + STEMS_HANJA[a.stem] + STEMS_HANJA[b.stem] + '.' + ka + kb, kind: '천간충',
            chars: [STEMS_HANJA[a.stem], STEMS_HANJA[b.stem]], between: [ka, kb], basis: 'relation-set/1'
          });
        }
        if (T.SIX_HAP[a.branch] === b.branch) {
          out.push({
            id: 'HAP.branch.' + BRANCHES_HANJA[a.branch] + BRANCHES_HANJA[b.branch] + '.' + ka + kb, kind: '육합',
            chars: [BRANCHES_HANJA[a.branch], BRANCHES_HANJA[b.branch]], between: [ka, kb], basis: 'relation-set/1'
          });
        }
        if (((a.branch - b.branch) % 12 + 12) % 12 === 6) {
          out.push({
            id: 'CHUNG.branch.' + BRANCHES_HANJA[a.branch] + BRANCHES_HANJA[b.branch] + '.' + ka + kb, kind: '육충',
            chars: [BRANCHES_HANJA[a.branch], BRANCHES_HANJA[b.branch]], between: [ka, kb], basis: 'relation-set/1'
          });
        }
        var pair = [a.branch, b.branch];
        ['HYEONG', 'PA', 'HAE'].forEach(function (key) {
          var kindKo = { HYEONG: '형', PA: '파', HAE: '해' }[key];
          var hit = T[key].some(function (p) {
            return (p[0] === pair[0] && p[1] === pair[1]) || (p[0] === pair[1] && p[1] === pair[0]);
          });
          if (hit) {
            out.push({
              id: key + '.branch.' + BRANCHES_HANJA[a.branch] + BRANCHES_HANJA[b.branch] + '.' + ka + kb, kind: kindKo,
              chars: [BRANCHES_HANJA[a.branch], BRANCHES_HANJA[b.branch]], between: [ka, kb], basis: 'relation-set/1'
            });
          }
        });
      }
    }

    T.SAMHAP.forEach(function (g) {
      var present = g.branches.filter(function (br) {
        return chart.list.some(function (p) { return p.branch === br; });
      });
      if (present.length < 2) return;
      var missing = g.branches.filter(function (br) { return present.indexOf(br) === -1; });
      var groupElem = BRANCH_ELEM[g.branches[0]] === '수' ? '수' : ({ 수국: '수', 목국: '목', 화국: '화', 금국: '금' })[g.name];
      out.push({
        id: 'HAP.samhap.' + present.map(function (br) { return BRANCHES_HANJA[br]; }).join(''),
        kind: present.length === 3 ? '삼합' : '반합', group: groupElem,
        chars: present.map(function (br) { return BRANCHES_HANJA[br]; }),
        completeness: present.length + '/3',
        missing: missing.map(function (br) { return BRANCHES_HANJA[br]; }),
        hapType: present.length === 3 ? '완전' : '拱合',
        basis: 'samhap/1'
      });
    });
    return out;
  }

  function geokgukOf(chart, dm, hiddenFactsList, hapchong) {
    var monthBranch = chart.monthBranch;
    var monthType = MONTH_TYPE[monthBranch];
    var stemChars = {};
    POSITIONS.forEach(function (k) {
      var p = chart.pillars[k];
      if (p) stemChars[STEMS_HANJA[p.stem]] = k;
    });

    var candidates = [];
    var monthHidden = hiddenFactsList.filter(function (h) { return h.pillar === 'month'; })[0];
    var bonggi = monthHidden ? monthHidden.entries[0] : null;
    if (bonggi) {
      candidates.push({
        id: 'GEOK.BONGGI.' + bonggi.tenGod,
        basis: '월지 ' + BRANCHES_HANJA[monthBranch] + ' 본기 ' + bonggi.stem + ' = ' + bonggi.tenGod,
        transparent: !!stemChars[bonggi.stem],
        god: bonggi.tenGod, decided: false
      });
    }
    (monthHidden ? monthHidden.entries : []).forEach(function (e) {
      candidates.push({
        id: 'GEOK.TUTUL.' + e.stem + '.' + e.tenGod,
        basis: '월지 ' + e.rank + ' ' + e.stem + (stemChars[e.stem] ? '이 ' + PILLAR_KO[stemChars[e.stem]] + '간에 투출' : ' — 천간에 없음') + ' = ' + e.tenGod,
        transparent: !!stemChars[e.stem],
        god: e.tenGod, decided: false
      });
    });
    var seenHoejuk = {};
    hapchong.filter(function (h) { return h.kind === '삼합' || h.kind === '반합'; }).forEach(function (h) {
      var hid = 'GEOK.HOEJUK.' + h.group;
      if (seenHoejuk[hid]) return;
      seenHoejuk[hid] = true;
      candidates.push({
        id: hid,
        basis: h.chars.join('') + ' ' + h.kind + ' ' + h.group + '국(' + (h.missing.length ? h.missing.join('') + ' 缺' : '완전') + ')',
        transparent: false, god: null, decided: false
      });
    });

    /* 祿·刃 후보 — 격 확정이 아니라 후보 사실이다. 양인은 五陽干 월령만. */
    var luBranch = [2, 3, 5, 6, 8, 9, 11, 0, 11, 0][dm]; // 甲寅 乙卯 丙巳 丁午 戊巳 己午 庚申 辛酉 壬亥 癸子
    if (monthBranch === luBranch) {
      candidates.push({
        id: 'GEOK.LU.' + STEMS[dm], basis: '월지 ' + BRANCHES_HANJA[monthBranch] + '이 일간 ' + STEMS_HANJA[dm] + '의 祿 자리', transparent: false, god: '비견', decided: false
      });
    }
    if (dm % 2 === 0) {
      var renBranch = [3, null, 6, null, 6, null, 9, null, 0, null][dm]; // 甲卯 丙午 戊午 庚酉 壬子
      if (renBranch !== null && monthBranch === renBranch) {
        candidates.push({
          id: 'GEOK.REN.' + STEMS[dm], basis: '월지 ' + BRANCHES_HANJA[monthBranch] + '이 양간 ' + STEMS_HANJA[dm] + '의 刃 자리(五陽干만)', transparent: false, god: '겁재', decided: false
        });
      }
    }

    var tutul = candidates.filter(function (c) { return c.id.indexOf('GEOK.TUTUL.') === 0 && c.transparent; });
    var agreement;
    if (!tutul.length) agreement = 'none';
    else {
      var same = tutul.filter(function (c) { return c.god === bonggi.tenGod; }).length;
      if (same === tutul.length) agreement = 'same';
      else if (same > 0) agreement = 'partial';
      else agreement = 'differs';
    }

    var unresolved = [];
    if (monthType === '잡기' && tutul.length > 1) unresolved.push('잡기월: 투출이 여러 개 — 문헌은 하나를 고르지 않는다(一透則一用, 兼透則兼用)');
    if (agreement === 'differs') unresolved.push('본기와 투출이 다른 격을 가리킨다 — 불일치 자체를 사실로 쓴다');
    if (candidates.some(function (c) { return c.id.indexOf('GEOK.LU.') === 0 || c.id.indexOf('GEOK.REN.') === 0; })) {
      unresolved.push('월지가 일간의 祿/刃 — 用神이 월령에 없어 투출·회국으로 따로 본다(자평진전 論建祿月劫)');
    }
    unresolved.push('격 확정 보류: 후보만 기록한다(사용자 지시)');

    return {
      monthType: monthType,
      candidates: candidates,
      agreement: agreement,
      agreementScope: '본기 후보와 투출 후보의 십성 비교만',
      unresolved: unresolved,
      decided: false
    };
  }

  function monthTermOf(chart) {
    try {
      var solar = chart.input.normalized.solar;
      var t = chart.input.normalized.time;
      var h = t && t.known ? t.hh : 12;
      var mi = t && t.known ? t.mm : 0;
      var jeol = global.Manseryeok.getJeolAround(solar.y, solar.m, solar.d, h, mi, { clock: 'korea-legal' });
      if (!jeol || !jeol.prev) return { term: null, daysFromTerm: null };
      var ms = D.kstWallMs(jeol.prev.year, jeol.prev.month, jeol.prev.day, jeol.prev.hour, jeol.prev.minute);
      var birth = D.wallToUtcMs(solar.y, solar.m, solar.d, h, mi);
      return {
        term: { name: jeol.prev.name, at: jeol.prev.year + '.' + pad2(jeol.prev.month) + '.' + pad2(jeol.prev.day) + ' ' + pad2(jeol.prev.hour) + ':' + pad2(jeol.prev.minute) },
        daysFromTerm: Math.round((birth - ms) / 86400000 * 10) / 10
      };
    } catch (e) {
      return { term: null, daysFromTerm: null };
    }
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function build(chart) {
    var dm = chart.dayMaster;
    var dmElem = chart.dayMasterElem;
    var season = SEASON[chart.monthBranch];
    var wx = wangXiangOf(season);
    var hidden = hiddenFacts(chart, dm);
    var roots = rootsOf(chart, dm, dmElem);
    var hapchong = hapchongOf(chart);
    var term = monthTermOf(chart);

    return {
      schemaVersion: 'analysis/1.0',
      chartVersion: chart.chartVersion,
      tables: {
        hiddenStems: 'cangdun-ge/1', hiddenWeights: 'product/1', season: 'wangxiang/1',
        stage: 'twelve-stages-yinyang/1', tenGods: 'ten-gods/1', relations: 'relation-set/1'
      },
      chart: {
        chartId: chart.chartId,
        hourKnown: !chart.flags.hourUnknown,
        pillars: pillarsOf(chart)
      },
      dayMaster: { stem: STEMS_HANJA[dm], elem: dmElem, yinYang: dm % 2 === 0 ? '양' : '음' },
      monthCommand: {
        branch: BRANCHES_HANJA[chart.monthBranch],
        monthType: MONTH_TYPE[chart.monthBranch],
        season: season,
        branchElem: BRANCH_ELEM[chart.monthBranch],
        wangXiang: wx,
        daysFromTerm: term.daysFromTerm,
        daysFromTermUse: 'reference-only',
        term: term.term
      },
      hiddenStems: hidden,
      earlyQiCandidates: earlyQiOf(chart, dm),
      roots: roots,
      deukryeong: deukryeongOf(chart, dm, dmElem, wx),
      deukji: deukjiOf(chart, dm, dmElem, roots),
      deukse: deukseOf(chart, dm, roots),
      elementFacts: {
        surface: chart.counts,
        share: chart.share,
        weighted: chart.weighted,
        tiedMax: chart.tiedMax,
        lacking: chart.lacking,
        hiddenOnly: chart.hiddenElems,
        basis: { surface: 'eight-chars/1', weighted: 'product/1' }
      },
      tenGodFacts: tenGodFactsOf(chart, dm),
      saenggeuk: saenggeukOf(chart, dm),
      hapchong: hapchong,
      geokguk: geokgukOf(chart, dm, hidden, hapchong),
      flags: {
        hourUnknown: !!chart.flags.hourUnknown,
        termEdge: !!chart.flags.termEdge,
        termEdgeTerm: chart.flags.termEdgeTerm || null,
        ziEdge: !!chart.flags.ziEdge,
        dstApplied: !!chart.flags.dstApplied,
        monthIsJabgi: MONTH_TYPE[chart.monthBranch] === '잡기'
      }
    };
  }

  /* ---------------- 린트 ----------------
     스키마가 판정의 입구를 거부한다. 테스트와 하네스가 함께 쓴다. */
  function lint(data) {
    var problems = [];
    (function walk(node, path) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach(function (v, i) { walk(v, path + '[' + i + ']'); });
        return;
      }
      Object.keys(node).forEach(function (k) {
        var p = path + '.' + k;
        if (FORBIDDEN_KEYS.indexOf(k) >= 0) problems.push('금지 키 ' + p);
        var pref = FORBIDDEN_PREFIX[path.replace(/^\./, '')];
        if (pref && pref.indexOf(k) >= 0) problems.push('금지 키 ' + p);
        walk(node[k], p);
      });
    })(data, '');
    /* earlyQi 는 판정에서 참조하지 않는다 */
    ['deukryeong', 'deukji', 'deukse', 'geokguk'].forEach(function (k) {
      if (JSON.stringify(data[k] || {}).indexOf('earlyQi') >= 0) problems.push('earlyQi 참조: ' + k);
    });
    return problems;
  }

  global.NyangAnalysis = {
    build: build,
    lint: lint,
    wangXiangOf: wangXiangOf,
    monthTypeOf: function (branch) { return MONTH_TYPE[branch]; },
    seasonOf: function (branch) { return SEASON[branch]; },
    FORBIDDEN_KEYS: FORBIDDEN_KEYS
  };
})(typeof window !== 'undefined' ? window : globalThis);
