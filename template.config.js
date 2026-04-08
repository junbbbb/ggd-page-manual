/**
 * Page Manual Config Template — copy to your project's docs/ folder and edit.
 *
 * Usage:
 *   node ~/.claude/skills/page-manual/capture.js ./page-manual-config.js
 */
module.exports = {
  // Login (set to null/empty to skip login)
  loginUrl: 'http://localhost:8081/dream/admLog.do?code=adminLogin',
  loginId: 'YOUR_ID',
  loginPw: 'YOUR_PASSWORD',

  // Output
  outputDir: 'C:/path/to/your/project/docs',  // Labeled screenshots land here
  rawDir: 'raw',                                // Raw (unlabeled) screenshots → outputDir/raw/
  containerSelector: 'div.container',           // What to crop screenshots to
  viewport: { width: 1920, height: 1080 },
  headless: false,  // true for CI/background
  slowMo: 50,

  pages: [
    // ====== Example: simple page (search + grid + button) ======
    {
      url: 'http://localhost:8081/dream/some/xxxPage.do',
      name: 'xxxPage',
      labels: [
        { n: 1, selector: '.content >> nth=0 >> table.list01 tr:nth-child(1) th', anchor: 'left' },
        { n: 2, selector: '.content >> nth=0 >> .ibsheet_area', anchor: 'first-row' },
        { n: 3, selector: '.content >> nth=0 >> .button_div button', anchor: 'button-tl' },
      ],
    },

    // ====== Example: page with double-click to reveal detail ======
    {
      url: 'http://localhost:8081/dream/some/detailPage.do',
      name: 'detailPage',
      beforeCapture: async (page) => {
        // 첫 행 더블클릭으로 상세 폼 채우기
        await page.evaluate(() => {
          if (typeof mySheet !== 'undefined' && mySheet.RowCount() > 0) {
            if (typeof mySheet_OnDblClick === 'function') {
              mySheet_OnDblClick(1, 0, '', 0, 0);
            }
          }
        });
        await page.waitForTimeout(3000);
      },
      labels: [
        { n: 1, selector: '.content >> nth=0 >> table.list01 tr:nth-child(1) th', anchor: 'left' },
        { n: 2, selector: '.content >> nth=0 >> .ibsheet_area', anchor: 'first-row' },
        { n: 3, selector: 'ul.tab-inner a >> nth=0', anchor: 'left' },
        { n: 4, selector: 'h3.text-title2:has-text("메타 상세정보")', anchor: 'left' },
        { n: 5, selector: '.content >> nth=1 >> a[name="a_init"]', anchor: 'button-tl' },
      ],
    },
  ],
};
