/* ==========================================================================
   입력 검증 · 정규화 (src/validate.js)
   --------------------------------------------------------------------------
   서버는 클라이언트가 보낸 명식을 믿지 않는다. 생년월일만 받아서 만세력으로
   다시 세운다. input_hash는 정규화된 입력의 sha256이고, 이 값이 주문·토큰·
   열람 요청을 하나로 묶는 열쇠다.
   ========================================================================== */

export const FOCUS_KEYS = ['love', 'money', 'work', 'year'];
export const GENDERS = ['여성', '남성'];
export const CALENDARS = ['solar', 'lunar'];

const MIN_YEAR = 1391;
const MAX_YEAR = 2050;

export class InputError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'InputError';
    this.field = field || null;
  }
}

/** 들어온 JSON을 계산에 필요한 9개 필드로만 줄인다 */
export function normalizeInput(raw) {
  if (!raw || typeof raw !== 'object') throw new InputError('입력이 비어 있습니다', 'body');

  const name = cleanName(raw.name);
  const gender = GENDERS.includes(raw.gender) ? raw.gender : '여성';
  const calendar = CALENDARS.includes(raw.calendar) ? raw.calendar : 'solar';

  const year = intOf(raw.year, 'year');
  const month = intOf(raw.month, 'month');
  const day = intOf(raw.day, 'day');

  if (year < MIN_YEAR || year > MAX_YEAR) {
    throw new InputError('만세력이 다루는 해는 ' + MIN_YEAR + '~' + MAX_YEAR + '년입니다', 'year');
  }
  if (month < 1 || month > 12) throw new InputError('달은 1~12입니다', 'month');
  if (day < 1 || day > 31) throw new InputError('날은 1~31입니다', 'day');

  let hourIdx = null;
  if (raw.hourIdx !== null && raw.hourIdx !== undefined && raw.hourIdx !== '') {
    hourIdx = intOf(raw.hourIdx, 'hourIdx');
    if (hourIdx < 0 || hourIdx > 11) throw new InputError('시각은 0~11(자시~해시)입니다', 'hourIdx');
  }

  const focus = FOCUS_KEYS.includes(raw.focus) ? raw.focus : 'love';
  const isLeap = calendar === 'lunar' && raw.isLeap === true;

  return { name, gender, year, month, day, calendar, isLeap, hourIdx, focus };
}

/** 정규화 입력 → 해시 입력 문자열 (키 순서 고정) */
export function canonical(input) {
  return JSON.stringify([
    input.name, input.gender, input.year, input.month, input.day,
    input.calendar, input.isLeap, input.hourIdx, input.focus
  ]);
}

export async function inputHashOf(input) {
  return sha256Hex(canonical(input));
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function cleanName(v) {
  const s = String(v == null ? '' : v)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '손님';
  return s.slice(0, 20);
}

function intOf(v, field) {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new InputError('숫자가 아닙니다: ' + field, field);
  return n;
}
