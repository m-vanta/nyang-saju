#!/usr/bin/env node
/* ==========================================================================
   냥도사 · 유료 본문 분리 도구 (tools/split-paid-copy.mjs)
   --------------------------------------------------------------------------
   copy.js 한 파일에 무료 문장과 유료 문장이 같이 있어서, 주소창에 copy.js만
   열면 1,900원 본문이 다 읽혔다. 이 스크립트가 그 경계를 실제로 자른다.

     apps/nyang-saju/copy.js            (클라이언트 배포본)
       ├─ C.MASTER  → {title, scene} 만 남긴다 (무료 화면의 그림 설명에 씀)
       ├─ C.THEME   → 삭제 (유료 전용)
       └─ C.PATTERN → 삭제 (유료 전용)

     worker/src/paid-copy.js             (서버 전용, 배포 금지)
       ├─ MASTER_PAID : 일간 10종의 유료 필드 전부
       ├─ THEME       : 세 가지 운 전체 풀이
       └─ PATTERN     : 반복되는 인생 패턴

   사용법:
     node worker/tools/split-paid-copy.mjs            # 분리 실행
     node worker/tools/split-paid-copy.mjs --check    # 클라이언트에 유료 문장이
                                                      # 남아 있는지만 검사 (CI용)
   ========================================================================== */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, '../..');            // apps/nyang-saju
const copyPath = resolve(appDir, 'copy.js');
const paidPath = resolve(here, '../src/paid-copy.js');

/* 유료 필드 — 이 목록에 있는 키가 클라이언트 문장에 있으면 유출이다 */
export const PAID_MASTER_FIELDS = [
  'selfSee', 'selfBlind', 'firstMet', 'closer', 'love', 'keep', 'avoidEnergy',
  'gift', 'money', 'timing', 'talisman', 'bomb', 'avoid', 'focus'
];

/* copy.js를 브라우저처럼 한 번 실행해 C 객체를 얻는다 */
function loadCopy(src) {
  const sandbox = { window: {}, globalThis: null, console };
  sandbox.window.globalThis = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'copy.js' });
  const C = sandbox.window.NyangCopy;
  if (!C) throw new Error('copy.js가 window.NyangCopy를 만들지 못했습니다');
  return C;
}

/* 줄 단위로 블록 경계를 찾아 잘라 낸다 (문장은 손대지 않는다) */
function cutBlock(lines, startPattern, endLine) {
  const start = lines.findIndex((l) => startPattern.test(l));
  if (start < 0) return null;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === endLine) return { start, end: i };
  }
  throw new Error('블록 끝을 찾지 못했습니다: ' + startPattern);
}

