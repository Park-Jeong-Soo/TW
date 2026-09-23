/**
 * HTML 도구를 output/html/ 폴더로 복사합니다.
 * 실행: node scripts/copy_tools.js
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, 'tools');
const DST  = path.join(ROOT, 'output', 'html');

if (!fs.existsSync(DST)) fs.mkdirSync(DST, { recursive: true });

const files = fs.readdirSync(SRC).filter(f => f.endsWith('.html'));
if (!files.length) {
  console.log('⚠️  tools/ 폴더에 HTML 파일이 없습니다.');
  process.exit(0);
}

files.forEach(f => {
  fs.copyFileSync(path.join(SRC, f), path.join(DST, f));
  console.log(`✅ 복사됨: output/html/${f}`);
});
