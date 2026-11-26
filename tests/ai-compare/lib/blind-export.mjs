/* ==========================================================================
   lib/blind-export.mjs — 블라인드 평가 패키지
   --------------------------------------------------------------------------
   목적: 다섯 실험군의 해석을 '어느 엔진이 썼는지' 모르는 상태로 읽고 채점한다.

   산출물 (out/<runId>/blind/)
     blind-package.md     평가자에게 주는 문서 — Model-1~Model-5 만 보인다
     blind-package.json   같은 내용의 기계용 판본
     blind-key.json       ★ 비밀 — Model-N ↔ 실험군·모델·프롬프트 해시·설정·비용
     prompts.md           ★ 비밀 — 시스템/사용자 프롬프트 전문

   블라인드 패키지에 담는 것: 원본 입력, 사주명식, analysisData, 8섹션 해석 전문,
   참조 근거, 토큰·비용·응답시간·재시도 횟수. 프롬프트·모델명·실험군 이름은 키에만 둔다.
   (토큰·비용은 프롬프트 길이를 암시할 수 있다 — README 의 한계 절에 적는다.)
   ========================================================================== */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { SECTIONS, flattenSections } from './schema.mjs';
import { formatUsd, formatKrw } from './cost.mjs';

function hash(str) {
  let h = 2166136261;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

export const BLIND_SEED = 'nyang-saju/exp-ai-engine/1';

/** 실험군 → 블라인드 라벨. 같은 실험군은 픽스처가 달라도 같은 라벨을 쓴다. */
export function blindMap(arms, seed) {
  const order = arms.slice().sort((a, b) => (hash((seed || BLIND_SEED) + a) % 997) - (hash((seed || BLIND_SEED) + b) % 997));
  const map = {};
  order.forEach((arm, i) => { map[arm] = 'Model-' + (i + 1); });
  return map;
}

/* 이름 마스킹 — 평가 패키지에는 실명을 넣지 않는다 */
export function maskText(text, name) {
  const nm = name || '민지';
  return String(text || '').split(nm).join('{name}');
}

function refsOfParagraph(p) {
  return {
    evidence: p.evidenceRefs || [],
    findings: p.findingRefs || [],
    kb: p.kbRefs || []
  };
}

function sectionView(doc, name) {
  return flattenSections(doc).map((s) => ({
    id: s.id,
    title: s.title,
    status: s.status,
    reason: s.reason,
    paragraphs: (s.paragraphs || []).map((p) => ({ text: maskText(p.text, name), refs: refsOfParagraph(p) }))
  }));
}

function inputView(ctx) {
  const f = ctx.fixture || {};
  const b = f.birth || f.input || {};
  return {
    fixture: f.id || null,
    birth: {
      year: b.year, month: b.month, day: b.day,
      calendar: b.calendar || 'solar', isLeap: !!b.isLeap,
      hourIdx: b.hourIdx == null ? null : b.hourIdx,
      ziSide: b.ziSide || 'early', gender: b.gender || '여성',
      focus: b.focus || f.focus || null
    },
    note: '이름은 {name} 로 마스킹한다. 연·월·일·시는 픽스처 원본 입력이다(내부 검토 전용).'
  };
}

function chartView(ctx) {
  const c = ctx.chart;
  const out = { hourKnown: !c.flags.hourUnknown, dayMaster: c.dayMasterHanja + '(' + c.dayMasterElem + ')', pillars: {} };
  ['year', 'month', 'day', 'hour'].forEach((k) => {
    const p = c.pillars[k];
    if (!p) return;
    out.pillars[k] = {
      ganzhi: p.hanja, stemTenGod: p.ten.stem, branchTenGod: p.ten.branch, stage: p.stage,
      hidden: p.hidden.map((h) => h.hanja + '(' + h.elem + '·' + h.ten + ')')
    };
  });
  out.elementCounts = c.counts;
  out.elementShare = c.share;
  return out;
}

function statsView(item, validation, metrics) {
  const records = item.records || [];
  const tokensIn = records.reduce((s, r) => s + r.usage.input_tokens, 0);
  const tokensOut = records.reduce((s, r) => s + r.usage.output_tokens, 0);
  const usd = records.reduce((s, r) => s + r.usd, 0);
  const ms = records.reduce((s, r) => s + r.ms, 0);
  return {
    paragraphs: metrics ? metrics.paragraphs : null,
    sectionsOk: metrics ? metrics.sectionsOk : null,
    tokens: { input: tokensIn, output: tokensOut, estimated: records.some((r) => r.estimated) },
    costUsd: Math.round(usd * 1e6) / 1e6,
    costKrw: Math.round(usd * 1390),
    latencyMs: ms,
    attempts: item.attempts || records.length,
    retries: Math.max(0, (item.attempts || records.length) - 1),
    validation: {
      violations: validation ? validation.violations.length : 0,
      byRule: validation ? validation.violations.reduce((o, x) => { o[x.rule] = (o[x.rule] || 0) + 1; return o; }, {}) : {}
    }
  };
}

/**
 * @param {object} input { runId, createdAt, models, items: [{ctx, arm, doc, validation, metrics, attempts, records, prompt, settings, model, engine}] }
 */
export function buildBlind(input) {
  const arms = [];
  input.items.forEach((it) => { if (arms.indexOf(it.arm) < 0) arms.push(it.arm); });
  const map = blindMap(arms.sort(), input.seed);
  const armOf = {};
  Object.keys(map).forEach((a) => { armOf[map[a]] = a; });

  /* 픽스처 순서 고정 */
  const fixtureIds = [];
  input.items.forEach((it) => { if (fixtureIds.indexOf(it.ctx.fixture.id) < 0) fixtureIds.push(it.ctx.fixture.id); });

  const key = {
    version: 'blind-key/1.0',
    runId: input.runId,
    createdAt: input.createdAt,
    seed: input.seed || BLIND_SEED,
    warning: '이 파일은 비밀이다. 평가가 끝나기 전에 평가자에게 주지 않는다.',
    mapping: {},
    prompts: {},
    perItem: []
  };

  arms.sort().forEach((arm) => {
    const sample = input.items.filter((it) => it.arm === arm)[0];
    key.mapping[map[arm]] = {
      arm,
      engine: sample && sample.engine,
      label: sample && sample.label,
      model: sample && sample.model,
      promptVersion: sample && sample.prompt && sample.prompt.promptVersion,
      promptHash: sample && sample.prompt && sample.prompt.hash,
      settings: (sample && sample.settings) || { temperature: 0, maxTokens: null },
      inputBoundary: sample && sample.inputBoundary
    };
  });

  const fixtures = fixtureIds.map((fid) => {
    const its = input.items.filter((it) => it.ctx.fixture.id === fid);
    const ctx = its[0].ctx;
    const responses = its.slice().sort((a, b) => map[a.arm] < map[b.arm] ? -1 : 1).map((it) => {
      const blindId = map[it.arm];
      const st = statsView(it, it.validation, it.metrics);
      key.perItem.push({ fixture: fid, blindId, ...st, arm: it.arm, critiqueCount: (it.doc.critique || []).length });
      return {
        blindId,
        promptHash: it.prompt ? it.prompt.hash : null,
        sections: sectionView(it.doc, input.name),
        stats: st,
        cautions: (it.doc.cautions || []).map((c) => maskText(c.text || c, input.name))
      };
    });
    return {
      fixture: fid,
      input: inputView(ctx),
      chart: chartView(ctx),
      analysisData: ctx.analysis,
      period: { asOf: ctx.period.asOf, seun: ctx.period.seun, daewoon: ctx.period.daewoon },
      responses
    };
  });

  const pkg = {
    version: 'blind-package/1.0',
    runId: input.runId,
    createdAt: input.createdAt,
    instructions: [
      '다섯 응답은 모두 같은 모델·같은 설정으로 생성됐고, 입력과 프롬프트만 다르다.',
      '각 응답은 Model-1~Model-5 로 익명화되어 있다. 실험군 대응표는 blind-key.json 에 있다.',
      '8개 섹션을 읽고, 각 응답에 대해 (1) 근거 정합 (2) 상충 설명 (3) 개인화 (4) 톤 을 1~5로 채점한다.',
      '어느 응답이 규칙 기반인지, 어느 것이 지식베이스를 받았는지 추측하지 않는다.'
    ],
    fixtures
  };

  const md = renderPackageMd(pkg);
  const promptsMd = renderPromptsMd(input, key);
  const critiqueMd = renderCritiqueMd(input, key);
  return { key, pkg, md, promptsMd, critiqueMd, map };
}

function renderPackageMd(pkg) {
  const L = [];
  L.push('# 블라인드 평가 패키지 — run ' + pkg.runId);
  L.push('');
  L.push('> ' + pkg.instructions.join('\n> '));
  L.push('');
  L.push('- 생성: ' + pkg.createdAt);
  L.push('- 픽스처 ' + pkg.fixtures.length + '건 · 응답 ' + pkg.fixtures.reduce((s, f) => s + f.responses.length, 0) + '건');
  L.push('- 이름은 `{name}` 로 마스킹했다. 연·월·일·시는 픽스처 원본 입력이다(내부 검토 전용, 외부 공유 금지).');
  L.push('');
  pkg.fixtures.forEach((f) => {
    L.push('---');
    L.push('');
    L.push('## 픽스처 ' + f.fixture);
    L.push('');
    L.push('- 입력: ' + f.input.birth.year + '-' + f.input.birth.month + '-' + f.input.birth.day + ' · ' +
      f.input.birth.calendar + ' · 시 ' + (f.input.birth.hourIdx == null ? '미상' : f.input.birth.hourIdx + '번째') + ' · ' + f.input.birth.gender);
    L.push('- 사주명식: ' + ['year', 'month', 'day', 'hour'].filter((k) => f.chart.pillars[k]).map((k) => f.chart.pillars[k].ganzhi).join(' ') +
      ' · 일간 ' + f.chart.dayMaster);
    L.push('');
    L.push('<details><summary>analysisData (펼치기)</summary>');
    L.push('');
    L.push('```json');
    L.push(JSON.stringify(f.analysisData, null, 1));
    L.push('```');
    L.push('');
    L.push('</details>');
    L.push('');
    f.responses.forEach((r) => {
      L.push('### ' + r.blindId);
      L.push('');
      L.push('- 프롬프트 해시: `' + (r.promptHash || '') + '` · 토큰 입/출 ' + r.stats.tokens.input + '/' + r.stats.tokens.output +
        (r.stats.tokens.estimated ? '(추정)' : '') + ' · 비용 ' + formatUsd(r.stats.costUsd) + ' (' + formatKrw(r.stats.costKrw) + ')' +
        ' · 응답 ' + r.stats.latencyMs + 'ms · 재시도 ' + r.stats.retries + '회');
      L.push('- 검증 위반 ' + r.stats.validation.violations + '건 ' + (Object.keys(r.stats.validation.byRule).length ? '(' + JSON.stringify(r.stats.validation.byRule) + ')' : ''));
      L.push('');
      r.sections.forEach((s) => {
        const meta = SECTIONS.filter((x) => x.id === s.id)[0];
        L.push('**§' + s.id + ' ' + (meta ? meta.title : s.title) + '**' + (s.status === 'unavailable' ? ' — _비움: ' + (s.reason || '') + '_' : ''));
        s.paragraphs.forEach((p) => {
          L.push('');
          L.push(p.text);
          const refs = [].concat(p.refs.evidence, p.refs.findings, p.refs.kb.map((k) => 'kb:' + k));
          L.push('');
          L.push('`근거: ' + (refs.join(', ') || '없음') + '`');
        });
        L.push('');
      });
    });
  });
  return L.join('\n');
}

function renderPromptsMd(input, key) {
  const L = [];
  L.push('# 프롬프트 전문 (비밀 — 평가 후 공개)');
  L.push('');
  L.push('| 라벨 | 실험군 | 모델 | 프롬프트 버전 | 해시 | 설정 |');
  L.push('|---|---|---|---|---|---|');
  Object.keys(key.mapping).forEach((k) => {
    const m = key.mapping[k];
    L.push('| ' + k + ' | ' + m.arm + ' | ' + (m.model || '—') + ' | ' + (m.promptVersion || '—') + ' | `' + (m.promptHash || '') + '` | ' + JSON.stringify(m.settings) + ' |');
  });
  L.push('');
  const seen = {};
  input.items.forEach((it) => {
    if (seen[it.arm] || !it.prompt) return;
    seen[it.arm] = true;
    L.push('---');
    L.push('');
    L.push('## 실험군 ' + it.arm + ' — 시스템 프롬프트 (`' + it.prompt.systemHash + '`)');
    L.push('');
    L.push('```text');
    L.push(it.prompt.system);
    L.push('```');
    L.push('');
    L.push('## 실험군 ' + it.arm + ' — 사용자 프롬프트 예시 (픽스처 ' + it.ctx.fixture.id + ', `' + it.prompt.hash + '`)');
    L.push('');
    L.push('> 픽스처마다 chartBasics·analysisData·evidenceRefs 값만 바뀌고 구조는 같다.');
    L.push('');
    L.push('```json');
    L.push(it.prompt.user);
    L.push('```');
    L.push('');
  });
  return L.join('\n');
}

/* E 의 비평 기록 — '비평이 있다'는 것 자체가 E 를 가리키므로 블라인드 패키지 밖에 둔다. */
function renderCritiqueMd(input, key) {
  const L = [];
  L.push('# 비평 기록 (비밀 — 평가 후 공개)');
  L.push('');
  L.push('E 의 초안 비평은 그 응답이 E 라는 것을 드러내므로 블라인드 패키지에서 뺐다. 평가가 끝난 뒤 여기서 확인한다.');
  L.push('');
  input.items.filter((it) => it.doc && it.doc.critique && it.doc.critique.length).forEach((it) => {
    L.push('## ' + it.ctx.fixture.id + ' — ' + key.mapping[it.arm]);
    L.push('');
    it.doc.critique.forEach((c) => L.push('- [' + c.dimension + '] ' + c.where + ' — ' + c.issue + ' → ' + c.fix));
    L.push('');
  });
  return L.join('\n');
}

export function writeBlind(outDir, built) {
  const dir = resolve(outDir, 'blind');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'blind-package.md'), built.md, 'utf8');
  writeFileSync(resolve(dir, 'blind-package.json'), JSON.stringify(built.pkg, null, 1), 'utf8');
  writeFileSync(resolve(dir, 'blind-key.json'), JSON.stringify(built.key, null, 1), 'utf8');
  writeFileSync(resolve(dir, 'prompts.md'), built.promptsMd, 'utf8');
  if (built.critiqueMd) writeFileSync(resolve(dir, 'critique.md'), built.critiqueMd, 'utf8');
  return dir;
}
