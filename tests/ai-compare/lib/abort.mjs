/* ==========================================================================
   lib/abort.mjs — 공통 설정 오류로 첫 실호출이 실패하면 남은 호출을 멈춘다
   --------------------------------------------------------------------------
   Opus 5.5 에서 temperature 같은 파라미터를 보내면 **모든 호출이 똑같이 HTTP 400**
   으로 실패한다. 요청·인증·모델 설정처럼 한 번 확인하면 끝나는 오류인데 12회를
   계속 날리면 같은 오류를 12번 사고, 호출 상한·비용만 축난다.

   그래서 첫 실호출이 아래 상태로 실패하면 실행을 멈춘다(abortRemaining).
     · 400 요청 형식 오류(temperature·top_p·top_k 전송, 없는 파라미터 등)
     · 401 인증 · 403 권한 · 404 모델/경로 없음
   네트워크 오류·5xx·타임아웃은 여기서 멈추지 않는다 — 그건 다음 호출이 성공할 수 있다.

   멈춘 뒤 아직 시도하지 않은 요청은 skipped:'notAttempted' 로 기록한다. 시도하지 않은
   것을 실패로 부풀리지도, 성공 모수에서 빼지도 않는다(성공률 모수는 요청 건수 그대로).
   ========================================================================== */

export const NOT_ATTEMPTED = 'notAttempted';

/* 요청·인증·모델 설정이 한 번에 틀렸다고 알려 주는 상태 코드 */
export const COMMON_CONFIG_ERROR_STATUSES = [400, 401, 403, 404];

/**
 * 이 오류 뒤의 호출을 멈춰야 하는가.
 * @param {object} e { httpStatus, errorType, message } (runArm 이 돌려주는 error 객체도 받는다)
 */
export function shouldAbortOn(e) {
  if (!e) return false;
  const status = Number(e.httpStatus);
  if (!status) return false;
  return COMMON_CONFIG_ERROR_STATUSES.indexOf(status) >= 0;
}

/** 종료 요약에 남길 중단 사유. 비밀(키·프롬프트)은 담지 않는다. */
export function abortInfo(e, at) {
  const src = e || {};
  return {
    reason: 'common-config-error',
    httpStatus: src.httpStatus == null ? null : src.httpStatus,
    errorType: src.errorType || null,
    message: src.message ? String(src.message).slice(0, 500) : null,
    at: at || new Date().toISOString()
  };
}

/** 중단 뒤 남은 요청의 기록 — 시도 0회. */
export function notAttemptedRow(abort) {
  return {
    skipped: NOT_ATTEMPTED,
    abort: abort || null,
    attempts: 0,
    records: [],
    ok: false
  };
}
