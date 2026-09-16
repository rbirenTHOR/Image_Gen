import { test, expect } from "@playwright/test";
import type { Batch, Job } from "../../lib/domain";
import type { FlowDocument } from "../../lib/campaign-flow";

test("Saved campaign plan controls snapshots, two-image billing, draft retention and conflict protection", async ({
  request,
}) => {
  const headers = { Cookie: "__sites_local_auth=1" };
  const post = (path: string, data: unknown) =>
    request.post("/api/studio/" + path, { headers, data });
  await post("bootstrap", {});
  const project = await (
    await post("projects", { name: "Persistent campaign test" })
  ).json();
  const path = "projects/" + project.id + "/workflow";
  const get = async () =>
    (await (
      await request.get("/api/studio/" + path, { headers })
    ).json()) as FlowDocument;
  let doc = await get();
  doc.state = {
    ...doc.state,
    rv_id: "sample-rv",
    scene_id: "mountain-stillness",
    brief:
      "Muted mountain photography, candid family moments and natural skin.",
    people: "Two adults relaxing; one adult only in close reading shots.",
    props: "Camp chairs and coffee mugs, no bicycles.",
    section: "plan",
  };
  const saved = await request.put("/api/studio/" + path, {
    headers,
    data: doc,
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  doc = await saved.json();
  expect((await get()).state.brief).toBe(doc.state.brief);
  const stale = await request.put("/api/studio/" + path, {
    headers,
    data: { ...doc, revision: doc.revision - 1 },
  });
  expect(stale.status()).toBe(409);
  const control = async (data = {}) =>
    await (
      await request.post("http://127.0.0.1:6199/__control", { data })
    ).json();
  const before = await control({
    failPlan: 0,
    failSubmit: 0,
    failSave: 0,
    failChat: 0,
    noGround: false,
    delay: 10,
  });
  const data = {
    id: crypto.randomUUID(),
    revision: doc.revision,
    shot_ids: doc.state.shots.map((s) => s.id),
  };
  const result = await post(path + "/generate", data);
  expect(result.ok(), await result.text()).toBe(true);
  const batch = (await result.json()) as Batch;
  expect(JSON.parse(batch.workflow_json!)).toEqual(doc.state);
  expect(batch.jobs.map((j) => j.output_aspect)).toEqual([
    "landscape_16_9",
    "portrait_4_3",
  ]);
  expect(batch.jobs[0].generation_prompt).toContain(doc.state.people);
  expect(batch.jobs[0].generation_prompt).toContain(
    "Never copy the RV from reference 2",
  );
  const records = (await control()).records;
  expect(
    records.filter((r: { kind: string }) => r.kind === "image").length -
      before.records.filter((r: { kind: string }) => r.kind === "image").length,
  ).toBe(2);
  expect((await post(path + "/generate", data)).ok()).toBe(true);
  expect((await control()).records.length).toBe(records.length);
  expect(
    (
      await post(path + "/generate", {
        ...data,
        id: crypto.randomUUID(),
        shot_ids: ["establishing", "portrait", "detail"],
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await post(path + "/generate", {
        ...data,
        id: crypto.randomUUID(),
        revision: 0,
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await post(path + "/generate", {
        ...data,
        id: crypto.randomUUID(),
        shot_ids: ["bad"],
      })
    ).status(),
  ).toBe(400);
  let ready: Job[] = [];
  await expect
    .poll(async () => {
      ready = (
        await (
          await request.get("/api/studio/batches/" + batch.id, { headers })
        ).json()
      ).jobs;
      return ready.every((j) => j.status === "ready");
    })
    .toBe(true);
  const gallery = await (
    await request.get("/api/studio/projects/" + project.id + "/gallery", {
      headers,
    })
  ).json();
  expect(gallery.saved_ids.sort()).toEqual(
    ready.map((j) => j.result_asset_id).sort(),
  );
  doc.state.shots[0].aspect = "square_hd";
  doc.state.shots[0].direction =
    "Tactile close view of a coffee mug, with partial RV context.";
  const edited = await request.put("/api/studio/" + path, {
    headers,
    data: doc,
  });
  expect(edited.ok()).toBe(true);
  doc = await edited.json();
  // Replay an old request remains safe after the campaign has changed.
  expect((await post(path + "/generate", data)).ok()).toBe(true);
  expect((await control()).records.length).toBe(records.length);
  const v2 = await post(path + "/generate", {
    id: crypto.randomUUID(),
    revision: doc.revision,
    shot_ids: ["establishing"],
  });
  expect(v2.ok(), await v2.text()).toBe(true);
  const newBatch = await v2.json();
  expect(newBatch.jobs[0].output_aspect).toBe("square_hd");
  expect(newBatch.jobs[0].generation_prompt).toContain(
    "Native output: Square · 1:1",
  );
  expect(newBatch.jobs[0].generation_prompt).toContain("Tactile close view");
  expect(
    JSON.parse(
      (
        await (
          await request.get("/api/studio/batches/" + batch.id, { headers })
        ).json()
      ).workflow_json,
    ).shots[0].aspect,
  ).toBe("landscape_16_9");
  await expect
    .poll(async () =>
      (
        await (
          await request.get("/api/studio/batches/" + newBatch.id, { headers })
        ).json()
      ).jobs.every((j: Job) => j.status === "ready"),
    )
    .toBe(true);
  const chatId = crypto.randomUUID();
  const turn = await post("projects/" + project.id + "/chat", {
    id: chatId,
    text: "Keep the same scene and RV; make the fabric texture more natural.",
    reference_ids: [ready[0].result_asset_id],
  });
  expect(turn.ok(), await turn.text()).toBe(true);
  const refined = await post(
    "projects/" + project.id + "/chat/" + chatId + "/generate",
    {
      count: 1,
      aspect: "landscape_16_9",
      prompt:
        "Keep the same scene and RV; make the fabric texture more natural.",
    },
  );
  expect(refined.ok(), await refined.text()).toBe(true);
  const refinement = await refined.json();
  expect(refinement.jobs[0].shot_id).toBe("establishing");
  expect(JSON.parse(refinement.workflow_json).rv_id).toBe("sample-rv");
  await expect
    .poll(async () =>
      (
        await (
          await request.get("/api/studio/batches/" + refinement.id, { headers })
        ).json()
      ).jobs.every((j: Job) => j.status === "ready"),
    )
    .toBe(true);
});

test("Campaign walkthrough saves direction and plan, generates two distinct formats and resumes results", async ({
  context,
  page,
}) => {
  await context.addCookies([
    { name: "__sites_local_auth", value: "1", url: "http://localhost:6173" },
  ]);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "New campaign", exact: true }),
  ).toBeVisible();
  const project = await (
    await page.request.post("/api/studio/projects", {
      data: { name: "Photographer workflow" },
    })
  ).json();
  await page.goto("/?project=" + project.id + "&view=campaign");
  await page
    .getByRole("button", { name: /Travel trailer.*sample/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Continue to scene", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Mountain stillness/i })
    .first()
    .click();
  await page
    .getByLabel("People & activity", { exact: true })
    .fill("One adult reading beside the RV; candid and relaxed.");
  await page
    .getByLabel("Campaign direction", { exact: true })
    .fill(
      "Soft mountain light, warm neutral wardrobe, lush green surroundings.",
    );
  await page
    .getByRole("button", { name: "Continue to shoot plan", exact: true })
    .click();
  await page
    .getByLabel("Add a shoot package", { exact: true })
    .selectOption("1");
  await expect(
    page.getByText("6 requested photos", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Select next two", exact: true })
    .click();
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(2);
  await expect(page.getByRole("checkbox").nth(2)).toBeDisabled();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("6 requested photos", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Select next two", exact: true })
    .click();
  await page.request.post("http://127.0.0.1:6199/__control", {
    data: {
      failPlan: 0,
      failSubmit: 0,
      failSave: 0,
      failChat: 0,
      noGround: false,
      delay: 10,
    },
  });
  await page
    .getByRole("button", { name: "Generate 2 selected photos", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review your campaign." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review & approve", exact: true }),
  ).toHaveCount(2, { timeout: 30000 });
  await expect(
    page.getByText("2 ready for this brief", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review & approve", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  for (const name of ["RV details checked", "Scene checked", "Framing checked"])
    await page.getByRole("dialog").getByRole("checkbox", { name }).check();
  await page
    .getByRole("button", { name: "Approve for export", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Download master", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBeTruthy();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Close refinements" }).click();
  await page
    .getByRole("button", { name: "2 Scene & lifestyle", exact: true })
    .click();
  await expect(
    page.getByLabel("Campaign direction", { exact: true }),
  ).toHaveValue(
    "Soft mountain light, warm neutral wardrobe, lush green surroundings.",
  );
  await expect(
    page.getByLabel("People & activity", { exact: true }),
  ).toHaveValue("One adult reading beside the RV; candid and relaxed.");
  expect(
    await page
      .locator("body")
      .evaluate((el) => el.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test("A lost generation response survives reload and recovers the same paid requests", async ({
  context,
  page,
}) => {
  await context.addCookies([
    { name: "__sites_local_auth", value: "1", url: "http://localhost:6173" },
  ]);
  await page.goto("/");
  const project = await (
    await page.request.post("/api/studio/projects", {
      data: { name: "Lost campaign response" },
    })
  ).json();
  const path = "/api/studio/projects/" + project.id + "/workflow";
  const doc = await (await page.request.get(path)).json();
  doc.state.rv_id = "sample-rv";
  doc.state.scene_id = "mountain-stillness";
  doc.state.section = "plan";
  expect((await page.request.put(path, { data: doc })).ok()).toBe(true);
  const control = async (data = {}) =>
    await (
      await page.request.post("http://127.0.0.1:6199/__control", { data })
    ).json();
  const before = await control({
    failPlan: 0,
    failSubmit: 0,
    failSave: 0,
    failChat: 0,
    noGround: false,
    delay: 10,
  });
  await page.goto("/?project=" + project.id + "&view=campaign");
  await page
    .getByRole("button", { name: "Select next two", exact: true })
    .click();
  await page.route(
    "**" + path + "/generate",
    async (route) => {
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Generate 2 selected photos", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Recover last request" }),
  ).toBeEnabled();
  await page.reload();
  await page.getByRole("button", { name: "Recover last request" }).click();
  await expect(
    page.getByRole("heading", { name: "Review your campaign." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review & approve", exact: true }),
  ).toHaveCount(2, { timeout: 30000 });
  const after = await control();
  expect(
    after.records.filter((r: { kind: string }) => r.kind === "image").length -
      before.records.filter((r: { kind: string }) => r.kind === "image").length,
  ).toBe(2);
  await expect(
    page.getByRole("button", { name: "Recover last request" }),
  ).toHaveCount(0);
});

test("Browser Back flushes the latest campaign edit before the autosave delay", async ({
  context,
  page,
}) => {
  await context.addCookies([
    { name: "__sites_local_auth", value: "1", url: "http://localhost:6173" },
  ]);
  await page.goto("/");
  const p = await (
    await page.request.post("/api/studio/projects", {
      data: { name: "History save check" },
    })
  ).json();
  await page.goto("/?project=" + p.id + "&view=campaign");
  await page
    .getByRole("navigation", { name: "Studio navigation" })
    .getByRole("button", { name: "Campaigns", exact: true })
    .click();
  await page.getByRole("button", { name: /History save check/ }).click();
  await page
    .getByRole("button", { name: "2 Scene & lifestyle", exact: true })
    .click();
  await page
    .getByLabel("Campaign direction", { exact: true })
    .fill("Keep this latest direction when I immediately navigate Back.");
  await page.goBack();
  await expect(
    page.getByRole("button", { name: "New campaign", exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get("/api/studio/projects/" + p.id + "/workflow")
          ).json()
        ).state.brief,
    )
    .toBe("Keep this latest direction when I immediately navigate Back.");
});
