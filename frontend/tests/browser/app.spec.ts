import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
const root = path.resolve(__dirname, "../../..");
const garment = path.join(root, "demo/emerald-saree.png");

test("collection, category filtering and detail gallery", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".product-card")).toHaveCount(4);
  await page.getByRole("button", { name: "Sarees", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(2);
  await page.locator(".product-photo").first().click();
  await expect(
    page.getByRole("button", { name: "Try it on me", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".thumbnails button")).toHaveCount(2);
  await page.locator(".thumbnails button").last().click();
  await expect(page.locator(".detail-image img")).toBeVisible();
});

test("shopper photo consent, fixture result, reload and delete", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".product-card").first().getByRole("button").click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Choose your photo" }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByLabel("Upload your photo", { exact: true })
    .setInputFiles(garment);
  await expect(
    dialog.getByText("Your photo is ready", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Generate my look", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Demonstration result" }),
  ).toBeVisible();
  const resultSrc = await dialog
    .locator(".comparison figure")
    .last()
    .locator("img")
    .getAttribute("src");
  expect(resultSrc).toContain("/api/assets/");
  await page.reload();
  await expect(page.locator(".product-card")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Style it your way", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Demonstration result" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete my photo & results", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Choose your photo/ }),
  ).toBeVisible();
  const revoked = await page.request.get(resultSrc!);
  expect(revoked.status()).toBe(404);
});

