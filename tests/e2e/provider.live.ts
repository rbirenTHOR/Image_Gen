import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("Real OpenAI conversation → fal Max 4K variants → save, inspect and download", async ({
  page,
  context,
}) => {
  test.skip(
    process.env.RUN_LIVE_PROVIDER_TESTS !== "1",
    "Paid provider test requires explicit opt-in.",
  );
  await context.addCookies([
    { name: "__sites_local_auth", value: "1", url: "http://localhost:5173" },
  ]);
  if (process.env.LIVE_QA_PROJECT) {
    await page.goto(
      "/?view=campaign&project=" +
        encodeURIComponent(process.env.LIVE_QA_PROJECT),
    );
  } else {
    await page.goto("/");
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Campaigns", exact: true })
      .click();
    await page
      .getByRole("button", { name: "New campaign", exact: true })
      .click();
    const name = "Browser journey QA · " + new Date().toISOString();
    await page.getByRole("textbox", { name: "Rename campaign" }).fill(name);
    await page.getByRole("textbox", { name: "Rename campaign" }).press("Tab");
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
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
      .getByRole("checkbox", {
        name: "Select Travel trailer · sample",
        exact: true,
      })
      .check();
    await page.getByRole("button", { name: "Use as references" }).click();
    await page
      .getByRole("textbox", { name: "Message your creative partner" })
      .fill(
        "Preserve this exact RV and its markings. Place it in a quiet alpine campground with natural afternoon light, open gravel foreground and distant pine trees. No people. Give me an editable photographic prompt with crisp natural detail.",
      );
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.locator(".assistant-reply")).toHaveCount(1, {
      timeout: 180000,
    });
    await page.getByRole("combobox", { name: "Generation format" }).click();
    await page.getByRole("option", { name: "Wide · 16:9" }).click();
    await page
      .getByRole("button", { name: "Generate 4 images", exact: true })
      .click();
  }
  await page.screenshot({
    path: test.info().outputPath("01-live-generating.png"),
    fullPage: true,
  });
  await expect(page.locator(".chat-result-preview")).toHaveCount(4, {
    timeout: 420000,
  });
  const saveCompleted = page.getByRole("button", {
    name: "Save completed images",
  });
  if (await saveCompleted.isEnabled()) await saveCompleted.click();
  await expect(page.getByText("5 saved images", { exact: true })).toBeVisible();
  const projectId = new URL(page.url()).searchParams.get("project");
  const state = await (await page.request.get("/api/studio/state")).json();
  const images = state.assets.filter(
    (a: any) => a.project_id === projectId && a.quality === "max",
  );
  expect(images).toHaveLength(4);
  for (const a of images)
    expect([a.width, a.height, a.mime]).toEqual([3840, 2160, "image/png"]);
  await test.info().attach("native-image-metadata", {
    body: JSON.stringify(
      images.map((a: any) => ({
        id: a.id,
        width: a.width,
        height: a.height,
        mime: a.mime,
        quality: a.quality,
      })),
      null,
      2,
    ),
    contentType: "application/json",
  });
  await page.screenshot({
    path: test.info().outputPath("02-live-four-results.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Inspect " + images[0].name, exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Actual size", exact: true })
    .click();
  await expect(dialog.locator("img.actual")).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("03-live-native-inspection.png"),
  });
  await dialog.getByRole("button", { name: "Fit image" }).click();
  if (
    !(await dialog.getByRole("link", { name: "Download master" }).isVisible())
  ) {
    for (const label of [
      "RV details checked",
      "Scene checked",
      "Framing checked",
    ])
      await dialog.getByRole("checkbox", { name: label }).check();
    await dialog.getByRole("button", { name: "Approve for export" }).click();
  }
  const wait = page.waitForEvent("download");
  await dialog.getByRole("link", { name: "Download master" }).click();
  const download = await wait;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
    3840, 2160,
  ]);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByText("5 saved images", { exact: true })).toBeVisible();
});
