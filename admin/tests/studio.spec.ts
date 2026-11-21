import { expect, test, Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(__dirname, "../..");
const garment = path.join(root, "demo/emerald-saree.png");
const model = path.join(root, "demo/ivory-suit.png");
async function signIn(page: Page) {
  await page.goto("/admin/dashboard");
  await page.getByLabel("Email", { exact: true }).fill("owner@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("fixture-owner-password-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your store, at a glance" }),
  ).toBeVisible();
}
async function csrf(page: Page) {
  const session = await page.request.post("/api/sessions", { data: {} });
  expect(session.ok()).toBeTruthy();
  return (await session.json()).csrf_token as string;
}

test("account roles protect the studio and sign-out revokes access", async ({
  page,
}) => {
  await page.goto("/admin/products");
  expect([401, 403]).toContain(
    (await page.request.get("/api/admin/products")).status(),
  );
  const customer = await page.request.post("/api/auth/signup", {
    data: {
      name: "Fixture customer",
      email: `customer-${Date.now()}@example.test`,
      password: "fixture-customer-password",
    },
  });
  const account = (await customer.json()).user;
  await page.reload();
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("fixture-customer-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".studio-signin").getByRole("alert")).toContainText(
    "does not have store access",
  );
  await page.getByLabel("Email", { exact: true }).fill("owner@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("fixture-owner-password-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your products" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome to your studio" }),
  ).toBeVisible();
  expect([401, 403]).toContain(
    (await page.request.get("/api/admin/products")).status(),
  );
});

