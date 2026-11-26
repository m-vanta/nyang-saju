/* ==========================================================================
   lib/blind-export.mjs — 블라인드 평가 자료 3종 분리 (리뷰 P1-1)
   --------------------------------------------------------------------------
   평가 자료를 **세 종류**로 나눈다. 한 파일에 다 담으면 평가자가 실험군·비용·
   자동 점수를 보고 판단이 흔들리고, 반대로 고객용에 근거가 남으면 '근거가 많다 =
   좋은 해석'으로 읽힌다.

     1. blind-customer.md/.json   고객 평가용 — 해석 전문만. 실험군·비용·자동 점수·
                                  근거 ID·모델명·명식·토큰 전부 숨김.
                                  사례(QA01 등)마다 **표시 순서를 무작위로** 바꾼다.
     2. blind-myeongri.md/.json   명리학 검토용 — 명식·입력·해석 전문 + 실제 근거
                                  (evidenceRefs 와 그 사실 값) + 규칙/지식베이스 출처.
                                  실험군명·모델명·비용은 숨김.
     3. tech-eval.md/.json        기술 평가용 — 실험군·요청/응답 모델·토큰·비용·지연·
                                  재시도·실패·검증 기록.

     blind-key.json               ★ 비밀 — 표시 id ↔ 실험군 대응표(사례별 순서 포함)
     prompts.md / critique.md     ★ 비밀 — 프롬프트 전문 / E 의 비평 기록

   순서는 결정적 시드(hash(seed + 사례 id))로 섞는다. 같은 run 을 다시 만들어도
   같은 순서가 나오고, 사례마다 순서는 달라진다.
   ========================================================================== */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { SECTIONS, flattenSections } from './schema.mjs';
import { formatUsd, formatKrw } from './cost.mjs';
import { getEntry } from './knowledge-base.mjs';
import { GROUP_KO, PILLAR_KO } from './facts.mjs';

function hash(str) {
  let h = 2166136261;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

export const BLIND_SEED = 'nyang-saju/exp-ai-engine/2';

/* 이름 마스킹 — 평가 패키지에는 실명을 넣지 않는다 */
export function maskText(text, name) {
  const nm = name || '민지';
  return String(text || '').split(nm).join('{name}');
}

/* 사례마다 다른 순서 — 같은 실험군이라도 사례가 바뀌면 자리가 바뀐다 */
export function displayOrder(arms, fixtureId, seed) {
  const key = (seed || BLIND_SEED) + '|' + fixtureId;
  return arms.slice().sort((a, b) => {
    const ha = hash(key + '|' + a) % 9973;
    const hb = hash(key + '|' + b) % 9973;
    if (ha !== hb) return ha - hb;
    return a < b ? -1 : 1;
  });
}

function sectionTexts(doc, name) {
  return flattenSections(doc).map((s) => ({
    id: s.id,
    title: s.title,
    status: s.status,
    reason: s.status === 'unavailable' ? maskText(s.reason || '', name) : null,
    paragraphs: (s.paragraphs || []).map((p) => maskText(p.text, name))
  }));
}

function refValue(pool, ref) {
  if (!pool) return null;
  const e = pool.get(ref);
  return e ? e.value : null;
}

function factsOfParagraph(p, pool, name) {
  const evidence = (p.evidenceRefs || []).map((ref) => ({
    ref, value: refValue(pool, ref)
  }));
  const findings = (p.findingRefs || []).map((ref) => ({ ref, value: refValue(pool, ref) }));
  const kb = (p.kbRefs || []).map((id) => {
    const entry = getEntry(String(id).replace(/^kb\./, ''));
    if (!entry) return { id, missing: true };
    return {
      id: entry.id,
      title: entry.title,
      status: entry.status,
      statement: entry.statement,
      source: entry.source ? { book: entry.source.book, chapter: entry.source.chapter, quote: entry.source.quote, url: entry.source.url } : null,
      guard: entry.guard || null
    };
  });
  return { evidence, findings, kb };
}

function myeongriSections(doc, pool, name) {
  return flattenSections(doc).map((s) => ({
    id: s.id,
    title: s.title,
    status: s.status,
    reason: s.status === 'unavailable' ? maskText(s.reason || '', name) : null,
    paragraphs: (s.paragraphs || []).map((p) => ({
      text: maskText(p.text, name),
      facts: factsOfParagraph(p, pool, name)
    }))
  }));
}

function inputView(ctx) {
  const f = ctx.fixture || {};
  const b = f.birth || f.input || {};
  return {
    case: f.id || null,
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
      position: PILLAR_KO[k],
      ganzhi: p.hanja, ko: p.ko,
      stemTenGod: p.ten.stem, branchTenGod: p.ten.branch, stage: p.stage,
      hidden: p.hidden.map((h) => h.hanja + '(' + h.elem + '·' + h.ten + ')')
    };
  });
  out.elementCounts = c.counts;
  out.elementShare = c.share;
  out.tenGodSurface = c.tenCount;
  const surfaceGroups = { peer: 0, output: 0, wealth: 0, power: 0, resource: 0 };
  const groupOfGod = { 비견: 'peer', 겁재: 'peer', 식신: 'output', 상관: 'output', 편재: 'wealth', 정재: 'wealth', 편관: 'power', 정관: 'power', 편인: 'resource', 정인: 'resource' };
  Object.keys(c.tenCount || {}).forEach((g) => { const grp = groupOfGod[g]; if (grp) surfaceGroups[grp] += c.tenCount[g] || 0; });
  out.tenGodGroups = {
    surface: surfaceGroups,
    hiddenAll: ctx.analysis ? ctx.analysis.tenGodFacts.groupsByHiddenAll : null,
    note: '묶음 이름: ' + Object.keys(GROUP_KO).map((k) => k + '=' + GROUP_KO[k]).join(' · ')
  };
  return out;
}

