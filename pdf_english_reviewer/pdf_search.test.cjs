const assert = require('node:assert/strict');
const { findPdfTextMatches } = require('./pdf_search.js');

const pages = [
  { page: 1, items: [{ text: 'Pressure', bbox: [10, 20, 60, 32] }, { text: 'sensor', bbox: [65, 20, 100, 32] }] },
  { page: 2, items: [{ text: 'A pressure sensor is installed.', bbox: [5, 10, 120, 20] }] },
];
const matches = findPdfTextMatches(pages, 'pressure sensor');
assert.equal(matches.length, 2);
assert.deepEqual(matches.map((match) => match.page), [1, 2]);
assert.deepEqual(matches[0].bbox, [10, 20, 60, 32]);
assert.equal(findPdfTextMatches(pages, 'PRESSURE').length, 2);
assert.equal(findPdfTextMatches(pages, '').length, 0);
assert.equal(findPdfTextMatches(pages, 'missing').length, 0);
console.log('PDF text search: passed');
