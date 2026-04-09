---
name: page-manual
description: Capture labeled screenshots of web admin pages with numbered markers, extract DOM element positions precisely via CSS selectors, and generate markdown descriptions ready for PPT/user manuals. Use when the user asks to create manuals, take documentation screenshots, generate PPT slides for admin pages, or document UI walkthroughs. Optimized for eGovFramework + IBSheet JSP projects but works with any web app.
---

# Page Manual Generator

Takes logged-in screenshots of web pages, injects numbered circle labels at precise DOM positions, saves labeled PNGs + raw PNGs + markdown descriptions.

## When to trigger

- "스크린샷 찍어서 매뉴얼 만들어줘"
- "PPT용 화면 캡쳐"
- "이 페이지 설명 매뉴얼 생성"
- "admin 페이지 문서화"
- URLs + "manual" or "screenshot" in same request

## Workflow

1. **Gather inputs from user**:
   - URLs to capture
   - Project source path (for JSP analysis)
   - Login URL + credentials (if not already known)
   - Output directory (default: `<project>/docs/`)

2. **Analyze each page's source code**:
   - Find the Spring `@RequestMapping` controller for each URL
   - Identify the JSP view file returned
   - Read the JSP to extract DOM structure:
     * Number of `.content` divs and their order
     * `form[name=...]` names
     * `.ibsheet_area` positions
     * `h3.text-title2` section headers (with text)
     * `.buttons` and `.button_div` locations
     * `a[name="a_xxx"]` action buttons (a_reg, a_init, a_modify, a_del, a_up, a_down, a_import, a_view, a_dataSample)
     * `ul.tab-inner` tab menus
     * Any interactive elements (double-click handlers like `mySheet_OnDblClick`)

3. **Decide labels** (typically 4-7 per page):
   - #1: Search area (first `th` in form table)
   - #2: Main grid (first data row)
   - #3: Section header or first button group
   - #4: Form/detail area
   - #5-7: Action buttons, secondary grids, tabs

4. **Write config file** at `<project>/docs/page-manual-config.js`:
   - Login info
   - Pages array with selectors + anchors
   - Output directory

5. **Validate selectors first (for 10+ pages)**:
   ```bash
   node ~/.claude/skills/page-manual/capture.js <project>/docs/page-manual-config.js --validate
   ```
   Reads `_failures.json` to find broken selectors. Fix them before full capture.

6. **Run capture**:
   ```bash
   node ~/.claude/skills/page-manual/capture.js <project>/docs/page-manual-config.js
   ```

7. **Retry failed pages only** (if needed):
   ```bash
   node capture.js config.js --only pageName1,pageName2
   ```

8. **Generate markdown** — one `NN_name.md` file per page (prefix matches image).

9. **Report result** — list generated files, summarize `_failures.json`, suggest Cowork handoff.

## CLI flags

| Flag | Purpose |
|---|---|
| `--validate` | Dry-run: check all selectors without saving screenshots |
| `--only name1,name2` | Only process specific page(s) by name (comma-separated) |
| `--skip-raw` | Skip saving raw (unlabeled) screenshots |
| `--headless` | Force headless mode |

## Scaling to 50+ pages

For large page sets, use **subagent parallelization** for analysis:

1. **Build pattern library once** — analyze 3-5 representative pages manually, derive selector patterns (search, grid, buttons, headers). Document in a `pattern-library.md`.

2. **Spawn parallel subagents** for JSP analysis:
   - Split pages into batches of 15-25
   - Each `Explore` subagent receives: URL list + pattern library + JSP structure hints
   - Returns structured JSON per page with: `url`, `name`, `selectors[]`, `koreanTitle`, `sectionSummaries[]`
   - Run all batches in parallel (one message, multiple Agent tool calls)

3. **Aggregate** into single config file.

4. **Validate** with `--validate` → fix failures → run full capture.

5. **Spawn parallel subagents again** for markdown generation (one per batch).

