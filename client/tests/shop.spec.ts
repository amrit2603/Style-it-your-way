import { test, expect, APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(__dirname, "../..");
async function publish(request: APIRequestContext, category = "shirt", name = `Customer ${category}`) {
  const login = await request.post("/api/auth/login", {
    data: {
      email: "owner@example.test",
      password: "fixture-owner-password-only",
    },
  });
  expect(login.ok()).toBeTruthy();
  const headers = { "X-CSRF-Token": (await login.json()).csrf_token };
  const created = await request.post("/api/admin/products", {
    headers,
    data: {
      name,
      sku: `CLIENT-${category}-${Date.now()}`,
      category,
      audience: "women",
      description: "Fictional browser test product",
      price_minor: 125000,
      currency: "INR",
      sizes: "M, L",
      colors: ["Green", "Gold"],
    },
  });
  expect(created.ok()).toBeTruthy();
  let product = await created.json();
  product = await (
    await request.post(`/api/admin/products/${product.id}/images`, {
      headers,
      multipart: {
        role: "main",
        file: {
          name: "garment.png",
          mimeType: "image/png",
          buffer: fs.readFileSync(path.join(root, "demo/emerald-saree.png")),
        },
      },
    })
  ).json();
  product = await (
    await request.post(`/api/admin/products/${product.id}/reference`, {
      headers,
      data: { asset_id: product.images[0].id, version: product.version },
    })
  ).json();
  const job = await (
    await request.post(`/api/admin/products/${product.id}/generate`, {
      headers,
      data: { version: product.version, idempotency_key: crypto.randomUUID() },
    })
  ).json();
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/style-it/jobs/${job.job_id}`)).json())
          .status,
    )
    .toBe("completed");
  product = await (
    await request.get(`/api/admin/products/${product.id}`)
  ).json();
  const image = product.images.find(
    (image: { kind: string }) => image.kind === "generated",
  );
  product = await (
    await request.post(
      `/api/admin/products/${product.id}/images/${image.id}/review`,
      {
        headers,
        data: { approved: true, public: true, version: product.version },
      },
    )
  ).json();
  expect(
    (
      await request.post(`/api/admin/products/${product.id}/publish`, {
        headers,
        data: { version: product.version },
      })
    ).ok(),
  ).toBeTruthy();
  return product.id as string;
}

test("catalog filters, locked personal preview, comparison and deletion", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/shop?category=saree");
  await expect(page.locator(".product-card").first()).toBeVisible();
  await page.locator(".product-card").first().getByRole("link").first().click();
  await expect(page).toHaveURL(/\/products\//);
  await expect(page.locator(".purchase-form")).toBeVisible();
  const product = new URL(page.url()).pathname.split("/").pop();
  await page.getByRole("link", { name: "Try it on me", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/style/${product}$`));
  await expect(
    page.getByText("This page previews only this product."),
  ).toBeVisible();
  await page.getByRole("checkbox").check();
  await page
    .getByLabel("Upload your photo", { exact: true })
    .setInputFiles(path.join(root, "demo/ivory-suit.png"));
  await expect(page.getByRole("slider")).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByText(/not a personalized result/i).first(),
  ).toBeVisible();
  await page.getByRole("slider").fill("80");
  const photoURL = await page
    .getByAltText("Your uploaded photo")
    .getAttribute("src");
  await page
    .getByRole("button", { name: "Delete my photo & results", exact: true })
    .click();
  await expect(page.getByRole("slider")).toHaveCount(0);
  expect((await page.request.get(photoURL!)).status()).toBe(404);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/shop");
  await expect(page.locator(".product-card").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  fs.mkdirSync(path.join(root, ".impeccable/review/client"), {
    recursive: true,
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) => image.decode().catch(() => {})),
    );
    scrollTo(0, 0);
  });
  await page.screenshot({
    path: path.join(root, ".impeccable/review/client/mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator(".customer-grid img").first()).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) => image.decode().catch(() => {})),
    );
    scrollTo(0, 0);
  });
  await page.screenshot({
    path: path.join(root, ".impeccable/review/client/desktop.png"),
    fullPage: true,
  });
});

test("cart survives signup and checkout retries reuse the order with server prices", async ({
  page,
  playwright,
}) => {
  const admin = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3001",
  });
  const id = await publish(admin);
  await admin.dispose();
  await page.goto(`/products/${id}`);
  await page.getByRole("combobox", { name: /^Size/ }).selectOption("M");
  await page.getByRole("combobox", { name: /^Color/ }).selectOption("Green");
  await page.getByRole("button", { name: /Add to cart/ }).click();
  await expect(page.getByRole("status")).toContainText("Added to your cart");
  await page.evaluate(() => {
    const items = JSON.parse(localStorage.getItem("vyumi-shopping-cart")!);
    items[0].price_minor = 1;
    localStorage.setItem("vyumi-shopping-cart", JSON.stringify(items));
  });
  await page.goto("/checkout");
  await page
    .getByRole("link", { name: "Sign in or create an account" })
    .click();
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page.getByLabel("Your name").fill("Customer Test");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`client-${Date.now()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("customer-test-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/checkout$/);
  await page
    .getByLabel("Delivery address")
    .fill("123 Fictional Test Lane, Test City");
  await page.getByLabel("Phone number").fill("1234567890");
  await page.route(
    "**/api/orders",
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await expect(
    page.getByText("The request may have reached the store.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Order received." }),
  ).toBeVisible();
  await expect(page.locator(".summary-total")).toContainText("1,250");
  const orderURL = page.url();
  const orders = await (await page.request.get("/api/orders")).json();
  expect(orders).toHaveLength(1);
  expect(orders[0].total).toBe(125000);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("vyumi-shopping-cart") || "[]"),
    ),
  ).toEqual([]);
  const stranger = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3001",
  });
  expect((await stranger.get(`/api/orders/${orders[0].id}`)).status()).toBe(
    401,
  );
  await stranger.dispose();
  await page.goto("/account");
  await expect(page.getByRole("link", { name: /Order / })).toHaveCount(1);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.goto(orderURL);
  await expect(
    page.getByRole("heading", { name: "Sign in to view this order" }),
  ).toBeVisible();
});

test("outfit selection sends complementary originals and blocks overlapping pieces", async ({
  page,
  playwright,
}) => {
  const admin = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3001",
  });
  await publish(admin, "shirt", "Outfit shirt");
  await publish(admin, "trousers", "Outfit trousers");
  await admin.dispose();
  await page.goto("/studio");
  await page
    .getByRole("checkbox", { name: "Outfit shirt", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Outfit trousers", exact: true })
    .check();
  await expect(
    page.getByRole("checkbox", { name: "Emerald silk saree", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: /permission to use/ }).check();
  const submitted = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.url().includes("/style-it/generate"),
  );
  await page
    .getByLabel("Upload your photo", { exact: true })
    .setInputFiles(path.join(root, "demo/ivory-suit.png"));
  const payload = (await submitted).postDataJSON();
  expect(payload.additional_product_ids).toHaveLength(1);
  await expect(page.getByRole("slider")).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByText("Fixed demonstration sample · not a personalized result", {
      exact: true,
    }),
  ).toBeVisible();
});
