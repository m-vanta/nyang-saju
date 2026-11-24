/* ==========================================================================
   냥도사 · 행동 데이터 (analytics.js)
   --------------------------------------------------------------------------
   무료 → 유료 퍼널에서 실제로 어디서 멈추는지 보려면 화면이 아니라 사건을 세야 한다.
   여기서 세는 일곱 개가 이 앱의 퍼널 전부다.

     page_view         화면이 열렸다 (유입 경로 inviter · referrer 포함)
     input_start       생년월일 폼을 처음 건드렸다 (한 번만)
     free_result_view  무료 천기(팔자 고양이)가 열렸다
     result_share      무료 결과 카드를 저장/공유했다
     friend_invite     친구 초대 링크를 복사/공유했다
     pay_button_click  복채 1,900원 버튼을 눌렀다
     payment_complete  결제(지금은 미리보기)가 끝나 유료 천기가 열렸다

   저장소는 브라우저 메모리 버퍼(+ localStorage 사본)뿐이다. 서버로 보내려면
   setEndpoint(url | fn) 로 훅을 걸고 flush() 하면 된다. GA4 는 자동으로 gtag 를 쓴다.
   검증: window.__nyangAnalytics.count('page_view') 등으로 바로 확인할 수 있다.
   ========================================================================== */
(function (global) {
  'use strict';

  var KEY = 'nyangsaJu.analytics.v1';
  var MAX = 400;
  var EVENTS = [
    'page_view', 'input_start', 'free_result_view',
    'result_share', 'friend_invite', 'pay_button_click', 'payment_complete'
  ];

  var session = 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  var log = [];
  var sentUpTo = 0;
  var endpoint = null;
  var endpointKind = null;

  /* 이전 세션 기록은 남겨 두되, 이번 세션 사건과 섞이지 않게 session 으로 가른다 */
  function restore() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(KEY);
      if (!raw) return;
      var arr = JSON.parse(raw);
      if (Object.prototype.toString.call(arr) === '[object Array]') log = arr.slice(-MAX);
    } catch (e) { /* 저장소를 못 쓰면 메모리만 쓴다 */ }
  }

  function save() {
    try {
      if (global.localStorage) global.localStorage.setItem(KEY, JSON.stringify(log.slice(-120)));
    } catch (e) { /* 무시 */ }
  }

  function viewport() {
    return (global.innerWidth || 0) + 'x' + (global.innerHeight || 0);
  }

  function baseProps() {
    return {
      session: session,
      path: (global.location && global.location.pathname) || '/',
      viewport: viewport(),
      ts: Date.now()
    };
  }

  function clone(o) {
    try { return JSON.parse(JSON.stringify(o)); } catch (e) { return {}; }
  }

  /**
   * 사건 하나를 남긴다.
   * @param {string} name EVENTS 중 하나
   * @param {Object} [props] 함께 남길 값 (금액·방식·유형 …)
   */
  function track(name, props) {
    var rec = baseProps();
    rec.event = String(name);
    rec.props = clone(props || {});
    log.push(rec);
    if (log.length > MAX) log = log.slice(-MAX);
    save();
    sendOne(rec);
    return rec;
  }

  /* ---------- 외부 전송 훅 ---------- */

  function sendOne(rec) {
    if (!endpoint) {
      if (typeof global.gtag === 'function') {
        try {
          global.gtag('event', rec.event, Object.assign({
            session_id: rec.session, path: rec.path, viewport: rec.viewport
          }, rec.props));
        } catch (e) { /* 무시 */ }
      }
      return;
    }
    if (endpointKind === 'fn') {
      try { endpoint(clone(rec)); } catch (e) { /* 무시 */ }
      return;
    }
    flush();
  }

  /**
   * 외부 엔드포인트를 건다.
   * @param {string|Function} target 수집 URL 또는 수신 함수
   */
  function setEndpoint(target) {
    if (typeof target === 'function') { endpoint = target; endpointKind = 'fn'; return; }
    endpoint = target || null;
    endpointKind = target ? 'url' : null;
  }

  /** 아직 안 보낸 사건을 모아 한 번에 보낸다 (sendBeacon → fetch keepalive 순) */
  function flush() {
    if (!endpoint || endpointKind !== 'url') return 0;
    var batch = log.slice(sentUpTo);
    if (!batch.length) return 0;
    var body = JSON.stringify({ session: session, events: batch });
    var ok = false;
    try {
      if (global.navigator && global.navigator.sendBeacon) {
        ok = global.navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
      }
    } catch (e) { ok = false; }
    if (!ok) {
      try {
        global.fetch(endpoint, {
          method: 'POST', keepalive: true,
          headers: { 'Content-Type': 'application/json' }, body: body
        });
      } catch (e) { return 0; }
    }
    sentUpTo = log.length;
    return batch.length;
  }

  /* ---------- 조회 (테스트·디버깅) ---------- */

  function all(includePast) {
    var out = includePast ? log : log.filter(function (r) { return r.session === session; });
    return clone(out);
  }

  function names(includePast) {
    return all(includePast).map(function (r) { return r.event; });
  }

  function count(name, includePast) {
    return all(includePast).filter(function (r) { return r.event === name; }).length;
  }

  function last(name) {
    var hit = null;
    all().forEach(function (r) { if (r.event === name) hit = r; });
    return hit;
  }

  function has(name) { return count(name) > 0; }

  /** 이번 세션 사건만 지운다 (검증 스크립트가 초기화할 때) */
  function reset(hard) {
    if (hard) log = [];
    else log = log.filter(function (r) { return r.session !== session; });
    sentUpTo = Math.min(sentUpTo, log.length);
    save();
    return session;
  }

  /** 퍼널 순서대로 몇 건씩 지나갔는지 한눈에 */
  function funnel() {
    return EVENTS.map(function (e) { return { event: e, count: count(e) }; });
  }

  var API = {
    EVENTS: EVENTS,
    session: session,
    track: track,
    setEndpoint: setEndpoint,
    flush: flush,
    all: all,
    names: names,
    count: count,
    last: last,
    has: has,
    reset: reset,
    funnel: funnel,
    get log() { return clone(all()); }
  };

  global.NyangAnalytics = API;
  global.__nyangAnalytics = API;
})(typeof window !== 'undefined' ? window : globalThis);
