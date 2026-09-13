import { test, expect, type Page } from "@playwright/test";

async function chat(page: Page) {
  await expect(page.locator(".campaign-workspace")).toBeVisible();
  const tab = page.getByRole("tab", { name: "Creative chat", exact: true });
  if (await tab.isVisible()) await tab.click();
}
async function records(page: Page) {
  return (
    await (
      await page.request.post("http://127.0.0.1:6199/__control", { data: {} })
    ).json()
  ).records;
}
test.beforeEach(async ({ page, context }) => {
  await context.addCookies([
    { name: "__sites_local_auth", value: "1", url: "http://localhost:6173" },
  ]);
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Campaigns", exact: true })
    .click();
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Rename campaign" })
    .fill("Refinement " + test.info().title + " " + test.info().project.name);
  await page.getByRole("textbox", { name: "Rename campaign" }).press("Tab");
});

test("Unsent creative direction and base photo survive reload and stay campaign-specific", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Add images", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", {
      name: "Choose Travel trailer · sample",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Add to campaign", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Inspect Travel trailer · sample",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Make more lifelike", exact: true })
    .click();
  const composer = page.getByRole("textbox", {
    name: "Message your creative partner",
  });
  const text =
    "Keep the same RV and remove painted-looking tree textures. Keep the overcast light.";
  await composer.fill(text);
  const campaignUrl = page.url();
  const before = await records(page);
  await page.reload();
  await chat(page);
  await expect(composer).toHaveValue(text);
  await expect(page.locator(".composer-references img")).toHaveCount(1);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Campaigns", exact: true })
    .click();
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  await chat(page);
  await expect(composer).toHaveValue("");
  await expect(page.locator(".composer-references img")).toHaveCount(0);
  await page.goto(campaignUrl);
  await chat(page);
  await expect(composer).toHaveValue(text);
  expect((await records(page)).length).toBe(before.length);
});

test("Edited generation direction and format survive reload before spending on images", async ({
  page,
}) => {
  await chat(page);
  await page
    .getByRole("textbox", { name: "Message your creative partner" })
    .fill("A restrained overcast forest photograph with real ground texture");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".assistant-reply")).toHaveCount(1);
  const edited =
    "Keep the RV unchanged. Preserve natural grey overcast light, irregular branches and the existing gravel texture.";
  await page
    .getByRole("textbox", { name: /^Enhanced prompt for/ })
    .fill(edited);
  await page.getByRole("combobox", { name: "Generation format" }).click();
  await page.getByRole("option", { name: "Wide · 16:9" }).click();
  const before = await records(page);
  await page.reload();
  await chat(page);
  await expect(
    page.getByRole("textbox", { name: /^Enhanced prompt for/ }),
  ).toHaveValue(edited);
  await expect(
    page.getByRole("combobox", { name: "Generation format" }),
  ).toContainText("Wide");
  expect(
    (await records(page)).filter((r: any) => r.kind === "image").length,
  ).toBe(before.filter((r: any) => r.kind === "image").length);
});

test("A lost generation response recovers the existing two requests without duplicates", async ({
  page,
}) => {
  await chat(page);
  await page
    .getByRole("textbox", { name: "Message your creative partner" })
    .fill(
      "A realistic desert clearing with muted sandstone and neutral daylight",
    );
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".assistant-reply")).toHaveCount(1);
  const before = (await records(page)).filter(
    (r: any) => r.kind === "image",
  ).length;
  let interrupted = false;
  await page.route("**/chat/*/generate", async (route) => {
    await route.fetch();
    interrupted = true;
    await route.abort("failed");
  });
  await page
    .getByRole("button", { name: "Generate 2 images", exact: true })
    .click();
  await expect.poll(() => interrupted).toBe(true);
  await expect(
    page.getByRole("button", { name: "Generate 2 images", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".chat-result img")).toHaveCount(2, {
    timeout: 30000,
  });
  await page.reload();
  await chat(page);
  await expect(page.locator(".chat-result img")).toHaveCount(2);
  expect(
    (await records(page)).filter((r: any) => r.kind === "image").length -
      before,
  ).toBe(2);
});
