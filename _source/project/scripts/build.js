/**
 * AFM Journal Search Tool — Master Build Script
 * 실행: node scripts/build.js
 * 모든 출력물(PPT, DOCX, HTML)을 output/ 폴더에 생성합니다.
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'output');

// ── 출력 폴더 생성 ──────────────────────────────────────
['html', 'pptx', 'pdf', 'docx'].forEach(dir => {
  const p = path.join(OUTPUT, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

function run(label, cmd) {
  console.log(`\n${'─'.repeat(55)}`);
  console.log(`▶  ${label}`);
  console.log('─'.repeat(55));
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
    console.log(`✅ 완료: ${label}`);
  } catch (e) {
    console.error(`❌ 실패: ${label}\n`, e.message);
    process.exit(1);
  }
}

console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║   AFM Journal Search Tool v2 — 전체 빌드 시작        ║');
console.log('╚══════════════════════════════════════════════════════╝');

run('HTML 도구 복사',                 'node scripts/copy_tools.js');
run('소개 PPT 생성 (KO + EN)',        'node presentations/make_intro_ppt.js');
run('발표 스크립트 Word 생성 (KO)', 'node presentations/make_script_docx.js');
run('사용자 가이드 HTML 생성',        'node scripts/make_guides.js');

console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║   ✅ 빌드 완료! output/ 폴더를 확인하세요.           ║');
console.log('╚══════════════════════════════════════════════════════╝\n');

// 최종 파일 목록 출력
function listDir(dir, indent = '') {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(f => {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      console.log(`${indent}📁 ${f}/`);
      listDir(full, indent + '   ');
    } else {
      const kb = Math.round(stat.size / 1024);
      console.log(`${indent}📄 ${f}  (${kb} KB)`);
    }
  });
}
console.log('output/');
listDir(OUTPUT, '   ');
