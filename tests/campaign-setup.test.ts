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

test("RV evidence cannot unlock a scene image, a missing view or an unverified unit", async () => {
  const {assessedViewDirections} = await import("../lib/rv-view-coverage.ts");
  const view = (reference: number, usable = true) => ({reference, usable,
    visible_view: "Front curbside three-quarter view",
    fixed_landmarks: "Door and window positions relative to the axles",
    limitations: "No unseen rear or opposite side is supported"});
  const shot = (source_reference: number) => ({source_reference, adaptation: "Crop the supported wall and retain source perspective"});
  assert.match(assessedViewDirections({views: [view(1)], shots: [shot(1)]}, 0, 1)[0], /reference 1 only/);
  assert.throws(() => assessedViewDirections({views: [view(1)], shots: [shot(2)]}, 0, 1));
  assert.throws(() => assessedViewDirections({views: [view(1)], shots: [shot(3)]}, 1, 1));
  assert.throws(() => assessedViewDirections({views: [view(1), view(3, false)], shots: [shot(3)]}, 1, 1));
  assert.match(assessedViewDirections({views: [view(1), view(3)], shots: [shot(3)]}, 1, 1)[0], /reference 3 only/);
  assert.throws(() => assessedViewDirections({views: [view(1), view(1)], shots: [shot(1)]}, 1, 1));
});

test("Cast reference moves with a complete setup, clears on reset and stays distinct from RV evidence", () => {
  const old = {...state(), cast_reference_id: "people-shot"};
  const selected = applyExistingSetup(old, "Mountain", "preset", mountain);
  assert.equal(selected.cast_reference_id, null);
  const withCast = applyExistingSetup(old, "Saved cast", "campaign", {...mountain, cast_reference_id: "new-cast"});
  assert.equal(withCast.cast_reference_id, "new-cast");
  assert.equal(setupProblem({...withCast, cast_reference_id: "different-cast"})?.includes("conflicting"), true);
  assert.equal(startCustomSetup(old, "new-scene").cast_reference_id, null);
  assert.equal(customizeSetup(withCast).cast_reference_id, "new-cast");
  assert.match(flowPrompt(old), /Reference 5 is PEOPLE AND WARDROBE ONLY/);
  assert.match(flowPrompt(old), /Ignore all RV geometry/);
  const batch = {workflow_json: JSON.stringify(old)} as Parameters<typeof matchingShot>[0];
  assert.equal(matchingShot(batch, old.shots[0], {...old, cast_reference_id: "other"}), false);
});

test("Shot framing survives custom labels and role directions without sacrificing RV source limits", async () => {
  const {resolvedShot} = await import('../lib/campaign-flow.ts');
  const {photoshootPrompt} = await import('../lib/photoshoot.ts');
  const shot = resolvedShot({...plannedShot('detail'), id: 'custom-id', label: 'Morning map', direction: 'Fold a map at camp.'});
  const prompt = photoshootPrompt(shot, 'One adult at camp.');
  assert.match(prompt, /TIGHT DETAIL/);
  assert.match(prompt, /under 15%/);
  assert.match(prompt, /Never rotate, mirror/);
  assert.match(photoshootPrompt(resolvedShot(plannedShot('portrait')), ''), /upper-body people/);
});


test("Lifestyle-only shots remove identity references, retain scene/cast, and invalidate only the changed shot", async () => {
  const {shotReferenceIndexes} = await import('../lib/campaign-flow.ts');
  const {lifestyleFramePrompt} = await import('../lib/lifestyle-frame.ts');
  const s = {...state(),cast_reference_id:'cast',shots:[plannedShot('establishing'),{...plannedShot('detail'),rv_presence:'none' as const}]};
  assert.deepEqual(shotReferenceIndexes(s,'establishing',5),[0,1,2,3,4]);
  assert.deepEqual(shotReferenceIndexes(s,'detail',5),[1,3,4]);
  const noOptional = {...s,identity_ids:[],prop_ids:[],cast_reference_id:null};
  assert.deepEqual(shotReferenceIndexes(noOptional,'detail',2),[1]);
  const legacy = {...s,shots:s.shots.map(original => { const shot = {...original}; delete shot.rv_presence; return shot; })};
  assert.deepEqual(shotReferenceIndexes(legacy,'detail',5),[0,1,2,3,4]);
  const prompt = lifestyleFramePrompt(s,s.shots[1],'Hands folding a blanket in soft light.');
  assert.match(prompt,/Image 1 is the source campaign photograph/);
  assert.match(prompt,/Image 3 is people and wardrobe only/);
  assert.doesNotMatch(prompt,/PLACEMENT GEOMETRY|FINAL RV VIEW CONTRACT|Image 1 is the exact RV/);
  const batch = {workflow_json:JSON.stringify(s)} as Parameters<typeof matchingShot>[0];
  const changed = {...s.shots[1],rv_presence:'partial' as const};
  assert.equal(matchingShot(batch,changed,{...s,shots:[s.shots[0],changed]}),false);
  assert.equal(matchingShot(batch,s.shots[0],s),true);
});


test("Every default campaign role retains RV presence while lifestyle roles stay contextual", async () => {
  const {photoshootShots, rvPresenceDirection, photoshootPrompt} = await import('../lib/photoshoot.ts');
  const {resolvedShot} = await import('../lib/campaign-flow.ts');
  for (const role of photoshootShots) assert.notEqual(plannedShot(role.id).rv_presence, 'none');
  assert.equal(plannedShot('establishing').rv_presence, 'full');
  for (const role of ['detail','action','social-feed']) {
    const shot = plannedShot(role);
    assert.equal(shot.rv_presence, 'partial');
    assert.doesNotMatch(shot.direction, /No vehicle in the frame|Keep every vehicle outside|Keep all RVs outside/);
    const prompt = photoshootPrompt(resolvedShot(shot), '', 'Preserve the source view.');
    assert.match(prompt, /never omit, rotate or distort the RV/);
    assert.doesNotMatch(prompt, /leave the RV outside|Omit the RV if/);
  }
  assert.match(rvPresenceDirection('partial'), /secondary context in every frame/);
});
