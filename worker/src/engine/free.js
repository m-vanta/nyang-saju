/* [자동 생성] 원본: apps/nyang-saju/src/content/free.js — tools/sync-engine.mjs 로 복사됨. 이 파일을 직접 고치지 마세요. */
/* ==========================================================================
   content/free.js — 무료 문장 카탈로그
   --------------------------------------------------------------------------
   각 문장은 requires(성립 조건 Finding id)와 forbids(배제 조건)를 가진다.
   선택은 render/select.js 가 Finding[] 로만 한다. 이름·조회시점은 선택에 쓰지 않는다.
   문장 안의 {name} 은 표시용 치환일 뿐이다.
   ========================================================================== */
(function (global) {
  'use strict';

  var C = global.NyangCopy;
  var T = global.NyangTables;
  if (!C || !T) throw new Error('content/free: copy.js / tables 가 먼저 로드되어야 합니다.');

  var DAY_NAMES = ['갑목', '을목', '병화', '정화', '무토', '기토', '경금', '신금', '임수', '계수'];
  var RELS = ['same', 'makes', 'kills', 'killed', 'cycle'];
  var GROUPS = ['peer', 'output', 'wealth', 'power', 'resource'];

  var out = [];

  /* --- 한 줄 정의의 수식어 (일간 Finding + 부족/관계 Finding) --- */
  /* 문장 조립은 render/def.js 가 Finding 으로만 고른다. 여기서는 조각만 둔다. */
  out.push({ id: 'FREE.DEF.LACK', tier: 'free', slot: 'defmod', requires: ['ELEM.LACK.*'], forbids: [], text: '그 자리를 스스로 메우는' });
  RELS.forEach(function (rel) {
    out.push({ id: 'FREE.DEF.REL.' + rel, tier: 'free', slot: 'defmod', requires: ['REL.DAY.' + rel], forbids: ['ELEM.LACK.*'], text: C.PALJA_MOD[rel] });
  });

  /* --- 대표 성향 1: 일간 --- */
  DAY_NAMES.forEach(function (nm, i) {
    var p = C.PALJA[i];
    out.push({
      id: 'FREE.TRAIT.1.' + i, tier: 'free', slot: 'trait1',
      requires: ['DAY.MASTER.' + i], forbids: [],
      label: p.trait.label,
      text: p.trait.text
    });
  });

  /* --- 대표 성향 2: 최다 오행과 일간의 관계 (동률이면 별도 문장) --- */
  RELS.forEach(function (rel) {
    out.push({
      id: 'FREE.TRAIT.2.' + rel, tier: 'free', slot: 'trait2',
      requires: ['REL.DAY.' + rel], forbids: ['ELEM.TIE.*'],
      label: C.TRAIT_ELEM[rel].label,
      text: C.TRAIT_ELEM[rel].text
    });
    out.push({
      id: 'FREE.TRAIT.2T.' + rel, tier: 'free', slot: 'trait2',
      requires: ['REL.DAY.' + rel, 'ELEM.TIE.*'], forbids: [],
      label: '두 기운이 나란한 자리',
      text: '{name} 님은 두 기운이 같은 크기로 서 있어요. {tieKo}이 각각 {count}개({pct}%)로 나란히 있죠. 그래서 잘될 때도 한쪽으로만 가지 않고, 막힐 때도 한쪽만 막히지 않아요. 대신 어느 쪽을 먼저 쓸지 고르는 데 시간이 걸려요.'
    });
  });

  /* --- 대표 성향 3: 최다 십성 묶음 --- */
  GROUPS.forEach(function (g) {
    out.push({
      id: 'FREE.TRAIT.3.' + g, tier: 'free', slot: 'trait3',
      requires: ['GOD.GROUP.' + g + '.*'], forbids: [],
      label: C.TRAIT_GOD[g].label,
      text: C.TRAIT_GOD[g].text
    });
  });

  /* --- 천기팩폭 훅 --- */
  out.push({ id: 'FREE.BOMB.HOOK.LACK', tier: 'free', slot: 'hook', requires: ['ELEM.LACK.*'], forbids: [], text: C.BOMB_HOOK.lack });
  out.push({ id: 'FREE.BOMB.HOOK.DOM', tier: 'free', slot: 'hook', requires: ['ELEM.MAX.*'], forbids: [], text: C.BOMB_HOOK.dom });
  out.push({ id: 'FREE.BOMB.HOOK.TIE', tier: 'free', slot: 'hook', requires: ['ELEM.TIE.*'], forbids: [], text: '{tieKo} 기운이 각각 {count}개({pct}%)로 같아요. 그런데 {name} 님은 늘 한쪽만 써요. 나란히 있는 두 힘 중 하나를 늘 눌러 두고 사는 셈이라냥.' });
  out.push({ id: 'FREE.BOMB.HOOK.GOD', tier: 'free', slot: 'hook', requires: ['TEN.REPEAT.*'], forbids: [], text: C.BOMB_HOOK.god });
  out.push({ id: 'FREE.BOMB.HOOK.DOHWA', tier: 'free', slot: 'hook', requires: ['FLAG.DOHWA'], forbids: [], text: C.BOMB_HOOK.dohwa });

  /* --- 천기팩폭 한 방 --- */
  GROUPS.forEach(function (g) {
    out.push({ id: 'FREE.BOMB.PUNCH.' + g, tier: 'free', slot: 'punch', requires: ['GOD.GROUP.' + g + '.*'], forbids: [], text: C.BOMB_PUNCH[g] });
  });
  C.BOMB_GENERIC.forEach(function (txt, i) {
    out.push({ id: 'FREE.BOMB.GENERIC.' + i, tier: 'free', slot: 'punch', requires: [], forbids: [], text: txt });
  });

  /* --- 해설 마무리 (관계별) --- */
  RELS.forEach(function (rel) {
    out.push({ id: 'FREE.ESSAY.CLOSE.' + rel, tier: 'free', slot: 'closer', requires: ['REL.DAY.' + rel], forbids: [], text: C.PALJA_ESSAY[rel] });
    out.push({ id: 'FREE.ESSAY.CLOSE.TIE.' + rel, tier: 'free', slot: 'closer', requires: ['REL.DAY.' + rel, 'ELEM.TIE.*'], forbids: [], text: '두 힘이 같은 크기라, 어느 하나를 탓할 수가 없어요. 그래서 {name} 님은 늘 “둘 다 맞다”는 자리에서 혼자 결정을 미뤄요. 순서를 정하는 것만으로도 판이 가벼워져요.' });
  });

  /* --- 시주 미상 고지 --- */
  out.push({ id: 'FREE.HOUR.UNKNOWN', tier: 'free', slot: 'note', requires: ['HOUR.UNKNOWN'], forbids: [], text: C.BOMB_HOOK.hour });

  global.NyangContentFree = out;
})(typeof window !== 'undefined' ? window : globalThis);
