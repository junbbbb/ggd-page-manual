#!/usr/bin/env node
/**
 * Page Manual Capture — reusable labeled screenshot tool.
 *
 * Usage:
 *   node capture.js <config.js>
 *
 * Config format: see template.config.js
 */
const path = require('path');
const fs = require('fs');

let chromium;
try {
  chromium = require('playwright').chromium;
} catch (e) {
  // Fall back to the playwright-skill's local install
  try {
    chromium = require(path.join(require('os').homedir(), '.claude/skills/playwright-skill/node_modules/playwright')).chromium;
  } catch (e2) {
    console.error('Playwright not installed. Install globally or in ~/.claude/skills/playwright-skill/');
    process.exit(1);
  }
}

const LABEL_SIZE = 56;
const LABEL_GAP = 10;
const CONTAINER_PADDING = 8;

/**
 * Inject numbered circle labels into the page DOM at computed positions.
 */
async function injectLabels(page, labels, containerSelector) {
  const containerBox = await page.locator(containerSelector).first().boundingBox();
  const minX = containerBox ? containerBox.x + CONTAINER_PADDING : 0;
  const maxX = containerBox ? containerBox.x + containerBox.width - LABEL_SIZE - CONTAINER_PADDING : Infinity;

  for (const lbl of labels) {
    let loc;
    try {
      loc = page.locator(lbl.selector).first();
      if ((await loc.count()) === 0) {
        console.log(`  [WARN] Selector not found: ${lbl.selector}`);
        continue;
      }
    } catch (e) {
      console.log(`  [WARN] Selector error: ${lbl.selector} - ${e.message}`);
      continue;
    }

    const box = await loc.boundingBox();
    if (!box) {
      console.log(`  [WARN] Element hidden (null bounding box): ${lbl.selector}`);
      continue;
    }

    const anchor = lbl.anchor || 'left';
    let x, y;

    switch (anchor) {
      case 'left':
        x = box.x - LABEL_SIZE - LABEL_GAP;
        y = box.y + box.height / 2 - LABEL_SIZE / 2;
        break;
      case 'top-left':
        x = box.x - LABEL_SIZE / 2;
        y = box.y - LABEL_SIZE - LABEL_GAP;
        break;
      case 'button-tl':
        // 버튼 좌상단 코너에 14px 겹침
        x = box.x - LABEL_SIZE + 14;
        y = box.y - LABEL_SIZE + 14;
        break;
      case 'first-row':
        // IBSheet 헤더 30px 건너뛰고 첫 데이터 행
        x = box.x - LABEL_SIZE - LABEL_GAP;
        y = box.y + 38 - LABEL_SIZE / 2;
        break;
      default:
        x = box.x - LABEL_SIZE - LABEL_GAP;
        y = box.y;
    }

    x += (lbl.dx || 0);
    y += (lbl.dy || 0);

    // Clamp to container bounds
    if (x < minX) x = minX;
    if (x > maxX) x = maxX;

    // Inject DOM element — Node v24 compatible via JSON payload
    const payload = JSON.stringify({ n: lbl.n, x, y, size: LABEL_SIZE });
    await page.evaluate((payloadStr) => {
      const { n, x, y, size } = JSON.parse(payloadStr);
      const circle = document.createElement('div');
      circle.textContent = String(n);
      circle.className = 'pw-capture-label';
      circle.style.cssText =
        'position: absolute;' +
        'left: ' + (x + window.scrollX) + 'px;' +
        'top: ' + (y + window.scrollY) + 'px;' +
        'width: ' + size + 'px;' +
        'height: ' + size + 'px;' +
        'border-radius: 50%;' +
        'background: #d32f2f;' +
        'color: white;' +
        'font-weight: bold;' +
        'font-size: 30px;' +
        'display: flex;' +
        'align-items: center;' +
        'justify-content: center;' +
        'z-index: 999999;' +
        'box-shadow: 0 3px 10px rgba(0,0,0,0.5);' +
        'border: 3px solid white;' +
        'font-family: Arial, sans-serif;' +
        'line-height: 1;' +
        'pointer-events: none;';
      document.body.appendChild(circle);
    }, payload);

    console.log(`  [OK] Label ${lbl.n} at (${Math.round(x)}, ${Math.round(y)})`);
  }
}

async function removeLabels(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.pw-capture-label').forEach(el => el.remove());
  });
}

async function login(page, config) {
  console.log('Logging in...');
  await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.fill('input[name="userId"], input[placeholder*="아이디"]', config.loginId);
  await page.fill('input[type="password"]', config.loginPw);
  await page.click('button:has-text("로그인"), input[type="submit"]');
  await page.waitForTimeout(3000);
  console.log('Login complete!\n');
}

async function capturePage(page, p, config) {
  console.log(`Capturing: ${p.name}...`);
  await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(p.waitMs || 4000);

  if (typeof p.beforeCapture === 'function') {
    await p.beforeCapture(page);
  }

  const containerSel = config.containerSelector || 'div.container';
  const container = page.locator(containerSel).first();
  const labeledPath = path.join(config.outputDir, `labeled_${p.name}.png`);
  const rawPath = path.join(config.rawDirAbs, `${p.name}.png`);

  // Labeled screenshot
  if (p.labels && p.labels.length > 0) {
    await injectLabels(page, p.labels, containerSel);
    await page.waitForTimeout(300);
  }
  if ((await container.count()) > 0) {
    await container.screenshot({ path: labeledPath });
  } else {
    await page.screenshot({ path: labeledPath, fullPage: true });
  }
  console.log(`  Saved: ${labeledPath}`);

  // Raw screenshot (labels removed)
  if (p.labels && p.labels.length > 0) {
    await removeLabels(page);
  }
  if ((await container.count()) > 0) {
    await container.screenshot({ path: rawPath });
  } else {
    await page.screenshot({ path: rawPath, fullPage: true });
  }
  console.log(`  Saved: ${rawPath}\n`);
}

async function main() {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error('Usage: node capture.js <config.js>');
    console.error('See template.config.js for format.');
    process.exit(1);
  }

  const absConfig = path.resolve(configPath);
  if (!fs.existsSync(absConfig)) {
    console.error(`Config file not found: ${absConfig}`);
    process.exit(1);
  }

  const config = require(absConfig);

  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  // Raw 스크린샷은 별도 서브폴더 (기본: raw/)
  const rawDir = config.rawDir
    ? path.resolve(config.outputDir, config.rawDir)
    : path.join(config.outputDir, 'raw');
  if (!fs.existsSync(rawDir)) {
    fs.mkdirSync(rawDir, { recursive: true });
  }
  config.rawDirAbs = rawDir;

  const browser = await chromium.launch({
    headless: config.headless === true,
    slowMo: config.slowMo || 50,
  });
  const context = await browser.newContext({
    viewport: config.viewport || { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  try {
    if (config.loginUrl && config.loginId) {
      await login(page, config);
    }

    for (const p of config.pages) {
      await capturePage(page, p, config);
    }
  } finally {
    await browser.close();
  }

  console.log('All done!');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});
