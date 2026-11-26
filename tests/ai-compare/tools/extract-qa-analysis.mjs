#!/usr/bin/env node
/* ==========================================================================
   tests/ai-compare/tools/extract-qa-analysis.mjs
   --------------------------------------------------------------------------
   원본 QA01~12 를 '실제 앱 엔진'(loadEngine + NyangAnalysis)으로 실행해
   원본 입력·사주명식·analysisData 를 그대로 뽑아 문서로 저장한다.

     docs/qa-original-analysis-data.json   기계용(전체)
     docs/qa-original-analysis-data.md     사람용(요약 + 대표 3건 전문)

   이 파일을 다시 만들면 run.mjs 의 자기시험이 엔진 결과와 일치하는지 확인한다.
   실행: node tests/ai-compare/tools/extract-qa-analysis.mjs
   ========================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadEngine } from '../lib/load.mjs';
import { buildContext, ASOF } from '../lib/readings.mjs';
import { conflictObligations } from '../lib/facts.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(HERE, '../../..');
const OUT_JSON = resolve(APP_DIR, 'docs/qa-original-analysis-data.json');
const OUT_MD = resolve(APP_DIR, 'docs/qa-original-analysis-data.md');

const PILOT = {
  ids: ['QA02', 'QA04', 'QA09'],
  reason: {
    QA02: '시주 미상(여섯 글자) · 왕지월(子) · 여성 · 戊土 일간 — 시주가 없을 때 무엇을 말할 수 없는지 보는 기준',
    QA04: '잡기월(丑) · 본기(식신)와 투출(편관)이 다른 격을 가리킴(agreement: differs) · 여성 · 丁火 일간 — 상충 설명력의 핵심',
    QA09: '생지월(申) · 남성 · 乙木 일간 · 대운·세운이 모두 있는 명식 — 구간 해석과 성별에 따른 대운 순역을 함께 보는 기준'
  },
  alternates: [
    'QA01 — 화3·토3 동률(단독 최강 서술 금지) 확인용',
    'QA05 — 생지월에서 본기·중기 동시 투출(兼透) 확인용',
    'QA10 — 조회연도 초점(year) 확인용'
  ],
  coverage: '왕지·잡기·생지 세 월령 유형, 시주 있음/없음, 남/녀, 격 후보 일치/불일치를 3건에 나눠 담았다.'
};

const POSITIONS = ['year', 'month', 'day', 'hour'];
const PILLAR_KO = { year: '년', month: '월', day: '일', hour: '시' };

function digestChart(chart) {
  const out = {
    chartVersion: chart.chartVersion,
    hourKnown: !chart.flags.hourUnknown,
    dayMaster: { hanja: chart.dayMasterHanja, ko: chart.dayMasterName, elem: chart.dayMasterElem },
    pillars: {},
    counts: chart.counts,
    share: chart.share,
    weighted: chart.weighted,
    tiedMax: chart.tiedMax,
    tiedMin: chart.tiedMin,
    lacking: chart.lacking,
    hiddenElems: chart.hiddenElems,
    tenCount: chart.tenCount,
    flags: chart.flags,
    daewoon: chart.daewoon ? {
      forward: chart.daewoon.forward,
      startAge: chart.daewoon.startAge,
      startAgeLabel: chart.daewoon.startAgeLabel,
      startDate: chart.daewoon.startDate,
      startTerm: chart.daewoon.startTerm,
      list: (chart.daewoon.list || []).map((d) => ({ hanja: d.hanja, ko: d.ko, age: d.age, from: d.from, to: d.to, stemTen: d.stemTen, branchTen: d.branchTen, ageRange: d.ageRange }))
    } : null
  };
  POSITIONS.forEach((k) => {
    const p = chart.pillars[k];
    if (!p) return;
    out.pillars[k] = {
      ganzhi: p.hanja, ko: p.ko,
      stem: p.stemKo, branch: p.branchKo,
      stemElem: p.stemElem, branchElem: p.branchElem,
      tenGodStem: k === 'day' ? '일간' : p.ten.stem,
      tenGodBranch: p.ten.branch,
      stage: p.stage,
      dohwa: !!p.dohwa,
      hidden: p.hidden.map((h) => ({ stem: h.hanja, ko: h.stemKo, elem: h.elem, tenGod: h.ten, weight: h.weight }))
    };
  });
  return out;
}

function digestPeriod(period) {
  if (!period) return null;
  return {
    asOf: period.asOf,
    seun: period.seun ? {
      year: period.seun.year, ganzhi: period.seun.hanja, ko: period.seun.ko,
      stemElem: period.seun.stemElem, branchElem: period.seun.branchElem,
      stemTenGod: period.seun.stemTen, branchTenGod: period.seun.branchTen,
      from: period.seun.fromLabel
    } : null,
    daewoon: period.daewoon ? {
      ganzhi: period.daewoon.hanja, ageRange: period.daewoon.ageRange,
      stemTenGod: period.daewoon.stemTen, branchTenGod: period.daewoon.branchTen,
      from: period.daewoon.from, to: period.daewoon.to
    } : null,
    nextDaewoon: period.nextDaewoon || null,
    daewoonStart: period.daewoonStart || null,
    beforeFirstDaewoon: !!period.beforeFirstDaewoon
  };
}

function digestAnalysis(a, ctx) {
  return {
    monthCommand: a.monthCommand,
    deukryeong: a.deukryeong,
    deukji: a.deukji,
    roots: a.roots.length,
    rootsList: a.roots,
    deukseGroups: a.deukse.groupCountsByHiddenAll,
    tenGodFacts: a.tenGodFacts,
    elementFacts: a.elementFacts,
    geokguk: a.geokguk,
    hapchong: a.hapchong,
    saenggeuk: a.saenggeuk.length,
    flags: a.flags,
    obligations: conflictObligations(ctx, null).map((o) => ({ id: o.id, topic: o.topic, requires: o.requires }))
  };
}

const E = loadEngine();
const raw = JSON.parse(readFileSync(resolve(APP_DIR, 'tests/fixtures/qa-original.json'), 'utf8'));

const profiles = raw.profiles.map((p) => {
  const fixture = { id: p.id, birth: p.input, focus: p.focus, conflict: p.conflict || null };
  const ctx = buildContext(E, fixture);
  return {
    id: p.id,
    source: p.source,
    focus: p.focus,
    input: {
      year: p.input.year, month: p.input.month, day: p.input.day,
      calendar: p.input.calendar || 'solar', isLeap: !!p.input.isLeap,
      hourIdx: p.input.hourIdx == null ? null : p.input.hourIdx,
      ziSide: p.input.ziSide || 'early', gender: p.input.gender || '여성'
    },
    chart: digestChart(ctx.chart),
    period: digestPeriod(ctx.period),
    analysisData: ctx.analysis,
    analysisDigest: digestAnalysis(ctx.analysis, ctx),
    analysisLint: E.A.lint(ctx.analysis),
    observedDefects: (p.defects || []).map((d) => d.code + ': ' + d.detail)
  };
});

const out = {
  meta: {
    version: 'qa-analysis/1.0',
    generatedAt: new Date().toISOString(),
    asOf: ASOF,
    appDir: 'apps/nyang-saju',
    engine: {
      loader: 'tests/ai-compare/lib/load.mjs (vm 샌드박스, 브라우저와 같은 파일 순서)',
      chart: 'NyangDomain.chart', analysis: 'NyangAnalysis.build', period: 'NyangPeriod.period',
      files: ['vendor/manseryeok.js', 'src/domain/tables.js', 'src/domain/chart.js', 'src/domain/analysis.js', 'src/domain/period.js', 'src/rules/findings.js', 'src/render/select.js']
    },
    note: 'QA01~12 원본 입력을 실제 앱 엔진으로 다시 계산한 결과다. analysisData 는 판정이 아니라 사실이며, lint() 를 통과해야 한다.'
  },
  pilotSet: PILOT,
  profiles
};

writeFileSync(OUT_JSON, JSON.stringify(out, null, 1), 'utf8');

/* ---------------- 사람용 문서 ---------------- */
const L = [];
const fmtPct = (n) => (Math.round(n * 10) / 10) + '%';
L.push('---');
L.push('title: "냥도사 · 원본 QA01~12 analysisData 추출"');
L.push('kind: data');
L.push('target: apps/nyang-saju @ v2.5 (exp/ai-engine)');
L.push('date: ' + new Date().toISOString().slice(0, 10));
L.push('---');
L.push('');
L.push('# 원본 QA01~12 · analysisData 추출');
L.push('');
L.push('> 이 문서는 **실제 앱 엔진이 계산한 사실**을 그대로 옮긴 것이다. 손으로 채운 값이 없다.');
L.push('> 기계용 전문은 [`qa-original-analysis-data.json`](./qa-original-analysis-data.json) 에 있고,');
L.push('> `node tests/ai-compare/tools/extract-qa-analysis.mjs` 로 언제든 다시 만들 수 있다.');
L.push('> run.mjs 는 이 JSON 과 엔진 결과가 12건 모두 같은지 자기시험에서 확인한다.');
L.push('');
L.push('| 항목 | 값 |');
L.push('|---|---|');
L.push('| 생성 시각 | ' + out.meta.generatedAt + ' |');
L.push('| 조회 시점(asOf) | ' + ASOF + ' |');
L.push('| 엔진 | chart → analysis → period (vm 샌드박스, 브라우저와 같은 순서) |');
L.push('| analysisData 스키마 | analysis/1.0 · 판정 필드 없음(lint 통과 ' + profiles.filter((p) => !p.analysisLint.length).length + '/12) |');
L.push('');
L.push('## 대표 명식 3건 (파일럿 세트)');
L.push('');
L.push('`--mode pilot` 은 아래 3건만 실제 모델로 돈다. 3건에 월령 유형·시주 유무·성별·격 후보 일치/불일치를 나눠 담았다.');
L.push('');
L.push('| id | 일간 | 월지(유형) | 시주 | 성별 | 초점 | 이 건으로 보는 것 |');
L.push('|---|---|---|---|---|---|---|');
profiles.filter((p) => PILOT.ids.indexOf(p.id) >= 0).forEach((p) => {
  L.push('| ' + p.id + ' | ' + p.chart.dayMaster.ko + '(' + p.chart.dayMaster.elem + ') | ' + p.chart.pillars.month.branch + '(' +
    p.analysisData.monthCommand.monthType + ') | ' + (p.input.hourIdx == null ? '미상' : '있음') + ' | ' + p.input.gender + ' | ' + p.focus + ' | ' +
    PILOT.reason[p.id] + ' |');
});
L.push('');
L.push('선정 이유: ' + PILOT.coverage);
L.push('');
L.push('교체 후보: ' + PILOT.alternates.join(' · '));
L.push('');
L.push('## 12건 요약');
L.push('');
L.push('| id | 사주명식 | 일간 | 월령 | 통근 | 득령(계절/운성/본기) | 격 후보 일치 | 상충 축 | 대운 | 세운 |');
L.push('|---|---|---|---|---|---|---|---|---|---|');
profiles.forEach((p) => {
  const a = p.analysisData;
  const pillars = POSITIONS.filter((k) => p.chart.pillars[k]).map((k) => p.chart.pillars[k].ganzhi).join(' ');
  const dw = p.period && p.period.daewoon ? p.period.daewoon.ganzhi + '(' + p.period.daewoon.ageRange.join('~') + ')' : '없음';
  const ob = a.geokguk;
  L.push('| ' + p.id + ' | ' + pillars + ' | ' + p.chart.dayMaster.ko + '(' + p.chart.dayMaster.elem + ') | ' +
    a.monthCommand.branch + '·' + a.monthCommand.monthType + '·' + a.monthCommand.season + ' | ' + a.roots.length + ' | ' +
    a.deukryeong.bySeasonRank.rank + '/' + a.deukryeong.byStage.stage + '/' + a.deukryeong.byMainQiTenGod.tenGod + ' | ' +
    ob.agreement + ' (' + ob.candidates.length + '후보) | ' +
    (p.analysisDigest.obligations.map((o) => o.id).join(',') || '—') + ' | ' + dw + ' | ' +
    (p.period && p.period.seun ? p.period.seun.ganzhi + '(' + p.period.seun.stemTenGod + '/' + p.period.seun.branchTenGod + ')' : '—') + ' |');
});
L.push('');
L.push('## 지표 설명');
L.push('');
L.push('- **사주명식**: 년·월·일·시 간지. 시주가 없으면 6글자.');
L.push('- **십성**: 천간·지지(본기) 기준 표면 십성. 지장간 전체 집계는 `analysisData.tenGodFacts.byHiddenAll`.');
L.push('- **12운성**: 일간 기준 각 지지의 운성(음양순역표 `twelve-stages-yinyang/1`).');
L.push('- **지장간**: 藏遁歌 표(`cangdun-ge/1`) + 제품 가중치(`product/1`).');
L.push('- **대운·세운**: `period.js` — 세운은 입춘 절입, 대운은 3일=1년·성별 순역.');
L.push('- **상충 축**: O1 월령↔통근, O2 본기↔투출, O3 합↔충, O4 표면0·지장간만, O5 시진 내 절입, O6 시주 미상.');
L.push('');

