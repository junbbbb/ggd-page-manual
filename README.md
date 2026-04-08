# ggd-page-manual

Claude Code skill for capturing labeled screenshots of web admin pages (eGovFramework + IBSheet JSP projects) with numbered markers, ready for PPT/user manuals.

## What it does

Given a list of URLs, it:

1. Logs into your admin app automatically
2. Navigates to each page and takes a clipped screenshot of the main content area
3. Injects numbered red circle labels at precise DOM positions (using CSS selectors, not pixel guessing)
4. Saves files with **order-prefixed names** so alphabetical sort = slide order:
   ```
   docs/
   ├── 01_openCatePage.png     ← labeled image (slide 1)
   ├── 01_openCatePage.md      ← description (paired)
   ├── 02_openDtPage.png
   ├── 02_openDtPage.md
   └── raw/
       ├── openCatePage.png    ← unlabeled original (reuse)
       └── openDtPage.png
   ```

Hand the folder to Claude Cowork with a one-liner:

> Process files in alphabetical order. Each `NN_xxx.png` + `NN_xxx.md` pair = one slide.
> Left: image. Right: markdown's numbered descriptions. White background.

## Installation (as Claude Code skill)

```bash
git clone https://github.com/junbbbb/ggd-page-manual.git ~/.claude/skills/page-manual
cd ~/.claude/skills/page-manual
# Playwright must be installed (via ~/.claude/skills/playwright-skill or globally)
```

Once placed in `~/.claude/skills/page-manual/`, Claude Code auto-discovers it. Trigger it by asking Claude to "create a manual" or "screenshot these pages".

## Manual usage (standalone)

```bash
# 1. Copy the template to your project
cp ~/.claude/skills/page-manual/template.config.js ./page-manual-config.js

# 2. Edit it: set login, output dir, and your pages + selectors

# 3. Run
node ~/.claude/skills/page-manual/capture.js ./page-manual-config.js
```

## Config shape

```javascript
module.exports = {
  loginUrl: 'http://localhost:8081/dream/admLog.do?code=adminLogin',
  loginId: 'YOUR_ID',
  loginPw: 'YOUR_PASSWORD',

  outputDir: 'C:/path/to/docs',
  rawDir: 'raw',                      // raw screenshots → outputDir/raw/
  containerSelector: 'div.container', // what to crop to
  viewport: { width: 1920, height: 1080 },

  pages: [
    {
      url: 'http://localhost:8081/dream/.../somePage.do',
      name: 'somePage',
      beforeCapture: async (page) => { /* optional: click rows, etc. */ },
      labels: [
        { n: 1, selector: '.content >> nth=0 >> table.list01 tr:nth-child(1) th', anchor: 'left' },
        { n: 2, selector: '.content >> nth=0 >> .ibsheet_area', anchor: 'first-row' },
        { n: 3, selector: 'a[name="a_reg"]', anchor: 'button-tl' },
      ],
    },
  ],
};
```

## Label anchors

| Anchor | Position | Use for |
|---|---|---|
| `left` | Element left side, vertically centered, outside | Text/headers/grids |
| `first-row` | Grid container top + 38px (skip IBSheet header) | IBSheet first data row |
| `button-tl` | Button top-left with ~14px overlap | Action buttons |
| `top-left` | Just above element | Rarely |

## Selector cheat sheet (eGovFramework + IBSheet)

```javascript
// Search area (first th in form's table)
'.content >> nth=0 >> table.list01 tr:nth-child(1) th'

// IBSheet grid (use `first-row` anchor)
'.content >> nth=0 >> .ibsheet_area'

// Section header by text
'h3.text-title2:has-text("기본항목정보")'

// Action buttons (a tags)
'a[name="a_reg"]'
'.content >> nth=1 >> a[name="a_init"]'

// Session buttons inside .button_div — target the actual button
'.content >> nth=0 >> .button_div button'

// Tab menu
'ul.tab-inner a >> nth=0'
```

## Common pitfalls (learned the hard way)

1. **`:nth-of-type` is element-type based** — doesn't work for class-matched items. Use Playwright `>> nth=N` instead.
2. **Hidden elements have null boundingBox** — `$("a[name=a_modify]").hide()` in `$(document).ready` → use `a_reg` instead.
3. **`.button_div` is full-width** — the actual button is right-aligned inside. Target `.button_div button`, not the wrapper.
4. **IBSheet first-row** — DOM is complex. Use `.ibsheet_area` container with `first-row` anchor (auto-offsets 38px).
5. **Detail forms hidden until row click** — add `beforeCapture` that calls `mySheet_OnDblClick(1, 0, '', 0, 0)`.
6. **Left-edge label clipping** — capture.js clamps labels to container bounds automatically.
7. **Node v24 + page.evaluate** — complex object args fail. capture.js uses JSON string payload (already handled).
8. **Multiple `.content` divs** — use `>> nth=N` to pick by DOM index (including hidden ones).
9. **Korean text in selectors** — `:has-text("한글")` works.
10. **Session buttons require login** — `${sessionScope.button.xxx}` only renders after auth.

## Requirements

- Node.js 18+
- Playwright (installed globally, or via `~/.claude/skills/playwright-skill/`)
- Chromium browser (installed by Playwright)

## License

MIT
