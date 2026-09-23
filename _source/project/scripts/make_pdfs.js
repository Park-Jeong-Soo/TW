/**
 * Convert output/pdf/*.html guides to PDF via headless Chrome (puppeteer).
 * Run: node scripts/make_pdfs.js
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
const DIR  = path.join(ROOT, 'output', 'pdf');

const targets = ['KO', 'EN']
  .map(lang => ({
    html: path.join(DIR, `AFM_UserGuide_${lang}.html`),
    pdf:  path.join(DIR, `AFM_UserGuide_${lang}.pdf`),
    lang,
  }))
  .filter(t => fs.existsSync(t.html));

if (!targets.length) {
  console.error('No guide HTML found. Run `npm run guide` first.');
  process.exit(1);
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    for (const t of targets) {
      const page = await browser.newPage();
      await page.goto('file:///' + t.html.replace(/\\/g, '/'), {
        waitUntil: 'networkidle0',
      });
      await page.pdf({
        path: t.pdf,
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      });
      await page.close();
      const size = (fs.statSync(t.pdf).size / 1024).toFixed(1);
      console.log(`PDF ${t.lang}: ${path.relative(ROOT, t.pdf)} (${size} KB)`);
    }
  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
