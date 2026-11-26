#!/usr/bin/env node
/* ==========================================================================
   v2.3 회귀 테스트 (tests/run-regression.mjs)
   --------------------------------------------------------------------------
   실행: node tests/run-regression.mjs
     · 원본 QA01~12 (tests/fixtures/qa-original.json)
     · DEV-QA01~12 (tests/fixtures/dev-qa.json)
     · 경계 14케이스 (음/양력, 닉네임, 관심운세, 반복, 시간미상, 동률,
       입춘·자시·서머타임·시진 내 절입, 대운 천/지 상이, 조회연도, 문단 중복, PII)
     · 궁합(궤도) 최소 데이터·근거
   화면 검사는 tools/check-*.py 가 따로 한다. 이 파일은 엔진·판정·문장·개인정보 계약을 본다.
   ========================================================================== */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, '..');
const ASOF = '2026-11-25T10:00:00+09:00';

const sandbox = {
  console,
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  btoa: (s) => Buffer.from(s, 'binary').toString('base64')
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const FILES = [
  'vendor/manseryeok.js', 'src/domain/tables.js', 'src/domain/chart.js', 'src/domain/analysis.js', 'src/domain/period.js',
  'src/rules/findings.js', 'copy.js', 'src/content/paid-strings.js', 'src/content/free.js',
  'src/content/paid.js', 'src/render/select.js', 'saju.js', 'palja.js'
];
for (const f of FILES) {
  vm.runInContext(readFileSync(resolve(appDir, f), 'utf8'), sandbox, { filename: f });
}

const S = sandbox.NyangSaju;
const T = sandbox.NyangTables;
const D = sandbox.NyangDomain;
const PD = sandbox.NyangPeriod;
const R = sandbox.NyangRules;
const RD = sandbox.NyangRender;
const PC = sandbox.NyangPaidCopy;

const results = [];
function check(id, name, fn) {
  try {
    const detail = fn();
    results.push({ id, name, ok: true, detail: detail == null ? '' : String(detail) });
  } catch (e) {
    results.push({ id, name, ok: false, detail: e && e.message ? e.message : String(e) });
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || '') + ' — ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)); }

function chartOf(p) {
  const i = p.input || p;
  return D.chart({ year: i.year, month: i.month, day: i.day, calendar: i.calendar || 'solar', isLeap: !!i.isLeap, hourIdx: i.hourIdx == null ? null : i.hourIdx, ziSide: i.ziSide || 'early', gender: i.gender || '여성' });
}
function readingOf(p, asOf) {
  const c = chartOf(p);
  const period = PD.period(c, asOf || ASOF);
  const name = (p.input && p.input.name) || p.name || '민지';
  return { chart: c, period, free: RD.buildFree(c, name), paid: RD.buildPaidTraits(c, name), themes: RD.buildThemes(c, period, name, (p.input && p.input.focus) || 'love'), patterns: RD.buildPatterns(c, period, name) };
}
/* 고전 십성표 — 엔진(D.tenGod)을 부르지 않고 오행 생극·음양만으로 다시 센다.
   일간 기준: 같은 오행 비견/겁재 · 내가 낳으면 식신/상관 · 내가 누르면 편재/정재 ·
   나를 누르면 편관/정관 · 나를 낳으면 편인/정인 (음양 같으면 앞, 다르면 뒤). */
const STEM_ELEM_TBL = ['목', '목', '화', '화', '토', '토', '금', '금', '수', '수'];
const MAKES_TBL = { 목: '화', 화: '토', 토: '금', 금: '수', 수: '목' };
const KILLS_TBL = { 목: '토', 화: '금', 토: '수', 금: '목', 수: '화' };
function tenGodByRule(dayStem, otherStem) {
  const me = STEM_ELEM_TBL[dayStem], you = STEM_ELEM_TBL[otherStem];
  const same = (dayStem % 2) === (otherStem % 2);
  if (me === you) return same ? '비견' : '겁재';
  if (MAKES_TBL[me] === you) return same ? '식신' : '상관';
  if (KILLS_TBL[me] === you) return same ? '편재' : '정재';
  if (KILLS_TBL[you] === me) return same ? '편관' : '정관';
  return same ? '편인' : '정인';
}
function cycleIndex(stem, branch) {
  for (let i = 0; i < 60; i++) if (i % 10 === stem && i % 12 === branch) return i;
  return -1;
}
function fmtYmd(o) {
  const p = (n) => (n < 10 ? '0' : '') + n;
  return o.y + '.' + p(o.m) + '.' + p(o.d);
}
function wishForward(chart, gender) {
  const yangYear = chart.pillars.year.stem % 2 === 0;   // 갑·병·무·경·임 = 양
  const male = gender === '남성' || gender === '남';
  return (yangYear && male) || (!yangYear && !male);      // 양남·음녀 순행
}

function walkText(obj, out) {
  if (typeof obj === 'string') { out.push(obj); return; }
  if (!obj || typeof obj !== 'object') return;
  Object.keys(obj).forEach((k) => walkText(obj[k], out));
}

const qaOriginal = JSON.parse(readFileSync(resolve(here, 'fixtures/qa-original.json'), 'utf8'));
const devQa = JSON.parse(readFileSync(resolve(here, 'fixtures/dev-qa.json'), 'utf8'));

/* ---------------- 1. 원본 QA ---------------- */
for (const p of qaOriginal.profiles) {
  check(p.id, '명식·세운·대운이 기대값과 같다', () => {
    const r = readingOf(p);
    eq(r.chart.dayMasterName, p.expected.dayMaster, '일간');
    eq(r.chart.list.map((x) => x.ko), p.expected.pillars, '사주');
    eq(r.chart.counts, p.expected.counts, '오행 개수');
    eq(r.chart.tiedMax, p.expected.tiedMax, '공동 최다');
    eq(r.period.seun.ko, p.expected.seun, '세운(입춘 기준)');
    return r.chart.list.map((x) => x.ko).join(' ');
  });
  check(p.id, '동률이면 단독 최강 문장을 쓰지 않는다', () => {
    const r = readingOf(p);
    const text = [r.free.def, r.free.tenLine, r.free.essay, r.free.bomb, ...r.free.traits.map((t) => t.text)].join(' ');
    if (r.chart.tiedMax.length > 1) {
      assert(!/제일 세요|단독/.test(r.free.essay), '동률인데 단독 최강 표현: ' + r.free.essay.slice(0, 80));
      assert(r.chart.tiedMax.every((e) => text.includes({ 목: '나무', 화: '불', 토: '흙', 금: '쇠', 수: '물' }[e])), '동률 오행 병기 없음');
      const pcts = r.chart.tiedMax.map((e) => r.chart.share[e]);
      assert(new Set(pcts).size === 1, '동률인데 %가 다름: ' + pcts);
    }
    return r.chart.tiedMax.join('·');
  });
  check(p.id, '시간 미상이면 모든 라벨이 여섯 글자', () => {
    const r = readingOf(p);
    const text = [r.free.def, r.free.tenLine, r.free.essay, r.free.bomb, ...r.free.traits.map((t) => t.text), ...r.themes.map((t) => t.body)].join(' ');
    if (r.chart.flags.hourUnknown) {
      assert(!/여덟 글자/.test(text), '여섯 글자 명식에 여덟 글자 표현');
      assert(text.includes('여섯 글자'), '여섯 글자 표기 없음');
    }
    return r.chart.flags.hourUnknown ? '여섯 글자' : '해당 없음';
  });
  check(p.id, '대운 순역이 양남음녀 규칙과 같다', () => {
    const c = chartOf(p);
    const want = wishForward(c, p.input.gender);
    assert(c.daewoon, '대운 없음');
    assert(c.daewoon.forward === want,
      '순역 ' + (c.daewoon.forward ? '순행' : '역행') + ' ≠ 규칙 ' + (want ? '순행' : '역행') +
      ' (' + c.pillars.year.ko + '·' + p.input.gender + ')');
    if (p.expected.daewoonForward !== undefined) {
      assert(c.daewoon.forward === p.expected.daewoonForward, '기대값 순역 불일치');
    }
    // 순행이면 다음 절, 역행이면 지난 절까지의 날수(3일=1년)로 대운이 열린다
    const open = c.daewoon.startTerm.date, birth = fmtYmd(c.solar);
    assert(c.daewoon.forward ? open > birth : open < birth, '대운 시작 절 방향이 순역과 반대: ' + open + ' / ' + birth);
    assert(c.daewoon.startAge >= 0 && c.daewoon.startAge <= 10, '대운수 범위: ' + c.daewoon.startAge);
    return (c.daewoon.forward ? '순행' : '역행') + ' · ' + c.daewoon.startAgeLabel + ' · ' + c.daewoon.startTerm.name + ' ' + open;
  });
  check(p.id, '대운 간지가 월주에서 순역으로 한 칸씩 간다', () => {
    const c = chartOf(p);
    const dw = c.daewoon;
    const base = cycleIndex(c.pillars.month.stem, c.pillars.month.branch);
    assert(base >= 0, '월주 60갑자 없음');
    assert(dw.list.length === 10, '대운 10개 아님');
    for (let k = 1; k <= 10; k++) {
      const want = ((base + (dw.forward ? k : -k)) % 60 + 60) % 60;
      const got = dw.list[k - 1];
      eq([got.stem, got.branch], [want % 10, want % 12], k + '번째 대운 간지');
      assert(got.fromMs > c.daewoon.startMs - 1, k + '번째 시작이 대운 시작 전');
      if (k > 1) assert(got.fromMs > dw.list[k - 2].fromMs, k + '번째 시작 순서');
    }
    return c.pillars.month.ko + ' → ' + dw.list[0].ko + ' … ' + dw.list[9].ko;
  });
  check(p.id, '대운 십성·현재 대운이 고전표와 같다', () => {
    const c = chartOf(p);
    const dw = c.daewoon;
    dw.list.forEach((d, i) => {
      eq(d.stemTen, tenGodByRule(c.dayMaster, d.stem), (i + 1) + '번째 천간 십성');
      eq(d.branchTen, tenGodByRule(c.dayMaster, T.HIDDEN[d.branch][0][0]), (i + 1) + '번째 지지 십성');
    });
    const per = PD.period(c, ASOF);
    assert(per.daewoon, '조회 시점 대운 없음');
    const asofMs = new Date(ASOF).getTime();
    assert(asofMs >= per.daewoon.fromMs && asofMs < per.daewoon.toMs, '조회 시점이 대운 구간 밖');
    eq(per.daewoon.ko, p.expected.daewoon, '현재 대운 간지');
    eq(per.daewoon.stemTen, p.expected.daewoonTen.stem, '현재 대운 천간 십성');
    eq(per.daewoon.branchTen, p.expected.daewoonTen.branch, '현재 대운 지지 십성');
    eq(per.daewoon.stemTen, tenGodByRule(c.dayMaster, per.daewoon.stem), '현재 천간 십성(고전표)');
    eq(per.daewoon.branchTen, tenGodByRule(c.dayMaster, T.HIDDEN[per.daewoon.branch][0][0]), '현재 지지 십성(고전표)');
    return per.daewoon.hanja + ' ' + per.daewoon.stemTen + '/' + per.daewoon.branchTen + ' · ' + per.daewoon.ageRange.join('~');
  });
  check(p.id, '대운 해석이 현재 대운 천간·지지 십성을 모두 말한다', () => {
    const r = readingOf(p);
    const dw = r.period.daewoon;
    const text = r.themes.map((t) => t.body).join(' ') + ' ' + r.patterns.map((x) => x.text + ' ' + x.cut).join(' ');
    assert(text.includes('대운 ' + dw.hanja), '현재 대운 간지 언급 없음: ' + dw.hanja);
    assert(text.includes(dw.stemTen), '천간 십성 언급 없음: ' + dw.stemTen);
    assert(text.includes(dw.branchTen), '지지 십성 언급 없음: ' + dw.branchTen);
    return dw.hanja + ' ' + dw.stemTen + '/' + dw.branchTen;
  });
}

check('QA', '십성표 대조 — 병화·계수 정관, 을목·계수 편인, 기토·경금 상관', () => {
  eq(tenGodByRule(2, 9), '정관', '병화 ↔ 계수');
  eq(tenGodByRule(1, 9), '편인', '을목 ↔ 계수');
  eq(tenGodByRule(5, 6), '상관', '기토 ↔ 경금');
  eq(tenGodByRule(0, 0), '비견', '갑목 ↔ 갑목');
  eq(tenGodByRule(0, 1), '겁재', '갑목 ↔ 을목');
  eq(tenGodByRule(3, 2), '겁재', '정화 ↔ 병화');
  return '고전표 6쌍';
});

check('QA', '같은 명식(QA07=QA08)은 이름이 달라도 같은 문장', () => {
  const a = readingOf({ input: { year: 2024, month: 2, day: 10, calendar: 'solar', hourIdx: 6, name: 'QA07', focus: 'love' } });
  const b = readingOf({ input: { year: 2024, month: 2, day: 10, calendar: 'solar', hourIdx: 6, name: 'QA08', focus: 'love' } });
  eq(a.chart.chartId, b.chart.chartId, 'chartId');
  const norm = (s) => String(s).replace(/QA0[78]/g, '이름');
  eq(norm(a.free.bomb), norm(b.free.bomb), '팩폭');
  eq(a.free.traits.map((t) => norm(t.text)), b.free.traits.map((t) => norm(t.text)), '성향');
  return a.free.bomb.slice(0, 40);
});

/* ---------------- 2. DEV-QA ---------------- */
for (const p of devQa.profiles) {
  check(p.id, 'DEV-QA 명식·세운', () => {
    const r = readingOf(p);
    eq(r.chart.dayMasterName, p.expected.dayMaster, '일간');
    eq(r.chart.list.map((x) => x.ko), p.expected.pillars, '사주');
    eq(r.chart.tiedMax, p.expected.tiedMax, '공동 최다');
    eq(r.period.seun.ko, p.expected.seun, '세운');
    return r.chart.list.map((x) => x.ko).join(' ');
  });
}

/* ---------------- 3. 경계 14 ---------------- */
check('T1', '음력·양력 같은 명식 + 변환된 양력 날짜', () => {
  const lunar = readingOf({ input: { year: 1990, month: 5, day: 15, calendar: 'lunar', hourIdx: 6, name: '민지' } });
  const solar = readingOf({ input: { year: 1990, month: 6, day: 7, calendar: 'solar', hourIdx: 6, name: '민지' } });
  eq(lunar.chart.list.map((x) => x.ko), solar.chart.list.map((x) => x.ko), '명식');
  eq(lunar.chart.input.normalized.solar, { y: 1990, m: 6, d: 7 }, '변환 양력');
  return '음력 1990.05.15 → 양력 1990.06.07';
});

check('T2', '닉네임만 바꾸면 핵심 문장 동일(호칭만 다름)', () => {
  const a = readingOf({ input: { year: 1990, month: 5, day: 15, calendar: 'solar', hourIdx: 6, name: '민지' } });
  const b = readingOf({ input: { year: 1990, month: 5, day: 15, calendar: 'solar', hourIdx: 6, name: '지민' } });
  const norm = (s, n) => String(s).split(n).join('이름');
  eq(norm(a.free.bomb, '민지'), norm(b.free.bomb, '지민'), '팩폭');
  eq(a.free.traits.map((t) => norm(t.text, '민지')), b.free.traits.map((t) => norm(t.text, '지민')), '성향');
  return '동일';
});

check('T3', '관심운세만 바꾸면 무료 동일·유료는 순서만', () => {
  const a = readingOf({ input: { year: 1986, month: 9, day: 9, calendar: 'solar', hourIdx: 6, name: '민지', focus: 'love' } });
  const b = readingOf({ input: { year: 1986, month: 9, day: 9, calendar: 'solar', hourIdx: 6, name: '민지', focus: 'money' } });
  eq(a.free.essay, b.free.essay, '무료 해설');
  eq(a.free.bomb, b.free.bomb, '팩폭');
  eq(a.themes[0].key, 'love', '연애 먼저');
  eq(b.themes[0].key, 'money', '재물 먼저');
  eq(a.themes.map((t) => t.title).sort(), b.themes.map((t) => t.title).sort(), '본문 구성');
  return '순서만 다름';
});

check('T4', '같은 입력 반복은 100% 동일', () => {
  const p = { input: { year: 1961, month: 4, day: 14, calendar: 'solar', hourIdx: 6, name: '민지' } };
  const a = readingOf(p), b = readingOf(p);
  eq(JSON.stringify([a.free.bomb, a.free.traits, a.paid, a.themes, a.patterns]), JSON.stringify([b.free.bomb, b.free.traits, b.paid, b.themes, b.patterns]));
  return '동일';
});

check('T5', '시간 미상: 6글자·정오 가정 고지', () => {
  const r = readingOf({ input: { year: 1990, month: 5, day: 15, calendar: 'solar', hourIdx: null, name: '민지' } });
  assert(r.chart.total === 6, '글자수');
  assert(r.chart.flags.assumptions.some((a) => a.key === 'hourUnknown'), '정오 가정 고지 없음');
  assert(!/여덟 글자/.test(r.free.essay + r.free.bomb + r.themes.map((t) => t.body).join(' ')), '여덟 글자 표현');
  return '여섯 글자';
});

check('T6', '오행 동률: 공동 최강·% 일치·단독 표현 0', () => {
  const r = readingOf({ input: { year: 1961, month: 4, day: 14, calendar: 'solar', hourIdx: 6, name: '민지' } });
  assert(r.chart.tiedMax.length > 1, '동률 아님');
  assert(r.free.essay.includes('각각'), '각각 표현 없음');
  assert(!/제일 세요/.test(r.free.essay), '제일 세요');
  return r.chart.tiedMax.join('·') + ' ' + r.chart.share[r.chart.tiedMax[0]] + '%';
});

check('T7', '입춘 경계: 1984-02-04 23:30 vs 02-05 00:30', () => {
  const a = chartOf({ year: 1984, month: 2, day: 4, calendar: 'solar', hourIdx: 0, ziSide: 'late', gender: '여성' });
  const b = chartOf({ year: 1984, month: 2, day: 5, calendar: 'solar', hourIdx: 0, ziSide: 'early', gender: '여성' });
  assert(a.pillars.year.ko !== b.pillars.year.ko, '연주가 같음');
  assert(b.flags.termEdge, '입춘 경계 고지 없음');
  return a.pillars.year.ko + ' → ' + b.pillars.year.ko;
});

check('T8', '자시 경계: 야자시/조자시 날짜', () => {
  const a = chartOf({ year: 1984, month: 2, day: 4, calendar: 'solar', hourIdx: 0, ziSide: 'late', gender: '여성' });
  const b = chartOf({ year: 1984, month: 2, day: 5, calendar: 'solar', hourIdx: 0, ziSide: 'early', gender: '여성' });
  assert(a.pillars.day.ko !== b.pillars.day.ko, '일주가 같음');
  assert(a.flags.ziEdge && b.flags.ziEdge, '자시 경계 고지 없음');
  return a.pillars.day.ko + ' / ' + b.pillars.day.ko;
});

check('T9', '대운 천간·지지 십성이 다르면 둘 다 서술', () => {
  const r = readingOf({ input: { year: 1986, month: 9, day: 9, calendar: 'solar', hourIdx: 6, name: '민지' } });
  const dw = r.period.daewoon;
  assert(dw, '대운 없음');
  assert(dw.stemTen !== dw.branchTen, '천·지 십성이 같음');
  const text = r.themes.map((t) => t.body).join(' ') + r.patterns.map((p) => p.text + ' ' + p.cut).join(' ');
  assert(text.includes(dw.stemTen) && text.includes(dw.branchTen), '천간/지지 분리 서술 없음');
  return dw.hanja + ' ' + dw.stemTen + '/' + dw.branchTen;
});

check('T10', '조회연도 변경: 세운만 바뀌고 명식 해석 불변', () => {
  const p = { input: { year: 1961, month: 4, day: 14, calendar: 'solar', hourIdx: 6, name: '민지' } };
  const a = readingOf(p, '2025-11-25T10:00:00+09:00');
  const b = readingOf(p, '2026-11-25T10:00:00+09:00');
  assert(a.period.seun.ko !== b.period.seun.ko, '세운이 같음');
  eq(a.free.bomb, b.free.bomb, '팩폭');
  eq(a.free.traits, b.free.traits, '성향');
  return a.period.seun.ko + ' → ' + b.period.seun.ko;
});

check('T11', '무료 문단 ∩ 유료 문단 = 0 (원본 12명식)', () => {
  let freeCount = 0, paidCount = 0;
  const overlaps = [];
  for (const p of qaOriginal.profiles) {
    const r = readingOf(p);
    const free = r.free.traits.map((t) => t.text).concat([r.free.def, r.free.essay, r.free.bomb]);
    const paid = r.paid.map((t) => t.text).concat(r.themes.map((t) => t.body), r.patterns.map((x) => x.text + ' ' + x.cut));
    freeCount += r.free.traits.length;
    paidCount += r.paid.length;
    for (const f of free) {
      for (const q of paid) {
        if (f.length > 25 && q.includes(f)) overlaps.push(p.id + ': ' + f.slice(0, 24));
        if (q.length > 25 && f.includes(q)) overlaps.push(p.id + ': ' + q.slice(0, 24));
      }
    }
  }
  eq(overlaps, [], '중복');
  return '무료 36문단 · 유료 ' + paidCount + '문단 · 중복 0';
});

check('T12', '공유 URL·분석로그에 개인정보 0', () => {
  const app = readFileSync(resolve(appDir, 'app.js'), 'utf8');
  const an = readFileSync(resolve(appDir, 'analytics.js'), 'utf8');
  const invite = app.slice(app.indexOf('function inviteUrl'), app.indexOf('function parseInvite'));
  assert(!/iy=|&im=|&id=|inviter=|hourIdx|isLeap/.test(invite), 'inviteUrl 에 개인정보 조립');
  assert(!/state\.input/.test(invite), 'inviteUrl 이 state.input 을 읽음');
  assert(!/cat:/.test(app.slice(app.indexOf("AN.track('result_share'"), app.indexOf("AN.track('result_share'") + 300)), 'result_share 에 cat');
  assert(/bombPublic/.test(app), '공유 카드 팩폭에 닉네임 치환 없음');
  assert(!/inviter\s*:/.test(an), 'analytics.js 가 inviter 속성을 보냄');
  return 'URL 조립 없음 · 카드 bombPublic';
});

check('COPY', '궤도 화면에 숫자 궁합 점수를 만드는 문장·전달이 없다', () => {
  const copy = readFileSync(resolve(appDir, 'copy.js'), 'utf8');
  assert(!/\{score\}/.test(copy), 'copy.js 에 {score} 템플릿');
  assert(!/scoreLabel/.test(copy), 'copy.js 에 scoreLabel');
  const app = readFileSync(resolve(appDir, 'app.js'), 'utf8');
  const parts = app.slice(app.indexOf('function orbitDetailParts'), app.indexOf('function orbitEvidenceHtml'));
  assert(parts.length > 100, 'orbitDetailParts 구간 없음');
  assert(!/score/.test(parts), 'orbitDetailParts 가 score 를 넘김');
  assert(/evidence/.test(parts), 'orbitDetailParts 에 evidence 없음');
  assert(/orbitEvidenceHtml/.test(app.slice(app.indexOf('function renderOrbitDetail'))), '상세에 근거 칩 렌더 없음');
  return '점수 템플릿 0 · 근거 칩 전달';
});

check('INVITE', '친구 초대는 Worker 배포 전 기본 닫힘 · 개인정보 URL 폴백 없음', () => {
  const app = readFileSync(resolve(appDir, 'app.js'), 'utf8');
  const html = readFileSync(resolve(appDir, 'index.html'), 'utf8');
  assert(/function inviteReady\(\) \{\s*return window\.NYANG_INVITE_READY === true;/.test(app),
    'inviteReady 기본값이 열림');
  const htmlLive = html.replace(/<!--[\s\S]*?-->/g, '');   // 안내용 주석은 빼고 실제 스크립트만 본다
  assert(!/NYANG_INVITE_READY\s*=\s*true/.test(htmlLive), 'index.html 이 초대를 켜 둠');
  const copyInvite = app.slice(app.indexOf('function copyInvite'), app.indexOf('function trackInvite'));
  assert(/if \(!inviteReady\(\)\)/.test(copyInvite), '초대 복사에 준비 중 가드 없음');
  assert(!/location\.search|inviter=|iy=/.test(copyInvite), '초대에 개인정보 URL 폴백');
  const parse = app.slice(app.indexOf('function parseInvite'), app.indexOf('/* --- 친구 추가 폼'));
  assert(/if \(inviteReady\(\)\) \{/.test(parse), '준비 중에 코드 조회를 막지 않음');
  assert(!/if \(!inviteReady\(\)\) return;/.test(parse), '준비 중에 예전 링크 안내까지 막음');
  assert(parse.lastIndexOf('예전 ?inviter=') > parse.indexOf('if (code) {'), '예전 링크 안내가 코드 조회 안에 갇힘');
  return '기본 준비 중 · 링크 조회 안 함';
});

check('T13', '서머타임: 1988-07-01 00:10 → 병진/무자', () => {
  const c = chartOf({ year: 1988, month: 7, day: 1, calendar: 'solar', hourIdx: 0, ziSide: 'early', gender: '여성' });
  eq(c.pillars.day.ko + ' ' + c.pillars.hour.ko, '병진 무자', '일주·시주');
  assert(c.flags.dstApplied, '서머타임 보정 플래그 없음');
  return c.pillars.day.ko + ' ' + c.pillars.hour.ko;
});

check('T14', '시진 내 절입: 1982-02-04 오시 → termEdge', () => {
  const c = chartOf({ year: 1982, month: 2, day: 4, calendar: 'solar', hourIdx: 6, gender: '여성' });
  assert(c.flags.termEdge, '절입 경계 고지 없음');
  assert(c.flags.termEdgeTerm === '입춘', '절입 이름');
  return c.flags.termEdgeTerm + ' ' + c.pillars.month.ko;
});

/* ---------------- 4. 궁합(궤도) ---------------- */
check('ORBIT', '궁합은 일간·일지 두 값만으로 계산되고 근거를 낸다', () => {
  const a = readingOf({ input: { year: 1986, month: 9, day: 9, calendar: 'solar', hourIdx: 6, name: '민지' } }).chart;
  const b = readingOf({ input: { year: 1990, month: 5, day: 15, calendar: 'solar', hourIdx: 6, name: '지안' } }).chart;
  const miniA = { dayMaster: a.dayMaster, pillars: { day: { branch: a.pillars.day.branch } } };
  const miniB = { dayMaster: b.dayMaster, pillars: { day: { branch: b.pillars.day.branch } } };
  const full = PD.compatibility(a, b);
  const mini = PD.compatibility(miniA, miniB);
  eq(mini, full, '최소 데이터 결과');
  assert(full.evidence.length >= 2, '근거 없음');
  assert(full.scoreNote.includes('제품 규약'), '점수 규약 표기 없음');
  return full.relation + ' ' + full.score + ' · ' + full.evidence.map((e) => e.text).join(' / ');
});

check('ORBIT', '궁합 동점 규칙·범위: 18~98, 궤도 1~3', () => {
  for (const x of qaOriginal.profiles.slice(0, 8)) {
    for (const y of qaOriginal.profiles.slice(0, 8)) {
      const c = PD.compatibility(chartOf(x), chartOf(y));
      assert(c.score >= 18 && c.score <= 98, '점수 범위');
      assert(c.orbit >= 1 && c.orbit <= 3, '궤도');
    }
  }
  return '8×8 조합';
});

check('CONTENT', '유료 성향 문단이 무료 성향 36문단과 겹치지 않는다', () => {
  const free = new Set();
  qaOriginal.profiles.forEach((p) => readingOf(p).free.traits.forEach((t) => free.add(t.text)));
  const paidTexts = [];
  qaOriginal.profiles.forEach((p) => readingOf(p).paid.forEach((t) => paidTexts.push(t.text)));
  const hit = paidTexts.filter((t) => free.has(t));
  eq(hit, [], '동일 문단');
  return '무료 ' + free.size + '종 · 유료 ' + new Set(paidTexts).size + '종';
});

/* ---------------- 5. analysisData (v2.4) ---------------- */
const A = sandbox.NyangAnalysis;

check('AN', 'analysisData — 결정적·필수 노드·금지 키 0 (원본 12명식)', () => {
  assert(A, 'NyangAnalysis 없음');
  const need = ['schemaVersion', 'tables', 'chart', 'dayMaster', 'monthCommand', 'hiddenStems', 'earlyQiCandidates',
    'roots', 'deukryeong', 'deukji', 'deukse', 'elementFacts', 'tenGodFacts', 'saenggeuk', 'hapchong', 'geokguk', 'flags'];
  for (const p of qaOriginal.profiles) {
    const c = chartOf(p);
    const a = A.build(c);
    eq(a.schemaVersion, 'analysis/1.0', p.id + ' schemaVersion');
    for (const k of need) assert(a[k] !== undefined, p.id + ' 노드 없음: ' + k);
    eq(A.lint(a), [], p.id + ' 린트');
    eq(JSON.stringify(a), JSON.stringify(A.build(chartOf(p))), p.id + ' 결정성');
  }
  return '12명식 · 결정적 · 금지 키 0';
});

check('AN', '분석 칩 — 득령·득지·득세가 각각 독립 판독으로만 나온다', () => {
  const a = A.build(chartOf(qaOriginal.profiles[8]));   // QA09 乙 · 戊辰 庚申 乙未 丁亥
  eq(a.monthCommand.branch, '申', '월지');
  eq(a.monthCommand.monthType, '생지', '월지 분류');
  eq(a.monthCommand.season, '가을', '계절');
  eq(a.monthCommand.wangXiang, { 목: '사', 화: '수', 토: '휴', 금: '왕', 수: '상' }, '왕상휴수사');
  eq(a.deukryeong.bySeasonRank.rank, '사', '득령 계절 판독');
  eq(a.deukryeong.byStage.stage, '태', '득령 12운성 판독');
  eq(a.deukryeong.byMainQiTenGod.tenGod, '정관', '득령 본기 십성 판독');
  eq(a.deukryeong.byElementCycle.relation, 'controls-me', '득령 오행 판독');
  eq(a.deukji.byStage.stage, '양', '득지 12운성 판독');
  eq(a.deukji.rootGrade.value, '경', '일지 통근 등급');
  eq(a.roots.map((r) => r.pillar + ':' + r.stem), ['year:乙', 'day:乙', 'hour:甲'], '통근 목록(辰 여기 乙 포함)');
  eq(a.tenGodFacts.groupsByHiddenAll, { peer: 3, output: 2, wealth: 4, power: 2, resource: 3 }, '지장간 전체 묶음 개수');
  assert(!('supported' in a.deukryeong), '득령이 단일 boolean 으로 접혔다');
  return 'QA09 — 4판독 분리 · 통근 2개 · 개수 3/2/4/2/3';
});

check('AN', '격국 — QA09 일부 일치, QA04 불일치. 확정하지 않는다', () => {
  const a9 = A.build(chartOf(qaOriginal.profiles[8]));
  eq(a9.geokguk.monthType, '생지', 'QA09 월지 분류');
  eq(a9.geokguk.agreement, 'partial', 'QA09 agreement');
  eq(a9.geokguk.decided, false, 'QA09 확정하지 않아야 함');
  const ids9 = a9.geokguk.candidates.map((c) => c.id);
  ['GEOK.BONGGI.정관', 'GEOK.TUTUL.庚.정관', 'GEOK.TUTUL.戊.정재'].forEach((id) => assert(ids9.includes(id), 'QA09 후보 없음: ' + id));

  const a4 = A.build(chartOf(qaOriginal.profiles[3]));   // QA04 丁 · 癸卯 乙丑 丁酉 丙午
  eq(a4.geokguk.monthType, '잡기', 'QA04 월지 분류');
  eq(a4.geokguk.agreement, 'differs', 'QA04 agreement');
  assert(a4.geokguk.candidates.some((c) => c.id === 'GEOK.HOEJUK.금'), 'QA04 회국 후보 없음');
  assert(a4.hapchong.some((h) => h.id.indexOf('CHUNG.branch.卯酉') === 0), 'QA04 卯酉 충 없음');
  assert(a4.geokguk.unresolved.length > 0, '확정 불가 사유 없음');
  return 'QA09 partial · QA04 differs · decided false';
});

check('AN', 'FLAG.DOHWA — rules 층이 내고 render 는 합성하지 않는다', () => {
  const c = chartOf(qaOriginal.profiles[0]);   // QA01 戊午 일주 = 도화
  assert(c.dohwa, 'QA01 도화 아님');
  assert(R.core(c).some((f) => f.id === 'FLAG.DOHWA'), 'rules.core 에 FLAG.DOHWA 없음');
  const sel = readFileSync(resolve(appDir, 'src/render/select.js'), 'utf8');
  assert(!/idx\.map\['FLAG\.DOHWA'\]/.test(sel), 'select.js 가 아직 FLAG.DOHWA 를 합성');
  return 'rules 에서 1회 · render 합성 0';
});

check('AN', 'earlyQi 는 참고값일 뿐 판정에서 참조하지 않는다', () => {
  const a = A.build(chartOf(qaOriginal.profiles[8]));
  assert(a.earlyQiCandidates.length === 0, '생지월에는 왕지 분야 참고값을 넣지 않는다');
  const a0 = A.build(chartOf(qaOriginal.profiles[0]));  // 子월 = 왕지
  assert(a0.earlyQiCandidates.length > 0, '왕지월 참고값 없음');
  a0.earlyQiCandidates.forEach((e) => eq(e.use, 'reference-only', 'use'));
  assert(!JSON.stringify(a0.geokguk).includes('earlyQi'), 'geokguk 이 earlyQi 참조');
  return '왕지 ' + a0.earlyQiCandidates.length + '건 · use reference-only';
});

/* ---------------- 출력 ---------------- */
const failed = results.filter((r) => !r.ok);
for (const r of results) {
  if (!r.ok || process.env.VERBOSE) console.log((r.ok ? 'OK  ' : 'NG  ') + r.id + ' ' + r.name + (r.detail ? ' — ' + r.detail : ''));
}
console.log('\n' + results.length + '건 · 통과 ' + (results.length - failed.length) + ' · 실패 ' + failed.length);
if (failed.length) {
  console.log('\n실패:');
  failed.forEach((f) => console.log('  - ' + f.id + ' ' + f.name + ': ' + f.detail));
  process.exit(1);
}
