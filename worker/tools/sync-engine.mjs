#!/usr/bin/env node
/* ==========================================================================
   엔진 파일 동기화 (tools/sync-engine.mjs)
   --------------------------------------------------------------------------
   Worker는 만세력·사주·팔자고양이·무료 문장을 클라이언트와 똑같이 계산해야 한다.
   같은 파일을 두 벌 관리하면 문장이 갈라지므로, apps/nyang-saju 의 원본을
   worker/src/engine/ 으로 복사한다. test/engine-sync.test.mjs 가 이 복사본이
   원본과 같은지 검사한다.

     vendor/manseryeok.js → src/engine/manseryeok.js
     saju.js              → src/engine/saju.js
     copy.js (무료 전용)   → src/engine/copy.js
     palja.js             → src/engine/palja.js
   ========================================================================== */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, '../..');
const outDir = resolve(here, '../src/engine');

const FILES = [
  ['vendor/manseryeok.js', 'manseryeok.js'],
  ['src/domain/tables.js', 'tables.js'],
  ['src/domain/chart.js', 'chart.js'],
  ['src/domain/period.js', 'period.js'],
  ['src/rules/findings.js', 'findings.js'],
  ['copy.js', 'copy.js'],
  ['src/content/paid-strings.js', 'paid-strings.js'],
  ['src/content/free.js', 'free.js'],
  ['src/content/paid.js', 'paid.js'],
  ['src/render/select.js', 'select.js'],
  ['saju.js', 'saju.js'],
  ['palja.js', 'palja.js']
];

mkdirSync(outDir, { recursive: true });

for (const [from, to] of FILES) {
  const src = readFileSync(resolve(appDir, from), 'utf8');
  const banner = '/* [자동 생성] 원본: apps/nyang-saju/' + from +
    ' — tools/sync-engine.mjs 로 복사됨. 이 파일을 직접 고치지 마세요. */\n';
  writeFileSync(resolve(outDir, to), banner + src, 'utf8');
  console.log('✓ ' + from + ' → worker/src/engine/' + to);
}
