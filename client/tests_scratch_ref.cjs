const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('https://yapp-mu.com/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: process.argv[2] });
  await page.screenshot({ path: process.argv[3], fullPage: true });
  await browser.close();
})();
