/* ==========================================================================
   냥도사의 천기누설 · 앱 UI (app.js)
   상태 / 티저 블러 / 데모 결제 / 천기 부적 카드(Canvas) / 공유
   - 문장은 전부 copy.js(NyangCopy)에서, 사주 계산은 saju.js(NyangSaju)에서
   ========================================================================== */
(function () {
  'use strict';

  var S = window.NyangSaju;
  var C = window.NyangCopy;
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
    friends: [],
    friendGender: '여성',
    invite: null,
    selectedFriend: null
  };

  var PAY_LABEL = { kakaopay: '카카오페이', tosspay: '토스페이', card: '신용카드' };

  /* --- 물상(物象) 아이콘 · 일러스트 매핑 -------------------------------- */

  // 천간 10자 → 물상 아이콘 + 짧은 이름
  var MU_STEM = [
    ['mu-tree', '큰나무'],
    ['mu-vine', '꽃·덩굴'],
    ['mu-sun', '태양'],
    ['mu-candle', '촛불'],
    ['mu-mountain', '큰 산'],
    ['mu-field', '기름진 밭'],
    ['mu-rock', '바위·쇠'],
    ['mu-gem', '보석'],
    ['mu-sea', '큰 바다'],
    ['mu-rain', '비·이슬']
  ];

  // 지지 12자 → 띠 동물 아이콘 + 물상
  var MU_BRANCH = [
    ['mb-rat', '쥐'],
    ['mb-ox', '소'],
    ['mb-tiger', '호랑이'],
    ['mb-rabbit', '토끼'],
    ['mb-dragon', '용'],
    ['mb-snake', '뱀'],
    ['mb-horse', '말'],
    ['mb-sheep', '양'],
    ['mb-monkey', '원숭이'],
    ['mb-rooster', '닭·보석'],
    ['mb-dog', '개'],
    ['mb-pig', '돼지']
  ];

  // 일간(천간 index) → 오행
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
  /* 1. 초기화                                                          */
  /* ------------------------------------------------------------------ */

  function init() {
    buildSelects();
    buildOrbitSelects();
    bindSegments();
    bindFocus();
    bindTeaserCta();
    bindForm();
    bindPayment();
    bindResultActions();
    bindMenu();
    bindOrbit();
    syncDays();
    state.friends = loadFriends();
    parseInvite();
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

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // 본문 속 한자(甲木·癸水)는 명조로 — 타이포 규칙: 한자만 Song Myung
  var HANJA_RUN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]+/g;
  // 받침에 맞춰 조사를 붙인다 (나무가 / 흙이, 겁재는 / 정관은)
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

  // '이다 / 다' — 받침에 따라 (경금이다 / 계수다)
  function copula(word) {
    return josaOf(word, '이가') === '이' ? '이다' : '다';
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
    });
  }

  // 티저 고정 바: 첫 화면에서는 무료 천기팩폭을 가리지 않도록, 스크롤한 뒤에만 띄운다
  function bindTeaserCta() {
    var app = $('#app');
    app.addEventListener('scroll', function () {
      if (!document.body.classList.contains('is-teaser')) return;
      document.body.classList.toggle('is-teaser-scrolled', app.scrollTop > 90);
    }, { passive: true });
  }

  function bindForm() {
    $('#year').addEventListener('change', syncDays);
    $('#month').addEventListener('change', syncDays);
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
    document.body.classList.toggle('is-teaser', id === 'screen-teaser');
    document.body.classList.remove('is-teaser-scrolled');
    $('#app').scrollTo({ top: 0, behavior: 'auto' });
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('is-on'); }, 2800);
  }

  /* ------------------------------------------------------------------ */
  /* 3. 제출 → 티저                                                     */
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
      err.textContent = /음력/.test(e && e.message ? e.message : '')
        ? '음력 날짜가 안 맞는다. 생년월일을 다시 확인해 봐.'
        : C.ui.error;
      err.hidden = false;
      return;
    }
    state.reading = r;
    state.input = input;
    state.paid = false;
    renderTeaser(r, input);
    show('screen-teaser');
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

  /* --- 사주명식 카드 ------------------------------------------------- */

  function elVars(elem) {
    return '--el:' + S.ELEM_COLOR[elem] + ';--el-ink:' + S.ELEM_INK[elem] + ';--el-soft:' + S.ELEM_SOFT[elem];
  }

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

  /* --- 오행 분포: 100% 누적 바 + 범례 ------------------------------- */

  function renderOheng(target, chart) {
    var bar = chart.dist.map(function (d) {
      if (d.pct <= 0) return '';
      var txt = d.pct >= 15 ? S.ELEM_HANJA[d.elem] + ' ' + d.pct + '%' : '';
      return '<span class="oheng__seg" data-el="' + d.elem + '" style="flex:0 0 ' + d.pct + '%;' + elVars(d.elem) + '">' + txt + '</span>';
    }).join('');

    var legend = chart.dist.map(function (d) {
      return '<li' + (d.count === 0 ? ' class="is-none"' : '') + ' data-el="' + d.elem + '" style="' + elVars(d.elem) + '">' +
        '<span class="oheng__name"><span class="oheng__hanja">' + d.hanja + '</span> ' + d.elem + '</span>' +
        '<span class="oheng__pct"><i></i><b>' + d.pct + '%</b></span></li>';
    }).join('');

    var label = '오행 분포 ' + chart.dist.map(function (d) { return d.elem + ' ' + d.pct + '%'; }).join(', ');
    target.innerHTML =
      '<div class="oheng__bar" role="img" aria-label="' + label + '">' + bar + '</div>' +
      '<ul class="oheng__legend">' + legend + '</ul>' +
      '<p class="oheng__note">' + charWord(chart) + ' 균등 가중 · 합 100%</p>';
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

    // --- 오행 다섯 원 (한자 + 한글 + 비율), 센 기운은 더 크고 굵게
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
      return '<g' + (d.count === 0 ? ' opacity="0.5"' : '') + '>' + halo +
        '<circle cx="' + n.x.toFixed(1) + '" cy="' + n.y.toFixed(1) + '" r="' + n.r.toFixed(1) + '"' +
        ' fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"' +
        (d.count === 0 ? ' stroke-dasharray="3 3"' : '') + '/>' +
        '<text x="' + n.x.toFixed(1) + '" y="' + (n.y - 1).toFixed(1) + '" text-anchor="middle" fill="' + txt + '"' +
        ' font-family="\'Song Myung\', serif" font-weight="700" font-size="' + (isTop ? 22 : 20) + '">' + d.hanja + '</text>' +
        '<text x="' + n.x.toFixed(1) + '" y="' + (n.y + 17).toFixed(1) + '" text-anchor="middle" fill="' + txt + '"' +
        ' font-family="\'Paperlogy\', sans-serif" font-weight="700" font-size="12">' +
        (d.count === 0 ? C.ui.oheng.cycleNone : d.ko + ' ' + d.pct + '%') + '</text>' +
        '</g>';
    }).join('');

    var dmHan = S.ELEM_HANJA[STEM_ELEM[chart.dayMaster]];
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="오행 상생상극도. ' +
      chart.dist.map(function (d) { return d.elem + ' ' + d.pct + '%'; }).join(', ') + '. 바깥 원은 상생, 안쪽 별은 상극입니다.">' +
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

  // 오행도 아래 한 줄 — 무엇이 많고, 무엇을 살리고, 무엇에 눌리는지
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
      s = who + many.join('·') + ' ' + numKo + '이 나란히 ' + t.pct + '%로 제일 많아요. 그중 ' +
        josa(mine, '을를') + ' 기준으로 보면, ' + josa(mine, '은는') + ' ' + josa(makes, '을를') +
        ' 살리고 ' + josa(kills, '을를') + ' 누릅니다. 반대로 ' + killed + '한테 눌리지요.';
    } else {
      s = who + josa(mine, '이가') + ' 제일 많아요. ' + t.pct + '%입니다. ' +
        josa(mine, '은는') + ' ' + josa(makes, '을를') + ' 살리고 ' + josa(kills, '을를') + ' 누릅니다. 반대로 ' +
        killed + '한테 눌리지요.';
    }
    if (chart.lacking.length) {
      var lackKo = S.ELEM_KO[chart.lacking[chart.lacking.length - 1]];
      s += ' ' + chart.lacking.map(function (e) { return S.ELEM_KO[e] + '(' + S.ELEM_HANJA[e] + ')'; }).join('·') +
        josaOf(lackKo, '은는') + ' 아예 안 들어왔어요. 그 자리는 비어 있는 채로 살아갑니다.';
    }
    return s;
  }

  /* --- 명식 해설 (십신 · 12운성 · 지장간 · 대운) --------------------- */

  function charWord(chart) {
    return chart.total === 6 ? '여섯 글자' : '여덟 글자';
  }

  function metaLine(chart) {
    return '일간 ' + chart.dayMasterName + ' · ' + chart.strongest.elem + ' ' + chart.strongest.pct + '%';
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

    // 1) 일간 + 기운의 세기 (동점이면 나란히)
    var tops = chart.dominant;
    var topTxt = tops.map(function (e) { return S.ELEM_KO[e]; }).join('·');
    var line1 = who + '의 중심은 ' + han(chart.dayMasterHanja) + '(' + chart.dayMasterName + ')입니다. ' +
      charWord(chart) + ' 중 ' + josa(topTxt, '이가') + ' <b>' + t.pct + '%</b>로 제일 세고';
    if (chart.lacking.length) {
      var lackKo1 = S.ELEM_KO[chart.lacking[chart.lacking.length - 1]];
      line1 += ', ' + chart.lacking.map(function (e) { return S.ELEM_KO[e]; }).join('·') + josaOf(lackKo1, '은는') + ' 하나도 없어요.';
    } else {
      var weak = chart.dist.slice().sort(function (a, b) { return a.count - b.count; })[0];
      line1 += ', ' + josa(S.ELEM_KO[weak.elem], '이가') + ' <b>' + weak.pct + '%</b>로 제일 얇아요.';
    }
    out.push('<p>' + line1 + '</p>');

    if (full) {
      // 2) 십신
      var list = tenList(chart);
      var head = list.slice(0, 3).map(function (x) { return x.t + ' ' + x.n; }).join(' · ');
      var gl = list.slice(0, 2).map(function (x) {
        return '<b>' + x.t + '</b>' + josaOf(x.t, '은는') + ' ' + S.TEN_GROUP[x.t];
      }).join(', ');
      out.push('<p>드러난 십신은 ' + head + ' 순서예요. ' + gl + '. 그게 ' + who + ' 판에서 제일 크게 도는 기운입니다.</p>');
      out.push('<p>카드 위 작은 글씨는 12운성입니다. 그 자리에서 ' + who + ' 기운이 얼마나 센지 보는 눈금이지요. 제왕·건록이면 그 자리가 세고, 병·사·절이면 기운이 빠져 있는 자리예요.</p>');

      // 3) 지장간
      if (chart.hiddenElems.length) {
        out.push('<p>' + C.ui.chart.hiddenHas.replace('{elems}',
          chart.hiddenElems.map(function (e) { return S.ELEM_KO[e] + '(' + S.ELEM_HANJA[e] + ')'; }).join('·')) + '</p>');
      } else {
        out.push('<p>' + (chart.total === 6
          ? '시주를 모른다고 숨은 기운까지 없는 건 아니에요. 여섯 글자만으로 본 결과입니다.'
          : C.ui.chart.hiddenNone) + '</p>');
      }

      // 4) 대운
      var dw = chart.daewoon;
      if (dw && dw.list.length) {
        var cur = dw.current;
        var next = dw.list.filter(function (d) { return d.age > (cur ? cur.age : 0); })[0];
        var s2 = '대운은 ' + (dw.forward ? '순행' : '역행') + '입니다. ' + dw.startAge + '세에 ' + dw.list[0].ko + '로 열렸고, ';
        if (cur) {
          s2 += '지금은 <b>' + cur.ko + '</b> 구간(' + cur.age + '~' + (cur.age + 9) + '세)이에요.';
          if (next) s2 += ' 다음은 ' + next.age + '세 ' + next.ko + '입니다.';
        } else {
          s2 += '아직 첫 대운 전이에요.';
        }
        out.push('<p>' + s2 + '</p>');
      }

      // 5) 경계 안내 (관법이 갈리는 자리)
      if (chart.hourEdge) out.push('<p>' + C.ui.chart.edgeHour + '</p>');
      if (chart.termEdge) out.push('<p>' + C.ui.chart.edgeTerm + '</p>');
    }
    return out.join('');
  }

  /* ------------------------------------------------------------------ */
  /* 3-1. 천기 조립 — 만세력 결과 + copy.js 문장                          */
  /* ------------------------------------------------------------------ */

  function buildReading(chart, input) {
    var m = C.MASTER[chart.dayMaster];
    var focusKey = C.FOCUS[input.focus] ? input.focus : 'love';
    var elemKo = STEM_ELEM[chart.dayMaster];
    var dmName = S.STEMS[chart.dayMaster] + elemKo;                          // 계수
    var dmHanja = S.STEMS_HANJA[chart.dayMaster] + S.ELEM_HANJA[elemKo];     // 癸水
    var name = (input.name || '').trim() || '손님';
    var timing = S.loveTiming(chart, Date.now());
    var timingText = timing
      ? S.fmtDate(timing.startMs) + ' ~ ' + S.fmtDate(timing.endMs)
      : null;

    var r = {
      name: name,
      callName: name === '손님' ? '손님' : name + ' 님',
      chart: chart,
      master: m,
      focusKey: focusKey,
      focus: C.FOCUS[focusKey],
      focusText: m.focus[focusKey],
      dayMaster: { name: dmName + '(' + dmHanja + ')', short: dmName, hanja: dmHanja, elem: elemKo },
      timing: timing,
      timingText: timingText
    };
    r.summary = buildSummary(r);
    return r;
  }

  // 결과 요약 복사 — 단톡방에 붙여도 도사의 말투가 남게
  function buildSummary(r) {
    var p = r.chart.pillars;
    var m = r.master;
    var line = function (pl) { return pl ? pl.ko + '(' + pl.hanja + ')' : '시주 모름'; };
    var L = [];
    L.push('냥도사의 천기누설 — ' + r.name);
    L.push('사주명식: ' + line(p.year) + ' · ' + line(p.month) + ' · ' + line(p.day) + ' · ' + line(p.hour));
    L.push('일간: ' + r.dayMaster.name + ' / 오행: ' + r.chart.dist.map(function (d) { return d.elem + d.pct + '%'; }).join(' '));
    L.push('한 줄 정의: ' + m.title);
    L.push('');
    L.push(fill(m.bomb, r.name));
    L.push('');
    L.push('[본편]');
    L.push('· ' + C.ui.result.sections.gift + ': ' + fill(m.gift, r.name));
    L.push('· ' + C.ui.result.sections.money + ': ' + fill(m.money, r.name));
    L.push('· ' + fill(C.ui.result.sections.ask, r.name) + ' (' + r.focus.label + '): ' + fill(r.focusText, r.name));
    L.push('· ' + C.ui.result.sections.timing + ': ' + fill(m.timing, r.name) +
      (r.timingText ? ' [' + r.timingText + ']' : ''));
    L.push('');
    L.push('[보너스]');
    L.push('· ' + C.ui.result.bonus.label1 + ' 내가 보는 나: ' + fill(m.selfSee, r.name));
    L.push('· 스스로 오해하는 점: ' + fill(m.selfBlind, r.name));
    L.push('· 남들이 보는 나: ' + fill(m.firstMet, r.name));
    L.push('· 친해진 뒤: ' + fill(m.closer, r.name));
    L.push('· ' + C.ui.result.bonus.label2 + ' 가까워질 때: ' + fill(m.love, r.name));
    L.push('· 곁에 둘 기운: ' + fill(m.keep, r.name));
    L.push('· 피할 기운: ' + fill(m.avoidEnergy, r.name));
    L.push('');
    L.push('· ' + C.ui.result.talismanTitle + ': ' + fill(m.talisman, r.name));
    L.push('');
    L.push('냥도사가 봤습니다. 재미로 보세요. (복채 900원)');
    return tidy(L.join('\n'));
  }

  function renderTeaser(r, input) {
    $('#teaser-call').textContent = fill(C.ui.call.short);
    $('#teaser-birth').innerHTML = birthLines(r, input).map(function (t) { return '<span>' + t + '</span>'; }).join('');
    $('#teaser-meta').textContent = metaLine(r.chart);
    renderPillars($('#pillars'), r.chart);
    $('#teaser-myeong-foot').innerHTML = myeongFoot(r.chart, false, r.name);
    $('#daymaster-badge').textContent = '일간 ' + r.dayMaster.short;
    renderOheng($('#oheng'), r.chart);
    renderCycle($('#cycle'), r.chart, r.name);
    $('#teaser-line').textContent = fill(r.master.bomb);
    renderLockedSections(r);
  }

  // 잠금 너머로 비치는 미리보기 — 본편 사주 4칸과 같은 순서로
  function renderLockedSections(r) {
    var box = $('#locked-inner');
    var m = r.master;
    var blocks = [
      [C.ui.result.sections.gift, fill(m.gift)],
      [C.ui.result.sections.money, fill(m.money)],
      [fill(C.ui.result.sections.ask), fill(r.focusText)],
      [C.ui.result.sections.timing, fill(m.timing)]
    ];
    box.innerHTML = blocks.map(function (b) {
      return '<h3>' + b[0] + '</h3><p>' + hanjaize(b[1]) + '</p>';
    }).join('');
  }

  /* ------------------------------------------------------------------ */
  /* 3-2. 인연 궤도 — 나 중심 달 궤도 궁합                                */
  /* ------------------------------------------------------------------ */

  var FRIEND_KEY = 'nyangsaJu.friends.v1';
  var MAX_FRIENDS = 9;

  // 첫 화면부터 어떻게 보이는지 알 수 있게, 기본 샘플 네 명을 궤도에 올려 둔다
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

  // 그 친구가 나에게 어떤 기운을 주는지 한 줄
  function orbitLine(item) {
    var tpl = C.orbit.relation[item.compat.relation] || C.orbit.relation.same;
    var line = tpl
      .replace(/\{f\}/g, item.f.name)
      .replace(/\{fe\}/g, S.ELEM_KO[item.compat.youElem])
      .replace(/\{me\}/g, S.ELEM_KO[item.compat.meElem]);
    if (item.compat.hap) line += ' ' + C.orbit.hapLine;
    else if (item.compat.yukhap) line += ' ' + C.orbit.yukhapLine;
    if (item.compat.chung) line += ' ' + C.orbit.chungLine;
    return fill(line);
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
        nodes += '<g class="orbit__node orbit__node--' + k + on + '" data-friend-id="' + esc(d.f.id) + '"' +
          ' tabindex="0" role="button" aria-label="' + esc(d.f.name) + ' 님, ' + k + '궤도, ' + d.compat.score + '점">' +
          '<circle cx="' + nx.toFixed(1) + '" cy="' + ny.toFixed(1) + '" r="26" fill="transparent"/>' +
          '<circle class="orbit__node-ring" cx="' + nx.toFixed(1) + '" cy="' + ny.toFixed(1) + '" r="15"/>' +
          '<circle cx="' + nx.toFixed(1) + '" cy="' + ny.toFixed(1) + '" r="4.4" fill="' + S.ELEM_COLOR[d.compat.youElem] + '"/>' +
          '<text class="orbit__node-name" x="' + nx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="middle">' + esc(label) + '</text>' +
          '<title>' + esc(d.f.name) + ' 님 · ' + k + '궤도 · ' + d.compat.score + '점</title>' +
          '</g>';
      });
    });

    var svg = rings + nodes + center;
    $('#orbit-svg').innerHTML = svg;
    $('#orbit-svg').setAttribute('aria-label',
      '나를 중심으로 한 인연 궤도. 1궤도 ' + byOrbit[1].length + '명, 2궤도 ' + byOrbit[2].length +
      '명, 3궤도 ' + byOrbit[3].length + '명.');

    $('#orbit-legend').innerHTML = C.orbit.legend.map(function (l) {
      return '<li class="orbit__leg orbit__leg--' + l.n + '"><i aria-hidden="true"></i>' +
        '<span><b>' + l.label + '</b> ' + l.name + '</span><em>' + byOrbit[l.n].length + '명</em></li>';
    }).join('');

    $('#orbit-list').innerHTML = data.length ? data.map(function (d) {
      var on = state.selectedFriend === d.f.id ? ' is-on' : '';
      return '<li class="orbit__item' + on + '">' +
        '<button type="button" class="orbit__pick" data-pick="' + esc(d.f.id) + '">' +
        '<span class="orbit__item-name">' + esc(d.f.name) + (d.f.sample ? '<i>샘플</i>' : '') + '</span>' +
        '<span class="orbit__item-meta">' + d.compat.orbit + '궤도 · ' + d.compat.score + '점</span>' +
        '</button>' +
        '<button type="button" class="orbit__remove" data-remove="' + esc(d.f.id) + '"' +
        ' aria-label="' + esc(C.orbit.removeAria.replace('{name}', d.f.name)) + '">×</button></li>';
    }).join('') : '<li class="orbit__none">' + C.orbit.empty + '</li>';

    var sel = data.filter(function (d) { return d.f.id === state.selectedFriend; })[0];
    $('#orbit-caption').innerHTML = sel
      ? '<b>' + esc(sel.f.name) + ' 님 · ' + sel.compat.orbit + '궤도 · ' + sel.compat.score + '점</b>' +
        '<span>' + orbitLine(sel) + '</span>'
      : fill(C.orbit.tip);

    renderInviteCard();
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
      '<h4 class="invite__title">' + esc(C.orbit.inviteLanded.replace(/\{name\}/g, name)) +
      ' <b>' + item.compat.score + '점</b></h4>' +
      '<p class="invite__meta">내 궤도에서 ' + esc(name) + ' 님은 <b>' + item.compat.orbit + '궤도 · ' + orbitName(item.compat.orbit) + '</b></p>' +
      '<p class="invite__text">' + orbitLine(item) + '</p>' +
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
    var base = location.origin + location.pathname;
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

    $('#btn-invite').addEventListener('click', copyInvite);

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

    state.friends.push(rec);
    saveFriends();
    state.selectedFriend = rec.id;
    renderOrbit();
    $('#friend-name').value = '';
    toast(C.orbit.addOk.replace('{name}', rec.name).replace('{orbit}', compat.orbit));
  }

  function removeFriend(id) {
    var gone = state.friends.filter(function (f) { return f.id === id; })[0];
    state.friends = state.friends.filter(function (f) { return f.id !== id; });
    if (state.selectedFriend === id) state.selectedFriend = null;
    saveFriends();
    renderOrbit();
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
    state.friends.push(rec);
    saveFriends();
    state.selectedFriend = rec.id;
    renderOrbit();
    toast(C.orbit.inviteAdded.replace('{name}', rec.name));
  }

  function selectFriend(id) {
    state.selectedFriend = state.selectedFriend === id ? null : id;
    renderOrbit();
  }

  function copyInvite() {
    if (!state.reading || !state.input) return;
    copyText(inviteUrl()).then(function () {
      toast(C.orbit.copied);
    }).catch(function () {
      toast(C.orbit.copyFail);
    });
  }

  /* ------------------------------------------------------------------ */
  /* 4. 데모 결제                                                       */
  /* ------------------------------------------------------------------ */

  function bindPayment() {
    $('#btn-unlock').addEventListener('click', openPay);
    $('#btn-unlock-2').addEventListener('click', openPay);
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
  }

  function openPay() {
    var modal = $('#pay-modal');
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
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
    btn.textContent = PAY_LABEL[state.payMethod] + ' 연결 중이다';

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

    setTimeout(function () {
      clearInterval(timer);
      loading.classList.remove('is-on');
      loading.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('is-loading');
      btn.disabled = false;
      btn.textContent = C.ui.pay.submit;
      state.paid = true;
      renderResult(state.reading, state.input);
      show('screen-result');
      toast(C.ui.toast.paid + PAY_LABEL[state.payMethod] + ' 900원');
    }, 2400);
  }

  /* ------------------------------------------------------------------ */
  /* 5. 결과 렌더                                                        */
  /* ------------------------------------------------------------------ */

  function renderResult(r, input) {
    var m = r.master;

    $('#result-call').textContent = fill(C.ui.call.long);
    $('#result-title').textContent = m.title;
    $('#result-birth').innerHTML = birthLines(r, input).map(function (t) { return '<span>' + t + '</span>'; }).join('');
    $('#bomb-text').textContent = fill(m.bomb);

    renderPillars($('#pillars-result'), r.chart);
    $('#result-meta').textContent = metaLine(r.chart);
    $('#result-myeong-foot').innerHTML = myeongFoot(r.chart, true, r.name);

    // 일간 오행에 맞는 고양이 일러스트 — 결과 상단 한가운데 크게
    var elem = r.dayMaster.elem;
    var art = ELEM_ART[elem];
    var img = $('#result-cat');
    img.onerror = function () {
      img.onerror = null;
      img.src = 'public/cat-' + art.slug + '-ink.png';
    };
    img.src = 'public/cat-' + art.slug + '-ink.webp';
    img.alt = S.ELEM_HANJA[elem] + ' · ' + r.dayMaster.short + ' — ' + (m.scene || art.scene) + ' 콩눈 고양이 그림';
    $('#result-elem-art').innerHTML = '<b style="color:' + S.ELEM_INK[elem] + '">' + S.ELEM_HANJA[elem] + '</b> · ' + r.dayMaster.short;

    /* ---- 본편 · 사주 전체 해석 (기질 → 돈과 일 → 물어본 질문 → 타이밍) ---- */
    var main = [
      { title: C.ui.result.sections.gift, body: fill(m.gift) },
      { title: C.ui.result.sections.money, body: fill(m.money) },
      { title: fill(C.ui.result.sections.ask), term: r.focus.label, body: fill(r.focusText) }
    ];

    main.push({
      title: C.ui.result.sections.timing,
      term: r.timingText || null,
      body: fill(m.timing),
      why: (r.timing && r.timing.why && r.timing.why.length) ? r.timing.why.join(' · ') : ''
    });

    var html = '';
    main.forEach(function (s, i) { html += entryHtml(pad(i + 1), s); });
    $('#result-sections').innerHTML = html;

    /* ---- 보너스 · 도사냥이의 시선 풀이 (BONUS 01 · 02, 03은 인연 궤도) ---- */
    var bonus = C.ui.result.bonus;
    var bp = bonus.parts;
    var bonusSections = [
      {
        bonus: bonus.label1,
        title: fill(bonus.title1),
        parts: [
          { label: bp.me, text: fill(m.selfSee) },
          { label: bp.blind, text: fill(m.selfBlind) },
          { label: bp.first, text: fill(m.firstMet) },
          { label: bp.closer, text: fill(m.closer) }
        ]
      },
      {
        bonus: bonus.label2,
        title: bonus.title2,
        tags: m.tags,
        parts: [
          { label: bp.when, text: fill(m.love) },
          { label: bp.keep, text: fill(m.keep) },
          { label: bp.avoid, text: fill(m.avoidEnergy), warn: true }
        ]
      }
    ];

    html = '';
    bonusSections.forEach(function (s) { html += entryHtml('', s); });
    $('#result-sections-bonus').innerHTML = html;

    // 보너스 띠 머리글 · 궤도 머리글 · 초대 링크 안내도 copy.js 한 곳에서
    $('#bonus-kicker').textContent = bonus.kicker;
    $('#bonus-title').textContent = bonus.title;
    $('#bonus-sub').textContent = bonus.sub;
    $('#orbit-kicker').textContent = C.orbit.kicker;
    $('#orbit-invite-hint').textContent = fill(C.orbit.inviteHint);

    /* ---- 오늘의 천기 부적 (공유·저장 카드 바로 위) ---- */
    $('#result-sections-talis').innerHTML =
      '<div class="entry entry--talis">' +
        '<p class="entry__text">' + tidy(fill(m.talisman)) +
        '<span>' + C.ui.result.talismanAvoid + tidy(fill(m.avoid)) + '</span></p>' +
      '</div>';

    $('#result-oheng-badge').textContent = '일간 ' + r.dayMaster.short;
    renderOheng($('#result-oheng'), r.chart);
    renderCycle($('#result-cycle'), r.chart, r.name);

    state.selectedFriend = null;
    renderOrbit();

    drawAmulet(r, elem);
    $('#btn-save-card').hidden = false;
    $('#btn-share-card').hidden = !canShareFiles();
  }

  // 결과 섹션 한 덩어리 (제목 · 기간 · 본문 · 태그) — 본편은 번호, 보너스는 BONUS 배지
  function entryHtml(no, s) {
    var head = s.bonus
      ? '<div class="entry__badge">' + s.bonus + '</div>' +
        '<h3 class="entry__title">' + s.title + '</h3>'
      : '<span class="entry__no">' + no + '</span>' +
        '<h3 class="entry__title">' + s.title + '</h3>';

    var html = '<div class="entry' + (s.talis ? ' entry--talis' : '') +
      (s.bonus ? ' entry--bonus' : '') + '">' +
      '<div class="entry__head">' + head + '</div>';

    if (s.term) html += '<span class="entry__term">' + s.term + '</span>';

    if (s.body) {
      html += '<p class="entry__text">' + (s.talis ? tidy(s.body) : hanjaize(s.body));
      if (s.why) html += ' <span class="entry__why">(' + s.why + ')</span>';
      if (s.avoid) html += '<span>' + s.avoid + '</span>';
      html += '</p>';
    }

    if (s.extra) {
      html += '<p class="entry__text entry__text--after">' + hanjaize(s.extra) + '</p>';
    }

    if (s.parts) {
      html += s.parts.map(function (p) {
        return '<p class="entry__part' + (p.warn ? ' entry__part--warn' : '') + '">' +
          '<span class="entry__part-label">' + p.label + '</span>' + hanjaize(p.text) + '</p>';
      }).join('');
    }

    if (s.tags && s.tags.length) {
      html += '<div class="entry__tags">' + s.tags.map(function (t) {
        return '<span>' + t + '</span>';
      }).join('') + '</div>';
    }
    return html + '</div>';
  }

  function copySummary(r) {
    return String(r.summary || '');
  }

  /* ------------------------------------------------------------------ */
  /* 6. 천기 부적 한 장 (Canvas 1080×1920)                              */
  /* ------------------------------------------------------------------ */

  var CW = 1080, CH = 1920;
  var INK = '#1E1A17', INK2 = '#453D36', INK3 = '#7A6B5D';
  var RED = '#C73E2C', RED_D = '#A93222';
  var PAPER = '#F5EFE2';

  // 부적 카드도 한자를 뺀 글자는 Paperlogy, 한자(緣·水)만 명조
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
      '400 32px "Paperlogy"', '700 32px "Paperlogy"',
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

  /* ---------- 매화 구분선 ---------- */
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

  /* ---------- 사주명식 미니 기둥 + 오행 분포 띠 ----------------------- */

  // 명식 블록의 좌우 먹선 (카드 1080 안에서 좌우 104px씩 비운 872px)
  var META_X0 = 104, META_X1 = 976;
  var META_H = 334;   // 위 먹선 ~ 아래 먹선

  // 곧은 먹선 — 붓 테두리와 달리 손떨림 없는 한 줄
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

  // 기둥 한 칸 — 년주/월주/일주/시주. 일주는 먹선 테두리로 강조
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

  // 오행 수치 한 줄 — 木 13% · 火 12% · 土 25% · 金 25% · 水 25%
  function drawElemLegend(ctx, dist, cx, y) {
    var parts = [];
    dist.forEach(function (d, k) {
      if (k) parts.push({ t: '  ·  ', size: 21, weight: '400', color: 'rgba(69,61,54,0.5)', hanja: false });
      parts.push({ t: d.hanja, size: 23, weight: '700', color: d.ink, hanja: true });
      parts.push({ t: ' ' + d.pct + '%', size: 23, weight: '400', color: INK2, hanja: false });
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

    /* 100% 누적 띠 */
    var barY = P0 + 212, barH = 22;
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

  /* ---------- 붓으로 그은 선 ---------- */
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

  function brushRect(ctx, inset, width, alpha, amp, phase) {
    var l = inset, t = inset, r = CW - inset, b = CH - inset;
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

  /* ---------- 굵은 먹선 테두리 (겹쳐 그은 붓 자국) ---------- */
  function inkBorder(ctx) {
    ctx.save();
    ctx.strokeStyle = INK;
    brushRect(ctx, 46, 30, 0.055, 4.4, 0.4);
    brushRect(ctx, 46, 16, 0.97, 2.4, 1.1);
    brushRect(ctx, 46, 6, 1, 1.2, 2.6);
    brushRect(ctx, 86, 2.6, 0.9, 1.3, 3.3);
    ctx.restore();
  }

  /* ---------- 인주 도장 (음각 · 두 글자는 세로로) ---------- */
  function sealStamp(ctx, x, y, size, chars, rnd) {
    var i, half = size / 2, per, side, along, px, py;
    var arr = String(chars).split('');
    ctx.save();
    ctx.translate(x + half, y + half);
    ctx.rotate(-0.07);

    // 살짝 눌린 네 변
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = RED;
    wobbleRectPath(ctx, -half, -half, half, half, 1.5, 1.1);
    ctx.fill();

    // 가장자리만 종이가 비치는 결 (찍힘)
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

    // 글자 (음각) — 한 글자는 크게, 두 글자는 위아래로
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

  /* ---------- 천기 부적 한 장 ---------- */
  function drawAmulet(r, elem) {
    var canvas = $('#amulet');
    var ctx = canvas.getContext('2d');
    var W = CW, H = CH;
    var art = ELEM_ART[elem] || ELEM_ART['수'];
    var bombText = tidy(fill(r.master.bomb, r.name));
    var talisText = tidy(fill(r.master.talisman, r.name));

    var seed = hashStr((r.name || '') + '|' + (state.input ? [state.input.year, state.input.month, state.input.day, state.input.hourIdx].join('-') : ''));
    var rnd = seededRand(seed || 20261124);

    var imgPromise = loadImage('public/cat-' + art.slug + '-ink.webp').then(function (im) {
      return im || loadImage('public/cat-' + art.slug + '-ink.png');
    });

    Promise.all([ensureFonts(), imgPromise]).then(function (res) {
      var img = res[1];
      var i, ti;

      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;

      ctx.clearRect(0, 0, W, H);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      /* ---------- 한지 ---------- */
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);
      for (i = 0; i < 2400; i++) {
        ctx.fillStyle = 'rgba(120,100,74,' + (0.005 + rnd() * 0.017).toFixed(3) + ')';
        ctx.fillRect(rnd() * W, rnd() * H, 2.2, 2.2);
      }
      ctx.lineCap = 'round';
      for (i = 0; i < 64; i++) {
        ctx.strokeStyle = 'rgba(120,100,74,' + (0.025 + rnd() * 0.045).toFixed(3) + ')';
        ctx.lineWidth = 1 + rnd() * 1.3;
        var fx = rnd() * W, fy = rnd() * H, fa = rnd() * Math.PI, fl = 8 + rnd() * 22;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + Math.cos(fa) * fl, fy + Math.sin(fa) * fl);
        ctx.stroke();
      }

      /* ---------- 테두리 · 도장 ---------- */
      inkBorder(ctx);
      sealStamp(ctx, W - 214, 152, 94, C.brand.stamp, rnd);

      /* ---------- 머리글 (34px · 카드의 타이틀) ---------- */
      ctx.textAlign = 'left';
      ctx.fillStyle = INK2;
      fillSpaced(ctx, C.ui.arumulet.header, W / 2, 208, 15, 'center', 34, 700);

      /* ---------- 일간 오행 고양이 ---------- */
      var boxW = 450, boxH = 360, catY = 246;
      var catW = boxW, catH = boxH;
      if (img) {
        var sc = Math.min(boxW / img.width, boxH / img.height);
        catW = Math.round(img.width * sc);
        catH = Math.round(img.height * sc);
        ctx.drawImage(img, (W - catW) / 2, catY + boxH - catH, catW, catH);
      }
      var artBottom = catY + boxH;

      /* ---------- 물상 캡션 (水 · 계수) ---------- */
      ctx.textAlign = 'left';
      ctx.fillStyle = S.ELEM_INK[elem];
      fillSpaced(ctx, S.ELEM_HANJA[elem] + ' · ' + r.dayMaster.short, W / 2, artBottom + 48, 5, 'center', 30, 700);

      /* ---------- 부적 한마디(큼직하게) · 팩트(한 단계 아래) ---------- */
      ctx.textAlign = 'center';
      var contentTop = artBottom + 68;
      var metaY1 = H - 272;              // 명식 블록 아래 먹선
      var metaY0 = metaY1 - META_H;      // 명식 블록 위 먹선
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
        ctx.strokeText(phraseLines[ti], W / 2, baseline + ti * lh);
        ctx.fillText(phraseLines[ti], W / 2, baseline + ti * lh);
      }

      /* ---------- 팩트 한 줄 ---------- */
      var divY = baseline + (phraseLines.length - 1) * lh + Math.round(phraseSize * 0.42) + gapB;
      plumDivider(ctx, W / 2, divY, 148);

      ctx.fillStyle = RED_D;
      ctx.textAlign = 'left';
      fillSpaced(ctx, C.ui.arumulet.factKicker, W / 2, divY + 56, 7, 'center', 24, 700);

      ctx.textAlign = 'center';
      ctx.fillStyle = INK2;
      ctx.font = '400 ' + factSize + 'px ' + F_SANS;
      for (ti = 0; ti < factLines.length; ti++) {
        ctx.fillText(factLines[ti], W / 2, divY + 56 + 52 + ti * factLh);
      }

      /* ---------- 사주명식 4기둥 + 오행 분포 (서명 위 먹선 사이) ---------- */
      drawChartMeta(ctx, r.chart, metaY0);

      /* ---------- 서명 · 메타 ---------- */
      var sigMain = r.callName + C.ui.arumulet.signature;
      var sigY = H - 210;
      ctx.font = '700 30px ' + F_SANS;
      var sigW = spacedWidth(ctx, sigMain, 3, 30, 700);
      var sigBrand = C.ui.arumulet.brand;
      ctx.font = '400 25px ' + F_SANS;
      var sigW2 = ctx.measureText(sigBrand).width;
      var sigX = W / 2 - (sigW + sigW2) / 2;

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
      ctx.fillText(birthLine(r, state.input || {}), W / 2, H - 164);

      ctx.fillStyle = 'rgba(30,26,23,0.45)';
      ctx.textAlign = 'left';
      fillSpaced(ctx, C.ui.arumulet.notice, W / 2, H - 120, 2, 'center', 22, 400);

      ctx.textAlign = 'left';
      state.canvasReady = true;
    });
  }

  /* ------------------------------------------------------------------ */
  /* 7. 공유 / 저장                                                     */
  /* ------------------------------------------------------------------ */

  function canShareFiles() {
    return !!(navigator.canShare && window.File);
  }

  function bindResultActions() {
    $('#btn-copy').addEventListener('click', function () {
      var text = state.reading ? copySummary(state.reading) : '';
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
        var payload = { files: [file], title: C.brand.name + ' 부적', text: copySummary(state.reading) };
        if (navigator.canShare(payload)) {
          navigator.share(payload).catch(function () {});
        } else {
          copyText(copySummary(state.reading)).then(function () { toast(C.ui.toast.shared); });
        }
      }, 'image/png');
    });

    $('#btn-again').addEventListener('click', function () {
      if (!state.reading) return;
      renderResult(state.reading, state.input);
      $('#app').scrollTo({ top: 0, behavior: 'smooth' });
      toast(C.ui.toast.again);
    });

    $$('[data-action="back-input"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        show('screen-input');
      });
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
