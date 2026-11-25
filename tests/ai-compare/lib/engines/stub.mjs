/* ==========================================================================
   lib/engines/stub.mjs — 오프라인 AI 응답 (네트워크 없음)
   --------------------------------------------------------------------------
   · fixtures/stub/<fixtureId>.json 이 있으면 그 파일을 쓴다(손으로 쓴 응답).
   · 없으면 규칙 문단을 같은 근거 id 로 다시 말한 문단을 만든다.
     (문장만 다르고 인용은 같다 → 비교표가 '문장' 차이를 보여 준다)
   · _probe 응답은 일부러 규칙을 어긴 문서다. 검증기가 잡는지 확인하는 데만 쓴다.
   ========================================================================== */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const STUB_DIR = resolve(HERE, '../../fixtures/stub');

const OPENERS = [
  '제가 읽은 결은 이래요.',
  '이 명식에서 먼저 눈에 들어오는 건 이 부분이에요.',
  '천기를 펼쳐 보면 이렇게 갈라져요.',
  '한 번에 하나씩 짚어 볼게요.'
];

export function stubDoc(ctx, rule) {
  const id = ctx.fixture.id;
  const file = resolve(STUB_DIR, id + '.json');
  if (existsSync(file)) {
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    doc.engine = 'ai-stub';
    return doc;
  }

  const sections = rule.sections.map((s, si) => {
    const paragraphs = [];
    s.paragraphs.forEach((p, pi) => {
      const text = (pi === 0 ? OPENERS[(si + pi) % OPENERS.length] + ' ' : '') + p.text;
      if (paragraphs.length && paragraphs.length % 2 === 1) {
        // 두 문단을 하나로 묶어 말투 차이를 만든다. 인용은 합집합.
        const last = paragraphs[paragraphs.length - 1];
        last.text = last.text + ' ' + text;
        p.findingRefs.forEach((r) => { if (last.findingRefs.indexOf(r) < 0) last.findingRefs.push(r); });
      } else {
        paragraphs.push({ text, findingRefs: p.findingRefs.slice() });
      }
    });
    return { id: s.id, title: s.title, paragraphs };
  });

  const used = [];
  sections.forEach((s) => s.paragraphs.forEach((p) => p.findingRefs.forEach((r) => { if (used.indexOf(r) < 0) used.push(r); })));
  return {
    docVersion: 'reading/1.0',
    engine: 'ai-stub',
    sections,
    cautions: [],
    meta: { usedFindings: used, skippedFindings: ctx.findings.map((f) => f.id).filter((x) => used.indexOf(x) < 0) }
  };
}

/* 검증기 자체 시험 — 일부러 어긴 문서 3종 */
export function probeDocs(ctx) {
  const base = () => ({
    docVersion: 'reading/1.0',
    engine: 'probe',
    sections: [{ id: '01', title: '타고난 기질과 성향', paragraphs: [] }],
    cautions: [], meta: { usedFindings: [], skippedFindings: [] }
  });

  const hallucination = base();
  hallucination.sections[0].paragraphs.push({
    text: '민지 님은 신강한 편이라 용신이 화로 잡혀요. 양인격으로 봅니다.',
    findingRefs: Array.from(ctx.ids).slice(0, 1)
  });

  const noRef = base();
  noRef.sections[0].paragraphs.push({
    text: '민지 님은 흐르는 물처럼 부드러운 사람이에요. 그런데 속은 생각보다 단단해요.',
    findingRefs: []
  });

  const sensitive = base();
  sensitive.sections[0].paragraphs.push({
    text: '민지 님은 올해 반드시 수술을 피해야 하고, 주식은 절대 하지 마세요. 확실히 알려 드립니다.',
    findingRefs: Array.from(ctx.ids).slice(0, 1)
  });

  return { hallucination, noRef, sensitive };
}
