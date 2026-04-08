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

5. **Run capture**:
   ```bash
   node ~/.claude/skills/page-manual/capture.js <project>/docs/page-manual-config.js
   ```

6. **Generate markdown** — one `.md` file per page with number-keyed descriptions.

7. **Report result** — list generated files, suggest next steps (PPT generation, Cowork handoff).

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
- `<outputDir>/labeled_<name>.png` — with red circle labels
- `<outputDir>/<name>.png` — raw screenshot (no labels)

Claude additionally writes:
- `<outputDir>/<name>.md` — markdown with per-number descriptions

## Hand-off to Cowork/PPT

The labeled PNG + MD files are designed to be dropped into Claude Cowork:

```
<outputDir>에 있는 labeled_*.png 이미지와 *.md 설명으로
슬라이드 하나씩 만들어서 PPT 생성해줘.
좌측에 이미지, 우측에 번호별 설명. 흰 배경.
```
