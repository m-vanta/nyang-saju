/* ==========================================================================
   tests/ai-compare/lib/load.mjs — 앱 엔진을 vm 샌드박스에 올린다
   --------------------------------------------------------------------------
   브라우저와 같은 순서로 파일을 읽어 window 전역을 만든 뒤 꺼내 쓴다.
   테스트가 앱과 다른 계산을 하지 않도록, 하네스는 엔진을 새로 쓰지 않는다.
   ========================================================================== */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const FILES = [
  'vendor/manseryeok.js', 'src/domain/tables.js', 'src/domain/chart.js', 'src/domain/analysis.js',
  'src/domain/period.js', 'src/rules/findings.js', 'copy.js', 'src/content/paid-strings.js',
  'src/content/free.js', 'src/content/paid.js', 'src/render/select.js', 'saju.js', 'palja.js'
];

export function loadEngine() {
  const sandbox = {
    console,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64')
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of FILES) {
    vm.runInContext(readFileSync(resolve(APP_DIR, f), 'utf8'), sandbox, { filename: f });
  }
  return {
    sandbox,
    T: sandbox.NyangTables,
    D: sandbox.NyangDomain,
    A: sandbox.NyangAnalysis,
    P: sandbox.NyangPeriod,
    R: sandbox.NyangRules,
    RD: sandbox.NyangRender,
    C: sandbox.NyangCopy,
    PC: sandbox.NyangPaidCopy,
    FREE: sandbox.NyangContentFree || [],
    PAID: sandbox.NyangContentPaid || []
  };
}
