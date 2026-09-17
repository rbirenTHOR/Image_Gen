import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page, context }) => {
  await context.addCookies([
    { name: "__sites_local_auth", value: "1", url: "http://localhost:6173" },
  ]);
  await page.goto("/");
  await expect(page.getByRole("navigation")).toBeVisible();
});

test("A campaign attaches an approved model pack while keeping evaluation images held out", async ({
  page,
}) => {
  const state = await (await page.request.get("/api/studio/state")).json();
  expect(state.assets.length).toBeGreaterThanOrEqual(4);
  const source = state.assets.slice(0, 4);
  const name = "Reference pack " + test.info().project.name;
  const created = await page.request.post("/api/studio/model-packs", {
    data: {
      name,
      brand: "Jayco",
      model: "Test model",
      model_year: "2027",
      assets: source.map((asset: { id: string }, index: number) => ({
        asset_id: asset.id,
        role: ["base", "identity", "detail", "evaluation"][index],
        priority: index,
      })),
    },
  });
  expect(created.status()).toBe(201);
  const pack = await created.json();
  const project = await (
    await page.request.post("/api/studio/projects", {
      data: { name: "Model pack campaign" },
    })
  ).json();

  await page.goto(`/?project=${project.id}&view=campaign`);
  const chatTab = page.getByRole("tab", { name: "Creative chat" });
  if ((page.viewportSize()?.width ?? 1000) < 850) {
    await expect(chatTab).toBeVisible();
    await chatTab.click();
    await expect(chatTab).toHaveAttribute("aria-selected", "true");
  }
  const selector = page.getByRole("combobox", { name: "Campaign model pack" });
  await expect(selector).toBeVisible();
  await selector.click();
  await page.getByRole("option", { name: `${name} · 4 images` }).click();

  await expect(page.locator(".composer-references > div")).toHaveCount(3);
  await expect(page.getByText("Base image", { exact: true })).toBeVisible();
  await expect(page.getByText("Reference 3", { exact: true })).toBeVisible();
  const refreshed = await (await page.request.get("/api/studio/state")).json();
  expect(
    refreshed.projects.find((item: { id: string }) => item.id === project.id)
      .model_pack_id,
  ).toBe(pack.id);
});