PILOT.ids.forEach((id) => {
  const p = profiles.filter((x) => x.id === id)[0];
  if (!p) return;
  const a = p.analysisData;
  L.push('---');
  L.push('');
  L.push('## ' + id + ' — ' + POSITIONS.filter((k) => p.chart.pillars[k]).map((k) => p.chart.pillars[k].ganzhi).join(' ') +
    ' · ' + p.chart.dayMaster.ko + '(' + p.chart.dayMaster.elem + ') 일간');
  L.push('');
  L.push('- 입력: ' + p.input.year + '-' + p.input.month + '-' + p.input.day + ' · ' + p.input.calendar +
    (p.input.isLeap ? '(윤달)' : '') + ' · 시 ' + (p.input.hourIdx == null ? '미상' : p.input.hourIdx + '번째') + ' · ' + p.input.gender + ' · 관심 ' + p.focus);
  L.push('');
  L.push('### 사주명식');
  L.push('');
  L.push('| 기둥 | 간지 | 천간(십성) | 지지(십성) | 12운성 | 지장간 |');
  L.push('|---|---|---|---|---|---|');
  POSITIONS.forEach((k) => {
    const x = p.chart.pillars[k];
    if (!x) { L.push('| ' + PILLAR_KO[k] + ' | — | — | — | — | — |'); return; }
    L.push('| ' + PILLAR_KO[k] + ' | ' + x.ganzhi + '(' + x.ko + ') | ' + x.stem + '(' + x.tenGodStem + ') | ' + x.branch + '(' + x.tenGodBranch + ') | ' +
      x.stage + ' | ' + x.hidden.map((h) => h.stem + ' ' + h.tenGod + ' ' + h.weight).join(' · ') + ' |');
  });
  L.push('');
  L.push('- 오행 표면: ' + Object.keys(a.elementFacts.surface).map((e) => e + ' ' + a.elementFacts.surface[e] + '(' + fmtPct(a.elementFacts.share[e]) + ')').join(' · '));
  L.push('- 표면 십성: ' + Object.keys(a.tenGodFacts.bySurface).filter((g) => a.tenGodFacts.bySurface[g]).map((g) => g + ' ' + a.tenGodFacts.bySurface[g]).join(' · '));
  L.push('- 지장간 전체 십성: ' + Object.keys(a.tenGodFacts.byHiddenAll).filter((g) => a.tenGodFacts.byHiddenAll[g]).map((g) => g + ' ' + a.tenGodFacts.byHiddenAll[g]).join(' · '));
  L.push('- 득령 4판독: 오행 ' + a.deukryeong.byElementCycle.relation + ' · 계절 ' + a.deukryeong.bySeasonRank.rank + ' · 12운성 ' + a.deukryeong.byStage.stage + ' · 본기 ' + a.deukryeong.byMainQiTenGod.tenGod);
  L.push('- 통근 ' + a.roots.length + '개: ' + (a.roots.map((r) => r.pillar + '.' + r.branch + ' ' + r.stem + '(' + r.rootGrade + ')').join(' · ') || '없음'));
  L.push('- 격 후보: ' + a.geokguk.candidates.map((c) => c.id + (c.transparent ? ' [투출]' : '')).join(' · ') + ' → agreement ' + a.geokguk.agreement);
  L.push('- 합충: ' + (a.hapchong.map((h) => h.kind + ' ' + h.chars.join('') + '(' + h.between + ')').join(' · ') || '없음'));
  L.push('- 대운: ' + (p.chart.daewoon ? (p.chart.daewoon.forward ? '순행' : '역행') + ' · 시작 ' + p.chart.daewoon.startAgeLabel + ' · 현재 ' +
    (p.period.daewoon ? p.period.daewoon.ganzhi + ' (' + p.period.daewoon.ageRange.join('~') + '세)' : '아직 없음') : '없음'));
  L.push('- 세운: ' + (p.period.seun ? p.period.seun.ganzhi + ' · 천간 ' + p.period.seun.stemTenGod + ' / 지지 ' + p.period.seun.branchTenGod : '—'));
  L.push('- 상충 의무: ' + (p.analysisDigest.obligations.map((o) => o.id + ' ' + o.topic).join(' · ') || '없음'));
  L.push('');
  L.push('<details><summary>analysisData 전문 (펼치기)</summary>');
  L.push('');
  L.push('```json');
  L.push(JSON.stringify(a, null, 1));
  L.push('```');
  L.push('');
  L.push('</details>');
  L.push('');
});

