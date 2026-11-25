/* ==========================================================================
   lib/engines/rule.mjs — 규칙 기반 출력 (ReadingDoc)
   --------------------------------------------------------------------------
   · 문장은 앱의 문장 카탈로그(src/content)에서 고른 것을 그대로 쓴다.
   · 모든 문단은 자기 문장의 requires 에서 나온 Finding id 만 인용한다.
   · 상충은 설계된 문장이 아니라, analysisData 의 서로 다른 축을 함께 놓아 말한다.
   ========================================================================== */

const RANK_KO = { 왕: '왕', 상: '상', 휴: '휴', 수: '수', 사: '사' };

function refsOf(ctx, ids) {
  return ids.filter((id) => ctx.ids.has(id)).filter((id, i, a) => a.indexOf(id) === i);
}

function pick(ctx, pred) {
  return ctx.findings.filter(pred);
}

function conflictParagraphs(ctx) {
  const a = ctx.analysis;
  const out = [];

  /* C1 — 월지 표 판독과 통근이 서로 다른 쪽을 가리킬 때 */
  const seasonRank = a.deukryeong.bySeasonRank.rank;
  const stageRead = a.deukryeong.byStage.stage;
  const supportedByTable = ['왕', '상'].indexOf(seasonRank) >= 0 || a.deukryeong.byElementCycle.supported;
  if (supportedByTable && a.roots.length === 0) {
    const ids = refsOf(ctx, [
      'AN.DEUKRYEONG.SEASON.' + seasonRank,
      'AN.DEUKRYEONG.STAGE.' + stageRead,
      'AN.ROOTS.COUNT.0'
    ]);
    out.push({
      text: '월지 쪽에서 보면 ' + RANK_KO[seasonRank] + ' 자리라 기세를 받는 판독이 나오는데, 통근은 하나도 없어요. 표 판독과 뿌리는 다른 축이라 한쪽만 골라 세다가 단정하지 않아요.',
      findingRefs: ids
    });
  }

  /* C2·C3 — 격 후보가 서로 다른 격을 가리킬 때 */
  if (a.geokguk.agreement === 'differs' || a.geokguk.agreement === 'partial') {
    const bonggi = a.geokguk.candidates.filter((c) => c.id.indexOf('GEOK.BONGGI.') === 0)[0];
    const tutul = a.geokguk.candidates.filter((c) => c.id.indexOf('GEOK.TUTUL.') === 0 && c.transparent);
    const hoejuk = a.geokguk.candidates.filter((c) => c.id.indexOf('GEOK.HOEJUK.') === 0);
    const names = [];
    if (bonggi) names.push('본기 후보 ' + bonggi.god);
    tutul.forEach((c) => names.push('투출 후보 ' + c.god));
    hoejuk.forEach((c) => names.push('회국 후보 ' + c.id.split('.').pop()));
    const ids = refsOf(ctx, []
      .concat(bonggi ? ['AN.' + bonggi.id] : [])
      .concat(tutul.map((c) => 'AN.' + c.id))
      .concat(hoejuk.map((c) => 'AN.' + c.id))
      .concat(['AN.GEOK.AGREEMENT.' + a.geokguk.agreement]));
    out.push({
      text: '월지 하나에서도 ' + names.join(', ') + '가 같이 나와요. 문헌은 하나를 고르라고 정해 주지 않으니, 격을 확정하지 않고 후보를 나란히 둡니다.',
      findingRefs: ids
    });
  }

  /* C4 — 합과 충이 동시에 */
  const haps = pick(ctx, (f) => /^(HAP\.|SAMHAP\.)/.test(f.id));
  const chungs = pick(ctx, (f) => /^CHUNG\./.test(f.id));
  if (haps.length && chungs.length) {
    const ids = refsOf(ctx, ['AN.HAPCHONG.CONFLICT'].concat(haps.map((f) => f.id), chungs.map((f) => f.id)));
    out.push({
      text: haps[0].display.short + '이면서 ' + chungs[0].display.short + '이 같이 있어요. 끌리는 힘과 부딪히는 힘이 한 명식에 있으니, 어느 한쪽만 골라 말하지 않아요.',
      findingRefs: ids
    });
  }

  /* C6 — 절입 경계 */
  if (a.flags.termEdge) {
    const ids = refsOf(ctx, ['FLAG.TERM_EDGE', 'MONTH.BRANCH.' + ctx.chart.monthBranch]);
    out.push({
      text: '태어난 시진 안에 ' + (a.flags.termEdgeTerm || '절입') + '이 걸려 있어요. 만세력마다 월주가 갈릴 수 있으니 월주를 확정으로 말하지 않아요.',
      findingRefs: ids
    });
  }

  /* C7 — 표면에 없지만 지장간에 있는 오행 */
  const hiddenOnly = a.elementFacts.lacking.filter((e) => a.elementFacts.hiddenOnly.indexOf(e) >= 0);
  if (hiddenOnly.length) {
    const e = hiddenOnly[0];
    const ids = refsOf(ctx, ['ELEM.LACK.' + e, 'ELEM.HIDDEN.' + a.elementFacts.hiddenOnly.join('')]);
    out.push({
      text: '표면 여덟 글자에는 ' + e + ' 기운이 없지만, 지장간에는 숨어 있어요. 그래서 "' + e + '이 아예 없다"고 단정하지 않아요.',
      findingRefs: ids
    });
  }

  return out;
}

