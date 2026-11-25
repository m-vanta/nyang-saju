/* ==========================================================================
   render/select.js — Finding[] → 문장 선택 · 근거 칩 생성 · 결과 조립
   --------------------------------------------------------------------------
   · 문장은 requires/forbids 로만 고른다. 이름·조회시점은 선택에 쓰지 않는다.
   · 변형 선택 키 = hash(chartId + slot). 같은 명식이면 언제나 같은 문장.
   · 근거 칩 = 선택된 문장의 requires Finding 의 display 에서만 만든다.
   · 여기서 수치를 새로 계산하지 않는다(domain·rules 결과를 읽기만 한다).
   ========================================================================== */
(function (global) {
  'use strict';

  var T = global.NyangTables;
  var C = global.NyangCopy;
  var PC = global.NyangPaidCopy;
  var R = global.NyangRules;
  var D = global.NyangDomain;
  var Pu = global.NyangPeriod;
  if (!T || !C || !PC || !R || !D || !Pu) throw new Error('render: domain/rules/content 가 먼저 로드되어야 합니다.');

  var FREE = global.NyangContentFree || [];
  var PAID = global.NyangContentPaid || [];
  var STEM_ELEM = T.STEM_ELEM, ELEM_KO = T.ELEM_KO, ELEM_HANJA = T.ELEM_HANJA, BRANCHES_HANJA = T.BRANCHES_HANJA;
  var STEMS = T.STEMS;

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h;
  }
  function hasJong(word) {
    var c = String(word).charCodeAt(String(word).length - 1);
    if (c < 0xAC00 || c > 0xD7A3) return false;
    return (c - 0xAC00) % 28 !== 0;
  }
  function josa(word, pair) { return word + (hasJong(word) ? pair.charAt(0) : pair.charAt(1)); }

  function makeIndex(findings) {
    var map = {};
    findings.forEach(function (f) { map[f.id] = f; });
    return {
      map: map,
      has: function (id) { return !!map[id]; },
      any: function (prefix) {
        return Object.keys(map).some(function (k) { return k.indexOf(prefix) === 0; });
      }
    };
  }

  function reqMet(req, idx) {
    if (!req) return true;
    if (req.charAt(req.length - 1) === '*') return idx.any(req.slice(0, -1));
    return idx.has(req);
  }
  function eligible(s, idx) {
    return (s.requires || []).every(function (q) { return reqMet(q, idx); }) &&
      !(s.forbids || []).some(function (q) { return reqMet(q, idx); });
  }

  function select(catalog, slot, idx, seq) {
    var cands = catalog.filter(function (s) { return s.slot === slot && eligible(s, idx); });
    if (!cands.length) return null;
    var maxSpec = 0;
    cands.forEach(function (s) { if ((s.requires || []).length > maxSpec) maxSpec = (s.requires || []).length; });
    var top = cands.filter(function (s) { return (s.requires || []).length === maxSpec; });
    top.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
    return top[hash(seq + '|' + slot) % top.length];
  }

  function basisOf(sentence, idx) {
    if (!sentence) return [];
    var out = [];
    (sentence.requires || []).forEach(function (q) {
      if (q.charAt(q.length - 1) === '*') {
        Object.keys(idx.map).forEach(function (k) {
          if (k.indexOf(q.slice(0, -1)) === 0) out.push(idx.map[k]);
        });
      } else if (idx.map[q]) out.push(idx.map[q]);
    });
    var seen = {}, chips = [];
    out.forEach(function (f) {
      if (!f.display || !f.display.short) return;
      if (seen[f.display.short]) return;
      seen[f.display.short] = 1;
      chips.push(f.display.short);
    });
    return chips.slice(0, 5);
  }

  function fill(text, vars) {
    return String(text == null ? '' : text).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? String(vars[k]) : m;
    });
  }

  function charsWord(chart) { return chart.flags.hourUnknown ? '여섯 글자' : '여덟 글자'; }

  function maxText(chart) {
    var tied = chart.tiedMax;
    if (tied.length > 1) {
      return tied.map(function (e) { return ELEM_KO[e]; }).join('·') + '이 각각 ' +
        chart.elements.maxCount + '개(' + chart.share[tied[0]] + '%)';
    }
    return ELEM_KO[tied[0]] + '이 ' + chart.elements.maxCount + '개(' + chart.share[tied[0]] + '%)';
  }

  /* ---------------- 무료 결과 ---------------- */

  function buildFree(chart, name) {
    var nm = (name || '').trim() || '손님';
    var call = nm === '손님' ? '손님' : nm + ' 님';
    var dm = chart.dayMaster;
    var base = C.PALJA[dm];
    var core = R.core(chart);
    var idx = makeIndex(core);
    if (chart.dohwa) {
      // dohwa 는 신살 표시일 뿐 판정 문장의 조건으로 쓰지 않는다 — 무료 팩폭 훅에서만 쓴다.
      idx.map['FLAG.DOHWA'] = { id: 'FLAG.DOHWA', display: { short: '도화', long: '도화가 앉아 있어요.' } };
    }
    var topTen = T.TEN_ORDER.map(function (t) { return { god: t, n: chart.tenCount[t] || 0 }; })
      .filter(function (x) { return x.n > 0; })
      .sort(function (a, b) { return b.n - a.n || T.TEN_ORDER.indexOf(a.god) - T.TEN_ORDER.indexOf(b.god); });
    var topN = topTen.length ? topTen[0].n : 0;
    var topGods = topTen.filter(function (x) { return x.n === topN; }).map(function (x) { return x.god; });
    if (topGods.length > 1) {
      idx.map['TEN.TIE.' + topGods.join('') + '.' + topN] = {
        id: 'TEN.TIE.' + topGods.join('') + '.' + topN,
        display: { short: topGods.map(function (g) { return g + ' ' + n0(topN); }).join(' · ') }
      };
    }
    topGods.forEach(function (g) {
      if (topN >= 2) idx.map['TEN.REPEAT.' + g + '.' + topN] = { id: 'TEN.REPEAT.' + g + '.' + topN, display: { short: g + ' ' + topN } };
    });

    var lackKo = chart.lacking.length ? ELEM_KO[chart.lacking[0]] : null;
    var strongKo = ELEM_KO[chart.tiedMax[0]];
    var tieKo = chart.tiedMax.map(function (e) { return ELEM_KO[e]; }).join('·');
    var topGod = topGods[0];
    var group = T.GOD_GROUP[topGod];
    var rel = R.relOf(chart.dayMasterElem, chart.tiedMax[0]);

    var vars = {
      name: nm, chars: charsWord(chart),
      strongKo: strongKo, strongKoJ: josa(strongKo, '이가'),
      lackKo: lackKo || '', lackKoJ: lackKo ? josa(lackKo, '이가') : '',
      tieKo: tieKo, count: chart.elements.maxCount, pct: chart.share[chart.tiedMax[0]],
      god: topGod, godJ: josa(topGod, '이가'), n: topN,
      monthKo: ELEM_KO[chart.monthElem], dmKo: chart.dayMasterName,
      pctSum: 0
    };

    /* 한 줄 정의 */
    var def;
    if (lackKo) def = base.core + ', ' + josa(lackKo, '이가') + ' 비어 있어 그 자리를 스스로 메우는 ' + base.name;
    else def = base.core + ', ' + C.PALJA_MOD[rel] + ' ' + base.name;

    /* 제일 크게 도는 십성 한 줄 (동률이면 나란히) */
    var tenLine;
    if (topGods.length > 1) {
      tenLine = topGods.map(function (g) { return josa(g, '이가') + ' ' + topN + '개'; }).join(', ') +
        '로 나란히 커요. ' + R.groupLabel(T.GOD_GROUP[topGod]) + ' 쪽이에요.';
    } else {
      tenLine = josa(topGod, '이가') + ' ' + topN + '개로 제일 크게 돌아요. ' + C.PALJA_TEN_MOD[topGod] + ' 쪽이에요.';
    }

    var facts = [
      '일간 ' + chart.dayMasterName,
      chart.tiedMax.length > 1
        ? chart.tiedMax.map(function (e) { return ELEM_KO[e] + ' ' + chart.counts[e] + '개'; }).join(' · ') + ' (동률)'
        : strongKo + ' ' + chart.elements.maxCount + '개(' + chart.share[chart.tiedMax[0]] + '%)',
      topTen.slice(0, 3).map(function (x) { return x.god + ' ' + x.n; }).join(' · ')
    ];

    var tags = ['#' + base.name];
    tags = tags.concat(base.tags);
    tags.push('#' + (chart.tiedMax.length > 1 ? chart.tiedMax.map(function (e) { return ELEM_KO[e]; }).join('·') + '동률' : strongKo + (rel === 'same' ? '과다' : '기운')));
    tags.push('#' + topGods.join('·') + topN);
    if (lackKo) tags.push('#' + lackKo + '부족');

    /* 해설 — 1) 오행 최다(동률 포함) 2) 십성 3) 일간 결 4) 마무리 */
    var essay = [];
    essay.push(charsWord(chart) + ' 중 ' + maxText(chart) + '로 표면에서 가장 많아요.' +
      (lackKo
        ? ' ' + josa(lackKo, '은는') + ' 하나도 안 들어왔고요.'
        : ' ' + josa(ELEM_KO[chart.tiedMin[0]], '은는') + ' ' + chart.elements.minCount + '개로 가장 얇아요.'));
    essay.push('드러난 십신은 ' + topTen.slice(0, 3).map(function (x) { return x.god + ' ' + x.n; }).join(' · ') +
      ' 순서고, ' + (topGods.length > 1
        ? '그중 ' + topGods.join('·') + '이 나란히 가장 커요. '
        : '그중 ' + josa(topGod, '이가') + ' 제일 크게 도는 편이에요. ') +
      S_TEN_GROUP(topGod) + '이라, 그게 ' + call + '의 기본값처럼 나오기 쉬워요.');
    essay.push(base.read);
    var close = select(FREE, 'closer', idx, chart.chartId);
    if (close) essay.push(fill(close.text, vars));
    essay = essay.join(' ').replace(/\{name\}/g, call);

    /* 팩폭 */
    var hook = select(FREE, 'hook', idx, chart.chartId);
    var punch = select(FREE, 'punch', idx, chart.chartId);
    var bomb = (hook ? fill(hook.text, vars) : '') + (punch ? ' ' + fill(punch.text, vars) : '');
    if (chart.flags.hourUnknown) bomb += ' 시주를 모르니 여섯 글자로 본 팩폭이에요.';

    /* 대표 성향 3 */
    var tr = ['trait1', 'trait2', 'trait3'].map(function (slot, i) {
      var s = select(FREE, slot, idx, chart.chartId);
      return {
        no: '0' + (i + 1),
        label: s ? fill(s.label, vars) : '',
        text: s ? fill(s.text, vars) : '',
        id: s ? s.id : null,
        basis: s ? basisOf(s, idx) : []
      };
    });

    return {
      key: dm, name: base.name, hanja: base.hanja, short: base.short, seal: base.seal,
      elem: chart.dayMasterElem, elemHanja: ELEM_HANJA[chart.dayMasterElem],
      core: base.core, def: def, tenLine: tenLine, facts: facts, tags: tags, essay: essay,
      bomb: bomb, bombPublic: String(bomb).split(call).join('이 사람'), traits: tr, rel: rel, group: group, topGod: topGod, godCount: topN,
      strongKo: strongKo, lackKo: lackKo, chartId: chart.chartId,
      strongText: maxText(chart), chars: charsWord(chart),
      findings: core.map(function (f) { return f.id; })
    };
  }

  function n0(n) { return n; }
  function S_TEN_GROUP(god) { return T.TEN_GROUP[god]; }

  /* ---------------- 유료 결과 ---------------- */

  function flowNarration(period, call) {
    if (!period || !period.seun) return { text: '', basis: [] };
    var p = period;
    var dw = p.daewoon;
    var parts = [];
    if (dw) {
      parts.push('지금 대운 ' + dw.hanja + '은 천간 ' + dw.hanja.charAt(0) + '가 ' + dw.stemTen +
        ', 지지 ' + dw.hanja.charAt(1) + '가 ' + dw.branchTen + '이에요.');
      parts.push(dw.stemTen === dw.branchTen
        ? '한 구간에 같은 성질이 두 번 들어와 ' + dw.stemTen + '의 방식이 십 년 동안 반복돼요.'
        : '한 구간 안에 ' + dw.stemTen + '과 ' + dw.branchTen + '이 같이 들어와 있어, 조이는 쪽과 풀리는 쪽이 번갈아 나와요.');
    } else if (p.daewoonStart) {
      parts.push('아직 첫 대운 전이에요. ' + p.daewoonStart.startDate + '부터 ' + p.daewoonStart.startTerm.name +
        '을 기점으로 ' + p.daewoonStart.startAgeLabel + '에 첫 대운이 열려요.');
    }
    parts.push('올해는 ' + p.seun.hanja + ' 세운으로, 천간은 ' + p.seun.stemTen + ', 지지는 ' + p.seun.branchTen + '이에요.');
    if (p.seun.fromLabel) parts.push(p.seun.fromLabel + ' 입춘부터 이 세운이에요.');
    return { text: parts.join(' '), basis: [] };
  }

  function buildThemes(chart, period, name, focusKey) {
    var dm = chart.dayMaster;
    var m = PC.MASTER[dm];
    var rel = R.relOf(chart.dayMasterElem, chart.tiedMax[0]);
    var topGod = T.TEN_ORDER.slice().sort(function (a, b) { return (chart.tenCount[b] || 0) - (chart.tenCount[a] || 0) || T.TEN_ORDER.indexOf(a) - T.TEN_ORDER.indexOf(b); })[0];
    var group = T.GOD_GROUP[topGod];
    var flow = flowNarration(period, name);

    /* 근거 칩 — 문장이 실제로 쓴 Finding 에서만 만든다 */
    var core = R.core(chart);
    var coreIdx = makeIndex(core);
    var periodIdx = makeIndex(R.period(period));
    var basis = [];
    function addBasis(list) {
      list.forEach(function (id) {
        if (id.charAt(id.length - 1) === '*') {
          var pre = id.slice(0, -1);
          [coreIdx, periodIdx].forEach(function (ix) {
            Object.keys(ix.map).forEach(function (k) {
              if (k.indexOf(pre) === 0) {
                var f = ix.map[k];
                if (f && f.display && basis.indexOf(f.display.short) === -1) basis.push(f.display.short);
              }
            });
          });
          return;
        }
        var f = coreIdx.map[id] || periodIdx.map[id];
        if (f && f.display && basis.indexOf(f.display.short) === -1) basis.push(f.display.short);
      });
    }
    addBasis(['PERIOD.DAEWOON.*', 'PERIOD.NO_DAEWOON', 'PERIOD.SEUN.*']);
    addBasis(['DAY.MASTER.' + dm, 'REL.DAY.' + rel, 'ELEM.TIE.*', 'ELEM.MAX.*', 'GOD.GROUP.*']);
    basis = basis.slice(0, 6);

    var order;
    var out = [];

    function bodyFor(key) {
      var Tt = PC.THEME[key];
      var bits = [fill(m.focus[key], name), fill(Tt.elem[rel], name), fill(Tt.god[group], name)];
      if (chart.tiedMax.length > 1) bits.push('표면 개수는 ' + chart.tiedMax.map(function (e) { return ELEM_KO[e] + ' ' + chart.counts[e] + '개'; }).join(', ') + '로 같아요. 어느 하나를 최강으로 부르지 않고, 두 기운이 번갈아 쓰이는 것으로 봐요.');
      return bits.join(' ');
    }

    function theme(key) {
      var Tt = PC.THEME[key];
      return {
        key: key, title: Tt.label, kicker: Tt.kicker,
        term: chart.dayMasterName + ' · ' + chart.strongText + ' · ' + topGod + ' ' + (chart.tenCount[topGod] || 0),
        body: bodyFor(key),
        why: flow.text,
        basis: basis.slice()
      };
    }

    if (focusKey === 'year') {
      var y = theme('love');
      y.key = 'year'; y.title = C.FOCUS.year.label; y.kicker = C.FOCUS.year.label;
      y.body = fill(m.focus.year, name) + ' ' + flow.text;
      y.why = '';
      out.push(y);
      order = ['love', 'money', 'work'];
    } else {
      order = ['love', 'money', 'work'].filter(function (k) { return k !== focusKey; });
      order.unshift(focusKey);
    }
    order.forEach(function (k) { out.push(theme(k)); });
    return out;
  }

  function buildPaidTraits(chart, name) {
    var core = R.core(chart);
    var idx = makeIndex(core);
    var vars = buildVars(chart);
    vars.name = name && name !== '손님' ? name : '손님';
    var picked = ['trait1', 'trait2', 'trait3'].map(function (slot) {
      return select(PAID, slot, idx, chart.chartId);
    });
    var closer = select(PAID, 'closer', idx, chart.chartId);
    return picked.map(function (s) {
      return {
        label: s ? fill(s.label, vars) : '',
        text: s ? fill(s.text, vars) : '',
        id: s ? s.id : null,
        basis: s ? basisOf(s, idx) : []
      };
    }).concat(closer ? [{ label: fill(closer.label, vars), text: fill(closer.text, vars), id: closer.id, basis: basisOf(closer, idx) }] : []);
  }

  /* 반복되는 인생 패턴 3 — ① 십성 ② 일주 ③ 대운·세운(천간·지지 분리) */
  function buildPatterns(chart, period, name) {
    var dm = chart.dayMaster;
    var topGod = T.TEN_ORDER.slice().sort(function (a, b) { return (chart.tenCount[b] || 0) - (chart.tenCount[a] || 0) || T.TEN_ORDER.indexOf(a) - T.TEN_ORDER.indexOf(b); })[0];
    var group = T.GOD_GROUP[topGod];
    var out = [];

    var godPt = PC.PATTERN.god[group];
    out.push({ label: godPt.label, text: fill(godPt.text, name), cut: fill(godPt.cut, name), basis: '십성 · ' + topGod + ' ' + (chart.tenCount[topGod] || 0) });

    var d = chart.pillars.day.branch;
    var clash = [chart.pillars.year, chart.pillars.month, chart.pillars.hour].some(function (p) {
      return p && ((p.branch - d) % 12 + 12) % 12 === 6;
    });
    var axis = chart.dohwa ? 'dohwa' : (clash ? 'chung' : (['장생', '관대', '건록', '제왕', '태', '양'].indexOf(chart.pillars.day.stage) >= 0 ? 'strong' : 'weak'));
    var axisKo = { dohwa: '도화', chung: '지지 충', strong: '일지 기세 강', weak: '일지 기세 약' }[axis];
    var pt = PC.PATTERN.pillar[axis];
    out.push({ label: pt.label, text: fill(pt.text, name), cut: fill(pt.cut, name), basis: '일주 · ' + chart.pillars.day.hanja + ' · ' + axisKo });

    var flow = flowNarration(period, name);
    var dw = period && period.daewoon;
    var flowLabel, cut;
    if (dw && dw.stemTen !== dw.branchTen) {
      flowLabel = '한 구간에 두 기운이 겹치는 반복';
      cut = '대운 천간의 ' + dw.stemTen + '은 바깥에서 오는 방식, 지지의 ' + dw.branchTen + '은 안에서 버티는 방식이에요. 둘을 같은 말로 설명하지 마세요. 밖에서는 ' + dw.stemTen + '처럼, 안에서는 ' + dw.branchTen + '처럼 움직이는 게 이 구간에 맞아요.';
    } else if (dw) {
      flowLabel = '같은 기운이 십 년을 반복하는 자리';
      cut = '천간과 지지가 같은 ' + dw.stemTen + '이라 방식이 하나예요. 잘될 때도 막힐 때도 같은 방식이 나와요. 방식을 바꾸려면 순서를 바꾸는 쪽이 쉬워요.';
    } else {
      flowLabel = '첫 대운을 기다리는 자리';
      cut = '첫 대운이 열리기 전에는 주변의 기운이 대운을 대신해요. 지금은 방향을 정하기보다 재료를 모으는 구간이에요.';
    }
    out.push({ label: flowLabel, text: flow.text, cut: cut, basis: dw ? ('대운 · ' + dw.hanja + ' · 올해 ' + period.seun.hanja) : ('올해 ' + period.seun.hanja) });

    return out;
  }

  function buildVars(chart) {
    var topTen = T.TEN_ORDER.map(function (t) { return { god: t, n: chart.tenCount[t] || 0 }; })
      .sort(function (a, b) { return b.n - a.n || T.TEN_ORDER.indexOf(a.god) - T.TEN_ORDER.indexOf(b.god); });
    var topGod = topTen[0].god;
    return {
      name: '{name}', chars: charsWord(chart),
      strongKo: ELEM_KO[chart.tiedMax[0]], strongKoJ: josa(ELEM_KO[chart.tiedMax[0]], '이가'),
      lackKo: chart.lacking.length ? ELEM_KO[chart.lacking[0]] : '',
      tieKo: chart.tiedMax.map(function (e) { return ELEM_KO[e]; }).join('·'),
      count: chart.elements.maxCount, pct: chart.share[chart.tiedMax[0]],
      god: topGod, godJ: josa(topGod, '이가'), n: chart.tenCount[topGod] || 0,
      monthKo: ELEM_KO[chart.monthElem], dmKo: chart.dayMasterName
    };
  }

  global.NyangRender = {
    select: select,
    basisOf: basisOf,
    makeIndex: makeIndex,
    fill: fill,
    buildFree: buildFree,
    buildPaidTraits: buildPaidTraits,
    buildPatterns: buildPatterns,
    buildThemes: buildThemes,
    flowNarration: flowNarration,
    charsWord: charsWord,
    josa: josa
  };
})(typeof window !== 'undefined' ? window : globalThis);
