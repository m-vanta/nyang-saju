/* ==========================================================================
   냥도사의 천기누설 · 앱 UI (app.js)
   --------------------------------------------------------------------------
   화면 셋 : 입력 → 무료 천기(팔자 고양이) → 유료 천기(1,900원)
   계산은 saju.js(NyangSaju), 팔자 고양이는 palja.js(NyangPalja),
   문장은 copy.js(NyangCopy), 사건은 analytics.js(NyangAnalytics).
   ========================================================================== */
(function () {
  'use strict';

  var S = window.NyangSaju;
  var C = window.NyangCopy;
  var P = window.NyangPalja;
  var AN = window.NyangAnalytics;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var state = {
    gender: '여성',
    calendar: 'solar',
    focus: 'love',
    payMethod: 'kakaopay',
    reading: null,
    input: null,
    paid: false,
    canvasReady: false,
    shareReady: false,
    friends: [],
    friendGender: '여성',
    invite: null,
    selectedFriend: null,
    shareInvite: false,
    shareRatio: 'story',
    inputStarted: false,
    inputDone: false
  };

  var PAY_LABEL = { kakaopay: '카카오페이', tosspay: '토스페이', card: '신용카드' };

  /* --- 물상(物象) 아이콘 · 일러스트 매핑 -------------------------------- */

  var MU_STEM = [
    ['mu-tree', '큰나무'], ['mu-vine', '꽃·덩굴'], ['mu-sun', '태양'], ['mu-candle', '촛불'],
    ['mu-mountain', '큰 산'], ['mu-field', '기름진 밭'], ['mu-rock', '바위·쇠'], ['mu-gem', '보석'],
    ['mu-sea', '큰 바다'], ['mu-rain', '비·이슬']
  ];

  var MU_BRANCH = [
    ['mb-rat', '쥐'], ['mb-ox', '소'], ['mb-tiger', '호랑이'], ['mb-rabbit', '토끼'],
    ['mb-dragon', '용'], ['mb-snake', '뱀'], ['mb-horse', '말'], ['mb-sheep', '양'],
    ['mb-monkey', '원숭이'], ['mb-rooster', '닭·보석'], ['mb-dog', '개'], ['mb-pig', '돼지']
  ];

  var STEM_ELEM = ['목', '목', '화', '화', '토', '토', '금', '금', '수', '수'];

  // 오행별 고양이 일러스트 (화투 × 콩눈 펜선)
  var ELEM_ART = {
    목: { slug: 'wood', scene: '소나무와 매화 가지 아래에서 꽃잎을 보는' },
    화: { slug: 'fire', scene: '붉은 해가 떠오르는 아래 당당하게 앉은' },
    토: { slug: 'earth', scene: '둥근 산과 황토 밭 위에 느긋하게 앉은' },
    금: { slug: 'metal', scene: '바위와 초승달 아래 단정히 앉은' },
    수: { slug: 'water', scene: '물결과 빗줄기 사이를 거니는' }
  };

  /* ------------------------------------------------------------------ */
  /* 0. 초기화                                                          */
  /* ------------------------------------------------------------------ */

  function init() {
    buildSelects();
    buildOrbitSelects();
    bindSegments();
    bindFocus();
    bindInputStart();
    bindForm();
    bindMenu();
    bindFreeCta();
    bindPayment();
    bindOrbit();
    bindShare();
    bindResultActions();
    syncDays();
    state.friends = loadFriends();
    parseInvite();
    renderValueList();
    trackPageView();
  }

  function trackPageView() {
    var q = null;
    try { q = new URLSearchParams(location.search); } catch (e) { q = null; }
    AN.track('page_view', {
      inviter: (q && q.get('inviter')) || null,
      inviteLanded: !!state.invite,
      referrer: document.referrer || null,
      paid: false
    });
  }

  /* {name} 님 → '민지 님' (이름이 없으면 '손님'). '당신'은 어디에도 남기지 않는다 */
  function callName(nameArg) {
    var name = nameArg != null ? nameArg : (state.reading && state.reading.name) || '';
    return name && name !== '손님' ? name + ' 님' : '손님';
  }

  function fill(s, nameArg) {
    return String(s == null ? '' : s)
      .replace(/\{name\} 님/g, callName(nameArg))
      .replace(/\{name\}/g, callName(nameArg));
  }

  /* 팔자 고양이·분포 수치까지 채우는 치환 (유료 운 풀이·패턴에서 씀) */
  function fillv(s, r) {
    var p = (r || state.reading || {}).palja;
    if (!p) return fill(s, (r || {}).name);
    return fill(String(s == null ? '' : s), r.name)
      .replace(/\{strongKo\}/g, p.strongKo)
      .replace(/\{strongKoJ\}/g, josa(p.strongKo, '이가'))
      .replace(/\{lackKo\}/g, p.lackKo || '')
      .replace(/\{pct\}/g, p.pct != null ? p.pct : (r.chart.strongest.pct))
      .replace(/\{count\}/g, r.chart.strongest.count)
      .replace(/\{god\}/g, p.topGod)
      .replace(/\{godJ\}/g, josa(p.topGod, '이가'))
      .replace(/\{n\}/g, p.godCount);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // 본문 속 한자(甲木·癸水)는 명조로 — 타이포 규칙: 한자만 Song Myung
  var HANJA_RUN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]+/g;

  function hasJong(word) {
    var c = word.charCodeAt(word.length - 1);
    if (c < 0xAC00 || c > 0xD7A3) return false;
    return (c - 0xAC00) % 28 !== 0;
  }

  function josaOf(word, pair) {
    return hasJong(word) ? pair.charAt(0) : pair.charAt(1);
  }

  function josa(word, pair) {
    return word + josaOf(word, pair);
  }

  // 곧은 따옴표(")를 여는·닫는 따옴표로 — 한국어 본문에서 훨씬 읽힌다
  function tidy(s) {
    var open = true;
    return String(s).replace(/"/g, function () {
      var c = open ? '\u201C' : '\u201D';
      open = !open;
      return c;
    });
  }

  function hanjaize(s) {
    return tidy(String(s)).replace(HANJA_RUN, function (m) { return '<span class="han">' + m + '</span>'; });
  }

  // 앞 문장 몇 개만 (미리보기 1~2줄)
  function firstSent(text, max) {
    var t = tidy(text).replace(/\s+/g, ' ').trim();
    var parts = t.match(/[^.!?]+[.!?]?/g) || [t];
    var out = '';
    for (var i = 0; i < parts.length && i < max; i++) out += parts[i];
    return out.trim();
  }

  function clip(text, max) {
    var t = String(text);
    return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, '') + ' …' : t;
  }

  function elVars(elem) {
    return '--el:' + S.ELEM_COLOR[elem] + ';--el-ink:' + S.ELEM_INK[elem] + ';--el-soft:' + S.ELEM_SOFT[elem];
  }

  /* ------------------------------------------------------------------ */
  /* 1. 폼 · 입력                                                       */
  /* ------------------------------------------------------------------ */

  function bindMenu() {
    var toggles = $$('[data-menu-toggle]');
    if (!toggles.length) return;

    function panelOf(btn) {
      var screen = btn.closest('.screen');
      return screen ? screen.querySelector('[data-menu]') : null;
    }

    function closeAll(exceptPanel) {
      $$('[data-menu]').forEach(function (m) { m.hidden = (m !== exceptPanel); });
      toggles.forEach(function (b) {
        var p = panelOf(b);
        b.setAttribute('aria-expanded', (p && !p.hidden) ? 'true' : 'false');
      });
    }

    toggles.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var panel = panelOf(btn);
        if (!panel) return;
        var open = panel.hidden;
        closeAll(open ? panel : null);
        panel.hidden = !open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });

    $$('[data-menu]').forEach(function (panel) {
      panel.addEventListener('click', function (e) {
        var item = e.target.closest('.menu__item');
        if (!item) return;
        closeAll(null);
        var act = item.getAttribute('data-action');
        if (act === 'back-input') show('screen-input');
        if (act === 'back-free') backToFree();
        var note = item.getAttribute('data-menu-note');
        if (note === 'pay') toast(C.ui.menu.payToast);
        if (note === 'fun') toast(C.ui.menu.funToast);
      });
    });

    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-menu-toggle]') || e.target.closest('[data-menu]')) return;
      closeAll(null);
    });
  }

  function buildSelects() {
    var yearSel = $('#year'), monthSel = $('#month'), daySel = $('#day'), hourSel = $('#hour');
    var thisYear = new Date().getFullYear();

    yearSel.innerHTML = '';
    for (var y = thisYear; y >= 1930; y--) {
      var o = document.createElement('option');
      o.value = y; o.textContent = y;
      if (y === 1995) o.selected = true;
      yearSel.appendChild(o);
    }

    monthSel.innerHTML = '';
    for (var m = 1; m <= 12; m++) {
      var om = document.createElement('option');
      om.value = m; om.textContent = m;
      if (m === 4) om.selected = true;
      monthSel.appendChild(om);
    }

    daySel.innerHTML = '';
    for (var d = 1; d <= 31; d++) {
      var od = document.createElement('option');
      od.value = d; od.textContent = d;
      if (d === 12) od.selected = true;
      daySel.appendChild(od);
    }

    hourSel.innerHTML = '';
    var unknown = document.createElement('option');
    unknown.value = 'none'; unknown.textContent = '모름 (시간 모름)';
    hourSel.appendChild(unknown);
    S.HOURS.forEach(function (h) {
      var o = document.createElement('option');
      o.value = h.idx;
      o.textContent = h.label + ' ' + h.range;
      hourSel.appendChild(o);
    });
    hourSel.value = '6';
  }

  function bindSegments() {
    $$('.seg').forEach(function (seg) {
      var group = seg.getAttribute('data-group');
      seg.addEventListener('click', function (e) {
        var btn = e.target.closest('.seg__btn');
        if (!btn) return;
        $$('.seg__btn', seg).forEach(function (b) { b.classList.remove('is-on'); });
        btn.classList.add('is-on');
        var val = btn.getAttribute('data-value');
        if (group === 'gender') state.gender = val;
        if (group === 'calendar') { state.calendar = val; syncDays(); }
      });
    });
  }

  // 오늘 물어볼 것 — 연애운 / 재물운 / 일·사업운 / 올해 총운
  function bindFocus() {
    $('#status-grid').addEventListener('click', function (e) {
      var btn = e.target.closest('.status');
      if (!btn) return;
      $$('.status', $('#status-grid')).forEach(function (b) { b.classList.remove('is-on'); });
      btn.classList.add('is-on');
      var v = btn.getAttribute('data-value');
      state.focus = C.FOCUS[v] ? v : 'love';
      $('#value-focus').textContent = valueFocusLine();
    });
  }

  // 퍼널 2번: 폼을 처음 건드린 순간 한 번만
  function bindInputStart() {
    function once(field) {
      if (state.inputStarted) return;
      state.inputStarted = true;
      AN.track('input_start', { field: field, focus: state.focus });
    }
    ['name', 'year', 'month', 'day', 'hour'].forEach(function (id) {
      var el = $('#' + id);
      if (!el) return;
      el.addEventListener('focus', function () { once(id); });
      el.addEventListener('change', function () { once(id); });
    });
    $$('.seg, .status').forEach(function (el) {
      el.addEventListener('click', function () { once('chip'); });
    });
  }

  // 무료 화면 고정 바: 첫 화면에서는 팩폭을 가리지 않도록, 스크롤한 뒤에만 띄운다
  function bindFreeCta() {
    var app = $('#app');
    app.addEventListener('scroll', function () {
      if (!document.body.classList.contains('is-free')) return;
      document.body.classList.toggle('is-free-scrolled', app.scrollTop > 120);
    }, { passive: true });
  }

  function bindForm() {
    $('#year').addEventListener('change', function () { syncDays(); });
    $('#month').addEventListener('change', function () { syncDays(); });
    $('#isLeap').addEventListener('change', function () { syncDays({ keepLeap: true }); });
    $('#form').addEventListener('submit', function (e) {
      e.preventDefault();
      onSubmit();
    });
    $('#name').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); onSubmit(); }
    });
  }

  function syncDays(opts) {
    var keepLeap = !!(opts && opts.keepLeap);
    var y = +$('#year').value, m = +$('#month').value;
    var daySel = $('#day');
    var current = +daySel.value || 1;
    var leapWrap = $('#leap-wrap');
    var note = $('#lunar-note');
    var max;

    if (state.calendar === 'lunar') {
      var L = S.leapMonthOf(y);
      leapWrap.hidden = (L !== m);
      if (!keepLeap) $('#isLeap').checked = false;
      var isLeap = $('#isLeap').checked && L === m;
      max = S.lunarToSolar(y, m, 30, isLeap) ? 30 : 29;
      note.hidden = false;
      note.textContent = L ? (y + '년 음력 ' + L + '월에 윤달이 있다. 윤달이면 체크해.') : (y + '년에는 윤달이 없다.');
    } else {
      max = S.daysInMonth(y, m);
      leapWrap.hidden = true;
      $('#isLeap').checked = false;
      note.hidden = true;
    }

    daySel.innerHTML = '';
    for (var d = 1; d <= max; d++) {
      var o = document.createElement('option');
      o.value = d; o.textContent = d;
      if (d === Math.min(current, max)) o.selected = true;
      daySel.appendChild(o);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 2. 화면 전환                                                       */
  /* ------------------------------------------------------------------ */

  function show(id) {
    $$('.screen').forEach(function (s) { s.classList.toggle('is-active', s.id === id); });
    $$('[data-menu]').forEach(function (m) { m.hidden = true; });
    document.body.classList.toggle('is-free', id === 'screen-free');
    document.body.classList.toggle('is-paid', id === 'screen-result');
    document.body.classList.remove('is-free-scrolled');
    $('#app').scrollTo({ top: 0, behavior: 'auto' });
  }

  function backToFree() {
    if (!state.reading) { show('screen-input'); return; }
    if (state.paid) renderOrbit();
    show('screen-free');
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('is-on'); }, 2800);
  }

  /* ------------------------------------------------------------------ */
  /* 3. 제출 → 무료 천기                                                */
  /* ------------------------------------------------------------------ */

  function collect() {
    return {
      name: $('#name').value,
      gender: state.gender,
      year: +$('#year').value,
      month: +$('#month').value,
      day: +$('#day').value,
      calendar: state.calendar,
      isLeap: state.calendar === 'lunar' && $('#isLeap').checked && S.leapMonthOf(+$('#year').value) === +$('#month').value,
      hourIdx: $('#hour').value === 'none' ? null : +$('#hour').value,
      focus: state.focus
    };
  }

  function onSubmit() {
    var err = $('#form-error');
    err.hidden = true;
    var input = collect();
    var r;
    try {
      r = buildReading(S.computePillars(input), input);
    } catch (e) {
      if (window.console && console.error) console.error(e);
      err.textContent = /음력/.test(e && e.message ? e.message : '')
        ? '음력 날짜가 맞지 않아요. 생년월일을 다시 확인해 주세요.'
        : C.ui.error;
      err.hidden = false;
      return;
    }
    state.reading = r;
    state.input = input;
    state.paid = false;
    state.selectedFriend = null;

    // 퍼널 3번: 생년월일·성별·관심운세를 다 채우고 폼을 낸 순간 한 번만
    if (!state.inputDone) {
      state.inputDone = true;
      AN.track('input_complete', {
        name: !!input.name,
        gender: input.gender,
        calendar: input.calendar,
        hasTime: input.hourIdx != null,
        focus: r.focusKey,
        chars: r.chart.total
      });
    }

    renderFree(r, input);
    show('screen-free');

    AN.track('free_result_view', {
      dayMaster: r.dayMaster.short,
      dayMasterIdx: r.chart.dayMaster,
      cat: r.palja.name,
      chars: r.chart.total,
      focus: r.focusKey,
      inviteLanded: !!state.invite
    });
  }

  function birthLines(r, input) {
    var cal = input.calendar === 'lunar'
      ? '음력 ' + input.year + '.' + pad(input.month) + '.' + pad(input.day) + (input.isLeap ? ' (윤달)' : '')
      : '양력 ' + input.year + '.' + pad(input.month) + '.' + pad(input.day);
    var h1 = r.chart.hour ? r.chart.hour.label : '시간 모름';
    var h2 = r.chart.hour ? r.chart.hour.range + ' · ' + r.focus.label : '시주 빼고 여섯 글자 · ' + r.focus.label;
    return [cal + ' · ' + h1, h2];
  }

  // 캔버스·요약용 한 줄 (양력 1995.04.12 · 오시 11:00~12:59 · 올해 총운)
  function birthLine(r, input) {
    var cal = input.calendar === 'lunar'
      ? '음력 ' + input.year + '.' + pad(input.month) + '.' + pad(input.day) + (input.isLeap ? ' 윤달' : '')
      : '양력 ' + input.year + '.' + pad(input.month) + '.' + pad(input.day);
    var h = r.chart.hour ? r.chart.hour.label + ' ' + r.chart.hour.range : '시간 모름';
    return cal + ' · ' + h + ' · ' + r.focus.label;
  }

  /* ------------------------------------------------------------------ */
  /* 3-1. 천기 조립 — 만세력 결과 + 팔자 고양이 + copy.js               */
  /* ------------------------------------------------------------------ */

  function buildReading(chart, input) {
    var m = C.MASTER[chart.dayMaster];
    var focusKey = C.FOCUS[input.focus] ? input.focus : 'love';
    var elemKo = STEM_ELEM[chart.dayMaster];
    var dmName = S.STEMS[chart.dayMaster] + elemKo;
    var dmHanja = S.STEMS_HANJA[chart.dayMaster] + S.ELEM_HANJA[elemKo];
    var name = (input.name || '').trim() || '손님';
    var timing = S.loveTiming(chart, Date.now());

    var r = {
      name: name,
      callName: name === '손님' ? '손님' : name + ' 님',
      chart: chart,
      master: m,
      focusKey: focusKey,
      focus: C.FOCUS[focusKey],
      dayMaster: { name: dmName + '(' + dmHanja + ')', short: dmName, hanja: dmHanja, elem: elemKo },
      timing: timing,
      timingText: timing ? S.fmtDate(timing.startMs) + ' ~ ' + S.fmtDate(timing.endMs) : null
    };

    r.palja = P.build(chart, name);
    r.palja.pct = chart.strongest.pct;
    r.themes = themeSections(r);
    r.patterns = buildPatterns(r);
    r.summary = buildSummary(r);
    return r;
  }

  /* --- 유료 : 세 가지 운 (고른 운세부터) ----------------------------- */

  function themeSections(r) {
    var out = [];
    var order;
    if (r.focusKey === 'year') {
      out.push({
        key: 'year',
        title: '올해 총운',
        term: '일간 ' + r.dayMaster.short + ' · ' + r.palja.strongKo + ' ' + r.chart.strongest.count +
          '개(' + r.palja.pct + '%)',
        basis: basisFor(r, 'year'),
        body: fill(r.master.focus.year, r.name),
        why: r.timingText || ''
      });
      order = ['love', 'money', 'work'];
    } else {
      order = ['love', 'money', 'work'].filter(function (k) { return k !== r.focusKey; });
      order.unshift(r.focusKey);
    }
    order.forEach(function (k) {
      var T = C.THEME[k];
      var body = fill(r.master.focus[k], r.name) + ' ' +
        fillv(T.elem[r.palja.rel], r) + ' ' + fillv(T.god[r.palja.group], r);
      out.push({
        key: k,
        title: T.label,
        kicker: T.kicker,
        term: r.dayMaster.short + ' · ' + r.palja.strongKo + ' ' + r.chart.strongest.count + '개(' +
          r.palja.pct + '%) · ' + r.palja.topGod + ' ' + r.palja.godCount,
        basis: basisFor(r, k),
        body: body
      });
    });
    return out;
  }

  /* --- 상세 해설의 명리 근거 한 줄 -----------------------------------
     일간·일주·오행·십성·대운·올해 중 그 운에 실제로 쓰인 축만 골라 붙인다. */
  function basisFor(r, key) {
    var c = r.chart;
    var day = c.pillars.day;
    var dayLine = day ? '일주 ' + day.hanja : '';
    var elem = r.palja.strongKo + ' ' + c.strongest.count + '개(' + c.strongest.pct + '%)';
    var god = r.palja.topGod + ' ' + r.palja.godCount;
    var flow = flowAxis(c);
    var parts = ['일간 ' + r.dayMaster.short];
    if (key === 'love') {
      if (dayLine) parts.push(dayLine);
      parts.push(elem);
      parts.push(god);
    } else if (key === 'money') {
      parts.push(elem);
      parts.push(god);
      parts.push('대운 ' + flow.daeHanja);
    } else if (key === 'work') {
      if (dayLine) parts.push(dayLine);
      parts.push(god);
      parts.push('대운 ' + flow.daeHanja);
    } else {
      parts.push('대운 ' + flow.daeHanja);
      parts.push('올해 ' + flow.yearHanja);
    }
    return parts.join(' · ');
  }

  /* --- 유료 : 반복되는 인생 패턴 3개 ---------------------------------
     세 축을 겹치지 않게 나눈다.
       ① 십성(제일 센 십성) — 사람 사이에서 내가 맡는 역할
       ② 일주(日柱)와 지지 관계·도화 — 가까운 사이에서 생기는 어긋남
       ③ 대운·올해 흐름 — 시기가 만드는 반복
     ================================================================== */

  // ② 일주 축: 도화 → 지지 충 → 일지의 기세(12운성) 순으로 하나를 고른다
  function dayPillarAxis(chart) {
    if (chart.dohwa) return 'dohwa';
    var d = chart.pillars.day.branch;
    var clash = ['year', 'month', 'hour'].some(function (k) {
      var p = chart.pillars[k];
      return p && ((p.branch - d) % 12 + 12) % 12 === 6;
    });
    if (clash) return 'chung';
    var strong = ['장생', '관대', '건록', '제왕', '태', '양'].indexOf(chart.pillars.day.stage) >= 0;
    return strong ? 'strong' : 'weak';
  }

  // ③ 대운·올해 축: 대운 지지가 일간 오행과 어떤 관계인지
  function relToMe(chart, elem) {
    var me = S.STEM_ELEM[chart.dayMaster];
    if (!elem) return 'same';
    if (me === elem) return 'same';
    if (S.ELEM_MAKES[me] === elem) return 'makes';
    if (S.ELEM_KILLS[me] === elem) return 'kills';
    if (S.ELEM_KILLS[elem] === me) return 'killed';
    if (S.ELEM_MAKES[elem] === me) return 'cycle';
    return 'same';
  }

  function flowAxis(chart) {
    var dw = chart.daewoon && chart.daewoon.current;
    var yearNow = new Date().getFullYear();
    var dy = yearNow - chart.solar.y;
    var ys = (chart.pillars.year.stem + dy) % 10;
    var yb = (chart.pillars.year.branch + dy) % 12;
    var elem = dw ? S.BRANCH_ELEM[dw.branch] : S.BRANCH_ELEM[chart.pillars.year.branch];
    return {
      key: relToMe(chart, elem),
      daeHanja: dw ? dw.hanja : '아직 대운 전',
      daeKo: dw ? dw.ko : '대운 전',
      yearHanja: S.STEMS_HANJA[ys] + S.BRANCHES_HANJA[yb],
      yearKo: S.STEMS[ys] + S.BRANCHES[yb]
    };
  }

  function buildPatterns(r) {
    var out = [];
    function add(pt, vars, basis) {
      if (!pt) return;
      var text = String(pt.text);
      if (vars) {
        Object.keys(vars).forEach(function (k) {
          text = text.split('{' + k + '}').join(vars[k]);
        });
      }
      out.push({ label: pt.label, text: fillv(text, r), cut: fillv(pt.cut, r), basis: basis || '' });
    }

    // ① 십성 — 사람 사이에서 반복되는 역할
    add(C.PATTERN.god[r.palja.group], null, '십성 · ' + r.palja.topGod + ' ' + r.palja.godCount);

    // ② 일주·지지·도화 — 가까운 사이의 결
    var axis = dayPillarAxis(r.chart);
    var axisKo = { dohwa: '도화', chung: '지지 충', strong: '일지 기세 강', weak: '일지 기세 약' }[axis];
    add(C.PATTERN.pillar[axis], null,
      '일주 · ' + r.chart.pillars.day.hanja + (axisKo ? ' · ' + axisKo : ''));

    // ③ 대운·올해 — 시기가 만드는 반복
    var flow = flowAxis(r.chart);
    add(C.PATTERN.flow[flow.key], {
      daeHanja: flow.daeHanja, daeKo: flow.daeKo,
      yearHanja: flow.yearHanja, yearKo: flow.yearKo
    }, '대운 · ' + flow.daeHanja + ' · 올해 ' + flow.yearHanja);

    return out.slice(0, 3);
  }

  /* --- 무료 : 연애·재물·직업운 미리보기 (1~2줄) ---------------------- */

  function previewItems(r) {
    var order = ['love', 'money', 'work'].filter(function (k) { return k !== r.focusKey; });
    var items = order.map(function (k) {
      var T = C.THEME[k];
      var base = firstSent(fill(r.master.focus[k], r.name), 1);
      var tail = firstSent(fillv(T.elem[r.palja.rel], r), 1);
      return { key: k, label: T.label, text: clip(base + ' ' + tail, 96) };
    });
    // 올해 총운을 골랐을 때는 연애·재물·직업 대신 올해·타이밍을 먼저 보여 준다
    if (r.focusKey === 'year') {
      items.unshift({
        key: 'year',
        label: C.FOCUS.year.label,
        text: clip(firstSent(fill(r.master.focus.year, r.name), 1) + ' ' +
          firstSent(fill(r.master.timing, r.name), 1), 96)
      });
    } else {
      var idx = order.indexOf(r.focusKey);
      if (idx >= 0) items.unshift(items.splice(idx, 1)[0]);
    }
    return items;
  }

  // 결과 요약 복사 — 단톡방에 붙여도 도사의 말투가 남게
  function buildSummary(r) {
    var p = r.chart.pillars;
    var m = r.master;
    var line = function (pl) { return pl ? pl.ko + '(' + pl.hanja + ')' : '시주 모름'; };
    var L = [];
    L.push('냥도사의 천기누설 — ' + r.name);
    L.push('팔자 고양이: ' + r.palja.name + ' (' + r.palja.hanja + ' · ' + r.palja.short + ')');
    L.push('한 줄 정의: ' + r.palja.def);
    L.push('사주명식: ' + line(p.year) + ' · ' + line(p.month) + ' · ' + line(p.day) + ' · ' + line(p.hour));
    L.push('오행: ' + r.chart.dist.map(function (d) { return d.elem + d.count + '개(' + d.pct + '%)'; }).join(' '));
    L.push('');
    L.push(fill(r.palja.bomb, r.name));
    L.push('');
    r.themes.forEach(function (t) {
      L.push('[' + t.title + ']');
      L.push(fill(t.body, r.name));
      L.push('');
    });
    L.push('[반복되는 인생 패턴]');
    r.patterns.forEach(function (pt) {
      L.push('· ' + pt.label + ': ' + fill(pt.text, r.name) + ' → ' + fill(pt.cut, r.name));
    });
    L.push('');
    L.push('· ' + C.ui.result.talismanTitle + ': ' + fill(m.talisman, r.name));
    L.push('');
    L.push('냥도사가 봤어요. 재미로 보세요.');
    return tidy(L.join('\n'));
  }

  /* ------------------------------------------------------------------ */
  /* 4. 무료 화면 렌더                                                   */
  /* ------------------------------------------------------------------ */

  function renderFree(r, input) {
    var p = r.palja;
    var elem = r.dayMaster.elem;
    var art = ELEM_ART[elem];

    $('#free-crumb').textContent = C.FREE.crumb;
    $('#cat-kicker').textContent = fill(C.FREE.kicker);
    $('#cat-kicker').setAttribute('data-for', r.name);

    var img = $('#cat-art');
    img.onerror = function () {
      img.onerror = null;
      img.src = 'public/cat-' + art.slug + '-ink.png';
    };
    img.src = 'public/cat-' + art.slug + '-ink.webp';
    img.alt = S.ELEM_HANJA[elem] + ' · ' + p.name + ' — ' + (r.master.scene || art.scene) + ' 콩눈 고양이 그림';

    $('#cat-no').textContent = pad(r.chart.dayMaster + 1);
    $('#cat-name').textContent = p.name;
    $('#cat-hanja').innerHTML = '<span class="han">' + p.hanja + '</span> · ' + esc(p.short);
    $('#cat-hanja').setAttribute('style', elVars(elem));
    $('#cat-def').textContent = tidy(p.def);
    $('#cat-ten').textContent = tidy(p.tenLine);
    $('#cat-facts').innerHTML = p.facts.map(function (f) { return '<span>' + esc(f) + '</span>'; }).join('');
    $('#cat-tags').innerHTML = p.tags.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
    $('#cat-essay').innerHTML = hanjaize(p.essay);
    $('#free-bomb').textContent = tidy(p.bomb);

    // 대표 성향 3
    $('#traits-sub').textContent = C.FREE.traitsSub;
    $('#traits-list').innerHTML = p.traits.map(function (t) {
      return '<li class="trait"><span class="trait__no">' + t.no + '</span>' +
        '<span class="trait__label">' + esc(t.label) + '</span>' +
        '<p class="trait__text">' + hanjaize(t.text) + '</p></li>';
    }).join('');

    // 사주명식 · 오행 (접기)
    $('#fold-chart-line').innerHTML = foldLine(r.chart);
    $('#fold-toggle-text').textContent = C.FREE.chartFoldOpen;
    renderPillars($('#pillars'), r.chart);
    $('#free-meta').textContent = metaLine(r.chart);
    $('#free-myeong-foot').innerHTML = myeongFoot(r.chart, false, r.name);
    $('#free-oheng-badge').textContent = '일간 ' + r.dayMaster.short;
    renderOheng($('#oheng'), r.chart);
    renderCycle($('#cycle'), r.chart, r.name);
    $('#fold-note').textContent = C.FREE.chartFoldNote;

    // 유료 미리보기 (구매 전 맛보기)
    $('#preview-title').textContent = C.FREE.previewTitle;
    $('#preview-sub').textContent = C.FREE.previewSub;
    $('#preview-list').innerHTML = previewItems(r).map(function (it) {
      return '<li class="preview__item">' +
        '<div class="preview__top"><span class="preview__label">' + esc(it.label) + '</span>' +
        '<span class="preview__chip">' + C.FREE.lockTag + '</span></div>' +
        '<p class="preview__text">' + hanjaize(it.text) + '</p></li>';
    }).join('');

    // 1,900원으로 열리는 다섯 가지
    $('#value-sub').textContent = C.FREE.valueSub;
    $('#value-focus').textContent = valueFocusLine();
    $('#value-note').textContent = C.FREE.valueNote;

    // 무료 결과 카드
    $('#share-sub').textContent = C.FREE.shareSub;
    $('#share-invite-label').textContent = C.FREE.shareInvite;
    $('#share-invite-hint').textContent = fill(C.FREE.shareInviteHint);
    $('#btn-share-save').textContent = C.FREE.shareSave;
    $('#btn-share-share').textContent = C.FREE.shareShare;
    $('#btn-share-share').hidden = !canShareFiles();
    state.shareInvite = false;
    state.shareRatio = state.shareRatio === 'square' ? 'square' : 'story';
    $('#share-invite').checked = false;
    $$('.seg[data-group="share-ratio"] .seg__btn').forEach(function (b) {
      var on = b.getAttribute('data-ratio') === state.shareRatio;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    drawShareCard(r, state.shareRatio);

    // 인연 궤도 (무료)
    $('#orbit-kicker').textContent = C.FREE.orbitKicker;
    $('#orbit-sub').textContent = C.FREE.orbitSub;
    $('#orbit-type-kicker').textContent = C.FREE.orbitTypeKicker;
    $('#orbit-lock').textContent = C.FREE.orbitLock;
    $('#orbit-invite-hint').textContent = fill(C.orbit.inviteHint);
    $('#btn-invite').textContent = C.orbit.inviteBtn;
    $('#btn-invite-share').hidden = !canShareFiles();
    renderOrbit();
  }

  function valueFocusLine() {
    var label = (C.FOCUS[state.focus] || C.FOCUS.love).label;
    return C.FREE.valueFocus.replace('{focus}', label);
  }

  // 1,900원으로 열리는 다섯 가지 — 무료 화면 목록·결제 시트·유료 체크리스트
  function renderValueList() {
    var rows = C.VALUE.map(function (v) {
      return '<li class="value__item"><span class="value__no">' + v.no + '</span>' +
        '<span class="value__title">' + esc(v.title) + '</span>' +
        '<p class="value__desc">' + esc(v.desc) + '</p></li>';
    }).join('');
    var box = $('#value-list');
    if (box) box.innerHTML = rows;
  }

  function foldLine(chart) {
    var out = [];
    ['year', 'month', 'day', 'hour'].forEach(function (k) {
      var p = chart.pillars[k];
      if (!p) {
        out.push('<span class="fold__pillar" style="color:var(--ink-3)">?</span>');
        return;
      }
      out.push('<span class="fold__pillar">' +
        '<span style="color:' + S.ELEM_INK[p.stemElem] + '">' + S.STEMS_HANJA[p.stem] + '</span>' +
        '<span style="color:' + S.ELEM_INK[p.branchElem] + '">' + S.BRANCHES_HANJA[p.branch] + '</span>' +
        '</span>');
    });
    var counts = chart.dist.map(function (d) {
      return '<span class="fold__elem" data-el="' + d.elem + '" style="' + elVars(d.elem) + '">' +
        '<span class="han">' + d.hanja + '</span> ' + d.count + '</span>';
    }).join('');
    return '<span>일간 ' + chart.dayMasterName + '</span><span>·</span>' +
      out.join('') + '<span>·</span>' + counts;
  }

  /* --- 사주명식 카드 ------------------------------------------------- */

  function tenChip(ten, elem, isSelf) {
    if (isSelf) return '<span class="pillar__ten pillar__ten--self">' + C.ui.chart.self + '</span>';
    return '<span class="pillar__ten" data-el="' + elem + '" style="' + elVars(elem) + '">' + ten + '</span>';
  }

  function hanChar(ch, elem) {
    return '<span class="pillar__han" data-el="' + elem + '">' + ch + '</span>';
  }

  function halfPillar(hanja, elem, mu, ten, isSelf) {
    var svg = mu
      ? '<svg class="pillar__mu" viewBox="0 0 32 32" aria-hidden="true"><use href="#' + mu[0] + '"/></svg>'
      : '';
    var name = mu ? '<span class="pillar__mu-name">' + mu[1] + '</span>' : '';
    return '<div class="pillar__half" style="' + elVars(elem) + '">' +
      '<div class="pillar__row">' + hanChar(hanja, elem) + svg + '</div>' +
      name + tenChip(ten, elem, isSelf) + '</div>';
  }

  function renderPillars(target, chart) {
    var L = C.ui.chart.pillarLabels;
    target.innerHTML = ['year', 'month', 'day', 'hour'].map(function (key) {
      var p = chart.pillars[key];
      var isDay = key === 'day';
      if (!p) {
        return '<div class="pillar pillar--empty">' +
          '<span class="pillar__label"><b>' + L[key] + '</b></span>' +
          '<div class="pillar__half"><div class="pillar__row">' + hanChar(C.ui.chart.unknownMark, '수') + '</div>' +
          '<span class="pillar__mu-name">' + C.ui.chart.unknown + '</span></div>' +
          '<span class="pillar__ko">시주 없음</span></div>';
      }
      return '<div class="pillar' + (isDay ? ' pillar--day' : '') + '" style="' + elVars(p.stemElem) + '">' +
        '<span class="pillar__label"><b>' + L[key] + '</b><i class="pillar__stage">' + p.stage + '</i></span>' +
        halfPillar(S.STEMS_HANJA[p.stem], p.stemElem, MU_STEM[p.stem], p.ten.stem, isDay) +
        halfPillar(S.BRANCHES_HANJA[p.branch], p.branchElem, MU_BRANCH[p.branch], p.ten.branch, false) +
        '<span class="pillar__ko">' + p.ko + '</span></div>';
    }).join('');
  }

  /* --- 오행 분포: 개수 + 100% 누적 바 + 범례 ------------------------- */

  function elemCountsLine(chart) {
    return chart.dist.map(function (d) { return S.ELEM_HANJA[d.elem] + d.count; }).join(' · ');
  }

  function renderOheng(target, chart) {
    var bar = chart.dist.map(function (d) {
      if (d.pct <= 0) return '';
      var txt = d.pct >= 18 ? S.ELEM_HANJA[d.elem] + ' ' + d.count + ' · ' + d.pct + '%' : '';
      return '<span class="oheng__seg" data-el="' + d.elem + '" style="flex:0 0 ' + d.pct + '%;' + elVars(d.elem) + '">' + txt + '</span>';
    }).join('');

    var legend = chart.dist.map(function (d) {
      return '<li' + (d.count === 0 ? ' class="is-none"' : '') + ' data-el="' + d.elem + '" style="' + elVars(d.elem) + '">' +
        '<span class="oheng__name"><span class="oheng__hanja">' + d.hanja + '</span> ' + d.elem + '</span>' +
        '<span class="oheng__pct"><i></i><b>' + d.count + '개</b><em>' + d.pct + '%</em></span></li>';
    }).join('');

    var label = '오행 분포 ' + chart.dist.map(function (d) {
      return d.elem + ' ' + d.count + '개 ' + d.pct + '%';
    }).join(', ');
    target.innerHTML =
      '<div class="oheng__bar" role="img" aria-label="' + label + '">' + bar + '</div>' +
      '<ul class="oheng__legend">' + legend + '</ul>' +
      '<p class="oheng__note">' + charWord(chart) + ' 균등 가중 · ' + elemCountsLine(chart) + ' · 합 100%</p>';
  }

  /* --- 오행도: 바깥 원 상생 화살표 + 안쪽 오각별 상극 화살표 --------- */

  function renderCycle(target, chart, name) {
    var W = 340, H = 366, cx = 170, cy = 180, R = 100, AR = 150;
    var order = ['목', '화', '토', '금', '수'];
    var byElem = {};
    chart.dist.forEach(function (d) { byElem[d.elem] = d; });
    var maxCount = Math.max(1, Math.max.apply(null, chart.dist.map(function (d) { return d.count; })));
    var tops = chart.dominant;

    var node = {};
    order.forEach(function (e, i) {
      var a = (-90 + i * 72) * Math.PI / 180;
      var d = byElem[e];
      node[e] = {
        e: e, a: a, d: d,
        x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R,
        r: d.count === 0 ? 26 : 33 + (d.count / maxCount) * 5
      };
    });

    function arrowHead(x, y, ux, uy, head, color, opacity) {
      var px = -uy, py = ux, w = head * 0.56;
      var bx = x - ux * head, by = y - uy * head;
      return '<polygon points="' + x.toFixed(1) + ',' + y.toFixed(1) + ' ' +
        (bx + px * w).toFixed(1) + ',' + (by + py * w).toFixed(1) + ' ' +
        (bx - px * w).toFixed(1) + ',' + (by - py * w).toFixed(1) + '" fill="' + color + '" opacity="' + opacity + '"/>';
    }

    // --- 상생: 바깥 고리를 시계방향으로 도는 화살표 (목→화→토→금→수→목)
    var makeLayer = '';
    order.forEach(function (e, i) {
      var next = order[(i + 1) % 5];
      var a0 = node[e].a + (node[e].r + 8) / AR;
      var a1 = node[next].a;
      while (a1 <= a0) a1 += Math.PI * 2;
      var head = 12, tipA = a1 - 1.5 / AR, endA = a1 - head / AR;
      var sx = cx + Math.cos(a0) * AR, sy = cy + Math.sin(a0) * AR;
      var ex = cx + Math.cos(endA) * AR, ey = cy + Math.sin(endA) * AR;
      var tx = cx + Math.cos(tipA) * AR, ty = cy + Math.sin(tipA) * AR;
      var hot = tops.indexOf(e) >= 0;
      var color = S.ELEM_COLOR[e];
      var width = hot ? 3.2 : 2.4;
      var op = hot ? 0.95 : 0.8;
      var large = (endA - a0) > Math.PI ? 1 : 0;
      makeLayer +=
        '<path d="M' + sx.toFixed(1) + ' ' + sy.toFixed(1) + ' A' + AR + ' ' + AR + ' 0 ' + large + ' 1 ' +
        ex.toFixed(1) + ' ' + ey.toFixed(1) + '" fill="none" stroke="' + color + '" stroke-width="' + width +
        '" stroke-linecap="round" opacity="' + op + '"/>' +
        arrowHead(tx, ty, -Math.sin(a1), Math.cos(a1), head, color, op);
    });

    // --- 상극: 안쪽 오각별 직선 화살표 (목→토→수→화→금→목)
    var killLayer = '';
    order.forEach(function (e, i) {
      var a = node[e], b = node[order[(i + 2) % 5]];
      var dx = b.x - a.x, dy = b.y - a.y;
      var len = Math.sqrt(dx * dx + dy * dy);
      var ux = dx / len, uy = dy / len;
      var head = 9;
      var sx = a.x + ux * (a.r + 3), sy = a.y + uy * (a.r + 3);
      var tx = b.x - ux * (b.r + 3), ty = b.y - uy * (b.r + 3);
      var ex = tx - ux * head, ey = ty - uy * head;
      var color = '#6B5D51';
      var width = 1.7;
      var op = 0.6;
      killLayer +=
        '<line x1="' + sx.toFixed(1) + '" y1="' + sy.toFixed(1) + '" x2="' + ex.toFixed(1) + '" y2="' + ey.toFixed(1) +
        '" stroke="' + color + '" stroke-width="' + width + '" stroke-linecap="round" opacity="' + op + '"/>' +
        arrowHead(tx, ty, ux, uy, head, color, op);
    });

    // --- 오행 다섯 원 (한자 + 한글·개수·비율), 센 기운은 더 크고 굵게
    var nodes = order.map(function (e) {
      var n = node[e], d = n.d;
      var dark = e === '목' || e === '화' || e === '수';
      var fill = d.count === 0 ? 'none' : (e === '금' ? '#EBE6DA' : S.ELEM_COLOR[e]);
      var stroke = d.count === 0 ? '#7A6B5D' : (e === '금' ? S.ELEM_COLOR['금'] : '#1E1A17');
      var isTop = tops.indexOf(e) >= 0 && d.count > 0;
      var sw = d.count === 0 ? 1.4 : (isTop ? 2.4 : (e === '금' ? 2.2 : 1.6));
      var txt = dark && d.count ? '#FBF6EA' : '#1E1A17';
      var halo = isTop
        ? '<circle cx="' + n.x.toFixed(1) + '" cy="' + n.y.toFixed(1) + '" r="' + (n.r + 5).toFixed(1) + '" fill="none" stroke="' + S.ELEM_COLOR[e] + '" stroke-width="1.2" opacity="0.45"/>'
        : '';
      var sub = d.count === 0 ? C.ui.oheng.cycleNone : d.ko + d.count + ' ' + d.pct + '%';
      return '<g' + (d.count === 0 ? ' opacity="0.5"' : '') + '>' + halo +
        '<circle cx="' + n.x.toFixed(1) + '" cy="' + n.y.toFixed(1) + '" r="' + n.r.toFixed(1) + '"' +
        ' fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"' +
        (d.count === 0 ? ' stroke-dasharray="3 3"' : '') + '/>' +
        '<text x="' + n.x.toFixed(1) + '" y="' + (n.y - 1).toFixed(1) + '" text-anchor="middle" fill="' + txt + '"' +
        ' font-family="\'Song Myung\', serif" font-weight="700" font-size="' + (isTop ? 22 : 20) + '">' + d.hanja + '</text>' +
        '<text x="' + n.x.toFixed(1) + '" y="' + (n.y + 17).toFixed(1) + '" text-anchor="middle" fill="' + txt + '"' +
        ' font-family="\'Paperlogy\', sans-serif" font-weight="700" font-size="12">' + sub + '</text>' +
        '</g>';
    }).join('');

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="오행 상생상극도. ' +
      chart.dist.map(function (d) { return d.elem + ' ' + d.count + '개 ' + d.pct + '%'; }).join(', ') +
      '. 바깥 원은 상생, 안쪽 별은 상극이에요.">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke="#1E1A17" stroke-width="0.8" stroke-dasharray="2 7" opacity="0.35"/>' +
      killLayer + makeLayer + nodes +
      '<circle cx="' + cx + '" cy="' + cy + '" r="6" fill="' + S.ELEM_COLOR[STEM_ELEM[chart.dayMaster]] + '" stroke="#1E1A17" stroke-width="1.2"/>' +
      '</svg>';

    var keyMake = '<svg viewBox="0 0 44 18" aria-hidden="true"><path d="M4 14 A16 16 0 0 1 34 9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><polygon points="39,10 30,5 31,13" fill="currentColor"/></svg>';
    var keyKill = '<svg viewBox="0 0 44 18" aria-hidden="true"><path d="M4 14 L33 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><polygon points="39,3 30,2 31,10" fill="currentColor"/></svg>';

    target.innerHTML = '<div class="cycle__wrap">' + svg + '</div>' +
      '<div class="cycle__key"><span>' + keyMake + C.ui.oheng.cycleLive + '</span><span>' + keyKill + C.ui.oheng.cycleKill + '</span></div>' +
      '<p class="cycle__note">' + cycleNote(chart, name) + '</p>';
  }

  // 오행도 아래 한 줄 — 무엇이 몇 개로 많고, 무엇을 살리고, 무엇에 눌리는지
  function cycleNote(chart, nameArg) {
    var who = callName(nameArg) + ' 안엔 ';
    var t = chart.strongest;
    var mine = S.ELEM_KO[t.elem];
    var makes = S.ELEM_KO[S.ELEM_MAKES[t.elem]];
    var kills = S.ELEM_KO[S.ELEM_KILLS[t.elem]];
    var killed = S.ELEM_KO[S.ELEM_KILLED[t.elem]];
    var s;
    if (chart.dominant.length > 1) {
      var many = chart.dominant.map(function (e) { return S.ELEM_KO[e]; });
      var numKo = { 2: '둘', 3: '셋', 4: '넷', 5: '다섯' }[many.length] || '여럿';
      s = who + many.join('·') + ' ' + numKo + '이 나란히 ' + t.count + '개(' + t.pct + '%)로 제일 많아요. 그중 ' +
        josa(mine, '을를') + ' 기준으로 보면, ' + josa(mine, '은는') + ' ' + josa(makes, '을를') +
        ' 살리고 ' + josa(kills, '을를') + ' 눌러요. 반대로 ' + killed + '한테 눌리죠.';
    } else {
      s = who + josa(mine, '이가') + ' ' + t.count + '개로 제일 많아요. ' + t.pct + '%예요. ' +
        josa(mine, '은는') + ' ' + josa(makes, '을를') + ' 살리고 ' + josa(kills, '을를') + ' 눌러요. 반대로 ' +
        killed + '한테 눌리죠.';
    }
    if (chart.lacking.length) {
      var lackKo = S.ELEM_KO[chart.lacking[chart.lacking.length - 1]];
      s += ' ' + chart.lacking.map(function (e) { return S.ELEM_KO[e] + '(' + S.ELEM_HANJA[e] + ')'; }).join('·') +
        josaOf(lackKo, '은는') + ' 0개, 아예 안 들어왔어요. 그 자리는 비어 있는 채로 살아가요.';
    }
    return s;
  }

  function charWord(chart) {
    return chart.total === 6 ? '여섯 글자' : '여덟 글자';
  }

  function metaLine(chart) {
    return '일간 ' + chart.dayMasterName + ' · ' + S.ELEM_KO[chart.strongest.elem] + ' ' +
      chart.strongest.count + '개(' + chart.strongest.pct + '%)';
  }

  function tenList(chart) {
    return S.TENS.map(function (t) { return { t: t, n: chart.tenCount[t] }; })
      .filter(function (x) { return x.n > 0; })
      .sort(function (a, b) { return b.n - a.n || S.TENS.indexOf(a.t) - S.TENS.indexOf(b.t); });
  }

  function myeongFoot(chart, full, nameArg) {
    var who = callName(nameArg);
    var out = [];
    var t = chart.strongest;
    var han = function (x) { return '<span class="han">' + x + '</span>'; };

    var tops = chart.dominant;
    var topTxt = tops.map(function (e) { return S.ELEM_KO[e]; }).join('·');
    var line1 = who + '의 중심은 ' + han(chart.dayMasterHanja) + '(' + chart.dayMasterName + ')이에요. ' +
      charWord(chart) + ' 중 ' + josa(topTxt, '이가') + ' <b>' + t.count + '개(' + t.pct + '%)</b>로 제일 세고';
    if (chart.lacking.length) {
      var lackKo1 = S.ELEM_KO[chart.lacking[chart.lacking.length - 1]];
      line1 += ', ' + chart.lacking.map(function (e) { return S.ELEM_KO[e]; }).join('·') + josaOf(lackKo1, '은는') + ' 하나도 없어요.';
    } else {
      var weak = chart.dist.slice().sort(function (a, b) { return a.count - b.count; })[0];
      line1 += ', ' + josa(S.ELEM_KO[weak.elem], '이가') + ' ' + weak.count + '개(' + weak.pct + '%)로 제일 얇아요.';
    }
    out.push('<p>' + line1 + '</p>');

    if (full) {
      var list = tenList(chart);
      var head = list.slice(0, 3).map(function (x) { return x.t + ' ' + x.n; }).join(' · ');
      var gl = list.slice(0, 2).map(function (x) {
        return '<b>' + x.t + '</b>' + josaOf(x.t, '은는') + ' ' + S.TEN_GROUP[x.t];
      }).join(', ');
      out.push('<p>드러난 십신은 ' + head + ' 순서예요. ' + gl + '. 그게 ' + who + ' 판에서 제일 크게 도는 기운이에요.</p>');
      out.push('<p>카드 위 작은 글씨는 12운성이에요. 그 자리에서 ' + who + ' 기운이 얼마나 센지 보는 눈금이죠. 제왕·건록이면 그 자리가 세고, 병·사·절이면 기운이 빠져 있는 자리예요.</p>');

      if (chart.hiddenElems.length) {
        out.push('<p>' + C.ui.chart.hiddenHas.replace('{elems}',
          chart.hiddenElems.map(function (e) { return S.ELEM_KO[e] + '(' + S.ELEM_HANJA[e] + ')'; }).join('·')) + '</p>');
      } else {
        out.push('<p>' + (chart.total === 6
          ? '시주를 모른다고 숨은 기운까지 없는 건 아니에요. 여섯 글자만으로 본 결과예요.'
          : C.ui.chart.hiddenNone) + '</p>');
      }

      var dw = chart.daewoon;
      if (dw && dw.list.length) {
        var cur = dw.current;
        var next = dw.list.filter(function (d) { return d.age > (cur ? cur.age : 0); })[0];
        var s2 = '대운은 ' + (dw.forward ? '순행' : '역행') + '이에요. ' + dw.startAge + '세에 ' + dw.list[0].ko + '로 열렸고, ';
        if (cur) {
          s2 += '지금은 <b>' + cur.ko + '</b> 구간(' + cur.age + '~' + (cur.age + 9) + '세)이에요.';
          if (next) s2 += ' 다음은 ' + next.age + '세 ' + next.ko + '이에요.';
        } else {
          s2 += '아직 첫 대운 전이에요.';
        }
        out.push('<p>' + s2 + '</p>');
      }

      if (chart.hourEdge) out.push('<p>' + C.ui.chart.edgeHour + '</p>');
      if (chart.termEdge) out.push('<p>' + C.ui.chart.edgeTerm + '</p>');
    }
    return out.join('');
  }

  /* ------------------------------------------------------------------ */
  /* 5. 유료 화면 렌더                                                   */
  /* ------------------------------------------------------------------ */

  function renderPaid(r, input) {
    var p = r.palja;
    var elem = r.dayMaster.elem;
    var art = ELEM_ART[elem];

    $('#paid-crumb').textContent = C.PAID.crumb;
    $('#result-demo-note').textContent = C.PAID.demoShort;
    $('#result-call').textContent = fill(C.ui.call.long);
    $('#result-title').textContent = tidy(p.def);
    $('#result-ten').textContent = tidy(p.tenLine);
    $('#bomb-text').textContent = tidy(p.bomb);
    $('#result-birth').innerHTML = birthLines(r, input).map(function (t) { return '<span>' + t + '</span>'; }).join('');

    var img = $('#result-cat');
    img.onerror = function () {
      img.onerror = null;
      img.src = 'public/cat-' + art.slug + '-ink.png';
    };
    img.src = 'public/cat-' + art.slug + '-ink.webp';
    img.alt = S.ELEM_HANJA[elem] + ' · ' + p.name + ' — ' + (r.master.scene || art.scene) + ' 콩눈 고양이 그림';
    $('#result-elem-art').innerHTML = '<b style="color:' + S.ELEM_INK[elem] + '">' + S.ELEM_HANJA[elem] + '</b> · ' + p.name;

    // 1,900원으로 연 천기 체크리스트
    $('#opened-title').textContent = C.PAID.openedTitle;
    $('#opened-sub').textContent = C.PAID.openedSub.replace('{focus}', r.focus.label);
    $('#opened-list').innerHTML = C.VALUE.map(function (v) {
      return '<li>' + esc(v.title) + '</li>';
    }).join('');

    // 본편: 세 가지 운 (고른 운세부터)
    var html = '';
    r.themes.forEach(function (t, i) {
      html += entryHtml(pad(i + 1), {
        title: t.title,
        term: '',
        basis: t.basis,
        body: t.body,
        why: t.why || ''
      });
    });
    $('#result-sections').innerHTML = html;

    // 팩폭 심층 · 성향 상세
    var m = r.master;
    var bp = C.ui.result.bonus.parts;
    var godBasis = '일간 ' + r.dayMaster.short + ' · ' + r.palja.topGod + ' ' + r.palja.godCount +
      (r.chart.dohwa ? ' · 도화' : '');
    var elemBasis = '일간 ' + r.dayMaster.short + ' · ' + r.palja.strongKo + ' ' +
      r.chart.strongest.count + '개(' + r.palja.pct + '%) · ' + r.palja.topGod + ' ' + r.palja.godCount;
    var flowBasis = '일간 ' + r.dayMaster.short + ' · 일주 ' + r.chart.pillars.day.hanja +
      ' · 대운 ' + flowAxis(r.chart).daeHanja;
    var deep = [
      {
        bonus: C.ui.result.bonus.label1,
        title: C.PAID.bombTitle,
        basis: godBasis,
        parts: [
          { label: bp.me, text: fill(m.selfSee, r.name) },
          { label: bp.blind, text: fill(m.selfBlind, r.name) },
          { label: bp.first, text: fill(m.firstMet, r.name) },
          { label: bp.strength, text: fill(m.gift, r.name) }
        ]
      },
      {
        bonus: C.ui.result.bonus.label2,
        title: C.PAID.traitTitle,
        basis: elemBasis,
        tags: p.tags,
        parts: p.traits.map(function (tr) {
          return { label: tr.label, text: tr.text };
        }).concat([
          { label: bp.closer, text: fill(m.closer, r.name) }
        ])
      },
      {
        bonus: C.ui.result.bonus.label3,
        title: C.ui.result.bonus.title2,
        basis: flowBasis,
        parts: [
          { label: bp.when, text: fill(m.love, r.name) },
          { label: bp.keep, text: fill(m.keep, r.name) },
          { label: bp.now, text: fill(m.timing, r.name) },
          { label: bp.avoid, text: fill(m.avoidEnergy, r.name), warn: true }
        ]
      }
    ];
    html = '';
    deep.forEach(function (s) { html += entryHtml('', s); });
    $('#result-sections-bonus').innerHTML = html;
    $('#bonus-kicker').textContent = C.ui.result.bonus.kicker;
    $('#bonus-title').textContent = C.PAID.bombTitle + ' · ' + C.PAID.traitTitle;
    $('#bonus-sub').textContent = C.ui.result.bonus.sub;

    // 반복되는 인생 패턴
    $('#pattern-sub').textContent = C.PAID.patternSub;
    $('#pattern-list').innerHTML = r.patterns.map(function (pt, i) {
      return '<li class="pattern"><span class="pattern__no">' + pad(i + 1) + '</span>' +
        '<span class="pattern__label">' + esc(pt.label) + '</span>' +
        (pt.basis ? '<span class="pattern__basis">근거 — ' + hanjaize(pt.basis) + '</span>' : '') +
        '<p class="pattern__text">' + hanjaize(fill(pt.text, r.name)) + '</p>' +
        '<span class="pattern__cut"><b>' + C.PAID.patternCut + '</b>' + hanjaize(fill(pt.cut, r.name)) + '</span></li>';
    }).join('');

    // 인연 궤도 상세 해석 (무료 화면의 잠금 문구도 같이 풀린다)
    $('#orbit-detail-sub').textContent = C.PAID.orbitSub;
    renderOrbitDetail();
    renderOrbit();

    // 오늘의 천기 부적
    $('#result-sections-talis').innerHTML =
      '<div class="entry entry--talis">' +
        '<p class="entry__text">' + tidy(fill(m.talisman, r.name)) +
        '<span>' + C.ui.result.talismanAvoid + tidy(fill(m.avoid, r.name)) + '</span></p>' +
      '</div>';

    drawAmulet(r, elem);
    $('#btn-save-card').hidden = false;
    $('#btn-share-card').hidden = !canShareFiles();
  }

  // 결과 섹션 한 덩어리 (제목 · 근거 · 본문 · 태그) — 본편은 번호, 심층은 '한 겹 더' 배지
  function entryHtml(no, s) {
    var head = s.bonus
      ? '<div class="entry__badge">' + s.bonus + '</div>' +
        '<h3 class="entry__title">' + s.title + '</h3>'
      : '<span class="entry__no">' + no + '</span>' +
        '<h3 class="entry__title">' + s.title + '</h3>';

    var html = '<div class="entry' + (s.bonus ? ' entry--bonus' : '') + '">' +
      '<div class="entry__head">' + head + '</div>';

    if (s.term) html += '<span class="entry__term">' + esc(s.term) + '</span>';

    if (s.basis) {
      var bits = String(s.basis).split(' · ').map(function (x) {
        return '<span>' + hanjaize(x) + '</span>';
      }).join('<i>·</i>');
      html += '<p class="entry__basis"><b>여덟 글자 근거</b><span class="entry__basis-list">' + bits + '</span></p>';
    }

    if (s.body) {
      html += '<p class="entry__text">' + hanjaize(s.body);
      if (s.why) html += ' <span class="entry__why">(' + esc(s.why) + ')</span>';
      html += '</p>';
    }

    if (s.parts) {
      html += s.parts.map(function (p) {
        return '<p class="entry__part' + (p.warn ? ' entry__part--warn' : '') + '">' +
          '<span class="entry__part-label">' + p.label + '</span>' + hanjaize(p.text) + '</p>';
      }).join('');
    }

    if (s.tags && s.tags.length) {
      html += '<div class="entry__tags">' + s.tags.map(function (t) {
        return '<span>' + esc(t) + '</span>';
      }).join('') + '</div>';
    }
    return html + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* 6. 인연 궤도 — 나 중심 달 궤도 궁합 (무료 지도 · 유료 상세)          */
  /* ------------------------------------------------------------------ */

  var FRIEND_KEY = 'nyangsaJu.friends.v1';
  var MAX_FRIENDS = 9;

  var SAMPLES = [
    { id: 's1', name: '유진', year: 1994, month: 3, day: 5, hourIdx: 6, gender: '여성', sample: true },
    { id: 's2', name: '하람', year: 1993, month: 8, day: 21, hourIdx: 4, gender: '여성', sample: true },
    { id: 's3', name: '소민', year: 1997, month: 5, day: 14, hourIdx: 5, gender: '여성', sample: true },
    { id: 's4', name: '도윤', year: 1991, month: 1, day: 9, hourIdx: 2, gender: '남성', sample: true }
  ];

  function loadFriends() {
    try {
      var raw = localStorage.getItem(FRIEND_KEY);
      if (raw) {
        var arr = JSON.parse(raw);
        if (Object.prototype.toString.call(arr) === '[object Array]') {
          return arr.filter(function (f) { return f && f.name && f.year; }).slice(0, MAX_FRIENDS);
        }
      }
    } catch (e) { /* 저장소를 못 쓰면 샘플로 시작한다 */ }
    return SAMPLES.map(function (s) {
      return { id: s.id, name: s.name, year: s.year, month: s.month, day: s.day, hourIdx: s.hourIdx, gender: s.gender, sample: true };
    });
  }

  function saveFriends() {
    try { localStorage.setItem(FRIEND_KEY, JSON.stringify(state.friends)); } catch (e) { /* 무시 */ }
  }

  function friendChart(f) {
    return S.computePillars({
      year: f.year, month: f.month, day: f.day,
      calendar: 'solar', hourIdx: f.hourIdx, gender: f.gender || '여성'
    });
  }

  function orbitName(n) {
    var l = C.orbit.legend[n - 1];
    return l ? l.name : '';
  }

  function orbitData() {
    if (!state.reading) return [];
    return state.friends.map(function (f) {
      var ch;
      try { ch = friendChart(f); } catch (e) { return null; }
      return { f: f, chart: ch, compat: S.compatibility(state.reading.chart, ch) };
    }).filter(Boolean);
  }

  function typeOf(compat) {
    return C.ORBIT_TYPE[compat.relation] || C.ORBIT_TYPE.same;
  }

  function typeFill(tpl, item) {
    return fill(String(tpl)
      .replace(/\{f\}/g, item.f.name)
      .replace(/\{fe\}/g, S.ELEM_KO[item.compat.youElem])
      .replace(/\{me\}/g, S.ELEM_KO[item.compat.meElem]));
  }

  // 무료: 유형 + 한 줄
  function orbitLine(item) {
    var T = typeOf(item.compat);
    var line = typeFill(T.line, item);
    if (item.compat.hap) line += ' ' + C.orbit.hapLine;
    return line;
  }

  // 유료: 상세 해석 + 이렇게
  function orbitDetailParts(item) {
    var T = typeOf(item.compat);
    var detail = typeFill(T.detail, item);
    if (item.compat.hap) detail += ' ' + C.orbit.hapLine;
    else if (item.compat.yukhap) detail += ' ' + C.orbit.yukhapLine;
    if (item.compat.chung) detail += ' ' + C.orbit.chungLine;
    return {
      name: item.f.name,
      type: T.name,
      score: item.compat.score,
      detail: detail,
      advice: typeFill(T.advice, item),
      tags: item.compat.tags
    };
  }

  function renderOrbit() {
    if (!state.reading) return;
    var data = orbitData();
    var byOrbit = { 1: [], 2: [], 3: [] };
    data.forEach(function (d) { byOrbit[d.compat.orbit].push(d); });

    var cx = 170, cy = 170;
    var R = { 1: 70, 2: 104, 3: 138 };
    var rings = '';
    [3, 2, 1].forEach(function (k) {
      rings += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R[k] + '" fill="none" stroke="#1E1A17"' +
        ' stroke-opacity="0.22" stroke-width="1.2" stroke-dasharray="1 6"/>';
    });

    var dm = state.reading.chart.dayMaster;
    var el = STEM_ELEM[dm];
    var dmHan = S.STEMS_HANJA[dm] + S.ELEM_HANJA[el];
    var darkFill = !(el === '토' || el === '금');
    var center = '<circle cx="' + cx + '" cy="' + cy + '" r="26" fill="' + (el === '금' ? '#EBE6DA' : S.ELEM_COLOR[el]) + '"' +
      ' stroke="#1E1A17" stroke-width="2"/>' +
      '<text x="' + cx + '" y="' + (cy - 1) + '" text-anchor="middle" font-family="\'Song Myung\', serif"' +
      ' font-size="15" font-weight="700" fill="' + (darkFill ? '#FBF6EA' : '#1E1A17') + '">' + dmHan + '</text>' +
      '<text x="' + cx + '" y="' + (cy + 14) + '" text-anchor="middle" font-family="\'Paperlogy\', sans-serif"' +
      ' font-size="12" font-weight="700" fill="' + (darkFill ? '#FBF6EA' : '#1E1A17') + '">' + C.orbit.centerSelf + '</text>';

    var nodes = '';
    [1, 2, 3].forEach(function (k) {
      var arr = byOrbit[k];
      var base = (-90 + (k - 1) * 120) * Math.PI / 180;
      arr.forEach(function (d, i) {
        var a = base + (i * 2 * Math.PI / Math.max(arr.length, 1));
        var nx = cx + Math.cos(a) * R[k];
        var ny = cy + Math.sin(a) * R[k];
        var label = d.f.name.length > 4 ? d.f.name.slice(0, 4) + '…' : d.f.name;
        var ly = ny < cy ? ny - 20 : ny + 28;
        var on = state.selectedFriend === d.f.id ? ' is-on' : '';
        var sampleMark = d.f.sample ? '예시 ' : '';
        nodes += '<g class="orbit__node orbit__node--' + k + on + (d.f.sample ? ' orbit__node--sample' : '') + '" data-friend-id="' + esc(d.f.id) + '"' +
          ' tabindex="0" role="button" aria-label="' + sampleMark + esc(d.f.name) + ' 님, ' + typeOf(d.compat).name + ' 관계">' +
          '<circle cx="' + nx.toFixed(1) + '" cy="' + ny.toFixed(1) + '" r="26" fill="transparent"/>' +
          '<circle class="orbit__node-ring" cx="' + nx.toFixed(1) + '" cy="' + ny.toFixed(1) + '" r="15"/>' +
          '<circle cx="' + nx.toFixed(1) + '" cy="' + ny.toFixed(1) + '" r="4.4" fill="' + S.ELEM_COLOR[d.compat.youElem] + '"/>' +
          '<text class="orbit__node-name" x="' + nx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="middle">' + esc(label) + '</text>' +
          '<title>' + sampleMark + esc(d.f.name) + ' 님 · ' + typeOf(d.compat).name + ' 관계</title>' +
          '</g>';
      });
    });

    $('#orbit-svg').innerHTML = rings + nodes + center;
    $('#orbit-svg').setAttribute('aria-label',
      '나를 중심으로 한 인연 궤도. 1궤도 ' + byOrbit[1].length + '명, 2궤도 ' + byOrbit[2].length +
      '명, 3궤도 ' + byOrbit[3].length + '명.');

    // 예시로 그린 궤도인지 알린다 (친구를 올리면 내 궤도로 바뀐다)
    var onlySamples = data.length > 0 && data.every(function (d) { return d.f.sample; });
    var sampleNote = $('#orbit-sample-note');
    if (sampleNote) {
      sampleNote.hidden = !onlySamples;
      sampleNote.textContent = onlySamples ? C.FREE.orbitSampleNote : '';
    }

    // 범례는 궤도가 아니라 관계 유형 다섯으로 — 유형마다 한 줄 설명을 함께
    var typeCount = {};
    data.forEach(function (d) {
      var k = d.compat.relation;
      typeCount[k] = (typeCount[k] || 0) + 1;
    });
    $('#orbit-legend').innerHTML = ['gwiin', 'give', 'same', 'press', 'drain'].map(function (k) {
      var T = C.ORBIT_TYPE[k];
      return '<li class="orbit__leg orbit__leg--type orbit__leg--' + k + '"><i aria-hidden="true"></i>' +
        '<b>' + T.name + '</b><em>' + (typeCount[k] || 0) + '명</em>' +
        '<span class="orbit__leg-line">' + T.short + '</span></li>';
    }).join('');

    $('#orbit-list').innerHTML = data.length ? data.map(function (d) {
      var on = state.selectedFriend === d.f.id ? ' is-on' : '';
      return '<li class="orbit__item' + on + '">' +
        '<button type="button" class="orbit__pick" data-pick="' + esc(d.f.id) + '">' +
        '<span class="orbit__item-name">' + esc(d.f.name) + (d.f.sample ? '<i>예시</i>' : '') + '</span>' +
        '<span class="orbit__item-meta">' + typeOf(d.compat).name + '</span>' +
        '</button>' +
        '<button type="button" class="orbit__remove" data-remove="' + esc(d.f.id) + '"' +
        ' aria-label="' + esc(C.orbit.removeAria.replace('{name}', d.f.name)) + '">×</button></li>';
    }).join('') : '<li class="orbit__none">' + C.orbit.empty + '</li>';

    var sel = data.filter(function (d) { return d.f.id === state.selectedFriend; })[0];
    var cap = $('#orbit-caption');
    if (sel) {
      cap.innerHTML = '<b>' + esc(sel.f.name) + ' 님 · ' + typeOf(sel.compat).name + '</b>' +
        '<span>' + hanjaize(state.paid ? orbitDetailParts(sel).detail : orbitLine(sel)) + '</span>' +
        '<span class="orbit__caption-advice">' + hanjaize(typeFill(typeOf(sel.compat).advice, sel)) + '</span>';
    } else {
      cap.innerHTML = fill(C.orbit.tip);
    }

    $('#orbit-lock').hidden = !!state.paid;
    renderInviteCard();
  }

  /* --- 유료 : 궤도 상세 해석 목록 ------------------------------------ */

  function renderOrbitDetail() {
    var box = $('#orbit-detail');
    if (!box) return;
    var data = orbitData();
    if (!data.length) {
      box.innerHTML = '<li class="orbit__detail-empty">' + C.PAID.orbitEmpty + '</li>';
      return;
    }
    box.innerHTML = data.map(function (d) {
      var it = orbitDetailParts(d);
      return '<li><div class="orbit__detail-top">' +
        '<span class="orbit__detail-name">' + esc(it.name) + (d.f.sample ? ' <i class="orbit__item-name"><i>예시</i></i>' : '') + '</span>' +
        '<span class="orbit__detail-type">' + esc(it.type) + '</span></div>' +
        '<p class="orbit__detail-text">' + hanjaize(it.detail) + '</p>' +
        '<p class="orbit__detail-advice">' + hanjaize(it.advice) + '</p></li>';
    }).join('');
  }

  function inviteItem() {
    if (!state.invite || !state.reading) return null;
    var ch;
    try { ch = friendChart(state.invite); } catch (e) { return null; }
    return { f: state.invite, chart: ch, compat: S.compatibility(state.reading.chart, ch) };
  }

  function renderInviteCard() {
    var box = $('#invite-card');
    var item = inviteItem();
    if (!item) { box.hidden = true; box.innerHTML = ''; return; }
    var name = state.invite.name;
    var already = state.friends.some(function (f) {
      return f.name === name && f.year === state.invite.year && f.month === state.invite.month && f.day === state.invite.day;
    });
    box.innerHTML = '<p class="invite__kicker">초대 링크로 오셨네요</p>' +
      '<h4 class="invite__title">' + esc(C.orbit.inviteLanded.replace(/\{name\}/g, name)) + '</h4>' +
      '<p class="invite__meta">내 궤도에서 ' + esc(name) + ' 님은 <b>' + typeOf(item.compat).name + ' · ' + orbitName(item.compat.orbit) + '</b></p>' +
      '<p class="invite__text">' + hanjaize(state.paid ? orbitDetailParts(item).detail : orbitLine(item)) + '</p>' +
      (already ? '' : '<button type="button" class="btn btn--line" data-invite-add>' + C.orbit.inviteAdd + '</button>');
    box.hidden = false;
  }

  function renderInviteBanner() {
    var box = $('#invite-banner');
    if (!state.invite) { box.hidden = true; return; }
    $('#invite-banner-kicker').textContent = C.orbit.inviteTitle.replace(/\{name\}/g, state.invite.name);
    $('#invite-banner-text').textContent = C.orbit.inviteBody.replace(/\{name\}/g, state.invite.name);
    box.hidden = false;
  }

  function parseInvite() {
    var q, name;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    name = (q.get('inviter') || '').trim().slice(0, 12);
    if (!name) return;
    var y = +q.get('iy'), m = +q.get('im'), d = +q.get('id');
    if (!(y >= 1930 && y <= 2050 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return;
    var ih = q.get('ih');
    var inp = {
      name: name,
      gender: q.get('ig') === 'm' ? '남성' : '여성',
      year: y, month: m, day: d,
      calendar: q.get('ic') === 'lunar' ? 'lunar' : 'solar',
      isLeap: q.get('il') === '1',
      hourIdx: (ih == null || ih === 'none') ? null : +ih
    };
    try { S.computePillars(inp); } catch (e) { return; }
    state.invite = inp;
    renderInviteBanner();
  }

  function inviteUrl() {
    var i = state.input || {};
    var base = pageBase();
    return base + '?inviter=' + encodeURIComponent(state.reading.name) +
      '&iy=' + i.year + '&im=' + i.month + '&id=' + i.day +
      '&ih=' + (i.hourIdx == null ? 'none' : i.hourIdx) +
      '&ic=' + (i.calendar || 'solar') + (i.isLeap ? '&il=1' : '') +
      '&ig=' + (i.gender === '남성' ? 'm' : 'f');
  }

  /* --- 친구 추가 폼 -------------------------------------------------- */

  function addOption(sel, value, text, selected) {
    var o = document.createElement('option');
    o.value = value; o.textContent = text;
    if (selected) o.selected = true;
    sel.appendChild(o);
  }

  function buildOrbitSelects() {
    var ySel = $('#friend-year'), mSel = $('#friend-month'), dSel = $('#friend-day'), hSel = $('#friend-hour');
    if (!ySel) return;
    var thisYear = new Date().getFullYear();
    for (var y = thisYear; y >= 1930; y--) addOption(ySel, y, y + '년', y === 1995);
    for (var m = 1; m <= 12; m++) addOption(mSel, m, m + '월', m === 1);
    syncFriendDays(true);
    addOption(hSel, 'none', '모름', false);
    S.HOURS.forEach(function (h) { addOption(hSel, h.idx, h.label + ' ' + h.range, h.idx === 6); });
  }

  function syncFriendDays(reset) {
    var dSel = $('#friend-day');
    if (!dSel) return;
    var y = +$('#friend-year').value, m = +$('#friend-month').value;
    var current = reset ? 1 : (+dSel.value || 1);
    var max = S.daysInMonth(y, m);
    dSel.innerHTML = '';
    for (var d = 1; d <= max; d++) addOption(dSel, d, d + '일', d === Math.min(current, max));
  }

  function bindOrbit() {
    if (!$('#orbit-form')) return;
    $('#orbit-form').addEventListener('submit', addFriend);
    $('#friend-year').addEventListener('change', function () { syncFriendDays(); });
    $('#friend-month').addEventListener('change', function () { syncFriendDays(); });

    var seg = document.querySelector('.seg[data-group="friend-gender"]');
    if (seg) {
      seg.addEventListener('click', function (e) {
        var btn = e.target.closest('.seg__btn');
        if (!btn) return;
        $$('.seg__btn', seg).forEach(function (b) { b.classList.remove('is-on'); });
        btn.classList.add('is-on');
        state.friendGender = btn.getAttribute('data-value');
      });
    }

    $('#orbit-list').addEventListener('click', function (e) {
      var rm = e.target.closest('[data-remove]');
      if (rm) { removeFriend(rm.getAttribute('data-remove')); return; }
      var pick = e.target.closest('[data-pick]');
      if (pick) selectFriend(pick.getAttribute('data-pick'));
    });

    $('#btn-invite').addEventListener('click', function () { copyInvite('copy'); });
    $('#btn-invite-share').addEventListener('click', shareInvite);

    $('#invite-card').addEventListener('click', function (e) {
      if (e.target.closest('[data-invite-add]')) addInviteFriend();
    });

    $('#orbit-svg').addEventListener('click', function (e) {
      var g = e.target.closest('[data-friend-id]');
      if (g) selectFriend(g.getAttribute('data-friend-id'));
    });

    $('#orbit-svg').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var g = e.target.closest('[data-friend-id]');
      if (!g) return;
      e.preventDefault();
      selectFriend(g.getAttribute('data-friend-id'));
    });
  }

  function addFriend(e) {
    e.preventDefault();
    var err = $('#orbit-error');
    err.hidden = true;
    if (!state.reading) return;
    if (state.friends.length >= MAX_FRIENDS) { toast(C.orbit.addMax); return; }

    var name = ($('#friend-name').value || '').trim().slice(0, 8) || '친구';
    var y = +$('#friend-year').value, m = +$('#friend-month').value, d = +$('#friend-day').value;
    var hRaw = $('#friend-hour').value;
    var rec = {
      id: 'f' + Date.now().toString(36),
      name: name, year: y, month: m, day: d,
      hourIdx: hRaw === 'none' ? null : +hRaw,
      gender: state.friendGender
    };

    var dup = state.friends.some(function (f) {
      return f.name === rec.name && f.year === rec.year && f.month === rec.month && f.day === rec.day;
    });
    if (dup) { toast(C.orbit.addSame); return; }

    var ch, compat;
    try {
      ch = friendChart(rec);
      compat = S.compatibility(state.reading.chart, ch);
    } catch (e2) {
      err.textContent = C.orbit.addError;
      err.hidden = false;
      return;
    }

    // 예시로 그려 둔 궤도는 첫 친구를 올리는 순간 내리해, 내 궤도로 바뀐다
    if (state.friends.length && state.friends.every(function (f) { return f.sample; })) {
      state.friends = [];
    }
    state.friends.push(rec);
    saveFriends();
    state.selectedFriend = rec.id;
    renderOrbit();
    if (state.paid) renderOrbitDetail();
    $('#friend-name').value = '';
    toast(C.orbit.addOk.replace('{name}', rec.name).replace('{orbit}', compat.orbit));
  }

  function removeFriend(id) {
    var gone = state.friends.filter(function (f) { return f.id === id; })[0];
    state.friends = state.friends.filter(function (f) { return f.id !== id; });
    if (state.selectedFriend === id) state.selectedFriend = null;
    saveFriends();
    renderOrbit();
    if (state.paid) renderOrbitDetail();
    if (gone) toast(C.orbit.removeOk.replace('{name}', gone.name));
  }

  function addInviteFriend() {
    var inv = state.invite;
    if (!inv || !state.reading) return;
    if (state.friends.length >= MAX_FRIENDS) { toast(C.orbit.addMax); return; }
    var rec = {
      id: 'f' + Date.now().toString(36),
      name: inv.name, year: inv.year, month: inv.month, day: inv.day,
      hourIdx: inv.hourIdx, gender: inv.gender
    };
    if (state.friends.length && state.friends.every(function (f) { return f.sample; })) {
      state.friends = [];
    }
    state.friends.push(rec);
    saveFriends();
    state.selectedFriend = rec.id;
    renderOrbit();
    if (state.paid) renderOrbitDetail();
    toast(C.orbit.inviteAdded.replace('{name}', rec.name));
  }

  function selectFriend(id) {
    state.selectedFriend = state.selectedFriend === id ? null : id;
    renderOrbit();
  }

  function copyInvite(method) {
    if (!state.reading || !state.input) return;
    copyText(inviteUrl()).then(function () {
      toast(C.orbit.copied);
      trackInvite(method || 'copy');
    }).catch(function () {
      toast(C.orbit.copyFail);
    });
  }

  function shareInvite() {
    if (!state.reading || !state.input) return;
    var url = inviteUrl();
    var payload = { title: C.brand.name, text: C.orbit.inviteBody.replace(/\{name\}/g, state.reading.name), url: url };
    if (navigator.share) {
      navigator.share(payload).then(function () { trackInvite('share'); }).catch(function () { });
    } else {
      copyText(url).then(function () { toast(C.orbit.copied); trackInvite('share'); }).catch(function () { });
    }
  }

  function trackInvite(method) {
    AN.track('friend_invite', {
      method: method,
      friends: state.friends.length,
      cat: state.reading ? state.reading.palja.name : null
    });
  }

  /* ------------------------------------------------------------------ */
  /* 7. 결제 (미리보기)                                                  */
  /* ------------------------------------------------------------------ */

  function bindPayment() {
    $('#btn-unlock').addEventListener('click', function () { openPay('value'); });
    $('#btn-unlock-2').addEventListener('click', function () { openPay('sticky'); });
    $('#pay-methods').addEventListener('click', function (e) {
      var btn = e.target.closest('.pay-method');
      if (!btn) return;
      $$('.pay-method').forEach(function (b) { b.classList.remove('is-on'); });
      btn.classList.add('is-on');
      state.payMethod = btn.getAttribute('data-value');
    });
    $$('[data-close-modal]').forEach(function (el) {
      el.addEventListener('click', closePay);
    });
    $('#btn-pay').addEventListener('click', doDemoPay);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePay();
    });

    // 모달의 1,900원 구성
    $('#pay-value').innerHTML = C.VALUE.map(function (v) {
      return '<li><span class="pay-value__no">' + v.no + '</span>' +
        '<span class="pay-value__title">' + esc(v.title) + '</span>' +
        '<p class="pay-value__desc">' + esc(v.desc) + '</p></li>';
    }).join('');
    $('#pay-badge').textContent = C.PAID.demoBadge;
    $('#pay-note').textContent = C.PAID.demoNote;
    $('#btn-pay').textContent = C.PAID.demoSubmit;
  }

  function openPay(source) {
    var modal = $('#pay-modal');
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    AN.track('pay_button_click', {
      source: source || 'value',
      price: 1900,
      focus: state.focus,
      cat: state.reading ? state.reading.palja.name : null
    });
  }

  function closePay() {
    var modal = $('#pay-modal');
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  var PAY_LOADING = C.ui.loading.msgs;

  function doDemoPay() {
    var btn = $('#btn-pay');
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = PAY_LABEL[state.payMethod] + ' 연결 중이에요';

    closePay();

    var loading = $('#loading');
    document.body.classList.add('is-loading');
    loading.classList.add('is-on');
    loading.setAttribute('aria-hidden', 'false');

    var i = 0;
    var textEl = $('#loading-text');
    textEl.textContent = PAY_LOADING[0];
    var timer = setInterval(function () {
      i = (i + 1) % PAY_LOADING.length;
      textEl.textContent = PAY_LOADING[i];
    }, 700);

    var orderId = 'NYANG_DEMO_' + Date.now().toString(36).toUpperCase();

    setTimeout(function () {
      clearInterval(timer);
      loading.classList.remove('is-on');
      loading.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('is-loading');
      btn.disabled = false;
      btn.textContent = C.PAID.demoSubmit;
      state.paid = true;
      renderPaid(state.reading, state.input);
      show('screen-result');
      toast(C.ui.toast.paid + PAY_LABEL[state.payMethod] + ' 1,900원');
      AN.track('payment_complete', {
        method: PAY_LABEL[state.payMethod],
        methodKey: state.payMethod,
        amount: 1900,
        orderId: orderId,
        demo: true,
        cat: state.reading.palja.name,
        friends: state.friends.length
      });
    }, 2400);
  }

  /* ------------------------------------------------------------------ */
  /* 8. 천기 부적 한 장 (Canvas 1080×1920)                              */
  /* ------------------------------------------------------------------ */

  var CW = 1080, CH = 1920;
  var INK = '#1E1A17', INK2 = '#453D36', INK3 = '#7A6B5D';
  var RED = '#C73E2C', RED_D = '#A93222';
  var PAPER = '#F5EFE2', PAPER_HI = '#FBF6EA';

  var F_SANS = '"Paperlogy", "Song Myung", "Gowun Batang", sans-serif';
  var F_HANJA = '"Song Myung", serif';
  var HANJA_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;

  function hashStr(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h;
  }

  function fontFor(ch, size, weight) {
    if (HANJA_RE.test(ch)) return '700 ' + size + 'px ' + F_HANJA;
    return (weight || '400') + ' ' + size + 'px ' + F_SANS;
  }

  function spacedWidth(ctx, text, gap, size, weight) {
    var total = 0;
    for (var i = 0; i < text.length; i++) {
      ctx.font = fontFor(text[i], size || 16, weight);
      total += ctx.measureText(text[i]).width + gap;
    }
    return total - gap;
  }

  function fillSpaced(ctx, text, x, y, gap, align, size, weight, stroke) {
    var w = spacedWidth(ctx, text, gap, size, weight);
    var cx = align === 'center' ? x - w / 2 : (align === 'right' ? x - w : x);
    for (var i = 0; i < text.length; i++) {
      ctx.font = fontFor(text[i], size, weight);
      if (stroke) ctx.strokeText(text[i], cx, y);
      ctx.fillText(text[i], cx, y);
      cx += ctx.measureText(text[i]).width + gap;
    }
    return w;
  }

  function seededRand(seed) {
    var s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
  }

  function ensureFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var specs = [
      '400 32px "Paperlogy"', '700 32px "Paperlogy"', '800 32px "Paperlogy"',
      '400 32px "Gowun Batang"', '700 32px "Gowun Batang"',
      '700 76px "Song Myung"', '400 76px "Song Myung"'
    ];
    return Promise.all(specs.map(function (s) {
      return document.fonts.load(s).catch(function () {});
    }));
  }

  function loadImage(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  // 띄어쓰기를 우선으로, 한 단어가 넘치면 글자 단위로 접는 줄바꿈
  function wrapChars(ctx, text, maxWidth, maxLines) {
    var words = String(text).split(' ');
    var lines = [];
    var line = '';

    function flush() {
      if (line) { lines.push(line); line = ''; }
    }

    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!w) continue;
      var test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
        continue;
      }
      flush();
      if (ctx.measureText(w).width <= maxWidth) {
        line = w;
        continue;
      }
      for (var c = 0; c < w.length; c++) {
        var ch = w[c];
        if (line && ctx.measureText(line + ch).width > maxWidth) flush();
        line += ch;
      }
    }
    flush();

    if (maxLines && lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = lines[maxLines - 1].replace(/.$/, '…');
    }
    return lines;
  }

  function plumDivider(ctx, cx, y, halfWidth) {
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cx - halfWidth, y);
    ctx.lineTo(cx - 26, y);
    ctx.moveTo(cx + 26, y);
    ctx.lineTo(cx + halfWidth, y);
    ctx.stroke();
    ctx.fillStyle = INK;
    var i, a;
    for (i = 0; i < 5; i++) {
      a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * 12, y + Math.sin(a) * 12, 6.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.arc(cx, y, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* --- 사주명식 미니 기둥 + 오행 분포 띠 ---------------------------- */

  var META_X0 = 104, META_X1 = 976;
  var META_H = 334;

  function inkRule(ctx, x0, x1, y, alpha) {
    ctx.save();
    ctx.strokeStyle = 'rgba(30,26,23,' + (alpha || 0.5) + ')';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.restore();
  }

  function drawPillar(ctx, cx, top, label, p, isDay) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    if (isDay) {
      ctx.strokeStyle = 'rgba(30,26,23,0.6)';
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 8;
      wobbleRectPath(ctx, cx - 78, top + 2, cx + 78, top + 166, 1.1, 2.4);
      ctx.stroke();
    }

    ctx.fillStyle = isDay ? INK : INK3;
    fillSpaced(ctx, label, cx, top + 22, 1.6, 'center', 20, isDay ? 700 : 400);

    if (!p) {
      ctx.font = '700 42px ' + F_SANS;
      ctx.fillStyle = 'rgba(69,61,54,0.62)';
      ctx.textAlign = 'center';
      ctx.fillText(C.ui.chart.unknownMark, cx, top + 76);
      ctx.textAlign = 'left';
      ctx.fillStyle = INK3;
      fillSpaced(ctx, C.ui.chart.unknown, cx, top + 120, 1, 'center', 20, 400);
      ctx.restore();
      return;
    }

    ctx.textAlign = 'center';
    ctx.font = '700 46px ' + F_HANJA;
    ctx.fillStyle = S.ELEM_INK[p.stemElem];
    ctx.fillText(S.STEMS_HANJA[p.stem], cx, top + 74);
    ctx.fillStyle = S.ELEM_INK[p.branchElem];
    ctx.fillText(S.BRANCHES_HANJA[p.branch], cx, top + 124);

    ctx.font = '400 21px ' + F_SANS;
    ctx.fillStyle = INK2;
    ctx.fillText(p.ko, cx, top + 154);
    ctx.restore();
  }

  // 오행 수치 한 줄 — 木 1 13% · 火 1 12% · 土 2 25% … (개수와 비율을 같이)
  function drawElemLegend(ctx, dist, cx, y) {
    var parts = [];
    dist.forEach(function (d, k) {
      if (k) parts.push({ t: '  ·  ', size: 20, weight: '400', color: 'rgba(69,61,54,0.5)', hanja: false });
      parts.push({ t: d.hanja, size: 23, weight: '700', color: d.ink, hanja: true });
      parts.push({ t: ' ' + d.count + '개', size: 21, weight: '700', color: INK2, hanja: false });
      parts.push({ t: ' ' + d.pct + '%', size: 21, weight: '400', color: INK2, hanja: false });
    });

    var total = 0;
    parts.forEach(function (p) {
      ctx.font = (p.hanja ? '700 ' : p.weight + ' ') + p.size + 'px ' + (p.hanja ? F_HANJA : F_SANS);
      p.w = ctx.measureText(p.t).width;
      total += p.w;
    });

    var x = cx - total / 2;
    ctx.save();
    ctx.textAlign = 'left';
    parts.forEach(function (p) {
      ctx.font = (p.hanja ? '700 ' : p.weight + ' ') + p.size + 'px ' + (p.hanja ? F_HANJA : F_SANS);
      ctx.fillStyle = p.color;
      ctx.fillText(p.t, x, y);
      x += p.w;
    });
    ctx.restore();
  }

  /* 부적 하단 — 사주명식 네 기둥 + 오행 5색 누적 띠 (먹선 사이) */
  function drawChartMeta(ctx, chart, y0) {
    var x0 = META_X0, x1 = META_X1;
    var cx = (x0 + x1) / 2;
    var P0 = y0 + 72;
    var i;

    inkRule(ctx, x0, x1, y0, 0.5);

    ctx.textAlign = 'left';
    ctx.fillStyle = INK3;
    fillSpaced(ctx, C.ui.arumulet.chartKicker, cx, y0 + 40, 4, 'center', 21, 400);

    var keys = ['year', 'month', 'day', 'hour'];
    var labels = C.ui.chart.pillarLabels;
    var colW = (x1 - x0) / 4;
    for (i = 0; i < keys.length; i++) {
      drawPillar(ctx, x0 + colW * (i + 0.5), P0, labels[keys[i]], chart.pillars[keys[i]], keys[i] === 'day');
    }

    drawElemLegend(ctx, chart.dist, cx, P0 + 198);

    var barY = P0 + 214, barH = 22;
    var total = chart.dist.reduce(function (s, d) { return s + d.pct; }, 0) || 100;
    var acc = x0;
    chart.dist.forEach(function (d) {
      var w = (x1 - x0) * d.pct / total;
      if (d.pct > 0) {
        ctx.save();
        ctx.fillStyle = d.elem === '금' ? S.ELEM_FILL['금'] : d.color;
        ctx.fillRect(acc, barY, w, barH);
        ctx.strokeStyle = d.elem === '금' ? 'rgba(122,116,107,0.9)' : 'rgba(30,26,23,0.24)';
        ctx.lineWidth = d.elem === '금' ? 1.3 : 1;
        ctx.strokeRect(acc + 0.5, barY + 0.5, Math.max(0, w - 1), barH - 1);
        ctx.restore();
      }
      acc += w;
    });
    ctx.save();
    ctx.strokeStyle = 'rgba(30,26,23,0.55)';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(x0, barY, x1 - x0, barH);
    ctx.restore();

    inkRule(ctx, x0, x1, y0 + META_H, 0.5);
  }

  /* --- 붓으로 그은 선 ------------------------------------------------ */
  function pushEdge(ctx, x1, y1, x2, y2, amp, phase, first) {
    var len = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)) || 1;
    var nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
    var steps = Math.max(2, Math.round(len / 90));
    var i, t, off, x, y;
    for (i = first ? 0 : 1; i <= steps; i++) {
      t = i / steps;
      off = (Math.sin(phase + t * Math.PI * 3.2) * amp +
        Math.sin(phase * 2.3 + t * Math.PI * 7.1) * amp * 0.32) * Math.sin(Math.PI * t);
      x = x1 + (x2 - x1) * t + nx * off;
      y = y1 + (y2 - y1) * t + ny * off;
      if (first && i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }

  function wobbleRectPath(ctx, x0, y0, x1, y1, amp, phase) {
    ctx.beginPath();
    pushEdge(ctx, x0, y0, x1, y0, amp, phase, true);
    pushEdge(ctx, x1, y0, x1, y1, amp, phase + 1.3, false);
    pushEdge(ctx, x1, y1, x0, y1, amp, phase + 2.7, false);
    pushEdge(ctx, x0, y1, x0, y0, amp, phase + 4.1, false);
    ctx.closePath();
  }

  function brushRect(ctx, inset, width, alpha, amp, phase, H) {
    var l = inset, t = inset, r = CW - inset, b = (H || CH) - inset;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 8;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    pushEdge(ctx, l, t, r, t, amp, phase, true);
    pushEdge(ctx, r, t, r, b, amp, phase + 1.7, false);
    pushEdge(ctx, r, b, l, b, amp, phase + 3.1, false);
    pushEdge(ctx, l, b, l, t, amp, phase + 4.6, false);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function inkBorder(ctx, H) {
    ctx.save();
    ctx.strokeStyle = INK;
    brushRect(ctx, 46, 30, 0.055, 4.4, 0.4, H);
    brushRect(ctx, 46, 16, 0.97, 2.4, 1.1, H);
    brushRect(ctx, 46, 6, 1, 1.2, 2.6, H);
    brushRect(ctx, 86, 2.6, 0.9, 1.3, 3.3, H);
    ctx.restore();
  }

  function sealStamp(ctx, x, y, size, chars, rnd) {
    var i, half = size / 2, per, side, along, px, py;
    var arr = String(chars).split('');
    ctx.save();
    ctx.translate(x + half, y + half);
    ctx.rotate(-0.07);

    ctx.globalAlpha = 0.94;
    ctx.fillStyle = RED;
    wobbleRectPath(ctx, -half, -half, half, half, 1.5, 1.1);
    ctx.fill();

    ctx.fillStyle = PAPER;
    for (i = 0; i < 22; i++) {
      per = 4 * size;
      side = Math.floor(rnd() * 4);
      along = -half + rnd() * size;
      px = side === 0 ? along : (side === 1 ? half : (side === 2 ? along : -half));
      py = side === 0 ? -half : (side === 1 ? along : (side === 2 ? half : along));
      ctx.globalAlpha = 0.35 + rnd() * 0.6;
      ctx.beginPath();
      ctx.arc(px, py, 0.5 + rnd() * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = PAPER;
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 1.8;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + Math.round(size * (arr.length > 1 ? 0.38 : 0.66)) + 'px ' + F_HANJA;
    var step = size * (arr.length > 1 ? 0.4 : 0);
    for (i = 0; i < arr.length; i++) {
      var cy = (i - (arr.length - 1) / 2) * step + size * 0.02;
      ctx.strokeText(arr[i], 0, cy);
      ctx.fillText(arr[i], 0, cy);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  /* 한지 바탕 + 종이 결 + 붓 테두리 (두 캔버스가 같이 쓴다) */
  function paintPaper(ctx, seed, H) {
    var h = H || CH;
    var i, rnd = seededRand(seed);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, CW, h);
    var grain = Math.round(2400 * h / CH);
    for (i = 0; i < grain; i++) {
      ctx.fillStyle = 'rgba(120,100,74,' + (0.005 + rnd() * 0.017).toFixed(3) + ')';
      ctx.fillRect(rnd() * CW, rnd() * h, 2.2, 2.2);
    }
    ctx.lineCap = 'round';
    for (i = 0; i < 64; i++) {
      ctx.strokeStyle = 'rgba(120,100,74,' + (0.025 + rnd() * 0.045).toFixed(3) + ')';
      ctx.lineWidth = 1 + rnd() * 1.3;
      var fx = rnd() * CW, fy = rnd() * h, fa = rnd() * Math.PI, fl = 8 + rnd() * 22;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + Math.cos(fa) * fl, fy + Math.sin(fa) * fl);
      ctx.stroke();
    }
    inkBorder(ctx, h);
  }

  function catBox(ctx, img, boxW, boxH, top, W) {
    if (!img) return top + boxH;
    var w0 = W || CW;
    var sc = Math.min(boxW / img.width, boxH / img.height);
    var w = Math.round(img.width * sc), h = Math.round(img.height * sc);
    ctx.drawImage(img, (w0 - w) / 2, top + boxH - h, w, h);
    return top + boxH;
  }

  /* ---------- 나만의 천기부적 (유료 · 1080×1920) ---------- */
  function drawAmulet(r, elem) {
    var canvas = $('#amulet');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var art = ELEM_ART[elem] || ELEM_ART['수'];
    var bombText = tidy(fill(r.palja.bomb, r.name));
    var talisText = tidy(fill(r.master.talisman, r.name));

    var seed = hashStr((r.name || '') + '|' + (state.input ? [state.input.year, state.input.month, state.input.day, state.input.hourIdx].join('-') : ''));
    var rnd = seededRand(seed || 20261124);

    var imgPromise = loadImage('public/cat-' + art.slug + '-ink.webp').then(function (im) {
      return im || loadImage('public/cat-' + art.slug + '-ink.png');
    });

    Promise.all([ensureFonts(), imgPromise]).then(function (res) {
      var img = res[1];
      var i, ti;

      if (canvas.width !== CW) canvas.width = CW;
      if (canvas.height !== CH) canvas.height = CH;

      ctx.clearRect(0, 0, CW, CH);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      paintPaper(ctx, seed || 20261124);
      sealStamp(ctx, CW - 214, 152, 94, C.brand.stamp, rnd);

      ctx.textAlign = 'left';
      ctx.fillStyle = INK2;
      fillSpaced(ctx, C.ui.arumulet.header, CW / 2, 208, 15, 'center', 34, 700);

      var artBottom = catBox(ctx, img, 450, 360, 246);

      ctx.textAlign = 'left';
      ctx.fillStyle = S.ELEM_INK[elem];
      fillSpaced(ctx, S.ELEM_HANJA[elem] + ' · ' + r.palja.name, CW / 2, artBottom + 48, 5, 'center', 30, 700);

      ctx.textAlign = 'center';
      var contentTop = artBottom + 68;
      var metaY1 = CH - 272;
      var metaY0 = metaY1 - META_H;
      var contentBottom = metaY0 - 14;
      var avail = contentBottom - contentTop;

      var factSize = 32, factLh = 46;
      ctx.font = '400 ' + factSize + 'px ' + F_SANS;
      var factLines = wrapChars(ctx, bombText, 860, 3);
      var factBlock = 56 + 52 + factLines.length * factLh;

      var phraseSize = 92, phraseLines = [], lh = 0;
      var maxLines = 4;
      for (; phraseSize >= 46; phraseSize -= 2) {
        ctx.font = '700 ' + phraseSize + 'px ' + F_SANS;
        phraseLines = wrapChars(ctx, talisText, 860, 0);
        lh = Math.round(phraseSize * 1.4);
        if (phraseLines.length <= maxLines && phraseLines.length * lh + factBlock + 76 <= avail) break;
      }
      if (phraseSize < 46) {
        phraseSize = 46;
        lh = Math.round(phraseSize * 1.4);
        ctx.font = '700 ' + phraseSize + 'px ' + F_SANS;
        phraseLines = wrapChars(ctx, talisText, 860, maxLines);
      }

      var phraseH = phraseLines.length * lh;
      var leftover = Math.max(0, avail - phraseH - factBlock);
      var gapA = Math.round(leftover * 0.45);
      var gapB = leftover - gapA;

      var baseline = contentTop + gapA + Math.round(phraseSize * 0.82);
      ctx.fillStyle = INK;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.8;
      ctx.font = '700 ' + phraseSize + 'px ' + F_SANS;
      for (ti = 0; ti < phraseLines.length; ti++) {
        ctx.strokeText(phraseLines[ti], CW / 2, baseline + ti * lh);
        ctx.fillText(phraseLines[ti], CW / 2, baseline + ti * lh);
      }

      var divY = baseline + (phraseLines.length - 1) * lh + Math.round(phraseSize * 0.42) + gapB;
      plumDivider(ctx, CW / 2, divY, 148);

      ctx.fillStyle = RED_D;
      ctx.textAlign = 'left';
      fillSpaced(ctx, C.ui.arumulet.factKicker, CW / 2, divY + 56, 7, 'center', 24, 700);

      ctx.textAlign = 'center';
      ctx.fillStyle = INK2;
      ctx.font = '400 ' + factSize + 'px ' + F_SANS;
      for (ti = 0; ti < factLines.length; ti++) {
        ctx.fillText(factLines[ti], CW / 2, divY + 56 + 52 + ti * factLh);
      }

      drawChartMeta(ctx, r.chart, metaY0);

      var sigMain = r.callName + C.ui.arumulet.signature;
      var sigY = CH - 210;
      ctx.font = '700 30px ' + F_SANS;
      var sigW = spacedWidth(ctx, sigMain, 3, 30, 700);
      var sigBrand = C.ui.arumulet.brand;
      ctx.font = '400 25px ' + F_SANS;
      var sigW2 = ctx.measureText(sigBrand).width;
      var sigX = CW / 2 - (sigW + sigW2) / 2;

      ctx.fillStyle = INK;
      ctx.textAlign = 'left';
      fillSpaced(ctx, sigMain, sigX, sigY, 3, 'left', 30, 700);
      ctx.fillStyle = INK2;
      ctx.font = '400 25px ' + F_SANS;
      ctx.textAlign = 'left';
      ctx.fillText(sigBrand, sigX + sigW, sigY);

      ctx.fillStyle = INK3;
      ctx.font = '400 24px ' + F_SANS;
      ctx.textAlign = 'center';
      ctx.fillText(birthLine(r, state.input || {}), CW / 2, CH - 164);

      ctx.fillStyle = 'rgba(30,26,23,0.45)';
      ctx.textAlign = 'left';
      fillSpaced(ctx, C.ui.arumulet.notice, CW / 2, CH - 120, 2, 'center', 22, 400);

      ctx.textAlign = 'left';
      state.canvasReady = true;
    });
  }

  /* ---------- 무료 결과 카드 (팔자 고양이 · 팩폭 · 유입 링크) ----------
     두 비율을 지원한다. 9:16 은 인스타 스토리, 1:1 은 카톡·피드용.
     생년월일·출생시간은 넣지 않고, 유입 경로(서비스 주소·초대 링크)만 담는다. */

  var SHARE_SIZE = { story: { w: 1080, h: 1920 }, square: { w: 1080, h: 1080 } };

  function shareLink() {
    if (state.shareInvite && state.reading && state.input) return inviteUrl();
    return pageBase();
  }

  // 주소창이 /index.html 로 끝나도 카드·초대 링크는 깔끔한 폴더 주소로
  function pageBase() {
    return location.origin + location.pathname.replace(/index\.html?$/i, '');
  }

  function drawShareCard(r, ratio) {
    var canvas = $('#share-card');
    if (!canvas || !r) return;
    var key = ratio === 'square' ? 'square' : 'story';
    var sq = key === 'square';
    var W = SHARE_SIZE[key].w, H = SHARE_SIZE[key].h;
    var ctx = canvas.getContext('2d');
    var p = r.palja;
    var art = ELEM_ART[p.elem] || ELEM_ART['수'];
    var seed = hashStr('share|' + (r.name || '') + '|' + p.name + '|' + (state.input ? state.input.day : '') + '|' + key);
    var rnd = seededRand(seed || 20261124);

    var imgPromise = loadImage('public/cat-' + art.slug + '-ink.webp').then(function (im) {
      return im || loadImage('public/cat-' + art.slug + '-ink.png');
    });

    Promise.all([ensureFonts(), imgPromise]).then(function (res) {
      var img = res[1];
      var i;

      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;

      ctx.clearRect(0, 0, W, H);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      paintPaper(ctx, seed, H);
      sealStamp(ctx, W - 206, sq ? 104 : 140, sq ? 72 : 84, C.brand.stamp, rnd);

      /* 머리글 — 서비스명 */
      ctx.fillStyle = INK2;
      fillSpaced(ctx, C.brand.name, W / 2, sq ? 158 : 196, sq ? 4 : 5, 'center', sq ? 26 : 30, 700);
      plumDivider(ctx, W / 2, sq ? 190 : 232, sq ? 112 : 132);

      /* 팔자 고양이 */
      ctx.fillStyle = RED_D;
      fillSpaced(ctx, C.FREE.catSeal + ' 고양이', W / 2, sq ? 230 : 288, 6, 'center', sq ? 21 : 24, 700);

      var artBottom = catBox(ctx, img, sq ? 330 : 570, sq ? 186 : 474, sq ? 240 : 288, W);

      ctx.textAlign = 'center';
      ctx.fillStyle = INK;
      ctx.font = (sq ? '800 76px ' : '800 100px ') + F_SANS;
      ctx.fillText(p.name, W / 2, artBottom + (sq ? 74 : 112));

      ctx.fillStyle = S.ELEM_INK[p.elem];
      fillSpaced(ctx, p.hanja + ' · ' + p.short, W / 2, artBottom + (sq ? 110 : 164), 5, 'center', sq ? 21 : 28, 700);

      /* 한 줄 정의 */
      var maxDef = sq ? 2 : 3;
      var defSize = sq ? 26 : 38, defLh = Math.round(defSize * (sq ? 1.38 : 1.5)), defLines;
      var y = artBottom + (sq ? 146 : 216);
      for (; defSize >= 24; defSize -= 2) {
        ctx.font = '700 ' + defSize + 'px ' + F_SANS;
        defLh = Math.round(defSize * 1.5);
        defLines = wrapChars(ctx, p.def, 860, maxDef);
        if (defLines.length <= maxDef) break;
      }
      ctx.fillStyle = INK;
      ctx.font = '700 ' + defSize + 'px ' + F_SANS;
      for (i = 0; i < defLines.length; i++) {
        ctx.fillText(defLines[i], W / 2, y + i * defLh);
      }
      y += (defLines.length - 1) * defLh + Math.round(defSize * (sq ? 0.86 : 0.9));

      /* 천기팩폭 띠 */
      var bandPad = sq ? 18 : 30;
      var bandTop = y + (sq ? 16 : 28);
      var bombSize = sq ? 27 : 32, bombLh = sq ? 34 : 48, bombLines;
      ctx.font = '400 ' + bombSize + 'px ' + F_SANS;
      bombLines = wrapChars(ctx, tidy(p.bomb), sq ? 820 : 820, sq ? 2 : 4);
      var bandH = bandPad + (sq ? 22 : 34) + (sq ? 8 : 16) + bombLines.length * bombLh + bandPad;

      ctx.save();
      ctx.fillStyle = RED;
      wobbleRectPath(ctx, 80, bandTop, W - 80, bandTop + bandH, 2.4, 1.4);
      ctx.fill();
      ctx.strokeStyle = RED_D;
      ctx.lineWidth = 2.4;
      wobbleRectPath(ctx, 84, bandTop + 4, W - 84, bandTop + bandH - 4, 1.6, 2.2);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#E7D9C4';
      fillSpaced(ctx, C.ui.arumulet.factKicker, W / 2, bandTop + bandPad + (sq ? 16 : 18), 7, 'center', sq ? 19 : 23, 700);

      ctx.fillStyle = PAPER_HI;
      ctx.font = '400 ' + bombSize + 'px ' + F_SANS;
      for (i = 0; i < bombLines.length; i++) {
        ctx.fillText(bombLines[i], W / 2, bandTop + bandPad + (sq ? 22 : 34) + (sq ? 8 : 16) + i * bombLh + (sq ? 19 : 22));
      }

      /* 해시태그 · 유형 근거 */
      ctx.fillStyle = '#4E6349';
      fillSpaced(ctx, p.tags.join('  '), W / 2, bandTop + bandH + (sq ? 30 : 56), 1, 'center', sq ? 20 : 24, 700);

      if (!sq) {
        ctx.fillStyle = INK3;
        fillSpaced(ctx, p.facts.join('   ·   '), W / 2, bandTop + bandH + 108, 0.6, 'center', 24, 400);
      }

      /* 아래 - 유입 링크 */
      var footRule = sq ? H - 250 : Math.max(H - 360, bandTop + bandH + 172);
      plumDivider(ctx, W / 2, footRule, sq ? 120 : 150);

      ctx.fillStyle = INK;
      fillSpaced(ctx, C.FREE.shareLinkLine, W / 2, footRule + (sq ? 38 : 62), 2, 'center', sq ? 27 : 32, 700);

      var link = shareLink();
      var shown = link.replace(/^https?:\/\//, '').replace(/\/$/, '');
      var maxLink = 2;
      var maxW = sq ? 878 : 830;
      var linkSize = sq ? 17 : 26, linkMin = sq ? 11 : 16;
      var linkLines = null, lh;
      for (; linkSize >= linkMin; linkSize -= 1) {
        ctx.font = '400 ' + linkSize + 'px ' + F_SANS;
        var probe = wrapChars(ctx, shown, maxW, 0);
        if (probe.length <= maxLink) { linkLines = probe; break; }
      }
      if (!linkLines) {
        linkSize = linkMin;
        ctx.font = '400 ' + linkSize + 'px ' + F_SANS;
        linkLines = wrapChars(ctx, shown, maxW, maxLink);
      }
      lh = Math.round(linkSize * 1.4);
      ctx.fillStyle = INK2;
      ctx.font = '400 ' + linkSize + 'px ' + F_SANS;
      var linkTop = footRule + (sq ? 64 : 112);
      for (i = 0; i < linkLines.length; i++) {
        ctx.fillText(linkLines[i], W / 2, linkTop + i * lh);
      }

      var infoY = linkTop + (linkLines.length - 1) * lh + (sq ? 32 : 40);
      if (sq) infoY = Math.min(infoY, H - 128);
      ctx.fillStyle = INK3;
      ctx.font = (sq ? '400 17px ' : '400 23px ') + F_SANS;
      ctx.fillText(
        state.shareInvite ? fill(C.FREE.shareInviteFooter) : C.FREE.shareNoInfo,
        W / 2, sq ? infoY : H - 150
      );

      ctx.fillStyle = 'rgba(30,26,23,0.42)';
      fillSpaced(ctx, C.ui.arumulet.notice, W / 2, sq ? Math.min(infoY + 32, H - 60) : H - 108,
        2, 'center', sq ? 15 : 21, 400);

      state.shareReady = true;
    });
  }

  /* ------------------------------------------------------------------ */
  /* 9. 공유 / 저장                                                     */
  /* ------------------------------------------------------------------ */

  function canShareFiles() {
    return !!(navigator.canShare && window.File);
  }

  function bindShare() {
    var seg = $('.seg[data-group="share-ratio"]');
    if (seg) {
      seg.addEventListener('click', function (e) {
        var btn = e.target.closest('.seg__btn');
        if (!btn || !state.reading) return;
        $$('.seg__btn', seg).forEach(function (b) {
          b.classList.remove('is-on');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('is-on');
        btn.setAttribute('aria-pressed', 'true');
        state.shareRatio = btn.getAttribute('data-ratio') === 'square' ? 'square' : 'story';
        drawShareCard(state.reading, state.shareRatio);
      });
    }

    $('#share-invite').addEventListener('change', function () {
      state.shareInvite = $('#share-invite').checked;
      drawShareCard(state.reading, state.shareRatio);
    });

    $('#btn-share-save').addEventListener('click', function () {
      var canvas = $('#share-card');
      canvas.toBlob(function (blob) {
        if (!blob) { toast(C.ui.toast.saveFail); return; }
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var safe = (state.reading.palja.name || '냥사주').replace(/[^\w가-힣]/g, '');
        a.href = url;
        a.download = C.FREE.shareFile + safe + (state.shareRatio === 'square' ? '-1x1' : '-9x16') + '.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        toast(C.ui.toast.saved);
        AN.track('result_share', { method: 'save', ratio: state.shareRatio, cat: state.reading.palja.name, inviteIncluded: state.shareInvite });
      }, 'image/png');
    });

    $('#btn-share-share').addEventListener('click', function () {
      var canvas = $('#share-card');
      canvas.toBlob(function (blob) {
        if (!blob) return;
        var file = new File([blob], C.FREE.shareFile + (state.shareRatio === 'square' ? '1x1' : '9x16') + '.png', { type: 'image/png' });
        var payload = {
          files: [file],
          title: C.brand.name,
          text: state.reading.palja.name + ' · ' + tidy(state.reading.palja.bomb)
        };
        if (navigator.canShare(payload)) {
          navigator.share(payload).then(function () {
            AN.track('result_share', { method: 'share', ratio: state.shareRatio, cat: state.reading.palja.name, inviteIncluded: state.shareInvite });
          }).catch(function () { });
        } else {
          copyText(state.reading.palja.name + ' · ' + tidy(state.reading.palja.bomb)).then(function () {
            toast(C.ui.toast.shared);
            AN.track('result_share', { method: 'copy', ratio: state.shareRatio, cat: state.reading.palja.name, inviteIncluded: state.shareInvite });
          });
        }
      }, 'image/png');
    });
  }

  function bindResultActions() {
    $('#btn-copy').addEventListener('click', function () {
      var text = state.reading ? state.reading.summary : '';
      copyText(text).then(function () {
        toast(C.ui.toast.copied);
      }).catch(function () {
        toast(C.ui.toast.copyFail);
      });
    });

    $('#btn-save-card').addEventListener('click', function () {
      var canvas = $('#amulet');
      canvas.toBlob(function (blob) {
        if (!blob) { toast(C.ui.toast.saveFail); return; }
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var safe = (state.reading.name || '냥사주').replace(/[^\w가-힣]/g, '');
        a.href = url;
        a.download = C.ui.arumulet.file + safe + '.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        toast(C.ui.toast.saved);
      }, 'image/png');
    });

    $('#btn-share-card').addEventListener('click', function () {
      var canvas = $('#amulet');
      canvas.toBlob(function (blob) {
        if (!blob) return;
        var file = new File([blob], C.ui.arumulet.file + '.png', { type: 'image/png' });
        var payload = { files: [file], title: C.brand.name + ' 부적', text: state.reading.summary };
        if (navigator.canShare(payload)) {
          navigator.share(payload).catch(function () { });
        } else {
          copyText(state.reading.summary).then(function () { toast(C.ui.toast.shared); });
        }
      }, 'image/png');
    });

    $('#btn-again').addEventListener('click', function () {
      if (!state.reading) return;
      renderPaid(state.reading, state.input);
      $('#app').scrollTo({ top: 0, behavior: 'smooth' });
      toast(C.ui.toast.again);
    });

    $$('[data-action="back-input"]').forEach(function (btn) {
      btn.addEventListener('click', function () { show('screen-input'); });
    });
    $$('[data-action="back-free"]').forEach(function (btn) {
      btn.addEventListener('click', backToFree);
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        resolve();
      } catch (e) { reject(e); }
    });
  }

  /* ------------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', init);
})();
