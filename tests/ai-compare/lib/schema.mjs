/* ==========================================================================
   lib/schema.mjs — A~E 비교용 공통 문서 스키마 (reading/2.0)
   --------------------------------------------------------------------------
   비교가 성립하려면 다섯 실험군이 '같은 그릇'에 담겨야 한다. 규칙 엔진(A)은
   8섹션을 만들지 않으므로, 있는 문단만 옮겨 담고 없는 섹션은 status:'unavailable'
   로 이유와 함께 남긴다(없는 것을 있는 척 채우지 않는다).

     §01 천기팩폭        §05 연애운
     §02 대표 성향       §06 재물운
     §03 내면의 상충     §07 직업운
     §04 반복 패턴       §08 대운 및 올해 운세

   근거(grounding)는 두 갈래다.
     · findings  — 규칙 엔진: findingRefs 에 실재 Finding id
     · evidence  — AI: evidenceRefs/citations 에 해석 가능한 사실 경로
   ========================================================================== */

export const DOC_VERSION = 'reading/2.0';
export const LEGACY_DOC_VERSION = 'reading/1.0';

export const SECTIONS = [
  { id: '01', key: 'cheongi', title: '천기팩폭' },
  { id: '02', key: 'trait', title: '대표 성향' },
  { id: '03', key: 'conflict', title: '내면의 상충하는 성향' },
  { id: '04', key: 'pattern', title: '반복되는 행동 패턴' },
  { id: '05', key: 'love', title: '연애운' },
  { id: '06', key: 'money', title: '재물운' },
  { id: '07', key: 'work', title: '직업운' },
  { id: '08', key: 'period', title: '대운 및 올해 운세' }
];

export const SECTION_BY_KEY = SECTIONS.reduce((o, s) => { o[s.key] = s; return o; }, {});
export const SECTION_BY_ID = SECTIONS.reduce((o, s) => { o[s.id] = s; return o; }, {});

export function emptyDoc(engine) {
  return {
    docVersion: DOC_VERSION,
    engine: engine || 'unknown',
    grounding: 'evidence',
    sections: SECTIONS.map((s) => ({ id: s.id, key: s.key, title: s.title, status: 'unavailable', reason: null, paragraphs: [] })),
    cautions: [],
    meta: { usedEvidence: [], skippedSections: [], provider: null, model: null }
  };
}

/* 문단 하나가 근거를 갖고 있는가 — 두 갈래를 모두 본다. */
export function groundingOfParagraph(p) {
  const refs = Array.isArray(p.findingRefs) ? p.findingRefs : [];
  const ev = Array.isArray(p.evidenceRefs) ? p.evidenceRefs : [];
  const cit = Array.isArray(p.citations) ? p.citations.map((c) => (c && c.ref) || null).filter(Boolean) : [];
  return { refs, ev, cit, all: refs.concat(ev, cit) };
}

export function allGrounding(doc) {
  const out = [];
  (doc.sections || []).forEach((s) => (s.paragraphs || []).forEach((p) => {
    groundingOfParagraph(p).all.forEach((r) => out.push(r));
  }));
  return out;
}

/* 스키마 자기검사 — 문서가 8섹션 그릇을 지켰는가. 결정적. */
export function checkSchema(doc) {
  const problems = [];
  if (!doc || typeof doc !== 'object') return ['문서 없음'];
  if (doc.docVersion !== DOC_VERSION && doc.docVersion !== LEGACY_DOC_VERSION) problems.push('docVersion ' + doc.docVersion);
  if (!Array.isArray(doc.sections)) return problems.concat('sections 없음');
  const seen = new Set();
  doc.sections.forEach((s) => {
    if (!s || !s.id) { problems.push('섹션 id 누락'); return; }
    if (!SECTION_BY_ID[s.id]) problems.push('알 수 없는 섹션 id ' + s.id);
    if (seen.has(s.id)) problems.push('중복 섹션 ' + s.id);
    seen.add(s.id);
    if (s.status && s.status !== 'ok' && s.status !== 'unavailable') problems.push('status ' + s.status + ' (' + s.id + ')');
    if (s.status === 'unavailable' && !s.reason) problems.push('unavailable 인데 이유 없음 (' + s.id + ')');
    if (s.status !== 'unavailable') {
      if (!Array.isArray(s.paragraphs) || !s.paragraphs.length) problems.push('문단 없음 (' + s.id + ')');
      (s.paragraphs || []).forEach((p, i) => {
        if (!p || typeof p.text !== 'string' || p.text.length < 20) problems.push('문단 텍스트 부족 (' + s.id + '#' + i + ')');
      });
    }
  });
  SECTIONS.forEach((s) => { if (!seen.has(s.id)) problems.push('섹션 빠짐 ' + s.id + ' ' + s.title); });
  return problems;
}

/* 8섹션 순서로 읽기 좋게 펴 놓는다(리포트·블라인드 패키지 공용). */
export function flattenSections(doc) {
  return SECTIONS.map((s) => {
    const found = (doc.sections || []).filter((x) => x.id === s.id)[0] || null;
    return {
      id: s.id, key: s.key, title: s.title,
      status: found ? (found.status || 'ok') : 'unavailable',
      reason: found ? found.reason || null : '섹션 없음',
      paragraphs: found ? found.paragraphs || [] : []
    };
  });
}
