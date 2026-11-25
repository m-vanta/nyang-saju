/* ==========================================================================
   palja.js — 팔자 고양이 (v2.3)
   --------------------------------------------------------------------------
   조립은 src/render/select.js 가 Finding 기반으로 한다. 이 파일은 예전
   이름(NyangPalja.build)을 유지하기 위한 얇은 다리다.
   ========================================================================== */
(function (global) {
  'use strict';

  var T = global.NyangTables;
  var R = global.NyangRules;
  var RD = global.NyangRender;
  if (!T || !R || !RD) throw new Error('palja.js: src/domain·rules·render 가 먼저 로드되어야 합니다.');

  function build(chart, nameArg) {
    return RD.buildFree(chart, nameArg || '');
  }

  function relKeyOf(chart) {
    return R.relOf(chart.dayMasterElem, chart.tiedMax[0]);
  }

  function topGodOf(chart) {
    var best = null;
    T.TEN_ORDER.forEach(function (t) {
      var n = chart.tenCount[t] || 0;
      if (n <= 0) return;
      if (!best || n > best.n) best = { god: t, n: n };
    });
    return best || { god: '비견', n: 1 };
  }

  var API = { build: build, relKeyOf: relKeyOf, GOD_GROUP: T.GOD_GROUP, topGodOf: topGodOf };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.NyangPalja = API;
})(typeof window !== 'undefined' ? window : globalThis);
