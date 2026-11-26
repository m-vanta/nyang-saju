/* ==========================================================================
   lib/normalize.mjs — 이름·수치 마스킹과 블라인드 라벨
   --------------------------------------------------------------------------
   채점자가 어느 엔진인지 모르게 A/B 로 라벨을 섞고, 사람 이름·연도를 지운다.
   비교 리포트에는 라벨과 엔진의 대응을 따로 적는다(사람 표본 검토용).
   ========================================================================== */

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

export function mask(text, name) {
  let t = String(text || '');
  if (name) t = t.split(name).join('{name}');
  t = t.replace(/\d{4}년/g, '{연도}').replace(/\d{4}\.\d{2}\.\d{2}/g, '{날짜}');
  return t;
}

export function maskDoc(doc, name) {
  return {
    ...doc,
    sections: (doc.sections || []).map((s) => ({
      ...s,
      paragraphs: (s.paragraphs || []).map((p) => ({ ...p, text: mask(p.text, name) }))
    }))
  };
}

export function blind(docs, seed) {
  const keys = Object.keys(docs);
  const ordered = keys.slice().sort((a, b) => (hash(seed + a) % 997) - (hash(seed + b) % 997));
  const labels = {};
  ordered.forEach((k, i) => { labels[k] = String.fromCharCode(65 + i); });
  return { labels, order: ordered };
}
