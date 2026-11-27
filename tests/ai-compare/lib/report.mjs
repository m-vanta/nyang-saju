/* ==========================================================================
   lib/report.mjs — score.json · report.md
   --------------------------------------------------------------------------
   리포트는 '무엇이 자동으로 검증됐고 무엇이 아닌지'를 먼저 말한다(리뷰 P0-2-2).
   자동 검증(구조·참조 + 결정적 내용 검사)은 명리학적 해석 품질을 보증하지 않는다.
   ========================================================================== */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatUsd, formatKrw, COST_ESTIMATE_DISCLAIMER } from './cost.mjs';
import { gateOf, GATE_EXEMPT } from './gates.mjs';
import { successStage } from './metrics.mjs';

const pct = (n) => (n === null || n === undefined ? '—' : (n * 100).toFixed(1) + '%');
const num = (n) => (n === null || n === undefined ? '—' : (Math.round(n * 1000) / 1000).toString());

export function buildScore(run) {
  return {
    runId: run.runId,
    mode: run.mode,
    set: run.set,
    model: run.model,
    createdAt: run.createdAt,
    gate: run.gateDef,
    safety: run.safety || null,
    engines: run.agg,
    /* 실험군별 성공률·실패율 — 모수는 요청 건수(스킵·실패 포함) */
    successByArm: Object.keys(run.agg || {}).reduce((o, k) => {
      const m = run.agg[k] || {};
      o[k] = {
        requestedCount: m.requestedCount || 0,
        attemptedCount: m.attemptedCount || 0,
        notAttemptedCount: m.notAttemptedCount || 0,
        firstAttemptSuccess: m.firstAttemptSuccess || 0,
        firstAttemptSuccessRate: m.firstAttemptSuccessRate == null ? null : m.firstAttemptSuccessRate,
        retriedSuccess: m.retriedSuccess || 0,
        finalSuccess: m.finalSuccess || 0,
        afterRetrySuccessRate: m.afterRetrySuccessRate == null ? null : m.afterRetrySuccessRate,
        finalFailure: m.finalFailure || 0,
        finalFailureRate: m.finalFailureRate == null ? null : m.finalFailureRate,
        qualityItems: m.qualityItems || 0,
        qualityExcluded: m.qualityExcluded || 0
      };
      return o;
    }, {}),
    cost: run.costSummary,
    costDisclaimer: COST_ESTIMATE_DISCLAIMER,
    budget: run.budget,
    preflight: run.preflight || null,
    fixtures: run.rows.map((r) => {
      const stage = successStage(r);
      return {
        id: r.fixture.id,
        arm: r.arm,
        skipped: r.skipped || null,
        stopped: r.stopped || null,
        errorType: r.error ? (r.error.errorType || null) : null,
        firstAttemptOk: stage.firstOk,
        finalOk: stage.finalOk,
        attempted: stage.attempted,
        metrics: r.metrics,
        attempts: r.attempts,
        ok: r.ok,
        modelRequested: r.model || null,
        modelResponse: r.responseModel || null,
        violations: r.validation ? r.validation.violations.map((v) => v.rule + ' ' + v.where + ' ' + v.detail) : [],
        structuralViolations: r.validation && r.validation.checks ? r.validation.checks.structural.violations.length : null,
        contentViolations: r.validation && r.validation.checks ? r.validation.checks.content.violations.length : null,
        warnings: r.validation ? r.validation.warnings.length : 0
      };
    }),
    probes: run.probes,
    selfTests: run.selfTests,
    determinism: run.determinism,
    pairs: run.pairs || [],
    kb: run.kbStats,
    blind: run.blindInfo,
    contentOrigin: run.contentOrigin || null,
    validationModel: {
      structural: 'V1·V2·V3·V13 — 근거 ID 실재·입력 범위·스키마',
      content: 'V4~V12·V14~V21 — 결정적으로 잡히는 사실·정합성 위반',
      notVerified: '명리학적 해석의 타당성·품질은 자동 검증이 보증하지 않는다(사람·모델 평가의 몫).',
      selfTests: '검증기 probe·하네스 자기시험·회귀 테스트 통과는 배선·안전장치 검증일 뿐 사주 해석 품질의 증거가 아니다.',
      successBasis: '성공률·실패율의 모수는 요청 건수(스킵·실패 포함)이고, 품질 지표의 모수는 문서가 나온 응답이다. 둘을 나란히 읽는다.'
    }
  };
}

