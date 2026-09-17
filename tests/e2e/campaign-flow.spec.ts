import { test, expect } from "@playwright/test";
import type { Batch, Job } from "../../lib/domain";
import { plannedShot, type FlowDocument } from "../../lib/campaign-flow";

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
    setup: { mode: "custom", name: "Custom setup" },
    shots: [plannedShot("establishing"), plannedShot("portrait")],
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
  expect(batch.jobs[0].generation_prompt).toContain("SCENE INTEGRATION");
  expect(batch.jobs[0].generation_prompt).toContain("compact contact shadows");
  expect(batch.jobs[0].generation_prompt).toContain("instead of copying reflections");
  expect(batch.jobs[0].generation_prompt!.split(doc.state.brief)).toHaveLength(2);
  expect(records.filter((r: {plan?: boolean}) => r.plan).at(-1)!.instructions)
    .toContain("Replace the source photo's studio/dealer lighting");

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
    .getByRole("button", { name: "Create a custom setup", exact: true })
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
    .getByLabel("Choose deliverables", { exact: true })
    .selectOption("1");
  await expect(
    page.getByText("6 requested photos", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(6);
  await expect(page.getByRole("checkbox").nth(2)).toBeEnabled();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("6 requested photos", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Select all", exact: true }).click();
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
  for (let i = 2; i < 6; i++) await page.getByRole("checkbox").nth(i).uncheck();
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
    .getByRole("button", { name: "2 Shoot setup", exact: true })
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
  doc.state.setup = { mode: "custom", name: "Custom setup" };
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
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.route(
    "**" + path + "/generate",
    async (route) => {
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  for (let i = 2; i < 6; i++) await page.getByRole("checkbox").nth(i).uncheck();
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
    .getByRole("button", { name: "2 Shoot setup", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create a custom setup", exact: true })
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

test("Existing setup snapshot rejects contradictory fields and generation waits for a setup", async ({
  request,
}) => {
  const headers = { Cookie: "__sites_local_auth=1" };
  await request.post("/api/studio/bootstrap", { headers, data: {} });
  const project = await (
    await request.post("/api/studio/projects", {
      headers,
      data: { name: "Setup integrity contract" },
    })
  ).json();
  const path = "/api/studio/projects/" + project.id + "/workflow";
  let doc = await (await request.get(path, { headers })).json();
  expect(doc.state.shots).toHaveLength(6);
  const unselected = await request.post(path + "/generate", {
    headers,
    data: {
      id: crypto.randomUUID(),
      revision: doc.revision,
      shot_ids: ["establishing"],
    },
  });
  expect(unselected.status()).toBe(400);
  const snapshot = {
    scene_id: "mountain-stillness",
    scene_mode: "place",
    brief: "Soft forest light",
    people: "One reader, no dogs",
    props: "One chair, no bikes",
    prop_ids: [],
  };
  doc.state = {
    ...doc.state,
    ...snapshot,
    rv_id: "sample-rv",
    setup: {
      mode: "existing",
      name: "Mountain reading",
      source: "Fixture revision 1",
      snapshot,
    },
  };
  let response = await request.put(path, { headers, data: doc });
  expect(response.ok(), await response.text()).toBe(true);
  doc = await response.json();
  for (const patch of [
    { scene_id: "alpine-shoreline" },
    { people: "Two cyclists" },
    { props: "Bikes" },
    { brief: "Desert sunset" },
    { scene_mode: "look" },
    { prop_ids: ["bad-reference"] },
  ]) {
    response = await request.put(path, {
      headers,
      data: { ...doc, state: { ...doc.state, ...patch } },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toContain("conflicting edits");
  }
  expect((await (await request.get(path, { headers })).json()).state).toEqual(
    doc.state,
  );
  doc.state.setup = {
    mode: "custom",
    name: "Custom setup",
    derived_from: "Mountain reading",
  };
  doc.state.people = "Two adults reading";
  response = await request.put(path, { headers, data: doc });
  expect(response.ok(), await response.text()).toBe(true);
});

test("Selected campaign delivers all checked shots together before polling with replay safety", async ({
  request,
}) => {
  const headers = { Cookie: "__sites_local_auth=1" };
  const control = async (data = {}) =>
    await (
      await request.post("http://127.0.0.1:6199/__control", { data })
    ).json();
  const baseline = await control({
    delay: 1,
    failPlan: 0,
    failSubmit: 0,
    failSave: 0,
    noGround: false,
  });
  const imageCount = (records: { kind: string }[]) =>
    records.filter((r) => r.kind === "image").length;
  await request.post("/api/studio/bootstrap", { headers, data: {} });
  const p = await (
    await request.post("/api/studio/projects", {
      headers,
      data: { name: "Full selection contract" },
    })
  ).json();
  const path = "/api/studio/projects/" + p.id + "/workflow";
  let doc = await (await request.get(path, { headers })).json();
  const { photoshootShots } = await import("../../lib/photoshoot");
  doc.state = {
    ...doc.state,
    rv_id: "sample-rv",
    scene_id: "mountain-stillness",
    setup: { mode: "custom", name: "Custom setup" },
    brief: "Original mountain campaign",
    shots: photoshootShots.map((s) => plannedShot(s.id)),
  };
  doc = await (await request.put(path, { headers, data: doc })).json();
  // Select all eighteen, then uncheck two. Exactly sixteen jobs should exist.
  const selected = doc.state.shots
    .filter((_: unknown, i: number) => i !== 2 && i !== 5)
    .map((s: { id: string }) => s.id);
  const data = {
    id: crypto.randomUUID(),
    revision: doc.revision,
    shot_ids: selected,
  };
  const created = await request.post(path + "/generate", { headers, data });
  expect(created.ok(), await created.text()).toBe(true);
  const batch = await created.json();
  expect(batch.jobs.map((j: Job) => j.shot_id)).toEqual(selected);
  expect(batch.jobs.filter((j: Job) => j.status === "waiting")).toHaveLength(
    0,
  );
  expect(
    imageCount((await control()).records) - imageCount(baseline.records),
  ).toBe(16);
  // A later edit must not change the already-authorized queued shots.
  doc.state.brief = "Changed desert campaign";
  expect((await request.put(path, { headers, data: doc })).ok()).toBe(true);
  const replay = await request.post(path + "/generate", { headers, data });
  expect(replay.ok()).toBe(true);
  expect(
    imageCount((await control()).records) - imageCount(baseline.records),
  ).toBe(16);
  let latest = batch;
  for (
    let n = 0;
    n < 60 && !latest.jobs.every((j: Job) => j.status === "ready");
    n++
  ) {
    // Concurrent polls simulate two tabs or a reload arriving during a poll.
    const polls = await Promise.all(
      [0, 1, 2].map(() =>
        request.get("/api/studio/batches/" + batch.id, { headers }),
      ),
    );
    for (const response of polls) {
      expect(response.ok(), await response.text()).toBe(true);
      const view = await response.json();
      expect(
        view.jobs.filter((j: Job) =>
          ["submitting", "queued", "generating", "saving"].includes(j.status),
        ).length,
      ).toBeLessThanOrEqual(16);
    }
    latest = await (
      await request.get("/api/studio/batches/" + batch.id, { headers })
    ).json();
    if (!latest.jobs.every((j: Job) => j.status === "ready"))
      await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  expect(latest.jobs.every((j: Job) => j.status === "ready")).toBe(true);
  expect(latest.jobs).toHaveLength(16);
  expect(
    imageCount((await control()).records) - imageCount(baseline.records),
  ).toBe(16);
  expect(JSON.parse(latest.workflow_json).brief).toBe(
    "Original mountain campaign",
  );
  expect(
    latest.jobs.every(
      (j: Job) => !j.generation_prompt?.includes("Changed desert"),
    ),
  ).toBe(true);
  expect(new Set(latest.jobs.map((j: Job) => j.request_id)).size).toBe(16);
  await request.post(path + "/generate", { headers, data });
  expect(
    imageCount((await control()).records) - imageCount(baseline.records),
  ).toBe(16);
});

test("A rejected image does not repeat or prevent the other selected deliverables", async ({
  request,
}) => {
  const headers = { Cookie: "__sites_local_auth=1" };
  const control = async (data = {}) =>
    await (
      await request.post("http://127.0.0.1:6199/__control", { data })
    ).json();
  const baseline = await control({
    delay: 10000,
    failSubmit: 1,
    failSave: 0,
    failPlan: 0,
    noGround: false,
  });
  const p = await (
    await request.post("/api/studio/projects", {
      headers,
      data: { name: "Partial provider rejection" },
    })
  ).json();
  const path = "/api/studio/projects/" + p.id + "/workflow";
  let doc = await (await request.get(path, { headers })).json();
  doc.state = {
    ...doc.state,
    rv_id: "sample-rv",
    scene_id: "mountain-stillness",
    setup: { mode: "custom", name: "Custom setup" },
  };
  doc = await (await request.put(path, { headers, data: doc })).json();
  const selected = doc.state.shots.slice(0, 5).map((s: { id: string }) => s.id);
  const created = await request.post(path + "/generate", {
    headers,
    data: {
      id: crypto.randomUUID(),
      revision: doc.revision,
      shot_ids: selected,
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  let batch = await created.json();
  batch = await (
    await request.get("/api/studio/batches/" + batch.id, { headers })
  ).json();
  const failedId = batch.jobs.find((j: Job) => j.status === "failed").id;
  await control({ delay: 1 });
  for (
    let i = 0;
    i < 30 &&
    batch.jobs.some((j: Job) => !["ready", "failed"].includes(j.status));
    i++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    batch = await (
      await request.get("/api/studio/batches/" + batch.id, { headers })
    ).json();
  }
  expect(batch.jobs.filter((j: Job) => j.status === "failed")).toHaveLength(1);
  expect(batch.jobs.filter((j: Job) => j.status === "ready")).toHaveLength(4);
  const after = await control();
  expect(
    after.records.filter((r: { kind: string }) => r.kind === "image").length -
      baseline.records.filter((r: { kind: string }) => r.kind === "image")
        .length,
  ).toBe(5);
  const retried = await request.post(
    "/api/studio/jobs/" + failedId + "/retry",
    { headers },
  );
  expect(retried.ok(), await retried.text()).toBe(true);
  expect(
    (await control()).records.filter(
      (r: { kind: string }) => r.kind === "image",
    ).length -
      baseline.records.filter((r: { kind: string }) => r.kind === "image")
        .length,
  ).toBe(6);
});

test("RV assessment inspects every reference, selects supported views and fails before image charges", async ({ request }) => {
  const headers = { Cookie: "__sites_local_auth=1" };
  const control = async (data = {}) => (await request.post("http://127.0.0.1:6199/__control", {data})).json();
  await control({delay: 1, failPlan: 0, failSubmit: 0, failSave: 0, invalidView: false, mismatchedView: false});
  await request.post("/api/studio/bootstrap", {headers, data: {}});
  const p = await (await request.post("/api/studio/projects", {headers, data: {name: "Source view assessment"}})).json();
  const path = "/api/studio/projects/" + p.id + "/workflow";
  let doc = await (await request.get(path, {headers})).json();
  doc.state = {...doc.state, rv_id: "sample-rv", scene_id: "mountain-stillness",
    identity_ids: ["alpine-shoreline"], setup: {mode: "custom", name: "View test"}};
  doc = await (await request.put(path, {headers, data: doc})).json();
  const generate = () => request.post(path + "/generate", {headers, data: {
    id: crypto.randomUUID(), revision: doc.revision, shot_ids: ["establishing", "portrait"]}});
  const before = await control();
  const result = await generate();
  expect(result.ok(), await result.text()).toBe(true);
  const batch = await result.json();
  expect(batch.jobs[0].generation_prompt).toContain("reference 1 only controls");
  expect(batch.jobs[1].generation_prompt).toContain("reference 3 only controls");
  const records = (await control()).records.slice(before.records.length);
  const plan = records.find((r: {plan?: boolean}) => r.plan);
  expect(plan.visionDetails).toHaveLength(3);
  expect(plan.referenceLabels.join("\n")).toContain("Reference 3: SUPPORTING RV IDENTITY");
  expect(plan.instructions).toContain("Repeated angles");
  const count = async () => (await control()).records.filter((r: {kind: string}) => r.kind === "image").length;
  const prior = await count();
  await control({invalidView: true});
  const bad = await generate();
  expect(bad.status()).toBe(503);
  expect(await count()).toBe(prior);
  await control({invalidView: false, failPlan: 1});
  expect((await generate()).status()).toBe(503);
  expect(await count()).toBe(prior);
  await control({failPlan: 0, mismatchedView: true});
  const restricted = await generate();
  expect(restricted.ok(), await restricted.text()).toBe(true);
  const safe = await restricted.json();
  expect(safe.jobs.every((j: Job) => j.generation_prompt?.includes("reference 1 only controls"))).toBe(true);
  await control({mismatchedView: false});
});

test("Cast reference remains separate from RV evidence and every shot shares one wardrobe plan", async ({request}) => {
  const headers = {Cookie: "__sites_local_auth=1"};
  const control = async (data = {}) => (await request.post("http://127.0.0.1:6199/__control", {data})).json();
  await control({delay: 1, failPlan: 0, failSubmit: 0, failSave: 0, invalidView: false, mismatchedView: false, noGround: false});
  await request.post('/api/studio/bootstrap', {headers, data:{}});
  const p = await (await request.post('/api/studio/projects', {headers, data:{name:'Shared cast contract'}})).json();
  const path = `/api/studio/projects/${p.id}/workflow`;
  let doc = await (await request.get(path,{headers})).json();
  doc.state = {...doc.state, rv_id:'sample-rv', scene_id:'mountain-stillness', cast_reference_id:'alpine-shoreline',
    setup:{mode:'custom',name:'Cast test'}, shots:['establishing','portrait','detail'].map(role => ({...plannedShot(role),rv_presence:'partial'}))};
  doc = await (await request.put(path,{headers,data:doc})).json();
  const baseline = await control();
  const data = {id:crypto.randomUUID(),revision:doc.revision,shot_ids:doc.state.shots.map((s:{id:string})=>s.id)};
  const r = await request.post(path+'/generate',{headers,data});
  expect(r.ok(),await r.text()).toBe(true);
  const batch = await r.json();
  expect(JSON.parse(batch.workflow_json).cast_reference_id).toBe('alpine-shoreline');
  for(const j of batch.jobs) {
    expect(j.generation_prompt).toContain('Reference 3 is PEOPLE AND WARDROBE ONLY');
    expect(j.generation_prompt).toContain('reference 1 only controls');
    expect(j.generation_prompt).toContain('The same two adults wear neutral olive outdoor layers and gray trousers throughout.');
  }
  expect(batch.jobs[1].generation_prompt).toContain('under 20%');
  expect(batch.jobs[2].generation_prompt).toContain('under 15%');
  const records = (await control()).records.slice(baseline.records.length);
  const plan = records.find((x:{plan?:boolean})=>x.plan);
  expect(plan.visionDetails).toHaveLength(3);
  expect(plan.referenceLabels.join('\n')).toContain('Reference 3: PEOPLE AND WARDROBE ONLY');
  expect(records.filter((x:{kind:string})=>x.kind==='image').every((x:{input:{image_urls:string[]}})=>x.input.image_urls.length===3)).toBe(true);
  expect((await request.put(path,{headers,data:{...doc,state:{...doc.state,cast_reference_id:'sample-rv'}}})).status()).toBe(400);
  await request.put(path,{headers,data:{...doc,state:{...doc.state,cast_reference_id:null}}});
  const replay = await request.post(path+'/generate',{headers,data});
  expect(replay.ok()).toBe(true);
  expect(JSON.parse((await replay.json()).workflow_json).cast_reference_id).toBe('alpine-shoreline');
  expect((await control()).records.filter((x:{kind:string})=>x.kind==='image').length - baseline.records.filter((x:{kind:string})=>x.kind==='image').length).toBe(3);
});


test("Incomplete six-shot assessment retries with more room and submits images only once", async ({request}) => {
  const headers = {Cookie: "__sites_local_auth=1"};
  const control = async (data = {}) => (await request.post("http://127.0.0.1:6199/__control", {data})).json();
  await control({delay:1, incompletePlan:1, failPlan:0, failSubmit:0, invalidView:false, mismatchedView:false, noGround:false});
  await request.post('/api/studio/bootstrap',{headers,data:{}});
  const p = await (await request.post('/api/studio/projects',{headers,data:{name:'Fresh six-shot recovery'}})).json();
  const path = `/api/studio/projects/${p.id}/workflow`;
  let doc = await (await request.get(path,{headers})).json();
  doc.state = {...doc.state,rv_id:'sample-rv',scene_id:'mountain-stillness',setup:{mode:'custom',name:'Fresh test'}};
  doc = await (await request.put(path,{headers,data:doc})).json();
  const baseline = await control();
  const data = {id:crypto.randomUUID(),revision:doc.revision,shot_ids:doc.state.shots.map((s:{id:string})=>s.id)};
  const response = await request.post(path+'/generate',{headers,data});
  expect(response.ok(),await response.text()).toBe(true);
  expect((await response.json()).jobs).toHaveLength(6);
  const records = (await control()).records.slice(baseline.records.length);
  const plans = records.filter((r:{plan?:boolean})=>r.plan);
  expect(plans).toHaveLength(2);
  expect(plans[1].maxOutputTokens).toBeGreaterThan(plans[0].maxOutputTokens);
  expect(records.filter((r:{kind:string})=>r.kind==='image')).toHaveLength(6);
  expect(records.findIndex((r:{kind:string})=>r.kind==='image')).toBeGreaterThan(records.lastIndexOf(plans[1]));
  expect((await request.post(path+'/generate',{headers,data})).ok()).toBe(true);
  expect((await control()).records.slice(baseline.records.length).filter((r:{kind:string})=>r.kind==='image')).toHaveLength(6);
});


test("Mixed lifestyle shoot routes references per shot and preserves the choice on retry", async ({request}) => {
  const headers = {Cookie:'__sites_local_auth=1'};
  const control = async (data = {}) => (await request.post('http://127.0.0.1:6199/__control',{data})).json();
  await control({delay:1,failSubmit:1,failPlan:0,incompletePlan:0,invalidView:false,mismatchedView:false,noGround:false});
  await request.post('/api/studio/bootstrap',{headers,data:{}});
  const p = await (await request.post('/api/studio/projects',{headers,data:{name:'Lifestyle visibility'}})).json();
  const path = `/api/studio/projects/${p.id}/workflow`;
  let doc = await (await request.get(path,{headers})).json();
  doc.state = {...doc.state,rv_id:'sample-rv',scene_id:'mountain-stillness',cast_reference_id:'alpine-shoreline',setup:{mode:'custom',name:'Lifestyle'},
    shots:['detail','establishing','portrait','action','social-feed','story-vertical'].map(role => ({...plannedShot(role),rv_presence: ['detail','action','social-feed'].includes(role) ? 'none' : role === 'establishing' ? 'full' : 'partial'}))};
  doc = await (await request.put(path,{headers,data:doc})).json();
  const before = await control();
  const data = {id:crypto.randomUUID(),revision:doc.revision,shot_ids:doc.state.shots.map((s:{id:string})=>s.id)};
  const r = await request.post(path+'/generate',{headers,data});
  expect(r.ok(),await r.text()).toBe(true);
  const b = await r.json();
  const records = (await control()).records.slice(before.records.length);
  const images = records.filter((r:{kind:string})=>r.kind==='image');
  expect(images).toHaveLength(6);
  const noRV = images.filter((r:{input:{prompt:string}})=>r.input.prompt.includes('ASSESSED LIFESTYLE DIRECTION'));
  expect(noRV).toHaveLength(3);
  for (const r of noRV) {
    expect(r.input.image_urls).toHaveLength(2);
    expect(r.input.prompt).not.toContain('RV SOURCE FOR THIS SHOT');
    expect(r.input.prompt).not.toContain('PLACEMENT GEOMETRY');
    expect(r.input.prompt).toContain('Image 2 is people and wardrobe only');
  }
  const hero = images.find((r:{input:{prompt:string}})=>r.input.prompt.includes('ASSIGNED SHOT — The whole escape'));
  expect(hero.input.image_urls).toHaveLength(3);
  expect(hero.input.prompt).toContain('FULL RV:');
  for (const r of noRV) expect(r.input.image_urls).toEqual(hero.input.image_urls.slice(1));
  const planner = records.find((r:{plan?:boolean})=>r.plan);
  expect(planner.instructions).toContain('none means a complete vehicle-free lifestyle frame');
  doc.state.shots = doc.state.shots.map((s: {id:string})=>({...s,rv_presence:'full'}));
  await request.put(path,{headers,data:doc});
  expect((await request.post(path+'/generate',{headers,data})).ok()).toBe(true);
  expect((await control()).records.slice(before.records.length).filter((r:{kind:string})=>r.kind==='image')).toHaveLength(6);
  const failed = b.jobs.find((j:Job)=>j.status==='failed');
  expect(failed.shot_id).toBe('detail');
  await control({failSubmit:0});
  expect((await request.post(`/api/studio/jobs/${failed.id}/retry`,{headers,data:{}})).ok()).toBe(true);
  const retry = (await control()).records.filter((r:{kind:string})=>r.kind==='image').at(-1);
  expect(retry.input.image_urls).toHaveLength(2);
  expect(retry.input.prompt).toBe(failed.generation_prompt);
});
