/* [자동 생성] 원본: apps/nyang-saju/src/domain/tables.js — tools/sync-engine.mjs 로 복사됨. 이 파일을 직접 고치지 마세요. */
/* ==========================================================================
   domain/tables.js — 명리 표 (계산·규칙·문장이 모두 참조하는 단일 출처)
   --------------------------------------------------------------------------
   이 파일은 값만 담는다. 판정도 문장도 만들지 않는다.
   ========================================================================== */
(function (global) {
  'use strict';

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

  var ELEM_COLOR = { 목: '#26694E', 화: '#C93B2B', 토: '#C98821', 금: '#8C867C', 수: '#1D2228' };
  var ELEM_INK = { 목: '#235F47', 화: '#B23323', 토: '#8A5A10', 금: '#6F6A60', 수: '#1D2228' };
  var ELEM_SOFT = { 목: '#DFE8E1', 화: '#F4DDD7', 토: '#F0E3C8', 금: '#ECE7DC', 수: '#DCDFE3' };
  var ELEM_FILL = { 금: '#EBE6DA' };
  var ELEM_EDGE = { 금: '#7A746B' };

  var ELEM_CYCLE = { 목: '수', 화: '목', 토: '화', 금: '토', 수: '금' }; // 나를 낳는 오행
  var ELEM_MAKES = { 목: '화', 화: '토', 토: '금', 금: '수', 수: '목' }; // 내가 낳는 오행
  var ELEM_KILLS = { 목: '토', 화: '금', 토: '수', 금: '목', 수: '화' }; // 내가 누르는 오행
  var ELEM_KILLED = { 목: '금', 화: '수', 토: '목', 금: '화', 수: '토' }; // 나를 누르는 오행

  var HOURS = [
    { idx: 0, label: '자시', range: '23:00~00:59', start: 23, end: 1, at: 0 },
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

  /* 지지 → 지장간 [천간 index, 비중%] — 본기 → 중기 → 여기 순서 */
  var HIDDEN = [
    [[9, 100]],
    [[5, 60], [9, 30], [7, 10]],
    [[0, 60], [2, 30], [4, 10]],
    [[1, 100]],
    [[4, 60], [1, 30], [9, 10]],
    [[2, 60], [4, 30], [6, 10]],
    [[3, 70], [5, 30]],
    [[5, 60], [3, 30], [1, 10]],
    [[6, 60], [8, 30], [4, 10]],
    [[7, 100]],
    [[4, 60], [7, 30], [3, 10]],
    [[8, 70], [0, 30]]
  ];

  var TEN_ORDER = ['비견', '겁재', '식신', '상관', '편재', '정재', '편관', '정관', '편인', '정인'];
  var TEN_GROUP = {
    비견: '나와 같은 기운', 겁재: '내 몫을 나눠 먹는 기운',
    식신: '내가 편하게 뽑아 쓰는 기운', 상관: '내 재주, 근데 말이 센 기운',
    편재: '크게 굴리는 돈', 정재: '꼬박꼬박 들어오는 돈',
    편관: '나를 조이는 규율', 정관: '나를 바르게 세우는 규칙',
    편인: '엉뚱하게 나를 살찌우는 공부', 정인: '든든하게 나를 받쳐주는 뒷배'
  };
  var GOD_GROUP = {
    비견: 'peer', 겁재: 'peer', 식신: 'output', 상관: 'output',
    편재: 'wealth', 정재: 'wealth', 편관: 'power', 정관: 'power',
    편인: 'resource', 정인: 'resource'
  };

  var STAGES = ['장생', '목욕', '관대', '건록', '제왕', '쇠', '병', '사', '묘', '절', '태', '양'];
  var STAGE_START = [11, 6, 2, 9, 2, 9, 5, 0, 8, 3];

  var SIX_HAP = { 0: 1, 1: 0, 2: 11, 11: 2, 3: 10, 10: 3, 4: 9, 9: 4, 5: 8, 8: 5, 6: 7, 7: 6 };
  var STEM_HAP = { 0: 5, 5: 0, 1: 6, 6: 1, 2: 7, 7: 2, 3: 8, 8: 3, 4: 9, 9: 4 };
  var STEM_CLASH = { 0: 6, 6: 0, 1: 7, 7: 1, 2: 8, 8: 2, 3: 9, 9: 3 };
  var DOHWA = { 2: 3, 6: 3, 10: 3, 8: 9, 0: 9, 4: 9, 5: 6, 9: 6, 1: 6, 11: 0, 3: 0, 7: 0 };

  /* 지지 관계 — 학파 공통으로 쓰는 기본형만. 길흉 점수는 만들지 않는다. */
  var SAMHAP = [
    { name: '수국', branches: [8, 0, 4] },
    { name: '목국', branches: [11, 3, 7] },
    { name: '화국', branches: [2, 6, 10] },
    { name: '금국', branches: [5, 9, 1] }
  ];
  var HYEONG = [[0, 3], [2, 5], [5, 8], [2, 8], [1, 10], [7, 10], [1, 7]];
  var PA = [[0, 9], [1, 4], [2, 11], [3, 6], [5, 8], [7, 10]];
  var HAE = [[0, 7], [1, 6], [2, 5], [3, 4], [8, 11], [9, 10]];

  /* 1954-03-21 ~ 1961-08-09 UTC+8:30, 서머타임 구간은 +1시간 (엔진 표와 같은 값) */
  var LEGAL_PERIODS = [
    { from: [1954, 3, 21, 0, 0], offset: 510 },
    { from: [1961, 8, 10, 0, 0], offset: 540 }
  ];
  var DST_PERIODS = [
    [[1948, 6, 1, 0, 0], [1948, 9, 13, 0, 0]],
    [[1949, 4, 3, 0, 0], [1949, 9, 11, 0, 0]],
    [[1950, 4, 1, 0, 0], [1950, 9, 10, 0, 0]],
    [[1951, 5, 6, 0, 0], [1951, 9, 9, 0, 0]],
    [[1955, 5, 5, 0, 0], [1955, 9, 9, 0, 0]],
    [[1956, 5, 20, 0, 0], [1956, 9, 30, 0, 0]],
    [[1957, 5, 5, 0, 0], [1957, 9, 22, 0, 0]],
    [[1958, 5, 4, 0, 0], [1958, 9, 21, 0, 0]],
    [[1959, 5, 3, 0, 0], [1959, 9, 20, 0, 0]],
    [[1960, 5, 1, 0, 0], [1960, 9, 18, 0, 0]],
    [[1987, 5, 10, 2, 0], [1987, 10, 11, 2, 0]],
    [[1988, 5, 8, 2, 0], [1988, 10, 9, 2, 0]]
  ];

  global.NyangTables = {
    STEMS: STEMS, STEMS_HANJA: STEMS_HANJA, STEMS_READ: STEMS_READ,
    BRANCHES: BRANCHES, BRANCHES_HANJA: BRANCHES_HANJA,
    STEM_ELEM: STEM_ELEM, BRANCH_ELEM: BRANCH_ELEM,
    ELEMS: ELEMS, ELEM_HANJA: ELEM_HANJA, ELEM_KO: ELEM_KO,
    ELEM_COLOR: ELEM_COLOR, ELEM_INK: ELEM_INK, ELEM_SOFT: ELEM_SOFT,
    ELEM_FILL: ELEM_FILL, ELEM_EDGE: ELEM_EDGE,
    ELEM_CYCLE: ELEM_CYCLE, ELEM_MAKES: ELEM_MAKES, ELEM_KILLS: ELEM_KILLS, ELEM_KILLED: ELEM_KILLED,
    HOURS: HOURS, WEEKDAYS: WEEKDAYS, HIDDEN: HIDDEN,
    TEN_ORDER: TEN_ORDER, TEN_GROUP: TEN_GROUP, GOD_GROUP: GOD_GROUP,
    STAGES: STAGES, STAGE_START: STAGE_START,
    SIX_HAP: SIX_HAP, STEM_HAP: STEM_HAP, STEM_CLASH: STEM_CLASH, DOHWA: DOHWA,
    SAMHAP: SAMHAP, HYEONG: HYEONG, PA: PA, HAE: HAE,
    LEGAL_PERIODS: LEGAL_PERIODS, DST_PERIODS: DST_PERIODS
  };
})(typeof window !== 'undefined' ? window : globalThis);