function statsOf(item) {
  const records = item.records || [];
  const noCalls = records.length === 0;
  const tokensIn = records.reduce((s, r) => s + (r.usage ? r.usage.input_tokens : 0), 0);
  const tokensOut = records.reduce((s, r) => s + (r.usage ? r.usage.output_tokens : 0), 0);
  const knownRecords = records.filter((r) => r.pricingKnown && r.usd !== null && r.usd !== undefined);
  const usd = knownRecords.reduce((s, r) => s + r.usd, 0);
  const unknownPricing = records.some((r) => !r.pricingKnown);
  return {
    noCalls,
    tokens: { input: tokensIn, output: tokensOut, estimated: records.some((r) => r.estimated) },
    costUsd: unknownPricing ? null : Math.round(usd * 1e6) / 1e6,
    costKrw: unknownPricing ? null : Math.round(usd * 1390),
    costStatus: unknownPricing ? 'unknown_pricing' : 'priced',
    latencyMs: records.reduce((s, r) => s + (r.ms || 0), 0),
    attempts: item.attempts || records.length,
    retries: Math.max(0, (item.attempts || records.length) - 1),
    truncated: records.some((r) => r.truncated),
    errors: records.filter((r) => r.errorType).map((r) => r.errorType)
  };
}

/* ---------------- 렌더 ---------------- */
function renderCustomerMd(pkg) {
  const L = [];
  L.push('# 고객 평가용 — 해석 전문');
  L.push('');
  L.push('> ' + pkg.instructions.join('\n> '));
  L.push('');
  L.push('- run ' + pkg.runId + ' · 사례 ' + pkg.cases.length + '건 · 응답 ' + pkg.cases.reduce((s, c) => s + c.responses.length, 0) + '건');
  L.push('- 응답 순서는 사례마다 다르다. 같은 번호라도 다른 사례의 같은 엔진이 아니다.');
  L.push('');
  pkg.cases.forEach((c) => {
    L.push('---');
    L.push('');
    L.push('## 사례 ' + c.case);
    L.push('');
    c.responses.forEach((r) => {
      L.push('### ' + r.id);
      L.push('');
      r.sections.forEach((s) => {
        const meta = SECTIONS.filter((x) => x.id === s.id)[0];
        L.push('**§' + s.id + ' ' + (meta ? meta.title : s.title) + '**' + (s.status === 'unavailable' ? ' — _비움: ' + (s.reason || '') + '_' : ''));
        s.paragraphs.forEach((t) => { L.push(''); L.push(t); });
        L.push('');
      });
    });
  });
  return L.join('\n');
}