L.push('---');
L.push('');
L.push('## 다시 만드는 법');
L.push('');
L.push('```bash');
L.push('node tests/ai-compare/tools/extract-qa-analysis.mjs');
L.push('node tests/ai-compare/run.mjs --mode stub        # 12건 일치 자기시험 포함');
L.push('```');
L.push('');
L.push('전체 12건의 `analysisData` 전문은 JSON 에 있다. 이 문서는 요약과 대표 3건의 전문만 담는다(문서 길이 때문에).');
writeFileSync(OUT_MD, L.join('\n'), 'utf8');

const lintFail = profiles.filter((p) => p.analysisLint.length);
console.log('profiles ' + profiles.length + '건 추출');
console.log('lint 실패 ' + lintFail.length + '건');
profiles.forEach((p) => {
  console.log('  ' + p.id + ' ' + POSITIONS.filter((k) => p.chart.pillars[k]).map((k) => p.chart.pillars[k].ganzhi).join(' ') +
    ' · ' + p.chart.dayMaster.ko + ' · ' + p.analysisData.monthCommand.monthType +
    ' · roots ' + p.analysisData.roots.length + ' · geok ' + p.analysisData.geokguk.agreement +
    ' · ob ' + p.analysisDigest.obligations.map((o) => o.id).join('') +
    ' · dw ' + (p.period.daewoon ? p.period.daewoon.ganzhi : '-') +
    ' · seun ' + (p.period.seun ? p.period.seun.ganzhi : '-'));
});
console.log('→ docs/qa-original-analysis-data.json');
console.log('→ docs/qa-original-analysis-data.md');
