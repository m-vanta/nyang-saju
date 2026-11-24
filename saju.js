/* ==========================================================================
   냥사주 · 만세력 (saju.js)
   --------------------------------------------------------------------------
   엔진 : @fullstackfamily/manseryeok v1.3.0  (vendor/manseryeok.js, MIT)
          · 음양력 1391~2050 — 한국천문연구원(KASI) 음양력 자료를 표로 내장
          · 24절기 절입 시각을 분 단위 실제 값으로 내장 (1899~2051)
          · 입춘 절입 순간에 년주, 12절 절입 순간에 월주
          · 한국 법정 시계(1954~1961 UTC+8:30 · 서머타임) 옵션
   이 파일 : 엔진 위에 얹는 '사주 읽기' 계산만 한다.
          · 지장간 · 십신 · 12운성 · 대운
          · 오행 분포(8자 동일 가중 → 100% 누적) · 도화 · 연애 타이밍
   브라우저 전역: window.NyangSaju
   ========================================================================== */
(function (global) {
  'use strict';

  var M = global.Manseryeok;
  if (!M) {
    throw new Error('만세력 엔진이 없습니다. index.html에서 vendor/manseryeok.js를 saju.js보다 먼저 불러오세요.');
  }

  /* ---------- 1. 글자 · 오행 · 색 ---------- */

  var STEMS = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
  var STEMS_HANJA = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  var STEMS_READ = ['갑목', '을목', '병화', '정화', '무토', '기토', '경금', '신금', '임수', '계수'];
  var BRANCHES = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
  var BRANCHES_HANJA = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  var STEM_ELEM = ['목', '목', '화', '화', '토', '토', '금', '금', '수', '수'];
  var BRANCH_ELEM = ['수', '토', '목', '목', '토', '화', '화', '토', '금', '금', '토', '수'];
  var ELEMS = ['목', '화', '토', '금', '수'];
  var ELEM_HANJA = { 목: '木', 화: '火', 토: '土', 금: '金', 수: '水' };
  var ELEM_KO = { 목: '나무', 화: '불', 토: '흙', 금: '쇠', 수: '물' };

  /* 전통 오행 오방색 — 바탕색(한지 크림)에서 바로 읽히는 채도로 잡았다.
     ELEM_COLOR : 채움·막대·도형 (선명한 쪽)
     ELEM_INK   : 작은 글자 (한지 위 대비 4.5:1 이상)
     ELEM_SOFT  : 아주 옅은 바탕 띠
     금(金)은 전통적으로 흰빛이라 한지 위에서 사라진다. 상아 바탕 + 먹테두리로 세운다. */
  var ELEM_COLOR = { 목: '#26694E', 화: '#C93B2B', 토: '#C98821', 금: '#8C867C', 수: '#1D2228' };
  var ELEM_INK = { 목: '#235F47', 화: '#B23323', 토: '#8A5A10', 금: '#6F6A60', 수: '#1D2228' };
  var ELEM_SOFT = { 목: '#DFE8E1', 화: '#F4DDD7', 토: '#F0E3C8', 금: '#ECE7DC', 수: '#DCDFE3' };
  var ELEM_FILL = { 금: '#EBE6DA' };
  var ELEM_EDGE = { 금: '#7A746B' };

  var ELEM_CYCLE = { 목: '수', 화: '목', 토: '화', 금: '토', 수: '금' }; // 나를 낳는 오행
  var ELEM_MAKES = { 목: '화', 화: '토', 토: '금', 금: '수', 수: '목' }; // 내가 낳는 오행
  var ELEM_KILLS = { 목: '토', 화: '금', 토: '수', 금: '목', 수: '화' }; // 내가 누르는 오행
  var ELEM_KILLED = { 목: '금', 화: '수', 토: '목', 금: '화', 수: '토' }; // 나를 누르는 오행

  // 12시진 — start는 24시간 기준 시작 시각, at은 시진 한가운데(대표 시각)
  var HOURS = [
    { idx: 0, label: '자시', range: '23:00~00:59', start: 23, at: 23 },
    { idx: 1, label: '축시', range: '01:00~02:59', start: 1, at: 2 },
    { idx: 2, label: '인시', range: '03:00~04:59', start: 3, at: 4 },
    { idx: 3, label: '묘시', range: '05:00~06:59', start: 5, at: 6 },
    { idx: 4, label: '진시', range: '07:00~08:59', start: 7, at: 8 },
    { idx: 5, label: '사시', range: '09:00~10:59', start: 9, at: 10 },
    { idx: 6, label: '오시', range: '11:00~12:59', start: 11, at: 12 },
    { idx: 7, label: '미시', range: '13:00~14:59', start: 13, at: 14 },
    { idx: 8, label: '신시', range: '15:00~16:59', start: 15, at: 16 },
    { idx: 9, label: '유시', range: '17:00~18:59', start: 17, at: 18 },
    { idx: 10, label: '술시', range: '19:00~20:59', start: 19, at: 20 },
    { idx: 11, label: '해시', range: '21:00~22:59', start: 21, at: 22 }
  ];

  var WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

  /* ---------- 2. 지장간 · 십신 · 12운성 표 ---------- */

  // 지지 → 지장간 [천간 index, 비중%] — 본기 → 중기 → 여기 순서 (hidden[0]이 본기)
  var HIDDEN = [
    [[9, 100]],                            // 자 子  계
    [[5, 60], [9, 30], [7, 10]],           // 축 丑  기 계 신
    [[0, 60], [2, 30], [4, 10]],           // 인 寅  갑 병 무
    [[1, 100]],                            // 묘 卯  을
    [[4, 60], [1, 30], [9, 10]],           // 진 辰  무 을 계
    [[2, 60], [4, 30], [6, 10]],           // 사 巳  병 무 경
    [[3, 70], [5, 30]],                    // 오 午  정 기
    [[5, 60], [3, 30], [1, 10]],           // 미 未  기 정 을
    [[6, 60], [8, 30], [4, 10]],           // 신 申  경 임 무
    [[7, 100]],                            // 유 酉  신
    [[4, 60], [7, 30], [3, 10]],           // 술 戌  무 신 정
    [[8, 70], [0, 30]]                     // 해 亥  임 갑
  ];

  var TEN_ORDER = ['비견', '겁재', '식신', '상관', '편재', '정재', '편관', '정관', '편인', '정인'];
  var TEN_GROUP = {
    비견: '나와 같은 기운', 겁재: '내 몫을 나눠 먹는 기운',
    식신: '내가 편하게 뽑아 쓰는 기운', 상관: '내 재주, 근데 말이 센 기운',
    편재: '크게 굴리는 돈', 정재: '꼬박꼬박 들어오는 돈',
    편관: '나를 조이는 규율', 정관: '나를 바르게 세우는 규칙',
    편인: '엉뚱하게 나를 살찌우는 공부', 정인: '든든하게 나를 받쳐주는 뒷배'
  };

  // 12운성 — 일간 기준 지지의 기세
  var STAGES = ['장생', '목욕', '관대', '건록', '제왕', '쇠', '병', '사', '묘', '절', '태', '양'];
  var STAGE_START = [11, 6, 2, 9, 2, 9, 5, 0, 8, 3]; // 갑해 을오 병인 정유 무인 기유 경사 신자 임신 계묘

  var SIX_HAP = { 0: 1, 1: 0, 2: 11, 11: 2, 3: 10, 10: 3, 4: 9, 9: 4, 5: 8, 8: 5, 6: 7, 7: 6 };
  var DOHWA = { 2: 3, 6: 3, 10: 3, 8: 9, 0: 9, 4: 9, 5: 6, 9: 6, 1: 6, 11: 0, 3: 0, 7: 0 };

  function elemMakes(a, b) { return ELEM_MAKES[a] === b; }
  function elemKills(a, b) { return ELEM_KILLS[a] === b; }

  function tenGod(dayStem, otherStem) {
    var me = STEM_ELEM[dayStem], you = STEM_ELEM[otherStem];
    var same = (dayStem % 2) === (otherStem % 2);
    if (me === you) return same ? '비견' : '겁재';
    if (elemMakes(me, you)) return same ? '식신' : '상관';
    if (elemKills(me, you)) return same ? '편재' : '정재';
    if (elemKills(you, me)) return same ? '편관' : '정관';
    return same ? '편인' : '정인';
  }

  function stageOf(dayStem, branch) {
    var start = STAGE_START[dayStem];
    var step = dayStem % 2 === 0 ? 1 : -1; // 양간 순행 · 음간 역행
    var i = ((branch - start) * step % 12 + 12) % 12;
    return STAGES[i];
  }

  /* ---------- 3. 날짜 유틸 ---------- */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function isGregLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  function daysInMonth(y, m) {
    return [31, isGregLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  }
  function kstMs(y, m, d, h, mi) { return Date.UTC(y, m - 1, d, (h || 0) - 9, mi || 0, 0); }

  function fmtDate(ms) {
    var k = new Date(ms + 9 * 3600000);
    return k.getUTCFullYear() + '.' + pad2(k.getUTCMonth() + 1) + '.' + pad2(k.getUTCDate());
  }

  function fmtDateKo(ms) {
    var k = new Date(ms + 9 * 3600000);
    return (k.getUTCMonth() + 1) + '월 ' + k.getUTCDate() + '일';
  }

  /* ---------- 4. 음양력 (엔진 위임) ---------- */

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

  // 그 음력해의 윤달 (없으면 0)
  function leapMonthOf(y) {
    var cached = leapCache[y];
    if (cached !== undefined) return cached;
    var found = 0;
    for (var m = 1; m <= 12; m++) {
      if (lunarToSolar(y, m, 1, true)) { found = m; break; }
    }
    leapCache[y] = found;
    return found;
  }
  var leapCache = {};

  /* ---------- 5. 사주팔자 ---------- */

  function stemOf(ch) { return STEMS.indexOf(ch); }
  function branchOf(ch) { return BRANCHES.indexOf(ch); }

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
      read: STEMS_READ[stem],
      stemElem: STEM_ELEM[stem], branchElem: BRANCH_ELEM[branch],
      yinYang: { stem: stem % 2 === 0 ? '양' : '음', branch: branch % 2 === 0 ? '양' : '음' },
      ten: { stem: tenGod(dayStem, stem), branch: tenGod(dayStem, hidden[0].stem) },
      hidden: hidden,
      stage: stageOf(dayStem, branch),
      dohwa: false
    };
  }

  // 8자 균등 가중 → 100% 누적 (최대잔여법으로 합이 정확히 100)
  function distribute(counts, total) {
    var raw = {}, base = {}, used = 0;
    ELEMS.forEach(function (e) {
      raw[e] = total ? (counts[e] / total) * 100 : 0;
      base[e] = Math.floor(raw[e]);
      used += base[e];
    });
    var left = 100 - used;
    var order = ELEMS.slice().sort(function (a, b) {
      return (raw[b] - base[b]) - (raw[a] - base[a]) || counts[b] - counts[a] || ELEMS.indexOf(a) - ELEMS.indexOf(b);
    });
    for (var i = 0; i < left; i++) base[order[i % 5]] += 1;
    return ELEMS.map(function (e) {
      return {
        elem: e, hanja: ELEM_HANJA[e], ko: ELEM_KO[e], count: counts[e],
        pct: base[e], raw: raw[e],
        color: ELEM_COLOR[e], ink: ELEM_INK[e], soft: ELEM_SOFT[e]
      };
    });
  }

  function hourIdxOf(h, mi) {
    var t = h * 60 + mi;
    if (t >= 23 * 60 || t < 60) return 0;
    return Math.floor((t - 60) / 120) + 1;
  }

  /**
   * 사주 계산
   * @param {Object} o { year, month, day, calendar:'solar'|'lunar', isLeap, hourIdx (0~11|null) }
   */
  function computePillars(o) {
    var isLunar = o.calendar === 'lunar';
    var hay = o.hourIdx == null ? null : HOURS[o.hourIdx];
    var h = hay ? hay.at : undefined;
    var mi = hay ? 30 : undefined;

    var res;
    try {
      res = M.calculateSaju(o.year, o.month, o.day, h, mi, {
        lunar: isLunar,
        isLeapMonth: isLunar && !!o.isLeap,
        applyTimeCorrection: false // 기본 명식은 한국 표준시. 진태양시는 아래에서 따로 계산해 안내만 한다.
      });
    } catch (e) {
      throw new Error(isLunar ? '음력 날짜를 확인해 주세요.' : '생년월일을 확인해 주세요.');
    }

    var solar = res.solarDate
      ? { y: res.solarDate.year, m: res.solarDate.month, d: res.solarDate.day }
      : { y: o.year, m: o.month, d: o.day };
    var lunarInfo = isLunar
      ? { year: o.year, month: o.month, day: o.day, isLeap: !!o.isLeap }
      : solarToLunar(solar.y, solar.m, solar.d);

    var yS = stemOf(res.yearPillar[0]), yB = branchOf(res.yearPillar[1]);
    var mS = stemOf(res.monthPillar[0]), mB = branchOf(res.monthPillar[1]);
    var dS = stemOf(res.dayPillar[0]), dB = branchOf(res.dayPillar[1]);
    var hS = res.hourPillar ? stemOf(res.hourPillar[0]) : null;
    var hB = res.hourPillar ? branchOf(res.hourPillar[1]) : null;

    var dayStem = dS;
    var yP = makePillar(yS, yB, dayStem);
    var mP = makePillar(mS, mB, dayStem);
    var dP = makePillar(dS, dB, dayStem);
    var hP = res.hourPillar ? makePillar(hS, hB, dayStem) : null;
    dP.isSelf = true;

    var list = [yP, mP, dP];
    if (hP) list.push(hP);

    // 오행 분포 — 천간 1 · 지지 본기 1, 8자 동일 가중
    var counts = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
    list.forEach(function (p) { counts[p.stemElem]++; counts[p.branchElem]++; });
    var total = list.length * 2;
    var dist = distribute(counts, total);

    var maxCount = 0;
    dist.forEach(function (d) { if (d.count > maxCount) maxCount = d.count; });
    var dominant = dist.filter(function (d) { return d.count === maxCount; }).map(function (d) { return d.elem; });
    var lacking = dist.filter(function (d) { return d.count === 0; }).map(function (d) { return d.elem; });
    var strongest = dist.slice().sort(function (a, b) { return b.count - a.count || ELEMS.indexOf(a.elem) - ELEMS.indexOf(b.elem); })[0];

    // 지장간에만 숨어 있는 오행 (겉으로는 안 보이는데 안에 있는 기운)
    var hiddenElems = [];
    list.forEach(function (p) {
      p.hidden.forEach(function (hd) {
        if (counts[hd.elem] === 0 && hiddenElems.indexOf(hd.elem) === -1) hiddenElems.push(hd.elem);
      });
    });

    // 십신 집계 (천간 + 지지 본기)
    var tenCount = {};
    TEN_ORDER.forEach(function (t) { tenCount[t] = 0; });
    list.forEach(function (p) {
      if (!p.isSelf) tenCount[p.ten.stem]++;
      tenCount[p.ten.branch]++;
    });

    // 도화살 — 년지·일지의 삼합국 기준 도화지가 다른 기둥에 있으면 성립
    var tYear = DOHWA[yB], tDay = DOHWA[dB];
    var dohwa = list.some(function (p) { return p.branch === tYear || p.branch === tDay; });
    list.forEach(function (p) { p.dohwa = (p.branch === tYear || p.branch === tDay); });

    // 절입 · 시진 경계 — 관법이 갈리는 자리인지 확인
    var jeol = null;
    try { jeol = M.getJeolAround(solar.y, solar.m, solar.d, h == null ? 12 : h, h == null ? 0 : mi); } catch (e) { jeol = null; }

    var corrected = null, hourEdge = false;
    if (hay) {
      try {
        var corr = M.calculateSaju(o.year, o.month, o.day, hay.at, mi, {
          lunar: isLunar, isLeapMonth: isLunar && !!o.isLeap,
          longitude: 126.98, applyTimeCorrection: true // 서울 진태양시(경도 보정)
        });
        if (corr.correctedTime) {
          corrected = {
            hour: corr.correctedTime.hour, minute: corr.correctedTime.minute,
            pillar: corr.hourPillar, idx: hourIdxOf(corr.correctedTime.hour, corr.correctedTime.minute)
          };
          hourEdge = corrected.idx !== hay.idx;
        }
      } catch (e2) { corrected = null; }
    }

    var termEdge = false;
    if (jeol && jeol.prev && hay) {
      var prevMin = jeol.prev.hour * 60 + jeol.prev.minute;
      var startMin = (hay.start * 60) % 1440;
      var endMin = startMin + 119;
      var sameDay = jeol.prev.month === solar.m && jeol.prev.day === solar.d;
      if (sameDay && prevMin > startMin && prevMin <= endMin) termEdge = true;
    }

    var daewoon = daewoonOf(o, { y: yS, m: mS, mb: mB }, { solar: solar, hour: hay });

    return {
      solar: { y: solar.y, m: solar.m, d: solar.d },
      lunar: lunarInfo,
      hour: hay,
      birthTime: hay ? { h: hay.at, m: 30, label: hay.label } : null,
      corrected: corrected,
      hourEdge: hourEdge,
      termEdge: termEdge,
      term: jeol && jeol.prev ? {
        name: jeol.prev.name, month: jeol.prev.month, day: jeol.prev.day,
        hour: jeol.prev.hour, minute: jeol.prev.minute
      } : null,
      pillars: { year: yP, month: mP, day: dP, hour: hP },
      list: list,
      counts: counts,
      dist: dist,
      total: total,
      dominant: dominant,
      strongest: strongest,
      lacking: lacking,
      hiddenElems: hiddenElems,
      tenCount: tenCount,
      dayMaster: dayStem,
      dayMasterName: STEMS[dayStem] + STEM_ELEM[dayStem],
      dayMasterHanja: STEMS_HANJA[dayStem] + ELEM_HANJA[STEM_ELEM[dayStem]],
      dohwa: dohwa,
      daewoon: daewoon,
      engine: 'manseryeok 1.3.0'
    };
  }

  /* ---------- 6. 대운 ---------- */

  function daewoonOf(o, monthPillar, ctx) {
    var yStem = monthPillar.y, mStem = monthPillar.m, mBranch = monthPillar.mb;
    var male = o.gender === '남성' || o.gender === '남';
    var yangYear = yStem % 2 === 0;
    var forward = (yangYear && male) || (!yangYear && !male); // 양남·음녀 순행

    var jeol;
    try {
      jeol = M.getJeolAround(ctx.solar.y, ctx.solar.m, ctx.solar.d,
        ctx.hour ? ctx.hour.at : 12, ctx.hour ? 30 : 0);
    } catch (e) { return null; }
    if (!jeol || !jeol.prev || !jeol.next) return null;

    var birth = kstMs(ctx.solar.y, ctx.solar.m, ctx.solar.d, ctx.hour ? ctx.hour.at : 12, ctx.hour ? 30 : 0);
    var target = forward
      ? kstMs(jeol.next.year, jeol.next.month, jeol.next.day, jeol.next.hour, jeol.next.minute)
      : kstMs(jeol.prev.year, jeol.prev.month, jeol.prev.day, jeol.prev.hour, jeol.prev.minute);
    var days = Math.abs(target - birth) / 86400000;
    var startAge = Math.max(1, Math.round(days / 3)); // 3일 = 1년

    // 월주의 60갑자 index (천간·지지는 음양이 같으므로 60갑자 안에서 하나로 정해진다)
    var base = 0;
    for (var i = 0; i < 60; i++) { if (i % 10 === mStem && i % 12 === mBranch) { base = i; break; } }

    var nowAge = new Date().getFullYear() - ctx.solar.y;
    var list = [];
    for (var k = 1; k <= 10; k++) {
      var idx = ((base + (forward ? k : -k)) % 60 + 60) % 60;
      var age = startAge + (k - 1) * 10;
      list.push({
        age: age, year: ctx.solar.y + age,
        stem: idx % 10, branch: idx % 12,
        hanja: STEMS_HANJA[idx % 10] + BRANCHES_HANJA[idx % 12],
        ko: STEMS[idx % 10] + BRANCHES[idx % 12],
        now: nowAge >= age && nowAge < age + 10
      });
    }
    return { forward: forward, startAge: startAge, list: list, current: list.filter(function (d) { return d.now; })[0] || null };
  }

  /* ---------- 7. 연애 타이밍 (절입 기준) ---------- */

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
          ms: kstMs(t.year, t.month, t.day, t.hour, t.minute)
        });
      });
    }
    return out.sort(function (a, b) { return a.ms - b.ms; });
  }

  function loveTiming(chart, nowMs) {
    var start = nowMs || Date.now();
    var dayBranch = chart.pillars.day.branch;
    var dayElem = STEM_ELEM[chart.dayMaster];
    var lacking = chart.lacking[0];
    var entries = jeolEntries(new Date(start + 9 * 3600000).getUTCFullYear());
    var best = null;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.ms <= start) continue;
      var score = 0, why = [];
      if (SIX_HAP[dayBranch] === e.branch) { score += 3; why.push('일지와 육합'); }
      if (lacking && BRANCH_ELEM[e.branch] === lacking) { score += 2; why.push('비어 있던 ' + lacking + ' 기운이 채워짐'); }
      if (BRANCH_ELEM[e.branch] === ELEM_CYCLE[dayElem]) { score += 1; why.push('일간을 살리는 기운'); }
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
      score: best.score
    };
  }

  /* ---------- 8. 인연 궁합 (나 중심 · 일간 오행 + 일지) ---------- */

  // 천간합 — 갑기·을경·병신·정임·무계
  var STEM_HAP = { 0: 5, 5: 0, 1: 6, 6: 1, 2: 7, 7: 2, 3: 8, 8: 3, 4: 9, 9: 4 };
  // 천간충 — 갑경·을신·병임·정계 (무기 토끼는 충 없음)
  var STEM_CLASH = { 0: 6, 6: 0, 1: 7, 7: 1, 2: 8, 8: 2, 3: 9, 9: 3 };

  /**
   * 나(중심)와 상대의 궁합 — 오행이 서로 살리는지/누르는지 + 천간합·육합
   * @returns {{score:number, orbit:1|2|3, relation:string, meElem:string, youElem:string,
   *            tags:string[], hap:boolean, yukhap:boolean, chung:boolean}}
   */
  function compatibility(mine, theirs) {
    var meE = STEM_ELEM[mine.dayMaster];
    var youE = STEM_ELEM[theirs.dayMaster];
    var relation, base;

    if (meE === youE) { relation = 'same'; base = 68; }
    else if (ELEM_MAKES[youE] === meE) { relation = 'gwiin'; base = 84; } // 상대가 나를 살림
    else if (ELEM_KILLS[youE] === meE) { relation = 'drain'; base = 36; } // 상대가 나를 누름
    else if (ELEM_KILLS[meE] === youE) { relation = 'press'; base = 54; } // 내가 상대를 누름
    else { relation = 'give'; base = 60; } // 내가 상대를 살림

    var score = base;
    var tags = [];
    var hap = STEM_HAP[mine.dayMaster] === theirs.dayMaster;
    var clash = STEM_CLASH[mine.dayMaster] === theirs.dayMaster;
    var meB = mine.pillars.day.branch, youB = theirs.pillars.day.branch;
    var yukhap = SIX_HAP[meB] === youB;
    var chung = ((meB - youB) % 12 + 12) % 12 === 6;

    if (hap) { score += 13; tags.push('천간합'); }
    if (clash) { score -= 8; tags.push('천간충'); }
    if (yukhap) { score += 8; tags.push('육합'); }
    if (chung) { score -= 8; tags.push('육충'); }

    score = Math.max(18, Math.min(98, Math.round(score)));
    var orbit = score >= 76 ? 1 : (score >= 56 ? 2 : 3);

    return {
      score: score, orbit: orbit, relation: relation,
      meElem: meE, youElem: youE,
      tags: tags, hap: hap, yukhap: yukhap, chung: chung
    };
  }

  /* ---------- 9. 결과 조립 (앱이 쓰는 요약) ---------- */

  function reading(input) {
    var chart = computePillars(input);
    var timing = loveTiming(chart, Date.now());
    return {
      name: (input.name || '').trim() || '집사',
      chart: chart,
      timing: timing,
      timingText: timing ? fmtDate(timing.startMs) + ' ~ ' + fmtDate(timing.endMs) : null
    };
  }

  var API = {
    // 글자·오행
    STEMS: STEMS, STEMS_HANJA: STEMS_HANJA, STEMS_READ: STEMS_READ,
    BRANCHES: BRANCHES, BRANCHES_HANJA: BRANCHES_HANJA,
    ELEMS: ELEMS, ELEM_HANJA: ELEM_HANJA, ELEM_KO: ELEM_KO,
    ELEM_COLOR: ELEM_COLOR, ELEM_INK: ELEM_INK, ELEM_SOFT: ELEM_SOFT,
    ELEM_FILL: ELEM_FILL, ELEM_EDGE: ELEM_EDGE,
    ELEM_CYCLE: ELEM_CYCLE, ELEM_MAKES: ELEM_MAKES, ELEM_KILLS: ELEM_KILLS, ELEM_KILLED: ELEM_KILLED,
    STEM_ELEM: STEM_ELEM, BRANCH_ELEM: BRANCH_ELEM,
    HOURS: HOURS, WEEKDAYS: WEEKDAYS,
    TENS: TEN_ORDER, TEN_GROUP: TEN_GROUP, STAGES: STAGES, HIDDEN: HIDDEN,
    // 계산
    computePillars: computePillars,
    compatibility: compatibility,
    reading: reading,
    loveTiming: loveTiming,
    daewoonOf: daewoonOf,
    tenGod: tenGod,
    stageOf: stageOf,
    solarToLunar: solarToLunar,
    lunarToSolar: lunarToSolar,
    leapMonthOf: leapMonthOf,
    daysInMonth: daysInMonth,
    fmtDate: fmtDate,
    fmtDateKo: fmtDateKo,
    hourIdxOf: hourIdxOf,
    // 엔진 원본 (검사용)
    engine: M
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.NyangSaju = API;
})(typeof window !== 'undefined' ? window : globalThis);