test("merchant uploads, generates, approves and publishes", async ({
  page,
}) => {
  await page.goto("/merchant");
  await page.getByLabel("Local access token").fill("browser-test-token");
  await page.getByRole("button", { name: "Open studio", exact: true }).click();
  await page.getByRole("link", { name: "Add a garment", exact: true }).click();
  await page
    .getByLabel("Product name", { exact: true })
    .fill("Browser test saree");
  await page.getByLabel("SKU", { exact: true }).fill(`BROWSER-${Date.now()}`);
  await page
    .getByLabel("Garment details & included pieces")
    .fill("A demonstration saree with blouse fabric. Browser workflow test.");
  await page.getByRole("button", { name: "Save & add images" }).click();
  await expect(
    page.getByRole("heading", { name: "Show the garment clearly" }),
  ).toBeVisible();
  await page
    .getByLabel("Upload garment photo", { exact: true })
    .setInputFiles(garment);
  await page
    .getByRole("button", { name: "Use for try-on", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirmed reference", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to generate" }).click();
  await page
    .getByRole("button", { name: "Generate catalog preview", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review before it goes live" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Approve this image", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Publish garment", exact: true })
    .click();
  await expect(
    page.getByText(
      "Published. This garment is now visible in the storefront.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("link", { name: "View product", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Browser test saree", exact: true }),
  ).toBeVisible();
  const productId = new URL(page.url()).pathname.split("/").pop();
  const initialJob = (
    await (await page.request.get(`/api/merchant/products/${productId}`)).json()
  ).latest_job.job_id;
  await page.goto(`/merchant/products/${productId}`);
  await page
    .locator(".editor-steps")
    .getByRole("button", { name: "3 Generate", exact: true })
    .click();
  const keys: string[] = [],
    jobs: string[] = [];
  let dropped = false;
  await page.route("**/api/merchant/products/*/generate", async (route) => {
    keys.push(route.request().postDataJSON().idempotency_key);
    const response = await route.fetch();
    jobs.push((await response.json()).job_id);
    if (!dropped) {
      dropped = true;
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: "Generate catalog preview", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .getByRole("button", { name: "Generate catalog preview", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review before it goes live" }),
  ).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(jobs[0]).toBe(jobs[1]);
  expect(jobs[0]).not.toBe(initialJob);
});

test("desktop and mobile render without horizontal overflow", async ({
  page,
}) => {
  const folder = path.join(root, ".impeccable/review");
  fs.mkdirSync(folder, { recursive: true });
  await page.goto("/");
  await page.locator(".product-card img").first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((i) => i.decode().catch(() => {})),
    );
  });
  await page.screenshot({
    path: path.join(folder, "desktop.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(folder, "mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.locator(".product-card").first().getByRole("button").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({
    path: path.join(folder, "mobile-tryon.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("merchant imports a PDF garment region with accessible crop controls", async ({
  page,
}) => {
  await page.goto("/merchant");
  await page.getByLabel("Local access token").fill("browser-test-token");
  await page.getByRole("button", { name: "Open studio", exact: true }).click();
  await page.getByRole("link", { name: "Add a garment", exact: true }).click();
  await page.getByLabel("Product name", { exact: true }).fill("PDF test suit");
  await page.getByLabel("SKU", { exact: true }).fill(`PDF-${Date.now()}`);
  await page
    .getByLabel("Garment details & included pieces")
    .fill("PDF crop import acceptance fixture.");
  await page.getByRole("button", { name: "Save & add images" }).click();
  await page.waitForURL(/step=images/);
  await page.getByLabel("Upload PDF catalog", { exact: true }).setInputFiles({
    name: "catalog.pdf",
    mimeType: "application/pdf",
    buffer: fs.readFileSync(path.join(root, "demo/catalog-example.pdf")),
  });
  await expect(
    page.getByRole("heading", { name: "Selected region", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Crop left percent").fill("5");
  await page.getByLabel("Crop width percent").fill("90");
  await page
    .getByRole("button", { name: "Add selection to garment", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Use for try-on", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Use for try-on", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirmed reference", exact: true }),
  ).toBeVisible();
  const folder = path.join(root, ".impeccable/review");
  fs.mkdirSync(folder, { recursive: true });
  await page.screenshot({
    path: path.join(folder, "merchant-pdf.png"),
    fullPage: true,
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: path.join(folder, "merchant-pdf-viewport.png"),
    fullPage: false,
  });
});

test("lost shopper response reuses the existing job and keyboard stays in modal", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".product-card").first().getByRole("button").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press(i % 2 ? "Tab" : "Shift+Tab");
    expect(
      await page.evaluate(() =>
        document.querySelector("dialog")?.contains(document.activeElement),
      ),
    ).toBeTruthy();
  }
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByLabel("Upload your photo", { exact: true })
    .setInputFiles(garment);
  await expect(
    dialog.getByText("Your photo is ready", { exact: true }),
  ).toBeVisible();
  let dropped = false;
  const keys: string[] = [],
    jobs: string[] = [];
  await page.route("**/api/style-it/generate", async (route) => {
    keys.push(route.request().postDataJSON().idempotency_key);
    const response = await route.fetch();
    jobs.push((await response.json()).job_id);
    if (!dropped) {
      dropped = true;
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  await dialog
    .getByRole("button", { name: "Generate my look", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog
    .getByRole("button", { name: "Resume my request", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Demonstration result" }),
  ).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(jobs[0]).toBe(jobs[1]);
});

test("shopper recovers an existing request after reload with no remaining allowance", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".product-card").first().getByRole("button").click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByLabel("Upload your photo", { exact: true })
    .setInputFiles(garment);
  await expect(
    dialog.getByText("Your photo is ready", { exact: true }),
  ).toBeVisible();
  let first = true;
  const ids: string[] = [];
  await page.route("**/api/style-it/generate", async (route) => {
    const response = await route.fetch();
    ids.push((await response.json()).job_id);
    if (first) {
      first = false;
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  await dialog
    .getByRole("button", { name: "Generate my look", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await page.route("**/api/health", async (route) => {
    const response = await route.fetch();
    const health = await response.json();
    await route.fulfill({
      json: { ...health, provider_ready: false, remaining_allowance: 0 },
    });
  });
  await page.reload();
  await page.locator(".product-card").first().waitFor();
  await page
    .getByRole("button", { name: "Style it your way", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Resume my request", exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Resume my request", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Demonstration result" }),
  ).toBeVisible();
  expect(ids[0]).toBe(ids[1]);
});
