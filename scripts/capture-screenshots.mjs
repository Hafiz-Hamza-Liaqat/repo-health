import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const screenshotsDir = path.resolve(rootDir, 'docs', 'screenshots');

async function capture() {
  fs.mkdirSync(screenshotsDir, { recursive: true });

  console.log('Starting preview server on port 4173...');
  const server = await preview({
    root: rootDir,
    preview: { port: 4173, host: '127.0.0.1' },
  });

  const serverUrl = 'http://127.0.0.1:4173';
  console.log(`Preview server running at ${serverUrl}`);

  console.log('Launching Chromium at 1440x900 viewport...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // High DPI for crisp portfolio screenshots
  });
  const page = await context.newPage();

  try {
    // 1. Homepage
    console.log('Navigating to homepage...');
    await page.goto(serverUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('input[placeholder*="Paste public GitHub repository URL"]');
    
    const homepagePath = path.join(screenshotsDir, 'homepage.png');
    await page.screenshot({ path: homepagePath });
    console.log(`Saved: ${homepagePath}`);

    // 2. Scan Hafiz-Hamza-Liaqat/repo-health
    console.log('Initiating live scan for Hafiz-Hamza-Liaqat/repo-health...');
    const input = page.locator('input[placeholder*="Paste public GitHub repository URL"]');
    await input.fill('https://github.com/Hafiz-Hamza-Liaqat/repo-health');
    await page.locator('button:has-text("Analyze")').click();

    console.log('Waiting for live GitHub API scan and report generation...');
    await page.waitForSelector('text=Category Findings & Verification', { timeout: 60000 });
    // Wait for animations / rendering to stabilize
    await page.waitForTimeout(2000);

    // 3. Report Overview
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    const overviewPath = path.join(screenshotsDir, 'report-overview.png');
    await page.screenshot({ path: overviewPath });
    console.log(`Saved: ${overviewPath}`);

    // 4. Report Findings
    console.log('Scrolling to Category Findings section...');
    const findingsHeader = page.locator('text=Category Findings & Verification');
    await findingsHeader.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);

    const findingsPath = path.join(screenshotsDir, 'report-findings.png');
    await page.screenshot({ path: findingsPath });
    console.log(`Saved: ${findingsPath}`);

    console.log('All screenshots captured successfully!');
  } finally {
    await browser.close();
    server.httpServer.close();
  }
}

capture().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
