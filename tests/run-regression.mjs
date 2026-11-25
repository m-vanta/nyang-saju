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
  'vendor/manseryeok.js', 'src/domain/tables.js', 'src/domain/chart.js', 'src/domain/period.js',
  'src/rules/findings.js', 'copy.js', 'src/content/paid-strings.js', 'src/content/free.js',
  'src/content/paid.js', 'src/render/select.js', 'saju.js', 'palja.js'
];
for (const f of FILES) {
  vm.runInContext(readFileSync(resolve(appDir, f), 'utf8'), sandbox, { filename: f });
}

const S = sandbox.NyangSaju;
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
}

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