function renderMyeongriMd(pkg) {
  const L = [];
  L.push('# 명리학 검토용 — 명식·해석 전문·근거·출처');
  L.push('');
  L.push('> 해석의 명리학적 타당성을 검토하는 자료다. 실험군·모델·비용은 들어 있지 않다.');
  L.push('> 각 문단 아래에 그 문단이 인용한 사실 값과, 인용한 지식베이스 항목(표기·출처)을 붙였다.');
  L.push('> 자동 검증이 통과했다는 사실은 해석 품질의 보증이 아니다 — 문장 자체를 검토해 달라.');
  L.push('');
  pkg.cases.forEach((c) => {
    L.push('---');
    L.push('');
    L.push('## 사례 ' + c.case);
    L.push('');
    L.push('- 입력: ' + c.input.birth.year + '-' + c.input.birth.month + '-' + c.input.birth.day + ' · ' + c.input.birth.calendar +
      (c.input.birth.isLeap ? '(윤달)' : '') + ' · 시 ' + (c.input.birth.hourIdx == null ? '미상' : c.input.birth.hourIdx + '번째') +
      ' · ' + c.input.birth.gender + ' · 관심 ' + (c.input.birth.focus || '—'));
    L.push('- 사주명식: ' + ['year', 'month', 'day', 'hour'].filter((k) => c.chart.pillars[k]).map((k) => c.chart.pillars[k].ganzhi).join(' ') +
      ' · 일간 ' + c.chart.dayMaster);
    L.push('');
    L.push('| 기둥 | 간지 | 천간(십성) | 지지(십성) | 12운성 | 지장간 |');
    L.push('|---|---|---|---|---|---|');
    ['year', 'month', 'day', 'hour'].forEach((k) => {
      const p = c.chart.pillars[k];
      if (!p) { L.push('| ' + PILLAR_KO[k] + ' | — | — | — | — | — |'); return; }
      L.push('| ' + p.position + ' | ' + p.ganzhi + '(' + p.ko + ') | ' + p.stemTenGod + ' | ' + p.branchTenGod + ' | ' + p.stage + ' | ' + p.hidden.join(' · ') + ' |');
    });
    L.push('');
    c.responses.forEach((r) => {
      L.push('### ' + r.id);
      L.push('');
      r.sections.forEach((s) => {
        const meta = SECTIONS.filter((x) => x.id === s.id)[0];
        L.push('**§' + s.id + ' ' + (meta ? meta.title : s.title) + '**' + (s.status === 'unavailable' ? ' — _비움: ' + (s.reason || '') + '_' : ''));
        s.paragraphs.forEach((p) => {
          L.push('');
          L.push(p.text);
          const facts = [].concat(
            p.facts.evidence.map((e) => e.ref + ' = ' + JSON.stringify(e.value)),
            p.facts.findings.map((e) => e.ref + ' = ' + JSON.stringify(e.value))
          );
          if (facts.length) L.push('`사실: ' + facts.join(' · ') + '`');
          p.facts.kb.forEach((k) => {
            if (k.missing) { L.push('`KB: ' + k.id + ' (없는 항목)`'); return; }
            const src = k.source ? ' · ' + k.source.book + (k.source.chapter ? ' ' + k.source.chapter : '') + (k.source.quote ? ' 「' + k.source.quote + '」' : '') : '';
            L.push('`KB: ' + k.id + ' [' + k.status + '] ' + k.title + src + '`');
          });
        });
        L.push('');
      });
    });
  });
  return L.join('\n');
}

