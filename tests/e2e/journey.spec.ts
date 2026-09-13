import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { resolve } from "node:path";

async function control(page: Page, options: Record<string, unknown> = {}) {
  return (
    await page.request.post("http://127.0.0.1:6199/__control", {
      data: options,
    })
  ).json();
}
async function nav(page: Page, name: string) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
}
async function newCampaign(page: Page, name: string) {
  await nav(page, "Campaigns");
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  await page.getByRole("textbox", { name: "Rename campaign" }).fill(name);
  await page.getByRole("textbox", { name: "Rename campaign" }).press("Tab");
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
async function createWizard(page: Page, name: string) {
  await newCampaign(page, name);
  await nav(page, "Create");
  await expect(
    page.getByRole("heading", { name: "Start with the real thing." }),
  ).toBeVisible();
}
async function sampleRV(page: Page) {
  await page
    .getByRole("button", {
      name: "Select Travel trailer · sample",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Choose the setting", exact: true })
    .click();
}
async function setting(page: Page) {
  await sampleRV(page);
  await page
    .getByRole("button", { name: /^Select / })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Compose your photograph", exact: true })
    .click();
}
async function ready(page: Page) {
  await expect(page.getByText("4 of 4 ready", { exact: true })).toBeVisible({
    timeout: 30000,
  });
}
async function gallery(page: Page) {
  await nav(page, "Campaigns");
  await page.locator(".campaign-board").first().click();
}
async function chat(page: Page) {
  const tab = page.getByRole("tab", { name: "Creative chat", exact: true });
  if (await tab.isVisible()) await tab.click();
}
async function evidence(page: Page, name: string) {
  await page.screenshot({
    path: test.info().outputPath(name + ".png"),
    fullPage: true,
  });
  await expect(page.locator("body")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 2,
  );
  expect(overflow, "Page must not scroll horizontally").toBe(false);
}
async function a11y(page: Page) {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const issues = result.violations.filter((v) =>
    ["critical", "serious"].includes(v.impact ?? ""),
  );
  await test.info().attach("accessibility", {
    body: JSON.stringify(issues, null, 2),
    contentType: "application/json",
  });
  expect(
    issues.map((v) => ({
      id: v.id,
      help: v.help,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
}

test.beforeEach(async ({ page, context }) => {
  await control(page, { delay: 900, failSubmit: 0, failSave: 0, failChat: 0 });
  await context.addCookies([
    { name: "__sites_local_auth", value: "1", url: "http://localhost:6173" },
  ]);
  await page.goto("/");
  await expect(page.getByRole("navigation")).toBeVisible();
});
// Finish pending fixture jobs after a failed test so account concurrency cannot leak into the next journey.
test.afterEach(async ({ page }) => {
  if (test.info().status === test.info().expectedStatus) return;
  await control(page, { failSubmit: 0, failSave: 0, failChat: 0 });
  const id = new URL(page.url()).searchParams.get("project");
  if (!id) return;
  await expect
    .poll(
      async () => {
        const batches = await (
          await page.request.get("/api/studio/projects/" + id + "/batches")
        ).json();
        let pending = 0;
        for (const b of batches) {
          const latest = await (
            await page.request.get("/api/studio/batches/" + b.id)
          ).json();
          pending += latest.jobs.filter((j: any) =>
            ["submitting", "queued", "generating", "saving"].includes(j.status),
          ).length;
        }
        return pending;
      },
      { timeout: 25000, intervals: [1000, 2000, 4000] },
    )
    .toBe(0);
});
test("Sign-in explains private access and opens the studio", async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await page.goto("/");
  await expect(
    page.getByText("Sign in to your private image studio."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Sign in with ChatGPT" }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
  await evidence(page, "signed-in");
});
test("Complete wizard: upload, prompt, four choices, people, objects, approval and export", async ({
  page,
}) => {
  const reference = "Journey reference " + test.info().project.name;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await createWizard(page, "Journey " + test.info().project.name);
  await expect(
    page.getByRole("button", { name: "Choose the setting", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /Add your RV/ }).click();
  const upload = page.getByRole("dialog");
  await upload
    .getByLabel("Image file")
    .setInputFiles(resolve("public/images/sample-rv.jpg"));
  await upload
    .getByRole("textbox", { name: "Name", exact: true })
    .fill(reference);
  await upload
    .getByRole("textbox", { name: "Brand", exact: true })
    .fill("Test brand");
  await upload.getByRole("button", { name: "Add to library" }).click();
  await expect(upload).toBeHidden();
  await page.getByRole("textbox", { name: "Search library" }).fill(reference);
  await page
    .getByRole("button", { name: "Select " + reference, exact: true })
    .click();
  await evidence(page, "01-rv-selected");
  await page
    .getByRole("button", { name: "Choose the setting", exact: true })
    .click();
  await page.getByRole("tab", { name: "Generate a setting" }).click();
  await page
    .getByLabel("Creative brief", { exact: true })
    .fill(
      "A quiet alpine lakeshore with level gravel foreground and warm afternoon sunlight.",
    );
  await page
    .getByRole("button", { name: "Enhance prompt", exact: true })
    .click();
  await expect(page.getByLabel("Enhanced prompt · editable")).toBeVisible();
  await page
    .getByLabel("Enhanced prompt · editable")
    .fill(
      "A quiet alpine lakeshore with open level gravel foreground. Preserve real photographic detail and natural afternoon sunlight. No vehicles or people.",
    );
  const before = (await control(page)).records.filter(
    (r: any) => r.kind === "image",
  ).length;
  await page.getByRole("button", { name: "Create 4 landscapes" }).click();
  await expect(page.getByText("0 of 4 ready", { exact: false })).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Generate a setting" }).click();
  await ready(page);
  await evidence(page, "02-landscape-options");
  const requests = (await control(page)).records
    .filter((r: any) => r.kind === "image")
    .slice(before);
  expect(requests).toHaveLength(4);
  expect(
    Math.max(...requests.map((r: any) => r.at)) -
      Math.min(...requests.map((r: any) => r.at)),
  ).toBeLessThan(1500);
  for (const r of requests) {
    expect(r.input.quality).toBe("max");
    expect(r.input.output_format).toBe("png");
    expect(r.input.image_size).toEqual({ width: 3264, height: 2448 });
  }
  await page
    .getByRole("button", { name: "Select Landscape · Take 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Compose your photograph", exact: true })
    .click();
  await page.getByRole("button", { name: "Generate 4 takes" }).click();
  await ready(page);
  await page.getByRole("button", { name: "Save all ready" }).click();
  await page
    .getByRole("button", { name: "Select Composition · Take 2", exact: true })
    .click();
  await evidence(page, "03-composition-options");
  await a11y(page);
  await page
    .getByRole("button", { name: "Continue with this photo", exact: true })
    .click();
  await page.getByLabel("Adults", { exact: true }).fill("2");
  await page.getByLabel("Children", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Generate 4 takes" }).click();
  await ready(page);
  await page
    .getByRole("button", { name: "Select People · Take 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use this version", exact: true })
    .click();
  await page.getByRole("tab", { name: "Objects", exact: true }).click();
  await page
    .getByLabel("Creative brief", { exact: true })
    .fill(
      "Add two folding chairs beside the RV. Preserve all existing people and vehicle details.",
    );
  await page.getByRole("button", { name: "Generate 4 takes" }).click();
  await ready(page);
  await page
    .getByRole("button", { name: "Select Objects · Take 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use this version", exact: true })
    .click();
  await evidence(page, "04-optional-additions");
  await a11y(page);
  await page
    .getByRole("button", { name: "Review current scene", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Approve & save" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Compare with source RV" }).click();
  await expect(page.getByRole("dialog").getByRole("img")).toHaveCount(2);
  await page.keyboard.press("Escape");
  for (const c of [
    "RV shape, graphics and badges checked",
    "People, objects and shadows checked",
    "Framing and crop checked",
  ])
    await page.getByRole("checkbox", { name: c }).check();
  await page.getByRole("button", { name: "Approve & save" }).click();
  await expect(
    page.getByText("Approved and saved", { exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download master" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.jpg$/);
  await page
    .getByRole("combobox", { name: "Export framing", exact: true })
    .click();
  await page.getByRole("option", { name: "Square · 1:1" }).click();
  await expect(
    page.getByRole("button", { name: "Download crop" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "Framing and crop checked" })
    .check();
  const horizontal = page.getByRole("slider", {
    name: "Horizontal crop position",
  });
  await horizontal.focus();
  await horizontal.press("ArrowRight");
  await expect(horizontal).toHaveAttribute("aria-valuenow", "51");
  await expect(
    page.getByRole("button", { name: "Download crop" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "Framing and crop checked" })
    .check();
  const crop = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download crop" }).click();
  expect((await crop).suggestedFilename()).toMatch(/\.jpg$/);
  await evidence(page, "05-review-export");
  await a11y(page);
  expect(errors).toEqual([]);
});
test("Campaign collection: multiple photos, ordered references, chat, variations, reload and removal", async ({
  page,
}) => {
  const name = "Collection " + test.info().project.name;
  await newCampaign(page, name);
  await page
    .getByRole("button", { name: "Add images", exact: true })
    .first()
    .click();
  const picker = page.getByRole("dialog");
  await picker
    .getByRole("button", {
      name: "Choose Travel trailer · sample",
      exact: true,
    })
    .click();
  await picker
    .getByRole("button", { name: /Choose / })
    .filter({ hasNotText: "Travel trailer" })
    .first()
    .click();
  await picker.getByRole("button", { name: "Add to campaign" }).click();
  await expect(page.getByText("2 saved images", { exact: true })).toBeVisible();
  await evidence(page, "06-campaign-gallery");
  await page
    .getByRole("checkbox", { name: /Select / })
    .nth(0)
    .check();
  await page
    .getByRole("checkbox", { name: /Select / })
    .nth(1)
    .check();
  await page.getByRole("button", { name: "Use as references" }).click();
  await chat(page);
  await expect(page.locator(".composer-references img")).toHaveCount(2);
  await page
    .getByRole("textbox", { name: "Message your creative partner" })
    .fill("Keep this RV and make the scene feel like early autumn.");
  await page.getByRole("button", { name: "Send message" }).click();
  await page
    .getByRole("textbox", { name: "Message your creative partner" })
    .fill("Keep this draft while the reply arrives.");
  await expect(page.locator(".assistant-reply")).toHaveCount(1);
  await expect(
    page.getByRole("textbox", { name: "Message your creative partner" }),
  ).toHaveValue("Keep this draft while the reply arrives.");
  await page
    .getByRole("button", { name: "Generate 4 images", exact: true })
    .click();
  await expect(page.locator(".chat-result-preview")).toHaveCount(4, {
    timeout: 30000,
  });
  await evidence(page, "07-chat-results");
  await a11y(page);
  await page.getByRole("button", { name: "Save completed images" }).click();
  await page.reload();
  await chat(page);
  await expect(page.locator(".assistant-reply")).toHaveCount(1);
  await expect(page.locator(".chat-result-preview")).toHaveCount(4);
  const gal = page.getByRole("tab", { name: "Gallery", exact: true });
  if (await gal.isVisible()) await gal.click();
  await expect(page.getByText("6 saved images", { exact: true })).toBeVisible();
  await page
    .getByRole("checkbox", { name: /Select / })
    .first()
    .check();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText("5 saved images", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("5 saved images", { exact: true })).toBeVisible();
});
test("Recovery: failed generation retries one slot and interrupted saving never regenerates", async ({
  page,
}) => {
  await createWizard(page, "Recovery " + test.info().project.name);
  await setting(page);
  await control(page, { failSubmit: 1, failSave: 1 });
  const before = (await control(page)).records.filter(
    (r: any) => r.kind === "image",
  ).length;
  await page.getByRole("button", { name: "Generate 4 takes" }).click();
  await expect(
    page.getByText("Generation failed", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry saving" })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Retry saving" }).click();
  expect(
    (await control(page)).records.filter((r: any) => r.kind === "image")
      .length - before,
  ).toBe(4);
  await page.getByRole("button", { name: "Retry this image" }).click();
  await ready(page);
  expect(
    (await control(page)).records.filter((r: any) => r.kind === "image")
      .length - before,
  ).toBe(5);
});
test("Recovery: failed chat retains the message and retries without generating images", async ({
  page,
}) => {
  await newCampaign(page, "Chat recovery " + test.info().project.name);
  await chat(page);
  await control(page, { failChat: 1 });
  const before = (await control(page)).records.filter(
    (r: any) => r.kind === "image",
  ).length;
  await page
    .getByRole("textbox", { name: "Message your creative partner" })
    .fill("Create a new alpine lake campaign image.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("button", { name: "Retry reply" })).toBeVisible();
  await page.getByRole("button", { name: "Retry reply" }).click();
  await expect(page.locator(".assistant-reply")).toHaveCount(1);
  expect(
    (await control(page)).records.filter((r: any) => r.kind === "image").length,
  ).toBe(before);
});
test("Navigation preserves the library and campaigns screen after reload", async ({
  page,
}) => {
  await nav(page, "Library");
  await page.getByRole("tab", { name: "Objects", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Objects", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await nav(page, "Campaigns");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "New campaign", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".campaign-home")).toBeVisible();
});
test("Next steps communicate prerequisites before a user hits an error", async ({
  page,
}) => {
  await createWizard(page, "Prerequisites " + test.info().project.name);
  const future = page
    .getByRole("button", { name: /^(5 Review & export|Review & export)/ })
    .filter({ visible: true });
  await expect(future).toBeDisabled();
});
test("A library search with no results explains how to recover", async ({
  page,
}) => {
  await createWizard(page, "Search " + test.info().project.name);
  await page
    .getByRole("textbox", { name: "Search library" })
    .fill("no-such-vehicle-xyz");
  await expect(page.getByText("No matching images")).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Select Travel trailer · sample",
      exact: true,
    }),
  ).toBeVisible();
});
test("Accessible keyboard paths, contrast, dialogs and responsive layout", async ({
  page,
}) => {
  await createWizard(page, "Accessibility " + test.info().project.name);
  await evidence(page, "accessibility-wizard");
  await a11y(page);
  await page.getByRole("button", { name: /Add your RV/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await a11y(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: /Add your RV/ })).toBeFocused();
  await nav(page, "Library");
  await a11y(page);
  await nav(page, "Campaigns");
  await evidence(page, "accessibility-campaign-home");
  await a11y(page);
  await page.locator(".campaign-board").first().click();
  await evidence(page, "accessibility-campaign-workspace");
  await a11y(page);
  await chat(page);
  await a11y(page);
});
