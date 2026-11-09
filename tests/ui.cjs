// Optional: run against `python3 server.py --port 8134` with Playwright installed.
// Browser contexts are isolated so this smoke test never changes a user's workspace.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.BROADSHEET_TEST_URL || "http://127.0.0.1:8134");
  await page.locator(".story").first().waitFor();
  await page.locator("#source-list button").filter({ hasText: "NASA" }).click();
  assert.ok(
    (await page.locator(".card-source").allTextContents()).every(
      (s) => s === "NASA",
    ),
  );
  const card = page.locator(".story").first(),
    id = await card.getAttribute("data-id");
  await card.locator(".move-handle").press("ArrowRight");
  await card.locator(".resize-handle").press("ArrowRight");
  const position = await card.getAttribute("style");
  await page.reload();
  assert.equal(
    await page.locator(`.story[data-id="${id}"]`).getAttribute("style"),
    position,
  );
  await page.locator("#list-mode").click();
  await page.locator("#search").fill("Hubble");
  assert.ok((await page.locator(".list-story").count()) > 0);
  await page.locator(".list-story .button").first().click();
  await page.locator("#saved-news").click();
  assert.equal(await page.locator(".list-story").count(), 1);
  await page.locator("#canvas-mode").click();
  assert.ok(
    parseInt(await page.locator("#zoom-label").innerText()) > 0,
    "Returning from list must retain positive zoom",
  );
  await page.locator("#add-channel").click();
  await page.locator("#channel-name").fill("Space briefing");
  await page
    .locator("#channel-topics")
    .getByLabel("Space", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Save channel →", exact: true })
    .click();
  await page.reload();
  assert.match(await page.locator("#view-title").innerText(), /Space briefing/);
  await page.locator("#coverage-top").click();
  assert.match(await page.locator("#coverage-dialog").innerText(), /unrated/);
  await page.getByRole("button", { name: "Close source analysis" }).click();
  await page.locator("#source-library").click();
  await page.locator(".import-panel summary").click();
  await page
    .locator("#feed-file")
    .setInputFiles(
      require("node:path").join(__dirname, "fixtures/import.atom"),
    );
  await page.waitForFunction(() =>
    document
      .querySelector("#import-status")
      .textContent.includes("Added 1 story"),
  );
  await page.locator("#library-done").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#menu-toggle").click();
  await page
    .locator("#topic-list button")
    .filter({ hasText: "Cooking" })
    .click();
  assert.equal(
    await page.locator("#menu-toggle").getAttribute("aria-expanded"),
    "false",
  );
  assert.match(await page.locator("#view-title").innerText(), /Cooking/);
  assert.deepEqual(errors, []);
  console.log(
    "Desktop/mobile filters, persistence, saved stories, channels, import, and source context passed",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
