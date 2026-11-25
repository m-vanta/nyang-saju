/* [자동 생성] 원본: apps/nyang-saju/src/domain/chart.js — tools/sync-engine.mjs 로 복사됨. 이 파일을 직접 고치지 마세요. */
/* ==========================================================================
   domain/chart.js — 출생 입력 → 명식(NatalChart)
   --------------------------------------------------------------------------
   · 시계를 읽지 않는다. 조회 시점은 period.js가 asOf로 따로 받는다.
   · 음력·윤달·시진·자시·서머타임을 입력 단계에서 확정하고, 가정한 값은
     flags.assumptions 에 남긴다(화면에서 그대로 고지한다).
   · 오행은 표면 개수(surface)와 지장간 가중(weighted) 두 뷰로 낸다.
     동률은 tiedMax 로 보존하고, 단일 최강을 만들지 않는다.
   ========================================================================== */
(function (global) {
  'use strict';

  var M = global.Manseryeok;
  var T = global.NyangTables;
  if (!M || !T) throw new Error('domain: manseryeok / tables 가 먼저 로드되어야 합니다.');

  var STEMS = T.STEMS, STEMS_HANJA = T.STEMS_HANJA, BRANCHES = T.BRANCHES, BRANCHES_HANJA = T.BRANCHES_HANJA;
  var STEM_ELEM = T.STEM_ELEM, BRANCH_ELEM = T.BRANCH_ELEM, ELEMS = T.ELEMS;
  var HIDDEN = T.HIDDEN, TEN_ORDER = T.TEN_ORDER, STAGES = T.STAGES, STAGE_START = T.STAGE_START;
  var DOHWA_MAP = T.DOHWA;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function isGregLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  function daysInMonth(y, m) {
    return [31, isGregLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  }
  function stamp(y, m, d, h, mi) {
    return y * 100000000 + m * 1000000 + d * 10000 + (h || 0) * 100 + (mi || 0);
  }
  /* KST 고정(+9) 벽시계 → UTC ms (절입 시각 표는 고정 +9다) */
  function kstWallMs(y, m, d, h, mi) {
    return Date.UTC(y, m - 1, d, (h || 0) - 9, mi || 0, 0);
  }
  /* 그때의 법정 시계 오프셋(분). 1954~1961 UTC+8:30, 서머타임 +60분 */
  function legalOffsetMinutes(y, m, d, h, mi) {
    var s = stamp(y, m, d, h, mi);
    var offset = 540;
    T.LEGAL_PERIODS.forEach(function (p) {
      if (s >= stamp(p.from[0], p.from[1], p.from[2], p.from[3], p.from[4])) offset = p.offset;
    });
    T.DST_PERIODS.forEach(function (pair) {
      var a = pair[0], b = pair[1];
      if (s >= stamp(a[0], a[1], a[2], a[3], a[4]) && s < stamp(b[0], b[1], b[2], b[3], b[4])) offset += 60;
    });
    return offset;
  }
  function wallToUtcMs(y, m, d, h, mi) {
    return Date.UTC(y, m - 1, d, h || 0, mi || 0, 0) - legalOffsetMinutes(y, m, d, h, mi) * 60000;
  }
  function msToKst(ms) {
    var k = new Date(ms + 9 * 3600000);
    return {
      y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate(),
      h: k.getUTCHours(), mi: k.getUTCMinutes()
    };
  }
  function fmtDate(ms) {
    var k = msToKst(ms);
    return k.y + '.' + pad2(k.m) + '.' + pad2(k.d);
  }
  function addYearsMs(ms, years) {
    return ms + years * 365.2425 * 86400000;
  }

  function tenGod(dayStem, otherStem) {
    var me = STEM_ELEM[dayStem], you = STEM_ELEM[otherStem];
    var same = (dayStem % 2) === (otherStem % 2);
    if (me === you) return same ? '비견' : '겁재';
    if (T.ELEM_MAKES[me] === you) return same ? '식신' : '상관';
    if (T.ELEM_KILLS[me] === you) return same ? '편재' : '정재';
    if (T.ELEM_KILLS[you] === me) return same ? '편관' : '정관';
    return same ? '편인' : '정인';
  }
  function stageOf(dayStem, branch) {
    var start = STAGE_START[dayStem];
    var step = dayStem % 2 === 0 ? 1 : -1;
    var i = ((branch - start) * step % 12 + 12) % 12;
    return STAGES[i];
  }
  function relKey(me, other) {
    if (!other) return 'same';
    if (me === other) return 'same';
    if (T.ELEM_MAKES[me] === other) return 'makes';
    if (T.ELEM_KILLS[me] === other) return 'kills';
    if (T.ELEM_KILLS[other] === me) return 'killed';
    if (T.ELEM_MAKES[other] === me) return 'cycle';
    return 'same';
  }
  function solarToLunar(y, m, d) {
    try {
      var r = M.solarToLunar(y, m, d);
      return { year: r.lunar.year, month: r.lunar.month, day: r.lunar.day, isLeap: !!r.lunar.isLeapMonth };
    } catch (e) { return null; }
  }
  function lunarToSolar(y, m, d, isLeap) {
    try {
      var r = M.lunarToSolar(y, m, d, !!isLeap);
      return { y: r.solar.year, m: r.solar.month, d: r.solar.day };
    } catch (e) { return null; }
  }
  var leapCache = {};
  function leapMonthOf(y) {
    if (leapCache[y] !== undefined) return leapCache[y];
    var found = 0;
    for (var m = 1; m <= 12; m++) {
      if (lunarToSolar(y, m, 1, true)) { found = m; break; }
    }
    leapCache[y] = found;
    return found;
  }

  function makePillar(stem, branch, dayStem) {
    var hidden = HIDDEN[branch].map(function (h) {
      return {
        stem: h[0], stemKo: STEMS[h[0]], hanja: STEMS_HANJA[h[0]],
        elem: STEM_ELEM[h[0]], weight: h[1], ten: tenGod(dayStem, h[0])
      };
    });
    return {
      stem: stem, branch: branch,
      stemKo: STEMS[stem], branchKo: BRANCHES[branch],
      hanja: STEMS_HANJA[stem] + BRANCHES_HANJA[branch],
      ko: STEMS[stem] + BRANCHES[branch],
      read: T.STEMS_READ[stem],
      stemElem: STEM_ELEM[stem], branchElem: BRANCH_ELEM[branch],
      yinYang: { stem: stem % 2 === 0 ? '양' : '음', branch: branch % 2 === 0 ? '양' : '음' },
      ten: { stem: tenGod(dayStem, stem), branch: tenGod(dayStem, hidden[0].stem) },
      hidden: hidden,
      stage: stageOf(dayStem, branch),
      dohwa: false
    };
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  /* 표면 개수 비율 — 같은 개수는 언제나 같은 % (최대잔여법으로 동률을 쪼개지 않는다) */
  function shareOf(counts, total) {
    var out = {};
    ELEMS.forEach(function (e) { out[e] = total ? round1((counts[e] / total) * 100) : 0; });
    return out;
  }

  function termUtc(t) { return kstWallMs(t.year, t.month, t.day, t.hour, t.minute); }

  /**
   * @param {Object} input { year, month, day, calendar, isLeap, hourIdx, ziSide, gender, name }
   * @param {Object} [opts] { clock:'korea-legal'|'kst-fixed' }
   */
  function chart(input, opts) {
    opts = opts || {};
    var clock = opts.clock || 'korea-legal';
    var isLunar = input.calendar === 'lunar';
    var assumptions = [];
    var solar;

    if (isLunar) {
      var leapYear = leapMonthOf(input.year);
      if (input.isLeap && leapYear !== input.month) {
        var err = new Error('음력 ' + input.year + '년 ' + input.month + '월에는 윤달이 없어요.' +
          (leapYear ? ' ' + input.year + '년 윤달은 ' + leapYear + '월이에요.' : ''));
        err.code = 'LUNAR_LEAP_INVALID';
        throw err;
      }
      solar = lunarToSolar(input.year, input.month, input.day, !!input.isLeap);
      if (!solar) {
        var e2 = new Error('음력 날짜를 확인해 주세요.');
        e2.code = 'LUNAR_INVALID';
        throw e2;
      }
    } else {
      solar = { y: input.year, m: input.month, d: input.day };
    }
    if (input.day > daysInMonth(solar.y, solar.m)) {
      var e3 = new Error('생년월일을 확인해 주세요.');
      e3.code = 'DATE_INVALID';
      throw e3;
    }

    var hourKnown = input.hourIdx !== null && input.hourIdx !== undefined && input.hourIdx !== '';
    var hourIdx = hourKnown ? Number(input.hourIdx) : null;
    var h, mi, timeLabel = null, ziSide = null;
    if (hourKnown) {
      if (hourIdx === 0) {
        ziSide = input.ziSide === 'late' ? 'late' : 'early';
        h = ziSide === 'late' ? 23 : 0;
        mi = 30;
        assumptions.push({
          key: 'ziSide', side: ziSide,
          text: ziSide === 'late'
            ? '자시(23:00~00:59) 가운데 전날 밤 23시대로 봤어요.'
            : '자시(23:00~00:59) 가운데 자정을 넘긴 00시대로 봤어요. 전날 밤 23시대라면 입력에서 바꿔 주세요.'
        });
      } else {
        h = T.HOURS[hourIdx].at;
        mi = 30;
      }
      timeLabel = T.HOURS[hourIdx].label;
    } else {
      assumptions.push({ key: 'hourUnknown', text: '출생시간을 몰라 시주를 빼고 여섯 글자로 봤어요. 연·월주는 그날 정오 기준이에요.' });
    }

    var res;
    try {
      res = M.calculateSaju(solar.y, solar.m, solar.d, hourKnown ? h : undefined,
        hourKnown ? mi : undefined, {
          clock: clock,
          boundaryRule: 'noon',
          applyTimeCorrection: false
        });
    } catch (e) {
      var e4 = new Error(isLunar ? '음력 날짜를 확인해 주세요.' : '생년월일을 확인해 주세요.');
      e4.code = 'ENGINE_INVALID';
      throw e4;
    }

    var yS = STEMS.indexOf(res.yearPillar[0]), yB = BRANCHES.indexOf(res.yearPillar[1]);
    var mS = STEMS.indexOf(res.monthPillar[0]), mB = BRANCHES.indexOf(res.monthPillar[1]);
    var dS = STEMS.indexOf(res.dayPillar[0]), dB = BRANCHES.indexOf(res.dayPillar[1]);
    var hS = res.hourPillar ? STEMS.indexOf(res.hourPillar[0]) : null;
    var hB = res.hourPillar ? BRANCHES.indexOf(res.hourPillar[1]) : null;

    var dayStem = dS;
    var yP = makePillar(yS, yB, dayStem);
    var mP = makePillar(mS, mB, dayStem);
    var dP = makePillar(dS, dB, dayStem);
    var hP = res.hourPillar ? makePillar(hS, hB, dayStem) : null;
    dP.isSelf = true;
    var list = [yP, mP, dP];
    if (hP) list.push(hP);

    var counts = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
    var weightedRaw = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
    list.forEach(function (p) {
      counts[p.stemElem]++;
      counts[p.branchElem]++;
      weightedRaw[p.stemElem] += 100;
      p.hidden.forEach(function (hd) { weightedRaw[hd.elem] += hd.weight; });
    });
    var total = list.length * 2;
    var share = shareOf(counts, total);
    var maxCount = 0;
    ELEMS.forEach(function (e) { if (counts[e] > maxCount) maxCount = counts[e]; });
    var tiedMax = ELEMS.filter(function (e) { return counts[e] === maxCount; });
    var minCount = Math.min.apply(null, ELEMS.map(function (e) { return counts[e]; }));
    var tiedMin = ELEMS.filter(function (e) { return counts[e] === minCount; });
    var lacking = ELEMS.filter(function (e) { return counts[e] === 0; });

    var weightTotal = 0;
    ELEMS.forEach(function (e) { weightTotal += weightedRaw[e]; });
    var weighted = {};
    ELEMS.forEach(function (e) { weighted[e] = weightTotal ? round1(weightedRaw[e] / weightTotal * 100) : 0; });
    var wMax = 0;
    ELEMS.forEach(function (e) { if (weighted[e] > wMax) wMax = weighted[e]; });
    var weightedTop = ELEMS.filter(function (e) { return weighted[e] === wMax; });

    var hiddenElems = [];
    list.forEach(function (p) {
      p.hidden.forEach(function (hd) {
        if (counts[hd.elem] === 0 && hiddenElems.indexOf(hd.elem) === -1) hiddenElems.push(hd.elem);
      });
    });

    var tenCount = {};
    TEN_ORDER.forEach(function (t) { tenCount[t] = 0; });
    list.forEach(function (p) {
      if (!p.isSelf) tenCount[p.ten.stem]++;
      tenCount[p.ten.branch]++;
    });

    var tYear = DOHWA_MAP[yB], tDay = DOHWA_MAP[dB];
    var dohwa = list.some(function (p) { return p.branch === tYear || p.branch === tDay; });
    list.forEach(function (p) { p.dohwa = (p.branch === tYear || p.branch === tDay); });

    /* 절입 경계 — 시진 창(자시는 23:00~24:00 또는 00:00~01:00) 안에 절입이 있는지 */
    var termEdge = false, termEdgeTerm = null, ziEdge = false;
    if (hourKnown) {
      var winStartH = hourIdx === 0 ? (ziSide === 'late' ? 23 : 0) : T.HOURS[hourIdx].start;
      var winEndH = hourIdx === 0 ? (ziSide === 'late' ? 24 : 1) : T.HOURS[hourIdx].start + 2;
      var jeol;
      try {
        jeol = M.getJeolAround(solar.y, solar.m, solar.d, Math.min(h, 23), h === 0 ? 0 : mi, { clock: clock });
      } catch (e) { jeol = null; }
      if (jeol) {
        [jeol.prev, jeol.next].forEach(function (t) {
          if (!t) return;
          var sameDay = t.year === solar.y && t.month === solar.m && t.day === solar.d;
          if (!sameDay) return;
          if (t.hour >= winStartH && t.hour < winEndH) {
            termEdge = true;
            termEdgeTerm = t.name;
          }
          if (hourIdx === 0) ziEdge = true;
        });
      }
      if (hourIdx === 0) ziEdge = true;
    }

    var dstApplied = false;
    if (hourKnown) {
      dstApplied = legalOffsetMinutes(solar.y, solar.m, solar.d, h, mi) !== 540;
    }
    if (dstApplied) {
      assumptions.push({ key: 'dst', text: '그 시기 한국 법정 시계(서머타임·UTC+8:30)로 보정했어요.' });
    }

    var birthMs = hourKnown ? wallToUtcMs(solar.y, solar.m, solar.d, h, mi)
      : wallToUtcMs(solar.y, solar.m, solar.d, 12, 0);
    var dw = daewoonOf({
      solar: solar, hourKnown: hourKnown, h: h, mi: mi, clock: clock,
      yStem: yS, mStem: mS, mBranch: mB, birthMs: birthMs,
      gender: input.gender, dayStem: dayStem
    });

    var lunarInfo = isLunar
      ? { year: input.year, month: input.month, day: input.day, isLeap: !!input.isLeap }
      : solarToLunar(solar.y, solar.m, solar.d);

    var dist = ELEMS.map(function (e) {
      return {
        elem: e, hanja: T.ELEM_HANJA[e], ko: T.ELEM_KO[e], count: counts[e],
        pct: share[e], raw: total ? counts[e] / total * 100 : 0,
        color: T.ELEM_COLOR[e], ink: T.ELEM_INK[e], soft: T.ELEM_SOFT[e]
      };
    });

    var chartObj = {
      chartVersion: 'natal/2.3',
      convention: {
        engine: 'manseryeok@1.3.0', clock: clock, dayBoundary: '00:00',
        ziRule: 'ja-si-split', hourMapping: 'sijeon-midpoint', termBoundary: 'jeol-ip'
      },
      input: {
        raw: {
          calendar: isLunar ? 'lunar' : 'solar', isLeap: !!input.isLeap,
          year: input.year, month: input.month, day: input.day,
          hourIdx: hourKnown ? hourIdx : null, ziSide: ziSide, gender: input.gender || null
        },
        normalized: {
          solar: { y: solar.y, m: solar.m, d: solar.d },
          lunar: lunarInfo,
          time: hourKnown
            ? { known: true, hh: h, mm: mi, label: timeLabel, assumedFrom: 'sijeon-midpoint' }
            : { known: false, hh: null, mm: null, assumedFrom: 'noon' }
        }
      },
      solar: { y: solar.y, m: solar.m, d: solar.d },
      lunar: lunarInfo,
      hour: hourKnown ? { idx: hourIdx, label: T.HOURS[hourIdx].label, range: T.HOURS[hourIdx].range, at: h, side: ziSide } : null,
      birthTime: hourKnown ? { h: h, m: mi, label: T.HOURS[hourIdx].label } : null,
      pillars: { year: yP, month: mP, day: dP, hour: hP },
      list: list,
      counts: counts,
      share: share,
      dist: dist,
      weighted: weighted,
      weightedTop: weightedTop,
      total: total,
      elements: {
        surface: counts,
        weighted: weighted,
        share: share,
        maxCount: maxCount,
        tiedMax: tiedMax,
        minCount: minCount,
        tiedMin: tiedMin
      },
      dominant: tiedMax,
      tiedMax: tiedMax,
      tiedMin: tiedMin,
      strongest: { elem: tiedMax[0], count: maxCount, pct: share[tiedMax[0]], tied: tiedMax.length > 1, tiedElems: tiedMax.slice() },
      lacking: lacking,
      hiddenElems: hiddenElems,
      tenCount: tenCount,
      dayMaster: dayStem,
      dayMasterName: STEMS[dayStem] + STEM_ELEM[dayStem],
      dayMasterHanja: STEMS_HANJA[dayStem] + T.ELEM_HANJA[STEM_ELEM[dayStem]],
      dayMasterElem: STEM_ELEM[dayStem],
      dohwa: dohwa,
      monthElem: BRANCH_ELEM[mB],
      monthBranch: mB,
      daewoon: dw,
      flags: {
        hourUnknown: !hourKnown,
        ziEdge: ziEdge,
        termEdge: termEdge,
        termEdgeTerm: termEdgeTerm,
        dstApplied: dstApplied,
        lunarConverted: isLunar,
        lunarLeap: isLunar && !!input.isLeap,
        assumptions: assumptions
      },
      termEdge: termEdge,
      hourEdge: false,
      engine: 'manseryeok 1.3.0'
    };

    chartObj.chartId = chartId(chartObj);
    return chartObj;
  }

  function chartId(c) {
    var p = c.pillars;
    var s = [p.year.ko, p.month.ko, p.day.ko, p.hour ? p.hour.ko : '--'].join(' ');
    if (c.flags.ziEdge) s += '|zi:' + (c.hour ? c.hour.side : '');
    return s + '|' + c.chartVersion;
  }

  /* ---------------- 대운 ---------------- */

  function daewoonOf(o) {
    var jeol;
    try {
      jeol = M.getJeolAround(o.solar.y, o.solar.m, o.solar.d,
        o.hourKnown ? o.h : 12, o.hourKnown ? o.mi : 0, { clock: o.clock || 'korea-legal' });
    } catch (e) { return null; }
    if (!jeol || !jeol.prev || !jeol.next) return null;

    var male = o.gender === '남성' || o.gender === '남';
    var yangYear = o.yStem % 2 === 0;
    var forward = (yangYear && male) || (!yangYear && !male); // 양남·음녀 순행

    var target = forward ? jeol.next : jeol.prev;
    var days = Math.abs(termUtc(target) - o.birthMs) / 86400000;
    var startAgeYears = days / 3;                       // 3일 = 1년
    var startAge = Math.floor(startAgeYears + 1e-9);
    var startMonths = Math.round((startAgeYears - startAge) * 12);
    if (startMonths >= 12) { startAge += 1; startMonths -= 12; }
    var startMs = addYearsMs(o.birthMs, startAgeYears);

    var base = 0;
    for (var i = 0; i < 60; i++) { if (i % 10 === o.mStem && i % 12 === o.mBranch) { base = i; break; } }

    var yearMs = 365.2425 * 86400000;
    var list = [];
    for (var k = 1; k <= 10; k++) {
      var idx = ((base + (forward ? k : -k)) % 60 + 60) % 60;
      var fromMs = addYearsMs(startMs, (k - 1) * 10);
      var toMs = addYearsMs(startMs, k * 10);
      var age = Math.floor((fromMs - o.birthMs) / yearMs + 1e-9);
      var stem = idx % 10, branch = idx % 12;
      list.push({
        index: k, age: age, ageRange: [age, age + 9],
        fromMs: fromMs, toMs: toMs,
        from: fmtDate(fromMs), to: fmtDate(toMs), toInclusive: fmtDate(toMs - 86400000),
        year: msToKst(fromMs).y,
        stem: stem, branch: branch,
        hanja: STEMS_HANJA[stem] + BRANCHES_HANJA[branch],
        ko: STEMS[stem] + BRANCHES[branch],
        stemElem: STEM_ELEM[stem], branchElem: BRANCH_ELEM[branch],
        stemTen: tenGod(o.dayStem, stem),
        branchTen: tenGod(o.dayStem, HIDDEN[branch][0][0]),
        stemRel: relKey(STEM_ELEM[o.dayStem], STEM_ELEM[stem]),
        branchRel: relKey(STEM_ELEM[o.dayStem], BRANCH_ELEM[branch]),
        now: false
      });
    }
    return {
      forward: forward,
      startAge: startAge,
      startMonths: startMonths,
      startAgeLabel: startAge + '세' + (startMonths ? ' ' + startMonths + '개월' : ''),
      startMs: startMs,
      startDate: fmtDate(startMs),
      startTerm: { name: target.name, date: fmtDate(termUtc(target)) },
      list: list,
      current: null
    };
  }

  function applyAsOf(c, asOf) {
    var dw = c.daewoon;
    if (!dw) return null;
    var t = asOf instanceof Date ? asOf.getTime() : new Date(asOf).getTime();
    var cur = dw.list.filter(function (d) { return t >= d.fromMs && t < d.toMs; })[0] || null;
    dw.list.forEach(function (d) { d.now = !!cur && d === cur; });
    dw.current = cur;
    return cur;
  }

  global.NyangDomain = {
    chart: chart,
    applyAsOf: applyAsOf,
    tenGod: tenGod,
    stageOf: stageOf,
    relKey: relKey,
    solarToLunar: solarToLunar,
    lunarToSolar: lunarToSolar,
    leapMonthOf: leapMonthOf,
    daysInMonth: daysInMonth,
    fmtDate: fmtDate,
    wallToUtcMs: wallToUtcMs,
    legalOffsetMinutes: legalOffsetMinutes,
    kstWallMs: kstWallMs,
    msToKst: msToKst,
    stemOf: function (ch) { return STEMS.indexOf(ch); },
    branchOf: function (ch) { return BRANCHES.indexOf(ch); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
