/* ==========================================================================
   유료 천기 조립 (src/reading.js) — 서버 전용
   --------------------------------------------------------------------------
   app.js 의 buildReading / themeSections / buildPatterns / buildSummary 를
   서버로 옮긴 것이다. 클라이언트는 이 결과를 받아서 그리기만 한다.
   계산은 클라이언트와 같은 엔진(saju.js · palja.js)으로 다시 한다 —
   클라이언트가 보낸 명식을 믿지 않고 생년월일에서 다시 세운다.
   ========================================================================== */
import './engine/manseryeok.js';
import './engine/tables.js';
import './engine/chart.js';
import './engine/period.js';
import './engine/findings.js';
import './engine/copy.js';
import './engine/paid-strings.js';
import './engine/free.js';
import './engine/paid.js';
import './engine/select.js';
import './engine/saju.js';
import './engine/palja.js';
import { MASTER_PAID, THEME, PATTERN } from './paid-copy.js';

const S = globalThis.NyangSaju;
const C = globalThis.NyangCopy;
const P = globalThis.NyangPalja;
const RD = globalThis.NyangRender;
const PD = globalThis.NyangPeriod;

/* ---------- app.js 와 같은 치환 규칙 ---------- */
function callNameOf(name) {
  return name && name !== '손님' ? name + ' 님' : '손님';
}

function fill(s, nameArg) {
  const who = callNameOf(nameArg);
  return String(s == null ? '' : s)
    .replace(/\{name\} 님/g, who)
    .replace(/\{name\}/g, who);
}

function fillv(s, r) {
  const p = r.palja;
  if (!p) return fill(s, r.name);
  return fill(s, r.name)
    .replace(/\{strongKo\}/g, p.strongKo)
    .replace(/\{lackKo\}/g, p.lackKo || '')
    .replace(/\{pct\}/g, p.pct != null ? p.pct : r.chart.strongest.pct)
    .replace(/\{count\}/g, r.chart.strongest.count)
    .replace(/\{god\}/g, p.topGod)
    .replace(/\{n\}/g, p.godCount);
}

function tidy(s) {
  let open = true;
  return String(s).replace(/"/g, () => {
    const c = open ? '\u201C' : '\u201D';
    open = !open;
    return c;
  });
}

function firstSent(text, max) {
  const t = tidy(text).replace(/\s+/g, ' ').trim();
  const parts = t.match(/[^.!?]+[.!?]?/g) || [t];
  let out = '';
  for (let i = 0; i < parts.length && i < max; i++) out += parts[i];
  return out.trim();
}

function clip(text, max) {
  const t = String(text);
  return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, '') + ' …' : t;
}

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

/* ---------- 명식 세우기 ---------- */
export function computeChart(input) {
  return S.computePillars(input);
}

/* ---------- 유료: 세 가지 운 ---------- */
function themeSections(r) {
  const out = [];
  let order;
  if (r.focusKey === 'year') {
    out.push({
      key: 'year',
      title: '올해 총운',
      term: '일간 ' + r.dayMaster.short + ' · ' + r.palja.strongKo + ' ' + r.chart.strongest.count +
        '개(' + r.palja.pct + '%)',
      body: fill(r.master.focus.year, r.name),
      why: r.timingText || ''
    });
    order = ['love', 'money', 'work'];
  } else {
    order = ['love', 'money', 'work'].filter((k) => k !== r.focusKey);
    order.unshift(r.focusKey);
  }
  order.forEach((k) => {
    const T = THEME[k];
    const body = fill(r.master.focus[k], r.name) + ' ' +
      fillv(T.elem[r.palja.rel], r) + ' ' + fillv(T.god[r.palja.group], r);
    out.push({
      key: k,
      title: T.label,
      kicker: T.kicker,
      term: r.dayMaster.short + ' · ' + r.palja.strongKo + ' ' + r.chart.strongest.count + '개(' +
        r.palja.pct + '%) · ' + r.palja.topGod + ' ' + r.palja.godCount,
      body: body
    });
  });
  return out;
}

/* ---------- 유료: 반복되는 인생 패턴 ---------- */
function buildPatterns(r) {
  const out = [];
  const add = (pt) => {
    if (!pt) return;
    out.push({ label: pt.label, text: fillv(pt.text, r), cut: fillv(pt.cut, r) });
  };
  add(PATTERN.god[r.palja.group]);
  add(PATTERN.elem[r.palja.rel]);
  add(r.chart.lacking.length ? PATTERN.lack : PATTERN.solid);
  return out.slice(0, 3);
}

/* ---------- 무료: 한 줄 미리보기 (티저) ---------- */
export function previewItems(r) {
  return ['love', 'money', 'work'].map((k) => {
    const T = THEME[k];
    const base = firstSent(fill(r.master.focus[k], r.name), 1);
    const tail = firstSent(fillv(T.elem[r.palja.rel], r), 1);
    return { key: k, label: T.label, text: clip(base + ' ' + tail, 96) };
  });
}

