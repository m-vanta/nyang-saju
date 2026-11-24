/* ==========================================================================
   냥도사 · 팔자 고양이 (palja.js)
   --------------------------------------------------------------------------
   일간 10종만으로 캐릭터를 붙이면 복붙 티가 난다. 그래서 이름은 일간이 정하고,
   한 줄 정의·해시태그·해설·팩폭·대표 성향은 여덟 글자의 실제 분포가 정한다.

     일간(dayMaster)      → 고양이 이름 (대장냥 … 안개냥)
     오행 분포(dominant)  → 한 줄 정의의 수식어 · 성향 2 · 해설 1~2문장
     십성 조합(tenCount)  → 성향 3 · 천기팩폭의 한 방

   같은 생일이면 언제 봐도 같은 문장이 나오도록, 선택은 전부 해시 시드로 고정한다.
   문장은 copy.js(C.PALJA · C.PALJA_MOD · C.TRAIT_* · C.BOMB_*), 여기는 조립만.

   브라우저 전역: window.NyangPalja
   ========================================================================== */
(function (global) {
  'use strict';

  var C = global.NyangCopy;
  var S = global.NyangSaju;

  var GOD_GROUP = {
    비견: 'peer', 겁재: 'peer',
    식신: 'output', 상관: 'output',
    편재: 'wealth', 정재: 'wealth',
    편관: 'power', 정관: 'power',
    편인: 'resource', 정인: 'resource'
  };

  /* ---------- 받침에 맞춘 조사 ---------- */
  function hasJong(word) {
    var c = String(word).charCodeAt(String(word).length - 1);
    if (c < 0xAC00 || c > 0xD7A3) return false;
    return (c - 0xAC00) % 28 !== 0;
  }
  function josa(word, pair) {
    return word + (hasJong(word) ? pair.charAt(0) : pair.charAt(1));
  }

  /* ---------- 문자열 해시 (사람마다 다른 문장 선택) ---------- */
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h;
  }

  function pick(list, seed) {
    return list[seed % list.length];
  }

  /* ---------- 오행 분포 → 관계 키 ----------
     내 일간 오행 기준으로 제일 센 오행이 무엇을 하는지.
     same(같은 기운 과다) / makes(내가 낳는 기운 과다) / kills(내가 누르는 기운 과다)
     killed(나를 누르는 기운 과다) / cycle(나를 낳는 기운 과다) */
  function relKeyOf(chart) {
    var me = S.STEM_ELEM[chart.dayMaster];
    var strong = chart.strongest.elem;
    if (me === strong) return 'same';
    if (S.ELEM_MAKES[me] === strong) return 'makes';
    if (S.ELEM_KILLS[me] === strong) return 'kills';
    if (S.ELEM_KILLS[strong] === me) return 'killed';
    if (S.ELEM_MAKES[strong] === me) return 'cycle';
    return 'same';
  }

  /* ---------- 십성 집계 → 제일 센 십성 ---------- */
  function topGodOf(chart) {
    var best = null;
    S.TENS.forEach(function (t) {
      var n = chart.tenCount[t] || 0;
      if (n <= 0) return;
      if (!best || n > best.n) best = { god: t, n: n };
    });
    return best || { god: '비견', n: 1 };
  }

  function tenLine(chart) {
    return S.TENS.map(function (t) { return { t: t, n: chart.tenCount[t] || 0 }; })
      .filter(function (x) { return x.n > 0; })
      .sort(function (a, b) { return b.n - a.n || S.TENS.indexOf(a.t) - S.TENS.indexOf(b.t); });
  }

  /* ---------- 조립 ---------- */

  function build(chart, nameArg) {
    var name = (nameArg || '').trim() || '손님';
    var call = name === '손님' ? '손님' : name + ' 님';
    var base = C.PALJA[chart.dayMaster];
    var elem = S.STEM_ELEM[chart.dayMaster];
    var strong = chart.strongest;
    var strongKo = S.ELEM_KO[strong.elem];
    var lackKo = chart.lacking.length ? S.ELEM_KO[chart.lacking[0]] : null;
    var rel = relKeyOf(chart);
    var top = topGodOf(chart);
    var group = GOD_GROUP[top.god] || 'peer';
    var list = tenLine(chart);
    var seedBase = name + '|' + chart.pillars.day.ko + '|' + chart.total + '|' + strong.elem + '|' + top.god;
    var seed = hash(seedBase);

    function fill(s) {
      return String(s == null ? '' : s)
        .replace(/\{name\} 님/g, call)
        .replace(/\{name\}/g, call)
        .replace(/\{strongKo\}/g, strongKo)
        .replace(/\{strongKoJ\}/g, josa(strongKo, '이가'))
        .replace(/\{lackKo\}/g, lackKo || '')
        .replace(/\{pct\}/g, strong.pct)
        .replace(/\{count\}/g, strong.count)
        .replace(/\{chars\}/g, chart.total === 6 ? '여섯 글자' : '여덟 글자')
        .replace(/\{god\}/g, top.god)
        .replace(/\{godJ\}/g, josa(top.god, '이가'))
        .replace(/\{n\}/g, top.n);
    }

    /* --- 한 줄 정의 : 일간 이미지 + 오행 분포(부족이 있으면 부족이 먼저 눈에 띈다) --- */
    var mod;
    if (lackKo) {
      mod = lackKo + (hasJong(lackKo) ? '이' : '가') + ' 비어 있어 그 자리를 스스로 메우는';
    } else {
      mod = C.PALJA_MOD[rel];
    }
    var def = base.core + ', ' + mod + ' ' + base.name;

    /* --- 제일 크게 도는 십성 한 줄 (정의 아래에 붙는 개인화 근거) --- */
    var godLine = josa(top.god, '이가') + ' ' + top.n + '개로 제일 크게 돌아요. ' +
      C.PALJA_TEN_MOD[top.god] + ' 쪽이에요.';

    /* --- 오행·십성 수치 한 줄 (사주 근거를 눈에 보이게) --- */
    var facts = [
      '일간 ' + chart.dayMasterName,
      strongKo + ' ' + strong.count + '개(' + strong.pct + '%)',
      list.slice(0, 3).map(function (x) { return x.t + ' ' + x.n; }).join(' · ')
    ];

    /* --- 해시태그 : 이름 + 일간 물상 + 오행 + 십성 (+ 빈 오행) --- */
    var tags = ['#' + base.name];
    tags = tags.concat(base.tags);
    tags.push('#' + strongKo + (rel === 'same' ? '과다' : '기운'));
    tags.push('#' + top.god + top.n);
    if (lackKo) tags.push('#' + lackKo + '부족');

    /* --- 해설 : 일간 → 분포 → 십성 → 마무리 --- */
    var essay = [];
    essay.push((chart.total === 6 ? '여섯 글자 중 ' : '여덟 글자 중 ') + josa(strongKo, '이가') + ' ' +
      strong.count + '개(' + strong.pct + '%)로 제일 세요.' +
      (lackKo
        ? ' ' + josa(lackKo, '은는') + ' 하나도 안 들어왔고요.'
        : ' ' + josa(S.ELEM_KO[chart.dist.slice().sort(function (a, b) { return a.count - b.count; })[0].elem], '은는') + ' 제일 얇아요.'));
    essay.push('드러난 십신은 ' + list.slice(0, 3).map(function (x) { return x.t + ' ' + x.n; }).join(' · ') +
      ' 순서고, 그중 ' + josa(top.god, '이가') + ' 제일 크게 도는 편이에요. ' + S.TEN_GROUP[top.god] + '이라, 그게 ' + call + '의 기본값처럼 나오기 쉬워요.');
    essay.push(base.read);
    essay.push(fill(C.PALJA_ESSAY[rel]));
    essay = essay.join(' ').replace(/\{name\}/g, call);

    /* --- 천기팩폭 : 실제 분포에서 잡은 한 방 --- */
    var hooks = [];
    if (lackKo) hooks.push(fill(C.BOMB_HOOK.lack));
    hooks.push(fill(C.BOMB_HOOK.dom));
    if (top.n >= 2) hooks.push(fill(C.BOMB_HOOK.god));
    if (chart.dohwa) hooks.push(fill(C.BOMB_HOOK.dohwa));
    var hook = pick(hooks, seed);

    var punches = [fill(C.BOMB_PUNCH[group])];
    C.BOMB_GENERIC.forEach(function (g) { punches.push(fill(g)); });
    var punch = pick(punches, seed >>> 3);

    var bomb = hook + ' ' + punch;
    if (chart.total === 6) bomb += ' 시주를 모르니 여섯 글자로 본 팩폭이에요.';

    /* --- 대표 성향 3 : 일간 · 오행 분포 · 십성 --- */
    var traits = [
      { no: '01', label: base.trait.label, text: fill(base.trait.text) },
      { no: '02', label: C.TRAIT_ELEM[rel].label, text: fill(C.TRAIT_ELEM[rel].text) },
      { no: '03', label: C.TRAIT_GOD[group].label, text: fill(C.TRAIT_GOD[group].text) }
    ];

    return {
      key: chart.dayMaster,
      name: base.name,
      hanja: base.hanja,
      short: base.short,
      seal: base.seal,
      elem: elem,
      elemHanja: S.ELEM_HANJA[elem],
      core: base.core,
      def: def,
      tenLine: godLine,
      facts: facts,
      tags: tags,
      essay: essay,
      bomb: bomb,
      traits: traits,
      rel: rel,
      group: group,
      topGod: top.god,
      godCount: top.n,
      strongKo: strongKo,
      lackKo: lackKo,
      seed: seed
    };
  }

  var API = {
    build: build,
    relKeyOf: relKeyOf,
    GOD_GROUP: GOD_GROUP,
    topGodOf: topGodOf
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.NyangPalja = API;
})(typeof window !== 'undefined' ? window : globalThis);