function renderTechMd(pkg) {
  const L = [];
  L.push('# 기술 평가용 — 실험군·모델·비용·지연·검증');
  L.push('');
  L.push('> 이 파일에는 실험군 이름과 모델명이 들어 있다. 고객·명리 평가에는 주지 않는다.');
  L.push('');
  L.push('## 실험군');
  L.push('');
  L.push('| 실험군 | 엔진 | 요청 모델 | 응답 모델 | 프롬프트 | 입력 경계 |');
  L.push('|---|---|---|---|---|---|');
  pkg.arms.forEach((a) => {
    L.push('| ' + a.arm + ' | ' + (a.engine || '—') + ' | ' + (a.modelRequested || '—') + ' | ' + (a.modelResponse || '—') + ' | ' +
      (a.promptVersion || '—') + ' `' + (a.promptHash || '') + '` | ' + (a.inputBoundary || '—') + ' |');
  });
  L.push('');
  L.push('## 실행 기록');
  L.push('');
  L.push('| 사례 | 실험군 | 응답 ID | 토큰 입/출 | 비용 | 지연 | 시도 | 잘림 | 오류 | 구조 위반 | 내용 위반 |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  pkg.rows.forEach((r) => {
    L.push('| ' + r.case + ' | ' + r.arm + ' | ' + r.id + ' | ' + (r.noCalls ? '— (모델 호출 없음)' : r.tokens.input + '/' + r.tokens.output + (r.tokens.estimated ? '(추정)' : '')) +
      ' | ' + (r.noCalls ? '—' : (r.costStatus === 'unknown_pricing' ? '미상(단가 미등록)' : formatUsd(r.costUsd) + ' (' + formatKrw(r.costKrw) + ')')) +
      ' | ' + r.latencyMs + 'ms | ' + r.attempts + ' | ' + (r.truncated ? '예' : '아니오') + ' | ' +
      (r.errors && r.errors.length ? r.errors.join(',') : '—') + ' | ' + (r.structuralViolations == null ? '—' : r.structuralViolations) +
      ' | ' + (r.contentViolations == null ? '—' : r.contentViolations) + ' |');
  });
  L.push('');
  L.push('## 비용 합계');
  L.push('');
  L.push('- 계산된 비용: ' + formatUsd(pkg.cost.totalUsdKnown) + ' · 단가 미등록 호출: ' + pkg.cost.unknownPricingCalls + '건' +
    (pkg.cost.unknownPricingCalls ? ' (합계 미상 — 0원으로 보고하지 않음)' : ''));
  if (pkg.preflight) {
    L.push('- 호출 전 최대 예상 비용(추정): ' + (pkg.preflight.usd == null ? '계산 불가(단가 미등록)' : formatUsd(pkg.preflight.usd)) +
      ' · 예산 상한: ' + (pkg.preflight.maxUsd ? formatUsd(pkg.preflight.maxUsd) : '없음'));
  }
  L.push('');
  L.push('## 정직한 한계');
  L.push('- 자동 검증은 근거 ID의 실재·범위와 결정적으로 잡히는 사실 오류만 본다.');
  L.push('- 구조·내용 검증을 통과해도 명리학적 해석 품질을 보증하지 않는다.');
  return L.join('\n');
}

/**
 * @param {object} input { runId, createdAt, items, seed, name, cost, preflight }
 * items: [{ctx, arm, doc, validation, metrics, attempts, records, prompt, settings, model, responseModel, engine, label, inputBoundary, pool}]
 */
