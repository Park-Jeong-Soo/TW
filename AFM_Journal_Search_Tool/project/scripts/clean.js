/**
 * output/ 폴더를 초기화합니다.
 * 실행: node scripts/clean.js
 */

const fs   = require('fs');
const path = require('path');

const OUTPUT = path.join(path.resolve(__dirname, '..'), 'output');

function rmDir(dir) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(f => {
    const full = path.join(dir, f);
    fs.statSync(full).isDirectory() ? rmDir(full) : fs.unlinkSync(full);
  });
  fs.rmdirSync(dir);
}

rmDir(OUTPUT);
console.log('✅ output/ 폴더가 초기화되었습니다.');
