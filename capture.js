#!/usr/bin/env node
/**
 * Page Manual Capture — reusable labeled screenshot tool.
 *
 * Usage:
 *   node capture.js <config.js> [flags]
 *
 * Flags:
 *   --validate            Dry-run: check selectors without capturing screenshots
 *   --only <name[,name]>  Only process specific page(s) by name (comma-separated)
 *   --skip-raw            Don't save raw (unlabeled) screenshots
 *   --headless            Force headless mode
 *
 * Config format: see template.config.js
 *
 * Outputs (main run):
 *   <outputDir>/NN_<name>.png   — labeled (order-prefixed)
 *   <outputDir>/raw/<name>.png  — raw unlabeled
 *   <outputDir>/_failures.json  — selector failures per page (always written)
 */
const path = require('path');
const fs = require('fs');

let chromium;
try {
  chromium = require('playwright').chromium;
} catch (e) {
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

// ============ CLI arg parsing ============

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    configPath: null,
    validate: false,
    only: null,
    skipRaw: false,
    headless: null,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--validate') opts.validate = true;
    else if (a === '--skip-raw') opts.skipRaw = true;
    else if (a === '--headless') opts.headless = true;
    else if (a === '--only') {
      opts.only = (args[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    }
    else if (!opts.configPath) opts.configPath = a;
  }
  return opts;
}

// ============ Label computation ============

function computeLabelXY(box, anchor, dx = 0, dy = 0) {
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
      // 버튼 좌상단 14px 겹침
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
  return { x: x + dx, y: y + dy };
}

/**
 * Resolve labels: returns { positioned: [...], failures: [...] }
 * Doesn't inject yet.
 */
async function resolveLabels(page, labels, containerSelector) {
  const containerBox = await page.locator(containerSelector).first().boundingBox();
  const minX = containerBox ? containerBox.x + CONTAINER_PADDING : 0;
  const maxX = containerBox ? containerBox.x + containerBox.width - LABEL_SIZE - CONTAINER_PADDING : Infinity;

  const positioned = [];
  const failures = [];

  for (const lbl of labels) {
    const failItem = { n: lbl.n, selector: lbl.selector, reason: null };

    let loc;
    try {
      loc = page.locator(lbl.selector).first();
      if ((await loc.count()) === 0) {
        failItem.reason = 'not_found';
        failures.push(failItem);
        console.log(`  [FAIL] #${lbl.n} not_found: ${lbl.selector}`);
        continue;
      }
    } catch (e) {
      failItem.reason = `selector_error: ${e.message}`;
      failures.push(failItem);
      console.log(`  [FAIL] #${lbl.n} selector_error: ${e.message}`);
      continue;
    }

    const box = await loc.boundingBox();
    if (!box) {
      failItem.reason = 'hidden';
      failures.push(failItem);
      console.log(`  [FAIL] #${lbl.n} hidden: ${lbl.selector}`);
      continue;
    }

    let { x, y } = computeLabelXY(box, lbl.anchor || 'left', lbl.dx, lbl.dy);
    if (x < minX) x = minX;
    if (x > maxX) x = maxX;

    positioned.push({ n: lbl.n, x, y });
    console.log(`  [OK]   #${lbl.n} at (${Math.round(x)}, ${Math.round(y)})`);
  }

  return { positioned, failures };
}

async function injectLabels(page, positioned) {
  for (const { n, x, y } of positioned) {
    const payload = JSON.stringify({ n, x, y, size: LABEL_SIZE });
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

async function processPage(page, p, config, opts) {
  console.log(`[${p._order}/${config._total}] ${p.name}`);
  await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(p.waitMs || 4000);

  if (typeof p.beforeCapture === 'function') {
    await p.beforeCapture(page);
  }

  const containerSel = config.containerSelector || 'div.container';
  const { positioned, failures } = p.labels && p.labels.length > 0
    ? await resolveLabels(page, p.labels, containerSel)
    : { positioned: [], failures: [] };

  if (opts.validate) {
    // Dry-run: don't save screenshots, just report
    return { failures, skipped: true };
  }

  // Save labeled screenshot
  const container = page.locator(containerSel).first();
  const orderStr = String(p._order).padStart(2, '0');
  const labeledPath = path.join(config.outputDir, `${orderStr}_${p.name}.png`);
  const rawPath = path.join(config.rawDirAbs, `${p.name}.png`);

  if (positioned.length > 0) {
    await injectLabels(page, positioned);
    await page.waitForTimeout(300);
  }
  if ((await container.count()) > 0) {
    await container.screenshot({ path: labeledPath });
  } else {
    await page.screenshot({ path: labeledPath, fullPage: true });
  }
  console.log(`  → ${labeledPath}`);

  // Save raw
  if (!opts.skipRaw) {
    if (positioned.length > 0) {
      await removeLabels(page);
    }
    if ((await container.count()) > 0) {
      await container.screenshot({ path: rawPath });
    } else {
      await page.screenshot({ path: rawPath, fullPage: true });
    }
    console.log(`  → ${rawPath}`);
  }

  return { failures, skipped: false };
}

async function main() {
  const opts = parseArgs();

  if (!opts.configPath) {
    console.error('Usage: node capture.js <config.js> [--validate] [--only name1,name2] [--skip-raw] [--headless]');
    process.exit(1);
  }

  const absConfig = path.resolve(opts.configPath);
  if (!fs.existsSync(absConfig)) {
    console.error(`Config not found: ${absConfig}`);
    process.exit(1);
  }

  const config = require(absConfig);

  // Assign 1-based order to each page (for filename prefix)
  config.pages.forEach((p, i) => { p._order = i + 1; });

  // Filter by --only
  let pagesToProcess = config.pages;
  if (opts.only && opts.only.length > 0) {
    const nameSet = new Set(opts.only);
    pagesToProcess = config.pages.filter(p => nameSet.has(p.name));
    if (pagesToProcess.length === 0) {
      console.error(`No pages matched --only ${opts.only.join(',')}`);
      process.exit(1);
    }
    console.log(`Filtered to ${pagesToProcess.length} page(s) via --only\n`);
  }
  config._total = config.pages.length;

  // Ensure dirs (skip in validate mode)
  if (!opts.validate) {
    if (!fs.existsSync(config.outputDir)) {
      fs.mkdirSync(config.outputDir, { recursive: true });
    }
    const rawDir = config.rawDir
      ? path.resolve(config.outputDir, config.rawDir)
      : path.join(config.outputDir, 'raw');
    if (!fs.existsSync(rawDir)) {
      fs.mkdirSync(rawDir, { recursive: true });
    }
    config.rawDirAbs = rawDir;
  } else {
    config.rawDirAbs = config.outputDir;  // unused but set for safety
    console.log('=== VALIDATE MODE (no screenshots will be saved) ===\n');
  }

  const browser = await chromium.launch({
    headless: opts.headless === true || config.headless === true,
    slowMo: config.slowMo || 50,
  });
  const context = await browser.newContext({
    viewport: config.viewport || { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  const report = {
    timestamp: new Date().toISOString(),
    mode: opts.validate ? 'validate' : 'capture',
    total: pagesToProcess.length,
    pagesWithFailures: 0,
    totalLabelFailures: 0,
    failures: {},  // { pageName: [ {n, selector, reason} ] }
  };

  try {
    if (config.loginUrl && config.loginId) {
      await login(page, config);
    }

    for (const p of pagesToProcess) {
      try {
        const result = await processPage(page, p, config, opts);
        if (result.failures.length > 0) {
          report.pagesWithFailures++;
          report.totalLabelFailures += result.failures.length;
          report.failures[p.name] = result.failures;
        }
      } catch (err) {
        console.error(`  ERROR on ${p.name}: ${err.message}`);
        report.failures[p.name] = [{ reason: `page_error: ${err.message}` }];
        report.pagesWithFailures++;
      }
      console.log('');
    }
  } finally {
    await browser.close();
  }

  // Write failure report (always, even in validate mode)
  const reportDir = opts.validate ? config.outputDir : config.outputDir;
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, '_failures.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Summary
  console.log('═══════════════════════════════════');
  console.log(`Mode:            ${report.mode}`);
  console.log(`Pages processed: ${report.total}`);
  console.log(`Pages with fail: ${report.pagesWithFailures}`);
  console.log(`Label failures:  ${report.totalLabelFailures}`);
  console.log(`Report:          ${reportPath}`);
  console.log('═══════════════════════════════════');

  if (report.totalLabelFailures > 0) {
    console.log('\nFailed pages:');
    for (const [name, fails] of Object.entries(report.failures)) {
      console.log(`  ${name}:`);
      for (const f of fails) {
        console.log(`    #${f.n || '?'} ${f.reason} — ${f.selector || ''}`);
      }
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});