6. **Review** by sampling random labeled images, patch specific pages with `--only`.

## Label anchor options

| Anchor | Position | Use for |
|---|---|---|
| `left` | Element's left side, vertically centered, outside | Text labels, headers, table cells, grids |
| `first-row` | Grid container top + 38px offset (skip IBSheet header) | IBSheet first data row |
| `button-tl` | Button top-left corner with ~14px overlap | Action buttons (a_reg, a_del, btn_inquiry, etc.) |
| `top-left` | Just above element | Rarely — when element has no left space |

## Selector cheat sheet (eGovFramework + IBSheet)

```javascript
// Search area (first th in form's table)
'.content >> nth=0 >> table.list01 tr:nth-child(1) th'
'form[name="adminXxx"] table.list01 tr:nth-child(1) th'

// IBSheet grid (use `first-row` anchor)
'.content >> nth=0 >> .ibsheet_area'

// Section header by text
'h3.text-title2:has-text("기본항목정보")'

// Action buttons (use `button-tl` anchor)
'a[name="a_reg"]'
'a[name="a_modify"]'
'.content >> nth=1 >> a[name="a_init"]'

// Session buttons inside .button_div (target actual button, not wrapper)
'.content >> nth=0 >> .button_div button'

// Tab menu
'ul.tab-inner a >> nth=0'

// Form by name (scoped)
'form[name="adminOpenCateOne"] .buttons a[name="a_init"]'
```

## Pitfalls learned the hard way

1. **CSS `:nth-of-type` is element-type based** — doesn't work for class-matched items. Use Playwright `>> nth=N` instead.

2. **Hidden elements have null boundingBox** — JSPs often have `$("a[name=a_modify]").hide()` in $(document).ready. Use `a_reg` or another visible button. Session buttons (`${sessionScope.button.xxx}`) require login — capture must authenticate first.

3. **`.button_div` is usually full-width** — its actual button is right-aligned. Target `.button_div button` (the inner element) not the wrapper, so the label hits the button position.

4. **IBSheet grids render to complex DOM** — can't easily target "first data row" by selector. Use `.ibsheet_area` container with `first-row` anchor (offsets 38px down to skip header).

5. **Detail forms are often hidden until row click** — if user needs to see detail content, add `beforeCapture` that calls `mySheet_OnDblClick(1, 0, '', 0, 0)` then waits 3s.

6. **Container captures clip labels to the left** — always clamp label x to container's left edge + padding (already handled in capture.js).

7. **Node v24 + Playwright page.evaluate** — complex object args fail with `refs.set is not a function`. Pass JSON.stringify'd payload and JSON.parse inside evaluate. (capture.js handles this.)

8. **Multiple `.content` divs with same class** — use `>> nth=N` to pick by index. Count from 0 starting from DOM order (including hidden ones).

9. **Korean text in selectors** — `:has-text("한글")` works reliably for section headers.

10. **Auto-login check** — when navigating, if the URL doesn't include the target page path after redirect, the page needs login. capture.js auto-logs in via credentials from config.

## Waiting for slow-loading pages

Many admin pages fetch grid data via AJAX after `DOMContentLoaded`. The default `waitMs` (4s) isn't enough for grids that take 10-60 seconds to populate. Use `waitFor` per page (declarative, JSON-safe):

```javascript
{
  url: '...',
  labels: [...],
  waitFor: {
    selector: '#dtfile-sheet-section td',  // wait until grid has a <td>
    text: '조회된 데이터가 없습니다',          // OR wait for "no results" text
    hidden: '.loading-spinner',             // wait until spinner disappears
    networkIdle: true,                      // wait for network to go quiet
    js: 'typeof mySheet !== "undefined" && mySheet.RowCount() >= 0',  // custom JS
    extraDelay: 500,                        // extra buffer after conditions pass
    timeout: 90000,                         // max wait (default 90s)
  }
}
```

