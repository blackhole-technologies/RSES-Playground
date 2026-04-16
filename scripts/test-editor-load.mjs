import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Listen for console logs
  page.on('console', msg => console.log('BROWSER:', msg.text()));

  // Listen for page errors
  page.on('pageerror', error => console.error('PAGE ERROR:', error.message));

  // Listen for network errors
  page.on('requestfailed', request => {
    console.error('REQUEST FAILED:', request.url(), request.failure()?.errorText);
  });

  console.log('Navigating to http://localhost:3000/editor...');

  try {
    await page.goto('http://localhost:3000/editor', { waitUntil: 'networkidle', timeout: 10000 });

    // Wait a bit for React to render
    await page.waitForTimeout(2000);

    // Check if root div has content
    const rootContent = await page.locator('#root').innerHTML();
    console.log('\n=== ROOT DIV CONTENT ===');
    console.log(rootContent.substring(0, 500));
    console.log('... (length:', rootContent.length, 'chars)');

    // Take a screenshot
    await page.screenshot({ path: '/tmp/editor-page.png', fullPage: true });
    console.log('\n✓ Screenshot saved to /tmp/editor-page.png');

    // Check for specific React elements
    const hasConfigSidebar = await page.locator('[role="complementary"][aria-label*="Configuration"]').count() > 0;
    const hasMainEditor = await page.locator('#main-editor').count() > 0;
    const hasHeader = await page.locator('header[role="banner"]').count() > 0;

    console.log('\n=== ELEMENT CHECK ===');
    console.log('Config Sidebar:', hasConfigSidebar ? '✓' : '✗');
    console.log('Main Editor:', hasMainEditor ? '✓' : '✗');
    console.log('Header:', hasHeader ? '✓' : '✗');

  } catch (error) {
    console.error('\n✗ Error:', error.message);
  }

  await browser.close();
})();