export function buildBlind(input) {
  const items = input.items || [];
  const seed = input.seed || BLIND_SEED;
  const arms = [];
  items.forEach((it) => { if (arms.indexOf(it.arm) < 0) arms.push(it.arm); });
  arms.sort();

  const fixtureIds = [];
  items.forEach((it) => { if (fixtureIds.indexOf(it.ctx.fixture.id) < 0) fixtureIds.push(it.ctx.fixture.id); });

  const key = {
    version: 'blind-key/2.0',
    runId: input.runId,
    createdAt: input.createdAt,
    seed,
    warning: '이 파일은 비밀이다. 평가가 끝나기 전에 평가자에게 주지 않는다.',
    arms: {},
    displayOrder: {},
    perItem: []
  };

  arms.forEach((arm) => {
    const sample = items.filter((it) => it.arm === arm)[0];
    key.arms[arm] = {
      engine: sample && sample.engine,
      label: sample && sample.label,
      modelRequested: sample && sample.model,
      modelResponse: sample && sample.responseModel,
      promptVersion: sample && sample.prompt && sample.prompt.promptVersion,
      promptHash: sample && sample.prompt && sample.prompt.hash,
      settings: (sample && sample.settings) || { temperature: 0, maxTokens: null },
      inputBoundary: sample && sample.inputBoundary,
      contentOrigin: sample && sample.contentOrigin ? sample.contentOrigin : null
    };
  });

  const cases = fixtureIds.map((fid) => {
    const its = items.filter((it) => it.ctx.fixture.id === fid);
    const ctx = its[0].ctx;
    const order = displayOrder(its.map((it) => it.arm), fid, seed);
    key.displayOrder[fid] = order.map((arm, i) => ({ id: fid + '-' + (i + 1), arm }));

    const responses = order.map((arm, i) => {
      const it = its.filter((x) => x.arm === arm)[0];
      const id = fid + '-' + (i + 1);
      const st = statsOf(it);
      key.perItem.push(Object.assign({ case: fid, id, arm }, st));
      return { it, id, stats: st };
    });

    return {
      case: fid,
      input: inputView(ctx),
      chart: chartView(ctx),
      period: ctx.period ? { asOf: ctx.period.asOf, seun: ctx.period.seun, daewoon: ctx.period.daewoon } : null,
      responses
    };
  });

  /* 1) 고객 평가용 */
  const customer = {
    version: 'blind-customer/1.0',
    runId: input.runId,
    createdAt: input.createdAt,
    instructions: [
      '아래 사례마다 여러 개의 해석이 있다. 어느 것이 어떤 방식으로 쓰였는지는 알려 주지 않는다.',
      '읽고 (1) 내 이야기처럼 느껴지는가 (2) 근거 없이 일반론으로 흐르지 않는가 (3) 말투와 수위가 괜찮은가를 1~5로 채점한다.',
      '응답 번호는 사례마다 순서가 다르다. 같은 번호라도 다른 사례의 같은 방식이 아니다.',
      '다른 사례의 응답과 비교해 순위를 매겨도 된다.'
    ],
    cases: cases.map((c) => ({
      case: c.case,
      responses: c.responses.map((r) => ({ id: r.id, sections: sectionTexts(r.it.doc, input.name) }))
    }))
  };

  /* 2) 명리학 검토용 */
  const myeongri = {
    version: 'blind-myeongri/1.0',
    runId: input.runId,
    createdAt: input.createdAt,
    instructions: [
      '명식과 해석 전문, 문단이 인용한 사실 값과 지식베이스 출처를 함께 실었다.',
      '문단마다 (1) 인용한 사실이 문장을 뒷받침하는가 (2) 명리 개념을 바르게 썼는가 (3) 상충·조건을 제대로 다뤘는가를 본다.',
      '자동 검증 통과는 해석 품질의 보증이 아니다.'
    ],
    cases: cases.map((c) => ({
      case: c.case,
      input: c.input,
      chart: c.chart,
      period: c.period,
      responses: c.responses.map((r) => ({ id: r.id, sections: myeongriSections(r.it.doc, r.it.pool, input.name) }))
    }))
  };

  /* 3) 기술 평가용 */
  const tech = {
    version: 'tech-eval/1.0',
    runId: input.runId,
    createdAt: input.createdAt,
    arms: arms.map((arm) => Object.assign({ arm }, key.arms[arm])),
    preflight: input.preflight || null,
    cost: input.cost || { totalUsdKnown: 0, unknownPricingCalls: 0 },
    rows: [].concat.apply([], cases.map((c) => c.responses.map((r) => {
      const v = r.it.validation;
      const checks = v && v.checks ? v.checks : null;
      return Object.assign({
        case: c.case,
        arm: r.it.arm,
        id: r.id,
        modelRequested: r.it.model,
        modelResponse: r.it.responseModel,
        structuralViolations: checks ? checks.structural.violations.length : null,
        contentViolations: checks ? checks.content.violations.length : null,
        ok: r.it.ok
      }, r.stats);
    }))),
    notes: [
      '자동 검증은 근거 ID의 실재·범위와 결정적으로 잡히는 사실 오류만 본다. 해석 품질을 보증하지 않는다.',
      '단가 미등록 모델의 비용은 0원이 아니라 미상(null)으로 기록된다.'
    ]
  };

  /* 4) 프롬프트·비평 (비밀) */
  const promptsMd = renderPromptsMd(items, key);
  const critiqueMd = renderCritiqueMd(items, key);

  return {
    key, customer, myeongri, tech, promptsMd, critiqueMd,
    md: {
      customer: renderCustomerMd(customer),
      myeongri: renderMyeongriMd(myeongri),
      tech: renderTechMd(tech)
    }
  };
}

