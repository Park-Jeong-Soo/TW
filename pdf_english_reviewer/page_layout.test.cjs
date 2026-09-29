const assert = require('node:assert/strict');
const { a4PageLayout } = require('./page_layout.js');

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.01, `${actual} != ${expected}`);

const portrait = a4PageLayout(612, 792, 900);
close(portrait.paperWidth, 595.28);
close(portrait.paperHeight, 841.89);
close(portrait.contentWidth / portrait.contentHeight, 612 / 792);
close(portrait.contentWidth + portrait.offsetX * 2, portrait.paperWidth);
close(portrait.contentHeight + portrait.offsetY * 2, portrait.paperHeight);
assert.ok(portrait.offsetY > 0, 'letter-size content has an A4 margin');

const landscape = a4PageLayout(792, 612, 900);
close(landscape.paperWidth / landscape.paperHeight, 841.89 / 595.28);
close(landscape.contentWidth / landscape.contentHeight, 792 / 612);

const narrow = a4PageLayout(595.28, 841.89, 420);
assert.ok(narrow.paperWidth <= 420 - 80);
const twoPage = a4PageLayout(595.28, 841.89, 900, 1, true);
assert.ok(twoPage.paperWidth * 2 + 24 <= 900 - 80);
close(a4PageLayout(612, 792, 900, 1.5).paperWidth, portrait.paperWidth * 1.5);
assert.throws(() => a4PageLayout(0, 792, 900), /Invalid PDF page size/);

console.log('A4 page layout: passed');