All conditions are awaited in order; any that trigger `waitFor timeout` is logged as `[WARN] waitFor timeout: ...` but capture continues (so a partial screenshot is still saved).

**Picking the right condition:**

| Scenario | Best option |
|---|---|
| IBSheet grid with AJAX data | `selector: '<grid-id> td'` (first data cell) |
| Grid that may legitimately return 0 rows | Use `js` with IBSheet API, e.g. `'mySheet.IsBusy() === false'` |
| Page with loading overlay | `hidden: '.loading, .sheet-loading'` |
| Multiple async fetches on one page | `networkIdle: true` + `extraDelay: 500` |
| Data appears after running a search button click | Use `beforeCapture` to click, then combine with `waitFor` |

**Slow-loading page template** (for pages that take 30-60s):

```javascript
{
  order: 42, name: 'heavyReportPage',
  url: 'http://host/dream/report/heavyPage.do',
  waitMs: 2000,  // minimal initial wait
  waitFor: {
    selector: '#report-sheet td',   // wait for first data cell
    timeout: 90000,                  // up to 90s
    extraDelay: 1000,                // 1s buffer so chart renders too
  },
  labels: [ /* ... */ ],
}
```

Don't bump `waitMs` to 60s globally — that multiplies total capture time by the number of pages. Use `waitFor` only on the pages that need it.

## Config file template

See `template.config.js` in this skill directory.

Minimal shape:

```javascript
module.exports = {
  loginUrl: 'http://localhost:8081/dream/admLog.do?code=adminLogin',
  loginId: 'userid',
  loginPw: 'password',
  outputDir: 'C:/path/to/docs',
  viewport: { width: 1920, height: 1080 },
  containerSelector: 'div.container',  // What to crop to

  pages: [
    {
      url: 'http://localhost:8081/dream/.../somePage.do',
      name: 'somePage',
      beforeCapture: null,  // or async function
      labels: [
        { n: 1, selector: '.content >> nth=0 >> table.list01 tr:nth-child(1) th', anchor: 'left' },
        { n: 2, selector: '.content >> nth=0 >> .ibsheet_area', anchor: 'first-row' },
        { n: 3, selector: 'a[name="a_reg"]', anchor: 'button-tl' },
      ],
    },
  ],
};
```

## Output

For each page, `capture.js` writes:
- `<outputDir>/NN_<name>.png` — labeled image with red circle markers (NN = 1-based order from `pages` array, zero-padded)
- `<outputDir>/raw/<name>.png` — raw screenshot (no labels), in subfolder
- `<outputDir>/_failures.json` — summary of selector failures per page (always written)

Claude MUST additionally write (matching the same order prefix):
- `<outputDir>/NN_<name>.md` — markdown description with per-number explanations

**Important**: The `NN_` prefix follows the order of the `pages` array in the config. Slide 1 = `01_`, slide 2 = `02_`, etc. This lets Cowork process files in alphabetical order and get the correct slide sequence automatically.

### `_failures.json` schema

```json
{
  "timestamp": "...",
  "mode": "capture|validate",
  "total": 100,
  "pagesWithFailures": 7,
  "totalLabelFailures": 12,
  "failures": {
    "somePageName": [
      { "n": 3, "selector": "a[name='a_reg']", "reason": "hidden" }
    ]
  }
}
```

Reasons: `not_found`, `hidden`, `selector_error: ...`, `page_error: ...`.

## Hand-off to Cowork/PPT

The numbered files in `<outputDir>` are designed for one-shot Cowork prompting:

```
<outputDir>에 있는 파일을 알파벳 순서대로 슬라이드로 만들어줘.
01_xxx.png + 01_xxx.md → 1번 슬라이드
02_yyy.png + 02_yyy.md → 2번 슬라이드
...
각 슬라이드: 좌측 이미지, 우측 md의 번호별 설명. 흰 배경. 깔끔하게.
```

Raw screenshots in `raw/` subfolder are reference/reuse only — Cowork ignores them.
