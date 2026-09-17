import test from "node:test";
import assert from "node:assert/strict";
import {
  flowSchema,
  sceneSetup,
  setupProblem,
  setupMode,
  applyExistingSetup,
  startCustomSetup,
  customizeSetup,
  plannedShot,
  matchingShot,
  flowPrompt,
} from "../lib/campaign-flow.ts";
const state = () =>
  flowSchema.parse({
    section: "scene",
    rv_id: "eagle",
    scene_id: "desert",
    identity_ids: ["eagle-detail"],
    prop_ids: ["bike"],
    scene_mode: "look",
    brief: "Desert and the old RV",
    people: "Two cyclists",
    props: "Two bicycles",
    shots: [
      {
        ...plannedShot("portrait"),
        direction: "Desert cyclists and old RV",
        label: "Desert portrait",
        aspect: "portrait_9_16",
      },
    ],
  });
const mountain = {
  scene_id: "mountain",
  scene_mode: "place" as const,
  brief: "Wooded mountain morning",
  people: "Two adults reading",
  props: "Chairs",
  prop_ids: [],
};
test("Selecting a setup replaces all scene fields but preserves RV identity and output formats", () => {
  const old = state();
  const next = applyExistingSetup(
    old,
    "Mountain retreat",
    "preset:mountain",
    mountain,
  );
  assert.deepEqual(sceneSetup(next), mountain);
  assert.equal(next.rv_id, "eagle");
  assert.deepEqual(next.identity_ids, ["eagle-detail"]);
  assert.equal(next.shots[0].aspect, "portrait_9_16");
  assert.equal(next.shots[0].direction, plannedShot("portrait").direction);
  assert.equal(next.shots[0].label, plannedShot("portrait").label);
  assert.equal(setupProblem(next), null);
  assert.doesNotMatch(flowPrompt(next), /cyclists|bicycles|Desert/);
  assert.equal(old.brief, "Desert and the old RV");
});
test("A saved setup rejects partial scene, cast, brief, prop and treatment edits", () => {
  const next = applyExistingSetup(
    state(),
    "Mountains",
    "source revision 4",
    mountain,
  );
  for (const patch of [
    { scene_id: "desert" },
    { scene_mode: "look" as const },
    { people: "Dogs" },
    { props: "Bicycles" },
    { brief: "Desert" },
    { prop_ids: ["bike"] },
  ]) {
    assert.match(setupProblem({ ...next, ...patch })!, /conflicting edits/);
  }
});
test("Customization is explicit, retains the selected setup and does not modify its snapshot", () => {
  const locked = applyExistingSetup(
    state(),
    "Mountains",
    "source revision 4",
    mountain,
  );
  const custom = customizeSetup(locked);
  assert.equal(setupMode(custom), "custom");
  assert.deepEqual(sceneSetup(custom), sceneSetup(locked));
  assert.equal(setupProblem({ ...custom, people: "One adult" }), null);
  assert.equal(locked.setup?.mode, "existing");
  assert.equal(locked.people, "Two adults reading");
});
test("Changing a custom setting clears stale direction, props and shot-specific scene content", () => {
  const custom = startCustomSetup(state(), "alpine-lake");
  assert.equal(custom.scene_id, "alpine-lake");
  assert.equal(custom.brief, "");
  assert.equal(custom.people, "");
  assert.equal(custom.props, "");
  assert.deepEqual(custom.prop_ids, []);
  assert.equal(custom.rv_id, "eagle");
  assert.doesNotMatch(custom.shots[0].direction, /Desert cyclists/);
});
test("Old campaigns retain their direction and are explicitly treated as custom", () => {
  const old = state();
  assert.equal(setupMode(old), "custom");
  assert.equal(
    flowSchema.parse(JSON.parse(JSON.stringify(old))).brief,
    old.brief,
  );
  assert.equal(
    setupProblem({ ...old, scene_id: null }),
    "Choose an existing setup or create a custom setup first.",
  );
});
test("A saved setup is a detached snapshot, survives serialization and ignores later source edits", () => {
  const source = { ...mountain, prop_ids: ["chair"] };
  const next = applyExistingSetup(
    state(),
    "Campaign A",
    "a · revision 2",
    source,
  );
  source.prop_ids.push("other");
  source.brief = "Desert";
  const loaded = flowSchema.parse(JSON.parse(JSON.stringify(next)));
  assert.equal(setupProblem(loaded), null);
  assert.equal(loaded.brief, mountain.brief);
  assert.deepEqual(loaded.prop_ids, ["chair"]);
});
test("Old outputs remain matched after metadata-only customization, but not a setting change", () => {
  const old = state();
  const batch = { workflow_json: JSON.stringify(old) } as Parameters<
    typeof matchingShot
  >[0];
  assert.equal(matchingShot(batch, old.shots[0], customizeSetup(old)), true);
  assert.equal(
    matchingShot(batch, old.shots[0], startCustomSetup(old, "mountain")),
    false,
  );
});
