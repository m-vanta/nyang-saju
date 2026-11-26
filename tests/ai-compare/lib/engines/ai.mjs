/* ==========================================================================
   lib/engines/ai.mjs — 실호출 엔진 (설계만, 이 저장소에서는 키가 없다)
   --------------------------------------------------------------------------
   docs/orbit-finding-and-ai-hybrid-design.md §6 을 그대로 따른다.
   · 입력은 analysisData + findings + policy 뿐. 이름·생년월일·성별은 보내지 않는다.
   · 출력은 근거 id 를 인용한 문단 JSON. 검증기(G1~G12)를 통과해야 화면에 나간다.
   · 실패하면 규칙 출력으로 폴백한다(run.mjs).

   실호출은 서버(worker)에서만 한다. 이 파일은 하네스가 '어떤 계약으로 부를지'를
   고정해 두는 자리이고, 키가 없으면 명확히 실패한다.
   ========================================================================== */

export const SYSTEM_PROMPT = [
  "너는 '냥도사'의 해석 엔진이다. 너는 명리 계산기가 아니라, 이미 계산된 판정을 읽어 주는 역할만 한다.",
  '[절대 규칙]',
  '1. 명식을 계산하지 않는다. analysisData 에 없는 간지 조합을 쓰지 않는다.',
  '2. 없는 판정을 만들지 않는다. findings 에 없는 격국·신강신약·용신·신살·궁합 점수를 말하지 않는다.',
  '3. 문단마다 근거를 단다. 모든 문단은 findingRefs 에 실제 findings.id 를 1개 이상 가진다.',
  '4. 수위를 바꾸지 않는다. polarity 가 neutral 인 판정을 긍정이나 부정으로 바꾸지 않는다.',
  '5. 상충하면 둘 다 말한다.',
  '6. 숫자를 만들지 않는다.',
  '7. 단정하지 않는다. 미래를 확정하지 않고 경향과 조건으로 말한다.',
  '8. 의료·법률·투자·생사를 판정하지 않는다.',
  "9. 호칭은 {name} 님. '당신'을 쓰지 않는다. '~냥'은 전체 2회 이하.",
  '10. 이름·생년월일·성별·지역을 출력에 쓰지 않는다.',
  '11. JSON 만 출력한다.',
  '12. 근거가 없으면 비워 둔다.'
].join('\n');

export function buildRequest(ctx, policy) {
  return {
    model: process.env.NYANG_COMPARE_MODEL || null,
    temperature: 0,
    system: SYSTEM_PROMPT,
    input: {
      analysisData: ctx.analysis,
      findings: ctx.findings.map((f) => ({ id: f.id, claim: f.claim, display: f.display, polarity: f.polarity, evidence: f.evidence })),
      policy
    }
  };
}

export async function aiDoc(ctx, policy) {
  if (!process.env.NYANG_COMPARE_API_KEY) {
    const err = new Error('실호출에는 NYANG_COMPARE_API_KEY 가 필요합니다. 오프라인 비교는 --mode stub 을 쓰세요.');
    err.code = 'NO_API_KEY';
    throw err;
  }
  /* 실제 호출은 worker 경유로만 한다(키를 클라이언트에 두지 않는다). */
  const req = buildRequest(ctx, policy);
  const url = process.env.NYANG_COMPARE_ENDPOINT;
  if (!url) {
    const err = new Error('NYANG_COMPARE_ENDPOINT(worker /api/compare) 가 필요합니다.');
    err.code = 'NO_ENDPOINT';
    throw err;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.NYANG_COMPARE_API_KEY },
    body: JSON.stringify(req)
  });
  if (!res.ok) throw new Error('AI 호출 실패: HTTP ' + res.status);
  const doc = await res.json();
  doc.engine = 'ai-live';
  return doc;
}
