/* ==========================================================================
   domain/period.js — 조회 시점(asOf) → 세운·대운
   --------------------------------------------------------------------------
   세운은 1월 1일이 아니라 입춘 절입 순간에 바뀐다. 대운은 출생 시각 + 대운수
   (3일=1년)로 열리고, 그 날짜부터 10년씩 간다. 이 파일은 시계를 직접 읽지 않고
   asOf 를 반드시 인자로 받는다.
   ========================================================================== */
(function (global) {
  'use strict';

  var M = global.Manseryeok;
  var T = global.NyangTables;
  var D = global.NyangDomain;
  if (!M || !T || !D) throw new Error('period: manseryeok / tables / domain 이 먼저 로드되어야 합니다.');

  var STEMS = T.STEMS, STEMS_HANJA = T.STEMS_HANJA, BRANCHES = T.BRANCHES, BRANCHES_HANJA = T.BRANCHES_HANJA;
  var HIDDEN = T.HIDDEN, STEM_ELEM = T.STEM_ELEM, BRANCH_ELEM = T.BRANCH_ELEM;

  function kstIso(t) {
    var k = D.msToKst(t);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return k.y + '-' + p(k.m) + '-' + p(k.d) + 'T' + p(k.h) + ':' + p(k.mi) + '+09:00';
  }

  function ipchunOf(year) {
    var t;
    try { t = M.getIpchun(year); } catch (e) { return null; }
    return {
      name: t.name || '입춘', year: t.year, month: t.month, day: t.day,
      hour: t.hour, minute: t.minute,
      ms: D.kstWallMs(t.year, t.month, t.day, t.hour, t.minute),
      label: t.year + '.' + (t.month < 10 ? '0' : '') + t.month + '.' + (t.day < 10 ? '0' : '') + t.day +
        ' ' + (t.hour < 10 ? '0' : '') + t.hour + ':' + (t.minute < 10 ? '0' : '') + t.minute
    };
  }

  function yearPillarOf(year) {
    var res = M.calculateSaju(year, 7, 1, 12, 0, { clock: 'kst-fixed', applyTimeCorrection: false });
    return {
      stem: STEMS.indexOf(res.yearPillar[0]),
      branch: BRANCHES.indexOf(res.yearPillar[1]),
      ko: res.yearPillar,
      hanja: res.yearPillarHanja
    };
  }

  /**
   * @param {Object} chart NyangDomain.chart 결과
   * @param {string|number|Date} asOf 조회 시점 (없으면 안 됨 — 시계를 읽지 않는다)
   */
  function period(chart, asOf) {
    if (asOf === undefined || asOf === null) throw new Error('period: asOf 가 필요합니다.');
    var t = asOf instanceof Date ? asOf.getTime() : (typeof asOf === 'number' ? asOf : new Date(asOf).getTime());
    if (!isFinite(t)) throw new Error('period: asOf 형식이 올바르지 않습니다.');
    var k = D.msToKst(t);

    var ip = ipchunOf(k.y);
    var seunYear = ip && t < ip.ms ? k.y - 1 : k.y;
    var yp = yearPillarOf(seunYear);
    var dayStem = chart.dayMaster;

    var seun = {
      year: seunYear,
      stem: yp.stem, branch: yp.branch,
      ko: yp.ko, hanja: yp.hanja,
      stemElem: STEM_ELEM[yp.stem], branchElem: BRANCH_ELEM[yp.branch],
      stemTen: D.tenGod(dayStem, yp.stem),
      branchTen: D.tenGod(dayStem, HIDDEN[yp.branch][0][0]),
      stemRel: D.relKey(STEM_ELEM[dayStem], STEM_ELEM[yp.stem]),
      branchRel: D.relKey(STEM_ELEM[dayStem], BRANCH_ELEM[yp.branch]),
      from: ip ? ip.ms : null,
      fromLabel: ip ? ip.label : null,
      nextIpchun: ipchunOf(seunYear + 1)
    };

    var dw = chart.daewoon;
    var cur = null;
    if (dw) cur = D.applyAsOf(chart, t);
    var nextDw = null;
    if (dw) {
      nextDw = dw.list.filter(function (d) { return d.fromMs > t; })[0] || null;
    }

    return {
      asOf: kstIso(t),
      asOfMs: t,
      seun: seun,
      daewoon: cur ? {
        index: cur.index, ko: cur.ko, hanja: cur.hanja, stem: cur.stem, branch: cur.branch,
        stemTen: cur.stemTen, branchTen: cur.branchTen,
        stemRel: cur.stemRel, branchRel: cur.branchRel,
        from: cur.from, to: cur.to, ageRange: cur.ageRange,
        fromMs: cur.fromMs, toMs: cur.toMs
      } : null,
      nextDaewoon: nextDw ? {
        ko: nextDw.ko, hanja: nextDw.hanja, from: nextDw.from, age: nextDw.age,
        fromMs: nextDw.fromMs
      } : null,
      beforeFirstDaewoon: !!(dw && t < dw.startMs),
      daewoonStart: dw ? {
        startAge: dw.startAge, startAgeLabel: dw.startAgeLabel, startDate: dw.startDate,
        startMs: dw.startMs, startTerm: dw.startTerm, forward: dw.forward
      } : null
    };
  }

  /* ---------------- 인연 궁합 (제품 규약) ----------------
     명리 고전의 점수표가 아니다. 일간 오행 생극 + 일지 관계에 제품이 정한
     가중치를 붙인 '관계 유형' 분류다. 점수는 참고값이고, 유형·근거를 먼저 낸다. */
  function compatibility(mine, theirs) {
    var meE = STEM_ELEM[mine.dayMaster];
    var youE = STEM_ELEM[theirs.dayMaster];
    var relation, base;
    if (meE === youE) { relation = 'same'; base = 68; }
    else if (T.ELEM_MAKES[youE] === meE) { relation = 'gwiin'; base = 84; }
    else if (T.ELEM_KILLS[youE] === meE) { relation = 'drain'; base = 36; }
    else if (T.ELEM_KILLS[meE] === youE) { relation = 'press'; base = 54; }
    else { relation = 'give'; base = 60; }

    var myStem = mine.dayMaster, youStem = theirs.dayMaster;
    var hap = T.STEM_HAP[myStem] === youStem;
    var clash = T.STEM_CLASH[myStem] === youStem;
    var meB = mine.pillars.day.branch, youB = theirs.pillars.day.branch;
    var yukhap = T.SIX_HAP[meB] === youB;
    var chung = ((meB - youB) % 12 + 12) % 12 === 6;

    var score = base;
    var tags = [];
    var evidence = [
      { kind: 'stem', text: '일간 ' + STEMS_HANJA[myStem] + '(' + STEM_ELEM[myStem] + ') ↔ ' + STEMS_HANJA[youStem] + '(' + STEM_ELEM[youStem] + ')' },
      { kind: 'branch', text: '일지 ' + BRANCHES_HANJA[meB] + ' ↔ ' + BRANCHES_HANJA[youB] }
    ];
    if (hap) { score += 13; tags.push('천간합'); evidence.push({ kind: 'hap', text: '천간합 ' + STEMS_HANJA[myStem] + STEMS_HANJA[youStem] }); }
    if (clash) { score -= 8; tags.push('천간충'); evidence.push({ kind: 'clash', text: '천간충 ' + STEMS_HANJA[myStem] + STEMS_HANJA[youStem] }); }
    if (yukhap) { score += 8; tags.push('육합'); evidence.push({ kind: 'yukhap', text: '일지 육합 ' + BRANCHES_HANJA[meB] + BRANCHES_HANJA[youB] }); }
    if (chung) { score -= 8; tags.push('육충'); evidence.push({ kind: 'chung', text: '일지 육충 ' + BRANCHES_HANJA[meB] + BRANCHES_HANJA[youB] }); }

    score = Math.max(18, Math.min(98, Math.round(score)));
    var orbit = score >= 76 ? 1 : (score >= 56 ? 2 : 3);
    return {
      score: score, orbit: orbit, relation: relation,
      meElem: meE, youElem: youE,
      myTenOfYou: D.tenGod(myStem, youStem),
      tags: tags, hap: hap, clash: clash, yukhap: yukhap, chung: chung,
      evidence: evidence,
      scoreNote: '제품 규약 점수(고전 점수표 아님)'
    };
  }

  /* ---------------- 연애 타이밍 (절입 기준, asOf 명시) ---------------- */
  function jeolEntries(fromYear) {
    var out = [];
    for (var y = fromYear; y <= fromYear + 3; y++) {
      var terms;
      try { terms = M.getSolarTermsByYear(y); } catch (e) { continue; }
      terms.forEach(function (t) {
        if (t.type !== 'jeolgi') return;
        out.push({
          name: t.name, year: t.year, month: t.month, day: t.day, hour: t.hour, minute: t.minute,
          branch: t.sajuMonth % 12,
          ms: D.kstWallMs(t.year, t.month, t.day, t.hour, t.minute)
        });
      });
    }
    return out.sort(function (a, b) { return a.ms - b.ms; });
  }

  function loveTiming(chart, asOfMs) {
    if (asOfMs === undefined || asOfMs === null) throw new Error('loveTiming: asOf 가 필요합니다.');
    var start = asOfMs instanceof Date ? asOfMs.getTime() : (typeof asOfMs === 'number' ? asOfMs : new Date(asOfMs).getTime());
    var dayBranch = chart.pillars.day.branch;
    var dayElem = chart.dayMasterElem;
    var lacking = chart.lacking[0];
    var entries = jeolEntries(D.msToKst(start).y);
    var best = null;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.ms <= start) continue;
      var score = 0, why = [];
      if (T.SIX_HAP[dayBranch] === e.branch) { score += 3; why.push('일지와 육합'); }
      if (lacking && BRANCH_ELEM[e.branch] === lacking) { score += 2; why.push('비어 있던 ' + lacking + ' 기운이 채워짐'); }
      if (BRANCH_ELEM[e.branch] === T.ELEM_CYCLE[dayElem]) { score += 1; why.push('일간을 살리는 기운'); }
      if (!why.length) why.push(BRANCH_ELEM[e.branch] + ' 기운이 들어오는 달');
      if (!best || score > best.score) best = { entry: e, score: score, why: why };
      if (best.score >= 3 && i >= 2) break;
    }
    if (!best) return null;
    var next = null;
    for (var j = 0; j < entries.length; j++) {
      if (entries[j].ms > best.entry.ms) { next = entries[j]; break; }
    }
    return {
      startMs: best.entry.ms,
      endMs: next ? next.ms : best.entry.ms + 30 * 86400000,
      term: best.entry.name,
      branch: best.entry.branch,
      branchKo: BRANCHES[best.entry.branch],
      why: best.why,
      score: best.score,
      convention: '절입~다음 절입 구간, 육합=3·빈 오행=2·생조=1 (제품 규약)'
    };
  }

  global.NyangPeriod = {
    period: period,
    ipchunOf: ipchunOf,
    yearPillarOf: yearPillarOf,
    loveTiming: loveTiming,
    compatibility: compatibility
  };
})(typeof window !== 'undefined' ? window : globalThis);