function stripClient(src) {
  const lines = src.split('\n');

  /* 1) MASTER → {title, scene} 공개본 */
  const master = cutBlock(lines, /^    MASTER: \[$/, '    ]');
  if (!master) throw new Error('MASTER 블록을 찾지 못했습니다');

  const C = loadCopy(src);
  if (!Array.isArray(C.MASTER) || C.MASTER.length !== 10) {
    throw new Error('MASTER는 일간 10종이어야 합니다 (지금 ' + (C.MASTER || []).length + '종)');
  }
  const publicMaster = C.MASTER.map((m) => ({ title: m.title, scene: m.scene }));
  const publicBlock = [
    '    /* 유료 필드(selfSee·firstMet·love·talisman·focus …)는 서버에만 둔다.',
    '       클라이언트에는 무료 화면이 쓰는 title·scene 두 개만 남긴다. */',
    '    MASTER: [',
    publicMaster
      .map((m) => '      { title: ' + JSON.stringify(m.title) + ', scene: ' + JSON.stringify(m.scene) + ' }')
      .join(',\n'),
    '    ]'
  ];
  lines.splice(master.start, master.end - master.start + 1, ...publicBlock);

  /* 2) THEME · PATTERN 삭제 */
  for (const [re, label] of [[/^  C\.THEME = \{$/, 'THEME'], [/^  C\.PATTERN = \{$/, 'PATTERN']]) {
    const b = cutBlock(lines, re, '  };');
    if (!b) throw new Error(label + ' 블록을 찾지 못했습니다');
    lines.splice(b.start, b.end - b.start + 1,
      '  /* ' + label + ' — 유료 전용. worker/src/paid-copy.js 로 옮겼다. */');
  }

  return lines.join('\n');
}

function buildPaidModule(C) {
  const paidMaster = C.MASTER.map((m, i) => {
    const out = {};
    for (const f of PAID_MASTER_FIELDS) {
      if (m[f] !== undefined) out[f] = m[f];
    }
    return { dayMaster: i, title: m.title, scene: m.scene, ...out };
  });

  const header = `/* ==========================================================================
   냥도사 · 유료 본문 (paid-copy.js) — 서버 전용
   --------------------------------------------------------------------------
   tools/split-paid-copy.mjs 가 copy.js 에서 옮겨 만든 파일이다.
   이 파일은 Cloudflare Worker 번들에만 들어가고, 정적 배포(GitHub Pages /
   Cloudflare Pages)에는 절대 올리지 않는다. 여기 문장이 클라이언트에 닿는
   순간 1,900원 상품의 본문이 공짜가 된다.

   생성 시각: ${new Date().toISOString()}
   일간 10종 × 필드: ${PAID_MASTER_FIELDS.join(', ')}
   ========================================================================== */

`;

  const body = [
    'export const PAID_MASTER_FIELDS = ' + JSON.stringify(PAID_MASTER_FIELDS, null, 2) + ';',
    '',
    'export const MASTER_PAID = ' + JSON.stringify(paidMaster, null, 2) + ';',
    '',
    'export const THEME = ' + JSON.stringify(C.THEME, null, 2) + ';',
    '',
    'export const PATTERN = ' + JSON.stringify(C.PATTERN, null, 2) + ';',
    ''
  ].join('\n');

  return header + body;
}

function leakReport(C) {
  const leaks = [];
  (C.MASTER || []).forEach((m, i) => {
    for (const f of PAID_MASTER_FIELDS) {
      if (m[f] !== undefined) leaks.push(`MASTER[${i}].${f}`);
    }
  });
  if (C.THEME) leaks.push('C.THEME');
  if (C.PATTERN) leaks.push('C.PATTERN');
  return leaks;
}

const checkOnly = process.argv.includes('--check');
const src = readFileSync(copyPath, 'utf8');
const C = loadCopy(src);
const leaks = leakReport(C);

if (checkOnly) {
  if (leaks.length) {
    console.error('✗ 클라이언트 copy.js에 유료 문장이 남아 있습니다: ' + leaks.join(', '));
    process.exit(1);
  }
  console.log('✓ 클라이언트 copy.js에 유료 문장 없음');
  if (existsSync(paidPath)) {
    const paid = readFileSync(paidPath, 'utf8');
    const missing = PAID_MASTER_FIELDS.filter((f) => !paid.includes('"' + f + '"'));
    if (missing.length) {
      console.error('✗ 서버 paid-copy.js에 빠진 필드: ' + missing.join(', '));
      process.exit(1);
    }
    console.log('✓ 서버 paid-copy.js 필드 완비');
  }
  process.exit(0);
}

if (!leaks.length) {
  console.log('이미 분리되어 있습니다 (클라이언트에 유료 문장 없음). paid-copy.js만 다시 만듭니다.');
} else {
  console.log('자르는 중: ' + leaks.length + '개 유료 항목');
}

const stripped = stripClient(src);
const strippedC = loadCopy(stripped);
const after = leakReport(strippedC);
if (after.length) {
  console.error('✗ 분리 후에도 남은 유료 항목: ' + after.join(', '));
  process.exit(1);
}
writeFileSync(copyPath, stripped, 'utf8');
console.log('✓ copy.js 정리 (' + stripped.length.toLocaleString() + ' bytes)');

writeFileSync(paidPath, buildPaidModule(C), 'utf8');
console.log('✓ worker/src/paid-copy.js 생성 (' + C.MASTER.length + '종, THEME·PATTERN 포함)');