test("product, model library, generation, review and publication", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("link", { name: "Add a product", exact: true }).click();
  await page
    .getByLabel("Product name", { exact: true })
    .fill("Studio workflow saree");
  await page.getByLabel("SKU", { exact: true }).fill(`STUDIO-${Date.now()}`);
  await page
    .getByLabel("Product details & included pieces")
    .fill("Fictional test saree, including blouse fabric.");
  await page.getByLabel("Colors (comma separated)").fill("Emerald, Gold");
  await page.getByRole("button", { name: "Save & add images" }).click();
  await expect(
    page.getByRole("heading", { name: "Show the garment clearly" }),
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await page
    .getByLabel("Upload garment photo", { exact: true })
    .setInputFiles(garment);
  await page
    .getByRole("button", { name: "Use for try-on", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirmed reference", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Photo library", exact: true }).click();
  await page
    .getByLabel("Photo label", { exact: true })
    .fill("Asha front · fictional sample");
  await page
    .getByRole("combobox", { name: "Collection", exact: true })
    .selectOption("women");
  await page.getByLabel("Model photo", { exact: true }).setInputFiles(model);
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Add to library", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Photo added to your private library.",
  );
  await page.goto(`/admin/ai-generate?product=${id}`);
  await expect(
    page.getByRole("combobox", { name: "Product", exact: true }),
  ).toHaveValue(id);
  await page
    .getByRole("button", {
      name: "Choose Asha front · fictional sample",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Create preview", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Review & publish" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByText(
      "Fixed demonstration sample · This is not a personalized result.",
      { exact: true },
    ),
  ).toBeVisible();
  expect((await page.request.get(`/api/products/${id}`)).status()).toBe(404);
  await page.getByRole("link", { name: "Review & publish" }).click();
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
  const published = await (
    await page.request.get(`/api/products/${id}`)
  ).json();
  expect(published.colors).toEqual(["Emerald", "Gold"]);
  expect(
    published.images.every(
      (image: { approved: boolean; public: boolean }) =>
        image.approved && image.public,
    ),
  ).toBeTruthy();
  await page.getByRole("link", { name: "Products", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your products", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) => image.decode().catch(() => {})),
    );
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await expect(page.locator(".admin-table .product-cell img")).toHaveCount(5);
  await page.evaluate(async () => { await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); });
  const folder = path.join(root, ".impeccable/review/admin");
  fs.mkdirSync(folder, { recursive: true });
  await page.screenshot({
    path: path.join(folder, "desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(folder, "mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome to your studio" }),
  ).toBeVisible();
});

test("orders move forward and archiving preserves order history", async ({
  page,
  playwright,
}) => {
  await signIn(page);
  const headers = { "X-CSRF-Token": await csrf(page) };
  const created = await page.request.post("/api/admin/products", {
    headers,
    data: {
      name: "Order history product",
      sku: `ORDER-${Date.now()}`,
      category: "saree",
      audience: "women",
      description: "Test product for unpaid order workflow",
      price_minor: 125000,
      currency: "INR",
      sizes: "M, L",
      colors: ["Green"],
    },
  });
  expect(created.ok()).toBeTruthy();
  let product = await created.json();
  const uploaded = await page.request.post(
    `/api/admin/products/${product.id}/images`,
    {
      headers,
      multipart: {
        role: "main",
        file: {
          name: "garment.png",
          mimeType: "image/png",
          buffer: fs.readFileSync(garment),
        },
      },
    },
  );
  product = await uploaded.json();
  const asset = product.images[0].id;
  product = await (
    await page.request.post(`/api/admin/products/${product.id}/reference`, {
      headers,
      data: { asset_id: asset, version: product.version },
    })
  ).json();
  const generation = await page.request.post(
    `/api/admin/products/${product.id}/generate`,
    {
      headers,
      data: {
        version: product.version,
        idempotency_key: `order-catalog-${Date.now()}`,
      },
    },
  );
  expect(generation.ok()).toBeTruthy();
  const job = await generation.json();
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`/api/style-it/jobs/${job.job_id}`)
          ).json()
        ).status,
    )
    .toBe("completed");
  product = await (
    await page.request.get(`/api/admin/products/${product.id}`)
  ).json();
  const generated = product.images.find(
    (image: { kind: string }) => image.kind === "generated",
  );
  product = await (
    await page.request.post(
      `/api/admin/products/${product.id}/images/${generated.id}/review`,
      {
        headers,
        data: { approved: true, public: true, version: product.version },
      },
    )
  ).json();
  const published = await page.request.post(
    `/api/admin/products/${product.id}/publish`,
    { headers, data: { version: product.version } },
  );
  expect(published.ok()).toBeTruthy();
  const customer = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3001",
  });
  try {
    const signup = await customer.post("/api/auth/signup", {
      data: {
        name: "Order customer",
        email: `order-${Date.now()}@example.test`,
        password: "fixture-customer-password",
      },
    });
    const session = await signup.json();
    const order = await customer.post("/api/orders", {
      headers: { "X-CSRF-Token": session.csrf_token },
      data: {
        items: [
          { product_id: product.id, quantity: 2, size: "M", color: "Green" },
        ],
        name: "Order customer",
        address: "123 Fixture Lane, Test City",
        phone: "1234567890",
        idempotency_key: `checkout-${Date.now()}`,
      },
    });
    expect(order.status()).toBe(201);
    const receipt = await order.json();
    await page.getByRole("link", { name: "Orders", exact: true }).click();
    await page
      .getByText(`Order customer · ${receipt.id.slice(0, 8)}`, { exact: true })
      .click();
    for (const next of ["confirmed", "shipped", "delivered"]) {
      await page
        .getByRole("button", { name: `Mark ${next}`, exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(`marked ${next}`);
    }
    await page.getByRole("link", { name: "Products", exact: true }).click();
    await page.getByLabel("Search products").fill("Order history product");
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await page
      .getByRole("button", { name: "Archive product", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Product archived");
    expect(
      (await page.request.get(`/api/products/${product.id}`)).status(),
    ).toBe(404);
    const history = await (
      await customer.get(`/api/orders/${receipt.id}`)
    ).json();
    expect(history.status).toBe("delivered");
    expect(history.items[0].name).toBe("Order history product");
    expect(history.total).toBe(250000);
  } finally {
    await customer.dispose();
  }
});

test("room library and PDF preparation remain usable in the separate app", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("link", { name: "Photo library", exact: true }).click();
  await page.getByRole("button", { name: "Rooms", exact: true }).click();
  await page
    .getByLabel("Photo label", { exact: true })
    .fill("Room upload fixture");
  await page.getByLabel("Room type", { exact: true }).fill("Fixture only");
  await page.getByLabel("Room photo", { exact: true }).setInputFiles(garment);
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Add to library", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Photo added to your private library.",
  );
  await expect(
    page.getByRole("img", { name: "Room upload fixture", exact: true }),
  ).toBeVisible();
  await page.route("**/api/admin/stock-models", async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({ response });
  });
  const delayedModelResponse = page.waitForResponse(
    "**/api/admin/stock-models",
  );
  await page.getByRole("button", { name: "Models", exact: true }).click();
  await page.getByRole("button", { name: "Rooms", exact: true }).click();
  await delayedModelResponse;
  await expect(
    page.getByRole("img", { name: "Room upload fixture", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Products", exact: true }).click();
  await page.getByRole("link", { name: "Add a product", exact: true }).click();
  await page
    .getByLabel("Product name", { exact: true })
    .fill("PDF studio product");
  await page
    .getByLabel("SKU", { exact: true })
    .fill(`PDF-STUDIO-${Date.now()}`);
  await page
    .getByLabel("Product details & included pieces")
    .fill("PDF selection test");
  await page.getByRole("button", { name: "Save & add images" }).click();
  await page
    .getByLabel("Upload PDF catalog", { exact: true })
    .setInputFiles(path.join(root, "demo/catalog-example.pdf"));
  await expect(
    page.getByRole("button", { name: "Select PDF page 1", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add selection to garment", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Use for try-on", exact: true }),
  ).toBeVisible({ timeout: 15000 });
});
