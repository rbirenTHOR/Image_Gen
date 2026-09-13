import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test.beforeEach(async ({ page, context }) => {
  await context.addCookies([
    { name: "__sites_local_auth", value: "1", url: "http://localhost:6173" },
  ]);
  await page.goto("/");
  await expect(page.getByRole("navigation")).toBeVisible();
});

test("Browser Back and Forward restore the selected screen", async ({
  page,
}) => {
  const nav = page.getByRole("navigation");
  await nav.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("tab", { name: "Objects", exact: true }).click();
  await nav.getByRole("button", { name: "Campaigns", exact: true }).click();
  await page.goBack();
  await expect(
    page.getByRole("tab", { name: "Objects", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.goForward();
  await expect(page.locator(".campaign-home")).toBeVisible();
});

test("Campaign multi-upload, individual approval, actual size and original download", async ({
  page,
}) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Campaigns", exact: true })
    .click();
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  await page
    .getByRole("button", { name: "Add images", exact: true })
    .first()
    .click();
  const jpeg = await readFile(resolve("public/images/sample-rv.jpg"));
  await page.getByLabel("Upload campaign photos").setInputFiles([
    { name: "First reference.jpg", mimeType: "image/jpeg", buffer: jpeg },
    { name: "Second reference.jpg", mimeType: "image/jpeg", buffer: jpeg },
  ]);
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("2 saved images", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Inspect First reference", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Approve for export" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Actual size" }).click();
  await expect(dialog.locator("img.actual")).toBeVisible();
  await dialog.getByRole("button", { name: "Fit image" }).click();
  for (const name of ["RV details checked", "Scene checked", "Framing checked"])
    await dialog.getByRole("checkbox", { name }).check();
  await dialog.getByRole("button", { name: "Approve for export" }).click();
  const downloaded = page.waitForEvent("download");
  await dialog.getByRole("link", { name: "Download master" }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/\.jpg$/);
  await page.keyboard.press("Escape");
  await page.reload();
  await page
    .getByRole("button", { name: "Inspect First reference", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Download master" }),
  ).toBeVisible();
});

test("Rejected upload keeps the form usable for a corrected image", async ({
  page,
}) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Library", exact: true })
    .click();
  await page.getByRole("button", { name: /Add your RV/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Image file").setInputFiles({
    name: "not-a-photo.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Invalid image fixture"),
  });
  await dialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Corrected upload " + test.info().project.name);
  await dialog.getByRole("button", { name: "Add to library" }).click();
  await expect(page.locator("[data-sonner-toast]")).toContainText(
    /JPEG|PNG|WebP|image/i,
  );
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("Image file")
    .setInputFiles(resolve("public/images/sample-rv.jpg"));
  await dialog.getByRole("button", { name: "Add to library" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", {
      name: "View Corrected upload " + test.info().project.name,
      exact: true,
    }),
  ).toBeVisible();
});

test("A failed photo preview can be retried without generating a new image", async ({
  page,
}) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Campaigns", exact: true })
    .click();
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
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
  await expect(page.getByText("1 saved image", { exact: true })).toBeVisible();
  let requests = 0;
  await page.route("**/api/studio/media/sample-rv*", (route) => {
    requests++;
    return requests === 1 ? route.abort("failed") : route.continue();
  });
  await page.reload();
  await page.getByRole("button", { name: "Retry image", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry image", exact: true }),
  ).toBeHidden();
  await expect(page.locator(".campaign-photo img")).toHaveJSProperty(
    "naturalWidth",
    1536,
  );
  expect(requests).toBeGreaterThanOrEqual(2);
  await expect(page.locator(".campaign-photo img")).toHaveCSS(
    "object-fit",
    "contain",
  );
});

test("Make more lifelike prepares a focused chat edit without paying for images", async ({
  page,
}) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Campaigns", exact: true })
    .click();
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
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
  const before = await (
    await page.request.post("http://127.0.0.1:6199/__control", { data: {} })
  ).json();
  await page
    .getByRole("button", {
      name: "Inspect Travel trailer · sample",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Make more lifelike", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("textbox", { name: "Message your creative partner" }),
  ).toHaveValue(/Preserve the exact RV/);
  await expect(page.locator(".composer-references img")).toHaveCount(1);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".assistant-reply")).toHaveCount(1);
  const after = await (
    await page.request.post("http://127.0.0.1:6199/__control", { data: {} })
  ).json();
  expect(after.records.filter((r: any) => r.kind === "image").length).toBe(
    before.records.filter((r: any) => r.kind === "image").length,
  );
  expect(
    after.records.filter((r: any) => r.kind === "chat").at(-1).visionDetails,
  ).toEqual(["high"]);
  await expect(
    page.getByRole("button", { name: "Generate 2 images", exact: true }),
  ).toBeVisible();
});