function traitParagraphs(ctx) {
  return ctx.free.traits
    .filter((t) => t.text)
    .map((t) => ({ text: (t.label ? t.label + '. ' : '') + t.text, findingRefs: refsOf(ctx, t.refs || []) }));
}

function deukParagraph(ctx) {
  const a = ctx.analysis;
  const ids = refsOf(ctx, [
    'AN.DEUKRYEONG.ELEMENT.' + (a.deukryeong.byElementCycle.supported ? 'YES' : 'NO'),
    'AN.DEUKRYEONG.SEASON.' + a.deukryeong.bySeasonRank.rank,
    'AN.DEUKRYEONG.STAGE.' + a.deukryeong.byStage.stage,
    'AN.DEUKRYEONG.TENGOD.' + a.deukryeong.byMainQiTenGod.tenGod,
    'AN.DEUKJI.STAGE.' + a.deukji.byStage.stage,
    'AN.DEUKJI.ROOT.' + (a.deukji.rootGrade.value || 'NONE')
  ]);
  const text = '월지에서는 ' + a.monthCommand.monthType + '이고, 일간은 계절 표에서 ' + a.deukryeong.bySeasonRank.rank +
    ' 자리예요. 월지 12운성은 ' + a.deukryeong.byStage.stage + ', 월지 본기는 ' + a.deukryeong.byMainQiTenGod.tenGod +
    '이고, 일지 12운성은 ' + a.deukji.byStage.stage + '예요. 네 판독은 서로 대신하지 않아서 하나로 합치지 않아요.';
  return { text, findingRefs: ids };
}

function themeParagraph(ctx, theme) {
  if (!theme) return null;
  return {
    text: theme.body + (theme.why ? ' (' + theme.why + ')' : ''),
    findingRefs: refsOf(ctx, theme.refs || [])
  };
}

function periodParagraph(ctx) {
  const pf = pick(ctx, (f) => f.id.indexOf('PERIOD.') === 0);
  if (!pf.length) return null;
  return {
    text: pf.map((f) => f.display.long).join(' '),
    findingRefs: refsOf(ctx, pf.map((f) => f.id))
  };
}

/* 문단 길이 목표(120~320자)에 맞춰 짧은 문단을 이웃과 묶는다. 인용은 합집합. */
function pack(paras) {
  const out = [];
  paras.forEach((p) => {
    if (!out.length) { out.push({ text: p.text, findingRefs: p.findingRefs.slice() }); return; }
    const last = out[out.length - 1];
    if (last.text.length < 120 && last.text.length + 1 + p.text.length <= 320) {
      last.text = last.text + ' ' + p.text;
      p.findingRefs.forEach((r) => { if (last.findingRefs.indexOf(r) < 0) last.findingRefs.push(r); });
      return;
    }
    out.push({ text: p.text, findingRefs: p.findingRefs.slice() });
  });
  return out;
}

export function ruleDoc(ctx) {
  const sections = [];

  sections.push({
    id: '01', title: '타고난 기질과 성향',
    paragraphs: pack([deukParagraph(ctx)].concat(traitParagraphs(ctx)))
  });

  const byKey = {};
  ctx.themes.forEach((t) => { byKey[t.key] = t; });
  const money = themeParagraph(ctx, byKey.money);
  const work = themeParagraph(ctx, byKey.work);
  sections.push({
    id: '02', title: '돈과 일의 흐름',
    paragraphs: pack([money, work].filter(Boolean))
  });

  const answer = themeParagraph(ctx, ctx.themes[0]);
  sections.push({ id: '03', title: '질문에 대한 답', paragraphs: [answer].filter(Boolean) });

  const timing = periodParagraph(ctx);
  sections.push({ id: '04', title: '올해와 내년 타이밍', paragraphs: [timing].filter(Boolean) });

  const conflicts = conflictParagraphs(ctx);
  if (conflicts.length) sections.push({ id: 'BONUS', title: '겹쳐 선 근거', paragraphs: pack(conflicts) });

  if (ctx.orbit) {
    const of = ctx.orbit.findings;
    const limit = of.filter((f) => f.id === 'ORBIT.LIMIT.DAY_ONLY')[0];
    const rel = of.filter((f) => f.id.indexOf('ORBIT.DAYREL.') === 0)[0];
    sections.push({
      id: 'BONUS', title: '인연 궤도',
      paragraphs: [{
        text: (rel ? rel.display.long : '') + ' ' + (limit ? limit.display.long : '') + ' 두 사람의 일주 두 글자만 보고 말해요.',
        findingRefs: of.map((f) => f.id)
      }]
    });
  }

  const used = [];
  sections.forEach((s) => s.paragraphs.forEach((p) => p.findingRefs.forEach((id) => { if (used.indexOf(id) < 0) used.push(id); })));
  const skipped = ctx.findings.map((f) => f.id).filter((id) => used.indexOf(id) < 0);

  return {
    docVersion: 'reading/1.0',
    engine: 'rule',
    sections,
    cautions: [],
    meta: { usedFindings: used, skippedFindings: skipped }
  };
}
