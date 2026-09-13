import { parseCompositionShots, placementPresets } from '../lib/composition-plan.ts';
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPrompt,
  modelFor,
  providerInput,
  requestSchema,
  activeStatus,
  generationSizes,
} from "../lib/domain.ts";
test("All Sunburst operations explicitly request Max and one image per independent job", () => {
  for (const stage of [
    "landscape",
    "compose",
    "objects",
    "prop",
    "campaign",
    "variation",
  ] as const) {
    const input = providerInput(stage, "brief", "landscape_4_3", [
      "rv",
      "landscape",
    ]);
    assert.equal(input.quality, "max");
    assert.equal(input.num_images, 1);
    assert.ok(modelFor(stage).includes("sunburst"));
  }
});
test("People uses Meta Muse, only selected base inputs, and no unsupported Max parameter", () => {
  const input = providerInput("people", "brief", "landscape_4_3", [
    "selected-scene",
  ]);
  assert.equal(modelFor("people"), "meta/muse-image/edit");
  assert.deepEqual(input.image_urls, ["selected-scene"]);
  assert.ok(!("quality" in input));
});
test("Only edit stages receive reference images", () => {
  for (const stage of ["landscape", "prop", "campaign"] as const)
    assert.ok(
      !(
        "image_urls" in providerInput(stage, "brief", "square_hd", ["ignored"])
      ),
    );
  assert.deepEqual(
    providerInput("compose", "brief", "landscape_4_3", ["rv", "landscape"])
      .image_urls,
    ["rv", "landscape"],
  );
});
test("Photographic prompts isolate generation stages and keep variant direction distinct", () => {
  const prompts = [0, 1, 2, 3].map((slot) =>
    buildPrompt("compose", "Preserve my RV.", slot),
  );
  assert.equal(new Set(prompts).size, 4);
  assert.ok(
    prompts.every(
      (p) =>
        p.includes("No people or added props") && p.includes("Preserve my RV."),
    ),
  );
  assert.match(
    buildPrompt("landscape", "Alpine lake", 0),
    /No RVs, vehicles, people/,
  );
});
test("Request validation blocks unsupported routing and invalid request identifiers", () => {
  const valid = {
    id: crypto.randomUUID(),
    project_id: "project",
    stage: "compose",
    prompt: "A photographic RV composition",
  };
  assert.ok(requestSchema.safeParse(valid).success);
  assert.ok(
    !requestSchema.safeParse({ ...valid, stage: "arbitrary-model" }).success,
  );
  assert.ok(!requestSchema.safeParse({ ...valid, id: "not-an-id" }).success);
  assert.ok(!requestSchema.safeParse({ ...valid, prompt: "x" }).success);
});
test("Only actionable job states continue polling", () => {
  for (const s of ["queued", "submitting", "generating", "saving"])
    assert.equal(activeStatus(s), true);
  for (const s of ["ready", "failed", "unknown", "save_failed"])
    assert.equal(activeStatus(s), false);
});

test("Campaign image variations preserve ordered references and use Sunburst edit Max", () => {
  const refs = ["base-photo", "supporting-rv"];
  assert.ok(modelFor("variation").endsWith("/edit"));
  assert.ok(modelFor("campaign").endsWith("/text-to-image"));
  assert.deepEqual(
    providerInput("variation", "Change only light", "square_hd", refs)
      .image_urls,
    refs,
  );
  assert.equal(
    providerInput("variation", "Add people", "square_hd", refs).quality,
    "max",
  );
  assert.match(buildPrompt("variation", "Add two people", 0), /Edit image 1/);
});

test("Native high-resolution outputs preserve aspect and satisfy fal pixel constraints", () => {
  const ratios: Record<string, number> = {
    landscape_4_3: 4 / 3,
    landscape_16_9: 16 / 9,
    square_hd: 1,
    portrait_4_3: 3 / 4,
  };
  for (const [aspect, size] of Object.entries(generationSizes)) {
    assert.equal(size.width % 16, 0);
    assert.equal(size.height % 16, 0);
    assert.ok(Math.max(size.width, size.height) <= 3840);
    assert.ok(size.width * size.height <= 8294400);
    assert.ok(size.width * size.height >= 7900000);
    assert.equal(size.width / size.height, ratios[aspect]);
    for (const stage of [
      "landscape",
      "compose",
      "objects",
      "prop",
      "campaign",
      "variation",
    ] as const) {
      const input = providerInput(stage, "Preserve detail", aspect, ["base"]);
      assert.deepEqual(input.image_size, size);
      assert.equal(input.quality, "max");
      assert.equal(input.output_format, "png");
      assert.ok(!("output_compression" in input));
    }
  }
  assert.throws(() => providerInput("campaign", "brief", "unsupported", []));
  assert.ok(
    !(
      "image_size" in
      providerInput("people", "brief", "landscape_4_3", ["base"])
    ),
  );
});

 test("Composition placement plans override default shots without changing other editing stages", () => {
  const direction = "RV centered at 72% from left and 66% from top, occupying 22% of frame width on the gravel turnout.";
  const p = buildPrompt("compose", "Keep it distant", 1, direction);
  assert.ok(p.includes(direction));
  assert.ok(!p.includes("28–34%"));
  assert.ok(p.includes("No people or added props"));
  assert.ok(p.includes("explicit user constraints"));
  const defaults = [0,1,2,3].map(i=>buildPrompt("compose", "Place the RV", i));
  assert.ok(defaults[0].includes("18–24%"));
  assert.ok(defaults[1].includes("right third"));
  assert.ok(defaults[2].includes("42–50%"));
  assert.ok(defaults[3].includes("12–17%"));
  assert.ok(!buildPrompt("people", "Add two adults", 1, direction).includes(direction));
 });

 test("Useful placement directions survive long or repeated display labels", () => {
   const plan={shots:placementPresets.map(s=>({...s,label:'A very detailed placement label '.repeat(5)}))};
   const shots=parseCompositionShots(plan);
   assert.equal(shots.length,4);
   assert.ok(shots.every(s=>s.label.length===65));
   assert.deepEqual(shots.map(s=>s.direction),placementPresets.map(s=>s.direction));
   assert.throws(()=>parseCompositionShots({shots:plan.shots.slice(0,3)}));
   assert.throws(()=>parseCompositionShots({shots:[plan.shots[0],plan.shots[0],plan.shots[0],plan.shots[0]]}));
   assert.ok(placementPresets.every(s=>s.direction.includes('reference') || s.direction.includes('image 1')));
 });