export function writeReport(outDir, run) {
  mkdirSync(outDir, { recursive: true });
  const arms = Object.keys(run.agg);
  const L = [];
  L.push('# AI 종합 해석 실험 리포트 — run ' + run.runId);
  L.push('');
  L.push('- 모드: **' + run.mode + '**' + (run.mode === 'stub' ? ' (오프라인 · 네트워크 없음 · 응답은 결정적 스텁)' : ' (실호출)'));
  L.push('- 픽스처: ' + run.set + ' (' + run.fixtureCount + '건 × ' + arms.length + '실험군)');
  L.push('- 모델: ' + (run.model || '—') + ' · temperature 0');
  L.push('- judge: 결정적 근사(heuristic) — 모델 채점 아님');
  if (run.safety) {
    L.push('- 안전장치(적용값): 최대 호출 **' + (run.safety.maxCalls ? run.safety.maxCalls + '회' : '상한 없음') + '** · 최초 실험 재시도 **' + run.safety.maxRetries + '회**' +
      (run.safety.defaulted && run.safety.defaulted.length ? ' (파일럿 기본값 적용: ' + run.safety.defaulted.join(' · ') + ')' : '') +
      (run.safety.maxCostUsd ? ' · 비용 상한 ' + formatUsd(run.safety.maxCostUsd) : ''));
  }
  L.push('- **자동 검증의 경계**: 구조·참조 검증(근거 ID 실재·범위)과 결정적 내용 검증(사실 오류·금지 표현·상충)만 한다. **자동 통과는 명리학적 해석 품질을 보증하지 않는다.** 품질은 `blind-myeongri`·`blind-customer` 평가의 몫이다.');
  L.push('- **자기시험 통과의 뜻**: 아래 자기시험(검증기 probe ' + ((run.probes || []).length) + '건 + 하네스 ' + ((run.selfTests || []).length) + '건 = ' +
    (((run.probes || []).length) + ((run.selfTests || []).length)) + '건)과 회귀 테스트(122건) 통과는 **배선·검증기·안전장치가 동작한다는 증거**일 뿐, **사주 해석 품질의 증거가 아니다**. 품질은 실호출 응답을 블라인드 3종으로 평가해야 판단된다.');
  L.push('');
  L.push('## 실험군');
  L.push('');
  L.push('| 실험군 | 받는 입력 | 이 실험군으로 보는 것 |');
  L.push('|---|---|---|');
  L.push('| A | 명식 + analysisData + Finding(앱 카탈로그) | 현행 앱(규칙 문장)의 기준선 |');
  L.push('| B | 명식 기본표 + 대운·세운 | 모델 자체의 명리 지식만으로 어디까지 가는가 |');
  L.push('| C | + analysisData·대운·세운 | 사실을 다 줘도 지식베이스가 없으면 어떤가 |');
  L.push('| D | + 지식베이스 35항목 | 검증된 명리 문장을 주면 달라지는가 |');
  L.push('| E | D + D 초안 비평·재작성 | 자기 검토 한 번이 품질을 올리는가 |');
  L.push('');
  /* 성공률·실패율 — 모수는 요청 건수(스킵·실패 포함). 품질 지표보다 먼저 놓는다. */
  L.push('## 성공률·실패율 (모수 = 요청 건수)');
  L.push('');
  L.push('| 실험군 | 요청 | 시도 | 미시도(스킵) | 1차 성공 | 1차 성공률 | 재시도로 성공 | 재시도 후 성공률 | 최종 실패 | 최종 실패율 | 품질 평가 모수 |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  arms.forEach((k) => {
    const m = run.agg[k];
    if (!m || !m.requestedCount) {
      L.push('| ' + k + ' | 0 | — | — | — | — | — | — | — | — | — |');
      return;
    }
    L.push('| ' + k + ' | ' + m.requestedCount + ' | ' + m.attemptedCount + ' | ' + m.notAttemptedCount + ' | ' +
      m.firstAttemptSuccess + ' | ' + pct(m.firstAttemptSuccessRate) + ' | ' + m.retriedSuccess + ' | ' + pct(m.afterRetrySuccessRate) + ' | ' +
      m.finalFailure + ' | ' + pct(m.finalFailureRate) + ' | ' + m.qualityItems + '/' + m.requestedCount + ' |');
  });
  L.push('');
  L.push('- **1차 성공률** = 재시도 없이 1차 시도에서 파싱·유효성 검사를 모두 통과한 요청 / 요청 건수.');
  L.push('- **재시도 후 성공률** = 최종적으로 통과한 요청 / 요청 건수(= 1 - 최종 실패율). **최종 실패율** = 끝까지 통과하지 못한 요청 / 요청 건수.');
  L.push('- 미시도는 E(유효한 D 초안 없음)·예산/호출 상한으로 호출하지 않은 건이다. 미시도도 요청 모수에서 빼지 않고 실패로 센다.');
  L.push('- **실패한 응답은 지우지 않는다** — 응답이 왔으면 raw output·오류 사유·usage·비용이 `calls/`·`docs.json`·`cost.json`·`score.json` 에 그대로 남고, 아래 「실패·건너뜀 상세」에 모은다.');
  L.push('');
  L.push('## 품질 지표 (문서가 나온 응답만 평균 — 성공률·실패율과 항상 함께 본다)');
  L.push('');
  L.push('| 실험군 | 품질 모수 | 섹션(ok/비움) | EA-1 | EA-2 | CA | HZ | GA | SC | CR | GN | GN(구정의) | 구조 위반 | 내용 위반 | KB/문단 | judge | gate |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  arms.forEach((k) => {
    const m = run.agg[k];
    if (!m || !m.items) {
      L.push('| ' + k + ' | 0/' + ((m && m.requestedCount) || 0) + ' | 실행 없음(모든 요청 실패·스킵) | — | — | — | — | — | — | — | — | — | — | — | — | — |');
      return;
    }
    const g = gateOf(m);
    L.push('| ' + k + ' | ' + m.qualityItems + '/' + m.requestedCount + ' | ' + (m.sectionsOk || 0).toFixed(1) + ' / ' + (m.sectionsUnavailable || 0).toFixed(1) + ' | ' +
      pct(m.ea1) + ' | ' + pct(m.ea2) + ' | ' + (m.caHit + '/' + m.caTotal) + ' (' + pct(m.ca) + ') | ' +
      m.hz + ' | ' + m.ga + ' | ' + m.sc + ' | ' + pct(m.cr) + ' | ' + pct(m.gn) + ' | ' + pct(m.gnChartOnly) + ' | ' +
      (m.referenceViolations || 0) + ' | ' + (m.contentViolations || 0) + ' | ' + (m.kb || 0).toFixed(2) + ' | ' + num(m.judge) + ' | ' +
      (g.pass ? 'PASS' : 'FAIL — ' + g.fails.join(', ') + (GATE_EXEMPT[k] ? ' (설계상 예상)' : '')) + ' |');
  });
  L.push('');
  L.push('- 품질 모수가 요청 건수보다 작으면, 그 차이만큼은 품질 평균에 들어가지 않았다. 성공률·실패율과 함께 읽어야 한다 — **품질 우위는 실패를 뺀 표본만으로 판단하지 않는다.**');
  L.push('');
  L.push('지표 정의: EA-1 인용 유효율 · EA-2 문단 근거율 · CA 상충 설명률(양쪽 인용+조건) · HZ 간지·십성·합충 환각 · GA 금지 판정어·단정·민감 · SC 스키마 · CR 사실 모순률 · GN 일반론률(개인 사실 미인용) · GN(구정의) chart.* 만 인용한 문단 비율(참고값, 게이트 미적용) · 구조/내용 위반 = V1·V2·V3·V13 / 그 밖의 규칙 · KB/문단 지식베이스 인용 밀도');
  L.push('');
  L.push('- GN·judge 의 개인화 판정은 `chart.*`(명식 사실)도 개인 근거로 센다. `chart.*` 만 인용한 문단을 무조건 일반론으로 몰면 B 가 구조적으로 불리해지기 때문이다(리뷰 P0-1-3).');
  L.push('- 구조 위반과 내용 위반을 나눠 센다. 둘 다 결정적 규칙이며, 어느 쪽도 해석 품질의 보증이 아니다.');
  if (Object.keys(GATE_EXEMPT).length) {
    L.push('');
    Object.keys(GATE_EXEMPT).forEach((k) => L.push('- ' + k + ' 의 gate 실패는 설계상 예상이다 — ' + GATE_EXEMPT[k]));
  } else {
    L.push('');
    L.push('- gate 면제 실험군 없음 — 모든 실험군이 같은 기준으로 판정된다.');
  }
  L.push('');
  L.push('## 실험군별 해석');
  arms.forEach((k) => {
    const m = run.agg[k];
    if (!m || !m.requestedCount) { L.push('- **' + k + '**: 실행 없음(예산·호출 상한)'); return; }
    const bits = [];
    bits.push('요청 ' + m.requestedCount + '건 · 1차 성공 ' + m.firstAttemptSuccess + '건(' + pct(m.firstAttemptSuccessRate) + ') · 최종 실패 ' + m.finalFailure + '건(' + pct(m.finalFailureRate) + ')');
    bits.push('섹션 ' + (m.sectionsOk || 0).toFixed(1) + '개 작성');
    if (m.caTotal) bits.push('상충 의무 ' + m.caTotal + '건 중 ' + m.caHit + '건 충족');
    else bits.push('상충 의무 없음(또는 근거 없음)');
    if (m.hz) bits.push('환각 ' + m.hz);
    if (m.ga) bits.push('게이트 위반 ' + m.ga);
    if (m.failed) bits.push('검증 실패 ' + m.failed + '건');
    if (m.skipped) bits.push('건너뜀 ' + m.skipped + '건');
    L.push('- **' + k + '**: ' + bits.join(' · '));
  });
  L.push('');

  /* A 콘텐츠 출처 (리뷰 P0-1-4) */
  if (run.contentOrigin) {
    L.push('## A 실험군 콘텐츠 출처');
    L.push('');
    L.push('A 는 앱의 문장을 쓰지만, 8섹션 그릇에 담으면서 **앱 화면에 없는 문단을 실험이 만든 경우**가 있다. 그것을 숨기면 A 가 실제 서비스와 같은 것으로 읽히므로 여기서 구분한다.');
    L.push('');
    L.push('| 출처 | 섹션 | 문단 수 | 뜻 |');
    L.push('|---|---|---|---|');
    const defs = run.contentOrigin.definitions || {};
    Object.keys(run.contentOrigin.byParagraph || {}).forEach((origin) => {
      const secs = (run.contentOrigin.bySection && run.contentOrigin.bySection[origin]) || [];
      const sample = Object.keys(defs).map((k) => defs[k]).filter((d) => d.origin === origin)[0] || null;
      L.push('| ' + origin + ' | ' + (secs.join('·') || '—') + ' | ' + (run.contentOrigin.byParagraph[origin] || 0) + ' | ' + (sample ? sample.label : '—') + ' |');
    });
    L.push('');
    Object.keys(defs).forEach((id) => {
      if (defs[id].origin !== 'service') L.push('- §' + id + ' — ' + defs[id].label + ': ' + defs[id].note);
    });
    L.push('');
  }

  /* 비용·지연 */
  L.push('## 비용·지연');
  L.push('');
  if (run.preflight) {
    L.push('- 호출 전 최대 예상 비용(프롬프트 토큰 추정 + max_tokens 상한): ' +
      (run.preflight.usd == null ? '계산 불가(단가 미등록)' : formatUsd(run.preflight.usd)) +
      ' · 상한 ' + (run.preflight.maxUsd ? formatUsd(run.preflight.maxUsd) : '없음') +
      (run.preflight.blocked ? ' → **상한 초과로 실행 차단**' : ''));
  }
  L.push('');
  L.push('| 실험군 | 호출 | 입력 토큰 | 출력 토큰 | 비용(USD) | 비용(KRW) | p50 | p95 | 재시도 | 잘림 | 오류 |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  arms.forEach((k) => {
    const c = (run.costSummary.byArm || {})[k];
    if (!c) { L.push('| ' + k + ' | — | — | — | — | — | — | — | — | — | — |'); return; }
    L.push('| ' + k + ' | ' + c.calls + ' | ' + c.inputTokens + ' | ' + c.outputTokens + ' | ' + (c.usd === null ? '미상(' + c.unknownPricing + '건)' : formatUsd(c.usd)) + ' | ' +
      (c.krw === null ? '미상' : formatKrw(c.krw)) + ' | ' + c.p50ms + 'ms | ' + c.p95ms + 'ms | ' + c.retries + ' | ' + (c.truncated || 0) + ' | ' + (c.errors || 0) + ' |');
  });
  L.push('');
  L.push('- 합계 ' + (run.costSummary.totalUsd === null ? '미상(' + run.costSummary.unknownPricingCalls + '건 단가 미등록) · 계산된 것만 ' + formatUsd(run.costSummary.totalUsdKnown) : formatUsd(run.costSummary.totalUsd) + ' (' + formatKrw(run.costSummary.totalKrw) + ')') +
    (run.costSummary.estimated ? ' — **stub 추정치**(글자 수 기반). 청구액이 아니다.' : ' — 실호출 usage 기준'));
  L.push('- 단가 미등록 모델은 0원으로 합산하지 않는다(리뷰 P0-3-3). `pricingKnown:false` · `costStatus:"unknown_pricing"` 로 기록된다.');
  L.push('- ' + COST_ESTIMATE_DISCLAIMER);
  L.push('');

  /* 비교쌍 */
  if (run.pairs && run.pairs.length) {
    L.push('## 비교쌍 (전체 실험 필수)');
    L.push('');
    run.pairs.forEach((p) => {
      L.push('### ' + p.id + ' ' + p.axis + ' — ' + (p.present ? (p.ok ? '✅ 확인' : '❌ 조건 불일치') : '— 이번 세트에 없음'));
      L.push('');
      L.push('- 질문: ' + p.question);
      L.push('');
      L.push('| 픽스처 | 입력 | 시주 | 명식 | 일간 |');
      L.push('|---|---|---|---|---|');
      p.rows.forEach((r) => {
        if (r.missing) { L.push('| ' + r.id + ' | (없음) | — | — | — |'); return; }
        L.push('| ' + r.id + ' | ' + r.birth + ' ' + r.calendar + ' | ' + (r.hourKnown ? '있음' : '미상') + ' | ' + r.chart + ' | ' + r.dayMaster + ' |');
      });
      L.push('');
      L.push('- 확인: ' + (Object.keys(p.checks).length ? Object.keys(p.checks).map((k) => k + '=' + (p.checks[k] ? 'O' : 'X')).join(' · ') : '이번 세트에 없어 확인하지 않음'));
      L.push('');
      /* 쌍의 출력 비교 — 같은 명식이면 문서 동일 여부, 다르면 문단·섹션 수 차이 */
      if (p.present) {
        const rowOf = (fid, arm) => run.rows.filter((r) => r.fixture.id === fid && r.arm === arm)[0];
        const armsHere = Array.from(new Set(run.rows.filter((r) => p.fixtures.indexOf(r.fixture.id) >= 0).map((r) => r.arm))).sort();
        const sameChart = p.checks.sameChart === true;
        L.push('| 실험군 | ' + p.fixtures.map((f) => f + ' 문단/섹션').join(' | ') + ' | ' + (sameChart ? '문서 동일?' : '차이') + ' |');
        L.push('|---|' + p.fixtures.map(() => '---').join('|') + '|---|');
        armsHere.forEach((arm) => {
          const cells = p.fixtures.map((fid) => {
            const r = rowOf(fid, arm);
            if (!r || !r.metrics) return '—';
            return r.metrics.paragraphs + '/' + r.metrics.sectionsOk;
          });
          let diff = '—';
          if (sameChart) {
            const docs = p.fixtures.map((fid) => rowOf(fid, arm)).filter((r) => r && r.doc);
            if (docs.length === p.fixtures.length) {
              const texts = docs.map((r) => JSON.stringify((r.doc.sections || []).map((x) => (x.paragraphs || []).map((q) => q.text))));
              diff = new Set(texts).size === 1 ? '동일' : '다름';
            }
          } else {
            const ms = p.fixtures.map((fid) => rowOf(fid, arm)).filter((r) => r && r.metrics);
            if (ms.length === p.fixtures.length) {
              diff = '문단 ' + ms.map((r) => r.metrics.paragraphs).join(' vs ') + ' · 섹션 ' + ms.map((r) => r.metrics.sectionsOk).join(' vs ');
            }
          }
          L.push('| ' + arm + ' | ' + cells.join(' | ') + ' | ' + diff + ' |');
        });
        L.push('');
        L.push('- 문서 동일 여부는 8섹션 문단 텍스트를 그대로 비교한 값이다. 같은 명식·같은 입력이면 엔진과 프롬프트가 같으므로 같아야 하고, 다르면 입력 둔감성을 의심한다.');
        L.push('');
      }
    });
  }

  /* 상충 */
  L.push('## 상충 픽스처 (CA)');
  L.push('');
  L.push('| 픽스처 | 상충 축 | ' + arms.map((k) => k).join(' | ') + ' |');
  L.push('|---|---|' + arms.map(() => '---').join('|') + '|');
  const byFixture = {};
  run.rows.forEach((r) => {
    const f = byFixture[r.fixture.id] = byFixture[r.fixture.id] || { fixture: r.fixture, arms: {} };
    f.arms[r.arm] = r;
  });
  Object.keys(byFixture).forEach((fid) => {
    const f = byFixture[fid];
    const any = arms.map((k) => f.arms[k]).filter(Boolean);
    const obs = (any.filter((r) => r.validation && r.validation.obligations).map((r) => r.validation.obligations)[0]) || [];
    if (!obs.length) return;
    const cells = arms.map((k) => {
      const r = f.arms[k];
      if (!r || !r.metrics || !r.metrics.caTotal) return '—';
      return r.metrics.caHit + '/' + r.metrics.caTotal;
    });
    L.push('| ' + fid + ' | ' + obs.map((o) => o.id + ' ' + o.topic).join('<br>') + ' | ' + cells.join(' | ') + ' |');
  });
  L.push('');
  L.push('## 최악 픽스처');
  arms.forEach((k) => {
    const list = run.rows.filter((r) => r.arm === k)
      .map((r) => ({ id: r.fixture.id, n: (r.validation ? r.validation.violations.length + r.validation.warnings.length : 0) }))
      .filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3);
    L.push('- ' + k + ': ' + (list.length ? list.map((x) => x.id + '(' + x.n + ')').join(', ') : '위반·경고 0'));
  });
  L.push('');
  L.push('## 실패·건너뜀 상세 (삭제하지 않고 보존)');
  const skippedRows = run.rows.filter((r) => r.skipped || r.stopped || r.error || r.ok === false);
  if (!skippedRows.length) L.push('- 없음 — 모든 요청이 최종 통과했다.');
  if (skippedRows.length) {
    L.push('');
    L.push('| 픽스처 | 실험군 | 사유 | 시도 | 입력/출력 토큰 | 비용 | raw output | 호출 파일 |');
    L.push('|---|---|---|---|---|---|---|---|');
    skippedRows.slice(0, 40).forEach((r) => {
      const recs = (r.records || []).filter((x) => x.phase !== 'blocked');
      const inTok = recs.reduce((s, x) => s + ((x.usage && x.usage.input_tokens) || 0), 0);
      const outTok = recs.reduce((s, x) => s + ((x.usage && x.usage.output_tokens) || 0), 0);
      const known = recs.filter((x) => x.pricingKnown && x.usd !== null && x.usd !== undefined);
      const unknown = recs.some((x) => !x.pricingKnown);
      const usd = unknown ? null : known.reduce((s, x) => s + x.usd, 0);
      const reason = r.skipped || r.stopped || (r.error && (r.error.errorType || r.error.message)) || '검증 미통과';
      const raw = r.doc ? 'docs.json (문서 전문)' : (recs.length && recs.some((x) => x.errorType) ? 'calls/*.json (rawText 전문)' : (recs.length ? 'calls/*.json (응답 기록)' : '— (호출 전 스킵)'));
      const callFiles = recs.length ? recs.map((x) => x.promptFile || null).filter(Boolean).slice(0, 1).join('') || ('calls/' + r.fixture.id + '-' + r.arm + '-a1.json') : '호출 없음';
      L.push('| ' + r.fixture.id + ' | ' + r.arm + ' | ' + reason + ' | ' + (r.attempts || 0) + ' | ' + (recs.length ? inTok + '/' + outTok : '—') + ' | ' +
        (recs.length ? (usd === null ? '미상(단가 미등록)' : formatUsd(usd)) : '—') + ' | ' + raw + ' | ' + callFiles + ' |');
    });
    L.push('');
    L.push('- 검증에 실패한 응답도 문서는 `docs.json` 에, 호출별 원문·오류·usage·비용은 `calls/<픽스처>-<실험군>-a<시도>.json` 과 `cost.json` 에 그대로 남는다. 실패를 지우고 성공만 모아 품질을 판단하지 않는다.');
  }
  if (run.budget && run.budget.exceeded) {
    L.push('- 예산/호출 상한: ' + run.budget.exceeded + (run.budget.exceededDetail ? ' — ' + run.budget.exceededDetail : ''));
  }
  L.push('');

  L.push('## 검증기 자기시험');
  L.push('');
  L.push('| probe | 주입한 오류 | 기대 규칙 | 잡은 규칙 | 결과 |');
  L.push('|---|---|---|---|---|');
  run.probes.forEach((p) => {
    L.push('| ' + p.name + ' | ' + (p.note || p.desc || '—') + ' | ' + p.expect + ' | ' + (p.caught.join(', ') || '없음') + ' | ' + (p.ok ? '✅' : '❌') + ' |');
  });
  L.push('');
  L.push('## 하네스 자기시험');
  L.push('');
  (run.selfTests || []).forEach((t) => L.push('- ' + (t.ok ? '✅' : '❌') + ' ' + t.name + (t.detail ? ' — ' + t.detail : '')));
  L.push('');
  L.push('## 결정성');
  L.push('- 규칙 엔진 같은 입력 2회 동일 출력: ' + (run.determinism ? '100%' : '실패'));
  L.push('');
  L.push('## 지식베이스');
  L.push('- 항목 ' + run.kbStats.total + '개 · 문헌 확인 ' + run.kbStats.byStatus['문헌 확인'] + ' · 현대적 해석 ' + run.kbStats.byStatus['현대적 해석'] + ' · 제품 규약 ' + run.kbStats.byStatus['제품 규약']);
  L.push('- 자기검사: ' + (run.kbProblems && run.kbProblems.length ? '실패 — ' + run.kbProblems.join(' / ') : '통과'));
  L.push('');
  L.push('## 블라인드 평가 자료 (3종 분리)');
  if (run.blindInfo) {
    L.push('- 경로: `' + run.blindInfo.dir + '`');
    L.push('  1. `blind-customer.md` / `.json` — 고객 평가용. 해석 전문만, 사례마다 표시 순서 무작위.');
    L.push('  2. `blind-myeongri.md` / `.json` — 명리학 검토용. 명식·해석·근거 사실 값·규칙/KB 출처.');
    L.push('  3. `tech-eval.md` / `.json` — 기술 평가용. 실험군·모델·토큰·비용·지연·실패·검증.');
    Object.keys(run.blindInfo.displayOrder || {}).slice(0, 3).forEach((fid) => {
      L.push('- ' + fid + ' 표시 순서: ' + run.blindInfo.displayOrder[fid].map((x) => x.id + '=' + x.arm).join(' · '));
    });
    L.push('- `blind-key.json`·`prompts.md`·`critique.md` 는 평가가 끝날 때까지 평가자에게 주지 않는다.');
  } else {
    L.push('- 생성하지 않음');
  }
  L.push('');
  L.push('## 한계');
  L.push('- stub 모드는 실제 모델의 문장 품질을 재지 않는다. 배선·검증기·채점·비용 계산 경로만 검증한다.');
  L.push('- judge 는 결정적 근사다. 모델 채점·사람 채점과의 상관은 실호출 라운드에서 확인해야 한다.');
  L.push('- 자동 검증(V1~V21)은 결정적으로 잡히는 오류만 본다. 근거 ID가 유효해도 해석이 틀릴 수 있고, 그 판단은 `blind-myeongri` 검토의 몫이다.');
  L.push('- 간지 환각 검사(V4)는 한자 쌍만 본다. 한글 표기(예: "갑자")의 오류는 별도 규칙이 필요하다.');
  L.push('- V16(근거-내용 불일치)·V19(원국/대운 혼동)는 보수적 휴리스틱이다. 탐지하지 못하는 무관 서술이 남을 수 있다.');
  L.push('- 토큰·비용은 stub 에서 추정치다(글자 수/2.2). 실호출에서 usage 로 대체된다.');
  L.push('- ' + COST_ESTIMATE_DISCLAIMER);
  L.push('- 자기시험·회귀 테스트 통과는 배선·검증기·안전장치 검증일 뿐, 사주 해석 품질의 증거가 아니다.');

  const md = L.join('\n');
  writeFileSync(resolve(outDir, 'report.md'), md, 'utf8');
  return md;
}
