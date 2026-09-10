import puppeteer from 'puppeteer';

const outDir = process.argv[2];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const results = [];
const check = (l, pass, d = '') => results.push(`${pass ? 'PASS' : 'FAIL'}  ${l}${d ? '  — ' + d : ''}`);

// Deliberately short viewports: the bug only appears when the form is taller
// than the window, which is every phone and any laptop with devtools open.
const sizes = [
  { w: 1440, h: 900, label: 'desktop 1440x900' },
  { w: 1280, h: 620, label: 'short laptop 1280x620' },
  { w: 390, h: 844, label: 'iPhone 390x844' },
  { w: 360, h: 640, label: 'small android 360x640' },
];

for (const { w, h, label } of sizes) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, isMobile: w < 700 });
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1800));

  // Open the modal from the landing-page CTA (the variant that was broken).
  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /create your account/i.test(x.textContent));
    if (!b) return false;
    b.click();
    return true;
  });
  await new Promise((r) => setTimeout(r, 1600));

  const m = await page.evaluate(() => {
    const form = document.querySelector('form');
    const card = form?.closest('div.bg-surface');
    if (!card) return null;
    // The scroll container is the fixed overlay.
    const scroller = card.closest('.overflow-y-auto') || document.scrollingElement;
    const h2 = document.querySelector('h2');
    const submit = [...document.querySelectorAll('button')].find((b) => /create account/i.test(b.textContent) && b.type === 'submit');
    return {
      scrollTop: scroller.scrollTop,
      cardTopAtRest: Math.round(card.getBoundingClientRect().top),
      headerTopAtRest: Math.round(h2.getBoundingClientRect().top),
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      submitTop: submit ? Math.round(submit.getBoundingClientRect().top) : null,
      docOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  if (!m) { check(`${label}: modal opened`, false, `cta clicked: ${opened}`); await page.close(); continue; }

  // 1. At rest (scrollTop 0) the header must be inside the viewport, not above it.
  check(`${label}: header visible at rest`, m.headerTopAtRest >= 0,
    `header top=${m.headerTopAtRest}px, card top=${m.cardTopAtRest}px, scrollTop=${m.scrollTop}`);

  // 2. Scrolling to the bottom must reveal the submit button.
  const bottom = await page.evaluate(() => {
    const card = document.querySelector('form').closest('div.bg-surface');
    const scroller = card.closest('.overflow-y-auto') || document.scrollingElement;
    scroller.scrollTop = scroller.scrollHeight;
    return new Promise((res) => setTimeout(() => {
      const submit = [...document.querySelectorAll('button')].find((b) => /create account/i.test(b.textContent) && b.type === 'submit');
      const r = submit.getBoundingClientRect();
      res({ top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight, scrollTop: Math.round(scroller.scrollTop) });
    }, 350));
  });
  check(`${label}: submit reachable at bottom`,
    bottom.bottom > 0 && bottom.bottom <= bottom.vh + 2,
    `button bottom=${bottom.bottom}px, viewport=${bottom.vh}px`);

  // 3. Scrolling back to the very top must still show the header.
  const backTop = await page.evaluate(() => {
    const card = document.querySelector('form').closest('div.bg-surface');
    const scroller = card.closest('.overflow-y-auto') || document.scrollingElement;
    scroller.scrollTop = 0;
    return new Promise((res) => setTimeout(() => {
      const h2 = document.querySelector('h2');
      res(Math.round(h2.getBoundingClientRect().top));
    }, 350));
  });
  check(`${label}: header still reachable after scrolling back`, backTop >= 0, `header top=${backTop}px`);

  check(`${label}: no horizontal overflow`, !m.docOverflowX, '');

  await page.screenshot({ path: `${outDir}/scroll-${w}x${h}.png` });
  await page.close();
}

console.log(results.join('\n'));
console.log('\n' + results.filter((r) => r.startsWith('PASS')).length + ' passed, ' +
  results.filter((r) => r.startsWith('FAIL')).length + ' failed');
await browser.close();