/* ---------- 요약 복사 ---------- */
function buildSummary(r) {
  const p = r.chart.pillars;
  const m = r.master;
  const line = (pl) => (pl ? pl.ko + '(' + pl.hanja + ')' : '시주 모름');
  const L = [];
  L.push('냥도사의 천기누설 — ' + r.name);
  L.push('팔자 고양이: ' + r.palja.name + ' (' + r.palja.hanja + ' · ' + r.palja.short + ')');
  L.push('한 줄 정의: ' + r.palja.def);
  L.push('사주명식: ' + line(p.year) + ' · ' + line(p.month) + ' · ' + line(p.day) + ' · ' + line(p.hour));
  L.push('오행: ' + r.chart.dist.map((d) => d.elem + d.count + '개(' + d.pct + '%)').join(' '));
  L.push('');
  L.push(fill(r.palja.bomb, r.name));
  L.push('');
  r.themes.forEach((t) => {
    L.push('[' + t.title + ']');
    L.push(fill(t.body, r.name));
    L.push('');
  });
  L.push('[반복되는 인생 패턴]');
  r.patterns.forEach((pt) => {
    L.push('· ' + pt.label + ': ' + fill(pt.text, r.name) + ' → ' + fill(pt.cut, r.name));
  });
  L.push('');
  L.push('· ' + C.ui.result.talismanTitle + ': ' + fill(m.talisman, r.name));
  L.push('');
  L.push('냥도사가 봤어요. 재미로 보세요.');
  return tidy(L.join('\n'));
}

/* ---------- 전체 조립 ---------- */
export function buildReading(chart, input, nowMs) {
  const m = MASTER_PAID[chart.dayMaster];
  if (!m) throw new Error('일간 ' + chart.dayMaster + '의 유료 본문이 없습니다');

  const focusKey = C.FOCUS[input.focus] ? input.focus : 'love';
  const elemKo = S.STEM_ELEM[chart.dayMaster];
  const dmName = S.STEMS[chart.dayMaster] + elemKo;
  const dmHanja = S.STEMS_HANJA[chart.dayMaster] + S.ELEM_HANJA[elemKo];
  const name = (input.name || '').trim() || '손님';
  const asOfMs = nowMs == null ? Date.now() : nowMs;
  const asOf = new Date(asOfMs).toISOString();
  const timing = S.loveTiming(chart, asOfMs);
  const period = PD.period(chart, asOf);

  const r = {
    name,
    chart,
    period,
    master: m,
    focusKey,
    focus: C.FOCUS[focusKey],
    dayMaster: { name: dmName + '(' + dmHanja + ')', short: dmName, hanja: dmHanja, elem: elemKo },
    timing,
    timingText: timing ? S.fmtDate(timing.startMs) + ' ~ ' + S.fmtDate(timing.endMs) : null
  };

  r.palja = P.build(chart, name);
  r.palja.pct = chart.share[chart.tiedMax[0]];
  r.themes = RD.buildThemes(chart, period, name, focusKey);
  r.patterns = RD.buildPatterns(chart, period, name);
  return r;
}

/** 클라이언트에 내려보내는 유료 페이로드 (문장 + 라벨용 값만) */
export function paidPayload(input, orderId, nowMs) {
  const chart = computeChart(input);
  const r = buildReading(chart, input, nowMs);

  return {
    orderId,
    inputHash: null, // 라우터가 채운다
    // 복귀(?orderId=) 후 세션이 비어 있어도 무료 화면을 다시 세울 수 있게 입력을 함께 준다
    input: {
      name: input.name, gender: input.gender, year: input.year, month: input.month,
      day: input.day, calendar: input.calendar, isLeap: !!input.isLeap,
      hourIdx: input.hourIdx == null ? null : input.hourIdx, focus: input.focus
    },
    name: r.name,
    callName: callNameOf(r.name),
    focus: { key: r.focusKey, label: r.focus.label },
    timingText: r.timingText,
    dayMaster: r.dayMaster,
    palja: {
      name: r.palja.name,
      hanja: r.palja.hanja,
      short: r.palja.short,
      def: tidy(r.palja.def),
      tags: r.palja.tags,
      traits: r.palja.traits,
      bomb: tidy(r.palja.bomb)
    },
    themes: r.themes.map((t) => ({
      key: t.key, title: t.title, kicker: t.kicker || '', term: t.term || '',
      body: tidy(t.body), why: t.why || ''
    })),
    patterns: r.patterns.map((p) => ({ label: p.label, text: tidy(p.text), cut: tidy(p.cut) })),
    paid: {
      selfSee: tidy(fill(r.master.selfSee, r.name)),
      selfBlind: tidy(fill(r.master.selfBlind, r.name)),
      firstMet: tidy(fill(r.master.firstMet, r.name)),
      closer: tidy(fill(r.master.closer, r.name)),
      love: tidy(fill(r.master.love, r.name)),
      keep: tidy(fill(r.master.keep, r.name)),
      avoidEnergy: tidy(fill(r.master.avoidEnergy, r.name)),
      talisman: tidy(fill(r.master.talisman, r.name)),
      avoid: tidy(fill(r.master.avoid, r.name))
    },
    summary: buildSummary(r)
  };
}

/** 무료 티저만 (결제 없이) */
export function previewPayload(input, nowMs) {
  const chart = computeChart(input);
  const r = buildReading(chart, input, nowMs);
  return {
    name: r.name,
    dayMaster: r.dayMaster,
    cat: r.palja.name,
    preview: previewItems(r)
  };
}
