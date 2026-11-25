/* [자동 생성] 원본: apps/nyang-saju/saju.js — tools/sync-engine.mjs 로 복사됨. 이 파일을 직접 고치지 마세요. */
/* ==========================================================================
   saju.js — 호환 파사드 (v2.3)
   --------------------------------------------------------------------------
   실제 계산은 src/domain 으로 옮겼다. 이 파일은 예전 이름(NyangSaju)을 그대로
   쓰는 화면 코드·검사 스크립트를 위해 표와 함수를 다시 노출할 뿐이다.
   새 코드는 NyangDomain / NyangRules / NyangRender 를 직접 쓴다.
   ========================================================================== */
(function (global) {
  'use strict';

  var T = global.NyangTables;
  var D = global.NyangDomain;
  var Pu = global.NyangPeriod;
  if (!T || !D || !Pu) {
    throw new Error('saju.js: src/domain 파일이 saju.js보다 먼저 로드되어야 합니다.');
  }

  function computePillars(input, opts) { return D.chart(input, opts); }

  function loveTiming(chart, asOfMs) { return Pu.loveTiming(chart, asOfMs); }

  function reading(input, opts) {
    opts = opts || {};
    var chart = D.chart(input, opts);
    var asOf = opts.asOf != null ? opts.asOf : new Date().toISOString();
    var timing = Pu.loveTiming(chart, asOf);
    return {
      name: (input.name || '').trim() || '집사',
      chart: chart,
      period: Pu.period(chart, asOf),
      timing: timing,
      timingText: timing ? D.fmtDate(timing.startMs) + ' ~ ' + D.fmtDate(timing.endMs) : null
    };
  }

  var API = {
    STEMS: T.STEMS, STEMS_HANJA: T.STEMS_HANJA, STEMS_READ: T.STEMS_READ,
    BRANCHES: T.BRANCHES, BRANCHES_HANJA: T.BRANCHES_HANJA,
    ELEMS: T.ELEMS, ELEM_HANJA: T.ELEM_HANJA, ELEM_KO: T.ELEM_KO,
    ELEM_COLOR: T.ELEM_COLOR, ELEM_INK: T.ELEM_INK, ELEM_SOFT: T.ELEM_SOFT,
    ELEM_FILL: T.ELEM_FILL, ELEM_EDGE: T.ELEM_EDGE,
    ELEM_CYCLE: T.ELEM_CYCLE, ELEM_MAKES: T.ELEM_MAKES, ELEM_KILLS: T.ELEM_KILLS, ELEM_KILLED: T.ELEM_KILLED,
    STEM_ELEM: T.STEM_ELEM, BRANCH_ELEM: T.BRANCH_ELEM,
    HOURS: T.HOURS, WEEKDAYS: T.WEEKDAYS,
    TENS: T.TEN_ORDER, TEN_GROUP: T.TEN_GROUP, STAGES: T.STAGES, HIDDEN: T.HIDDEN,

    computePillars: computePillars,
    compatibility: Pu.compatibility,
    reading: reading,
    loveTiming: loveTiming,
    daewoonOf: function () { throw new Error('daewoonOf 는 v2.3에서 domain/chart 로 통합됐습니다.'); },
    tenGod: D.tenGod,
    stageOf: D.stageOf,
    solarToLunar: D.solarToLunar,
    lunarToSolar: D.lunarToSolar,
    leapMonthOf: D.leapMonthOf,
    daysInMonth: D.daysInMonth,
    fmtDate: D.fmtDate,
    fmtDateKo: function (ms) {
      var k = D.msToKst(ms);
      return k.m + '월 ' + k.d + '일';
    },
    hourIdxOf: function (h, mi) {
      var t = h * 60 + mi;
      if (t >= 23 * 60 || t < 60) return 0;
      return Math.floor((t - 60) / 120) + 1;
    },
    engine: global.Manseryeok
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.NyangSaju = API;
})(typeof window !== 'undefined' ? window : globalThis);