function renderPromptsMd(items, key) {
  const L = [];
  L.push('# 프롬프트 전문 (비밀 — 평가 후 공개)');
  L.push('');
  L.push('| 실험군 | 엔진 | 모델 | 프롬프트 버전 | 해시 | 설정 |');
  L.push('|---|---|---|---|---|---|');
  Object.keys(key.arms).forEach((k) => {
    const m = key.arms[k];
    L.push('| ' + k + ' | ' + (m.engine || '—') + ' | ' + (m.modelRequested || '—') + ' | ' + (m.promptVersion || '—') + ' | `' + (m.promptHash || '') + '` | ' + JSON.stringify(m.settings) + ' |');
  });
  L.push('');
  const seen = {};
  items.forEach((it) => {
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

/* E 의 비평 기록 — '비평이 있다'는 것 자체가 E 를 가리키므로 블라인드 밖에 둔다. */
function renderCritiqueMd(items, key) {
  const L = [];
  L.push('# 비평 기록 (비밀 — 평가 후 공개)');
  L.push('');
  L.push('E 의 초안 비평은 그 응답이 E 라는 것을 드러내므로 고객·명리 패키지에서 뺐다. 평가가 끝난 뒤 여기서 확인한다.');
  L.push('');
  items.filter((it) => it.doc && it.doc.critique && it.doc.critique.length).forEach((it) => {
    L.push('## ' + it.ctx.fixture.id + ' — 실험군 ' + it.arm);
    L.push('');
    it.doc.critique.forEach((c) => L.push('- [' + c.dimension + '] ' + c.where + ' — ' + c.issue + ' → ' + c.fix));
    L.push('');
  });
  return L.join('\n');
}

export function writeBlind(outDir, built) {
  const dir = resolve(outDir, 'blind');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'blind-customer.md'), built.md.customer, 'utf8');
  writeFileSync(resolve(dir, 'blind-customer.json'), JSON.stringify(built.customer, null, 1), 'utf8');
  writeFileSync(resolve(dir, 'blind-myeongri.md'), built.md.myeongri, 'utf8');
  writeFileSync(resolve(dir, 'blind-myeongri.json'), JSON.stringify(built.myeongri, null, 1), 'utf8');
  writeFileSync(resolve(dir, 'tech-eval.md'), built.md.tech, 'utf8');
  writeFileSync(resolve(dir, 'tech-eval.json'), JSON.stringify(built.tech, null, 1), 'utf8');
  writeFileSync(resolve(dir, 'blind-key.json'), JSON.stringify(built.key, null, 1), 'utf8');
  writeFileSync(resolve(dir, 'prompts.md'), built.promptsMd, 'utf8');
  if (built.critiqueMd) writeFileSync(resolve(dir, 'critique.md'), built.critiqueMd, 'utf8');
  return dir;
}
