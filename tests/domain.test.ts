import { parseCompositionShots, placementPresets } from '../lib/composition-plan.ts';
import {parseLandscape, commonsImageUrl, sourceText, landscapeQueries} from '../lib/landscape-discovery.ts';
import { imageDimensions } from "../lib/image-metadata.ts";
import {
  campaignPresets,
  getCampaignPreset,
  resolveCampaignPreset,
} from "../lib/campaign-presets.ts";
import test from "node:test";
import assert from "node:assert/strict";
test('Natural landscape requests broaden without changing place words into source operators',()=>{
  assert.deepEqual(landscapeQueries('burning man concenrt open area'),['burning man concert open area','burning man']);
  assert.deepEqual(landscapeQueries('Alaska landscape'),['Alaska landscape','Alaska']);
  assert.deepEqual(landscapeQueries('Black Rock Desert open area'),['Black Rock Desert open area','Black Rock Desert','Black Rock']);
  assert.deepEqual(landscapeQueries('!!!'),[]);
  assert.ok(landscapeQueries('mountian lake')[0].includes('mountain'));
  assert.ok(landscapeQueries('x filew:>10 OR license:any').every(q=>!/[":><]/.test(q)));
});
test('Photo discovery validates source hosts, rights, dimensions and artwork metadata',()=>{
  const photo={pageid:123,title:'File:Meadow.jpg',imageinfo:[{url:'https://upload.wikimedia.org/wikipedia/commons/a/a1/Meadow.jpg',thumburl:'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a1/Meadow.jpg/1280px-Meadow.jpg',width:8000,height:5000,size:12_000_000,mime:'image/jpeg',extmetadata:{LicenseShortName:{value:'CC0'},Artist:{value:'<b>Photographer</b>'},Categories:{value:'Nature photographs'}}}]};
  assert.equal(parseLandscape(photo,7680)?.photographer,'Photographer');
  assert.equal(parseLandscape({...photo,imageinfo:[{...photo.imageinfo[0],width:5000}]},7680),null);
  assert.equal(parseLandscape({...photo,imageinfo:[{...photo.imageinfo[0],size:70_000_000}]}),null);
  for(const license of ['CC BY 4.0','CC BY-SA 4.0','Unknown','CC0 and restrictions'])assert.equal(parseLandscape({...photo,imageinfo:[{...photo.imageinfo[0],extmetadata:{LicenseShortName:{value:license}}}]}),null);
  for(const category of ['AI-generated photographs','Oil paintings','Maps of Alaska','Satellite images'])assert.equal(parseLandscape({...photo,imageinfo:[{...photo.imageinfo[0],extmetadata:{...photo.imageinfo[0].extmetadata,Categories:{value:category}}}]}),null);
  for(const url of ['http://upload.wikimedia.org/wikipedia/commons/a.jpg','https://upload.wikimedia.org.evil.test/wikipedia/commons/a.jpg','https://user@upload.wikimedia.org/wikipedia/commons/a.jpg','https://127.0.0.1/wikipedia/commons/a.jpg','https://upload.wikimedia.org/private/a.jpg'])assert.equal(commonsImageUrl(url),null);
  assert.equal(sourceText('<script>alert(1)</script><p>Meadow &amp; lake</p>'),'alert(1) Meadow & lake');
});
import {
  buildPrompt,
  modelFor,
  providerInput,
  requestSchema,
  activeStatus,
  generationSizes,
  selectModelPackReferences,
  type ModelPackAsset,
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
  assert.equal(requestSchema.parse(valid).count,2);
  for (const count of [1,2,3,4]) assert.equal(requestSchema.parse({...valid,count}).count,count);
  for (const count of [0,5,1.5,"2",null]) assert.ok(!requestSchema.safeParse({...valid,count}).success);
  assert.ok(
    !requestSchema.safeParse({ ...valid, stage: "arbitrary-model" }).success,
  );
  assert.ok(!requestSchema.safeParse({ ...valid, id: "not-an-id" }).success);
  assert.ok(!requestSchema.safeParse({ ...valid, prompt: "x" }).success);
});
test("Only actionable job states continue polling", () => {
  for (const s of ["waiting", "queued", "submitting", "generating", "saving"])
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
    portrait_4_5: 4 / 5,
    portrait_9_16: 9 / 16,
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
  assert.ok(defaults.every(p=>p.includes("Use uniform scaling") && p.includes("tire contact line")));
  assert.ok(defaults.every(p=>!p.includes("42–50%")));
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

test('Placement plans enforce the requested count',()=>{
  for(const n of [1,2,3,4]) assert.equal(parseCompositionShots({shots:placementPresets.slice(0,n)},n).length,n);
  assert.throws(()=>parseCompositionShots({shots:placementPresets},2));
});

test("Model packs preserve the campaign base, prefer identity views, and hold evaluation images out", () => {
  const item = (
    asset_id: string,
    role: ModelPackAsset["role"],
    priority: number,
    view = "",
    approved_for_generation = 1,
  ): ModelPackAsset => ({
    id: "assignment-" + asset_id,
    pack_id: "pack",
    asset_id,
    role,
    view,
    room: "",
    priority,
    approved_for_generation,
    created_at: priority,
  });
  const assignments = [
    item("held-out", "evaluation", 0, "front"),
    item("unapproved", "identity", 0, "front", 0),
    item("rear", "identity", 1, "rear"),
    item("front", "identity", 8, "front"),
    item("detail", "detail", 0, "front"),
    item("style", "style", 0, "front"),
  ];
  assert.deepEqual(
    selectModelPackReferences(assignments, "campaign-base", "front"),
    ["campaign-base", "front", "rear", "detail"],
  );
  assert.ok(
    !selectModelPackReferences(assignments, "campaign-base", "front").includes(
      "held-out",
    ),
  );
});

test("A model pack supplies its own base and removes duplicate assignments", () => {
  const base: ModelPackAsset = {
    id: "one",
    pack_id: "pack",
    asset_id: "rv-front",
    role: "base",
    view: "front",
    room: "",
    priority: 0,
    approved_for_generation: 1,
    created_at: 1,
  };
  assert.deepEqual(selectModelPackReferences([base, { ...base, id: "two" }]), [
    "rv-front",
  ]);
});

test("Uploaded image dimensions are read without decoding the full file", () => {
  const jpeg = Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x0b,
    0x08, 0x05, 0x56, 0x08, 0x00, 0x03, 1, 0x11, 0,
  ]);
  assert.deepEqual(imageDimensions(jpeg, "image/jpeg"), {
    width: 2048,
    height: 1366,
  });
  const png = new Uint8Array(24);
  png.set([0, 0, 8, 0, 0, 0, 5, 86], 16);
  assert.deepEqual(imageDimensions(png, "image/png"), {
    width: 2048,
    height: 1366,
  });
});

test("Eagle campaign presets use two-shot sets and resolve approved references", () => {
  const asset = (overrides: Record<string, unknown>) =>
    ({
      id: crypto.randomUUID(),
      kind: "rv",
      brand: "Jayco",
      model: "Eagle Fifth Wheel",
      year: "2026",
      name: "Eagle",
      ...overrides,
    }) as never;
  const rv = asset({});
  const style = asset({
    kind: "landscape",
    brand: "",
    model: "",
    year: "",
    name: "Jayco North Point lifestyle setup — wooded mountain field",
  });
  const presets = campaignPresets.filter((preset) => preset.id !== "blank");
  assert.equal(presets.length, 7);
  assert.ok(presets.every((preset) => preset.count === 2));
  assert.equal(presets.filter((preset) => preset.mode === "lifestyle").length, 3);
  assert.ok(
    presets
      .filter((preset) => preset.mode === "lifestyle")
      .every((preset) => preset.fallbackShots?.length === 2),
  );
  assert.deepEqual(
    new Set(presets.map((preset) => preset.aspect)),
    new Set(["landscape_4_3", "landscape_16_9", "square_hd", "portrait_4_3"]),
  );
  const resolved = resolveCampaignPreset(
    getCampaignPreset("jayco-eagle-north-point-wide")!,
    [style, rv],
  );
  assert.equal(resolved.rv, rv);
  assert.equal(resolved.landscape, style);
  const lifestylePrompt = buildPrompt(
    "compose",
    "Two candid adults beside the Eagle.",
    0,
    "Use the foreground camp pad.",
    true,
  );
  assert.match(lifestylePrompt, /approved Jayco lifestyle reference/);
  assert.match(lifestylePrompt, /candid and anatomically realistic/);
});

test('Photoshoot selection preserves order, mixed native formats and a two-shot limit', async () => {
  const { resolvePhotoshootShots, photoshootPrompt, nextPhotoshootIds } = await import('../lib/photoshoot.ts');
  const shots = resolvePhotoshootShots(['portrait', 'establishing']);
  assert.deepEqual(shots.map(s => s.aspect), ['portrait_4_3', 'landscape_16_9']);
  for (const ids of [[], ['portrait', 'portrait'], ['missing'], ['portrait', 'detail', 'action']])
    assert.throws(() => resolvePhotoshootShots(ids));
  const prompt = buildPrompt('compose', 'Use the reference cast and palette.', 0,
    photoshootPrompt(shots[0], 'Use the reference cast and palette.'), true, true);
  assert.match(prompt, /Intentionally crop the RV/);
  assert.match(prompt, /Keep the door closed if the RV identity photo shows it closed/);
  assert.match(prompt, /never relocate, resize or reorder/);
  assert.match(prompt, /complete cast and pets do not need to appear in every image/);
  assert.ok(!prompt.includes('Keep the backdrop camera and horizon fixed'));
  assert.ok(!prompt.includes('No people or added props'));
  assert.deepEqual(providerInput('compose', prompt, shots[0].aspect, ['rv', 'style']).image_size,
    {width:2448,height:3264});
  const history = [{stage:'compose', jobs:[{status:'ready',shot_id:'establishing'}, {status:'failed',shot_id:'portrait'}, {status:'ready',shot_id:''}]}] as never;
  assert.deepEqual(nextPhotoshootIds(history), ['portrait','detail']);
});


test('Full shoot coverage pairs every role once and advances only past ready compositions', async () => {
  const { photoshootShots, photoshootPasses, photoshootCategories, nextPhotoshootIds, photographedShotIds, photoshootPrompt } = await import('../lib/photoshoot.ts');
  const ids = photoshootShots.map(s => s.id);
  const planned = photoshootPasses.flatMap(p => p.shotIds);
  assert.equal(ids.length, 18);
  assert.equal(new Set(planned).size, planned.length);
  assert.deepEqual(new Set(planned), new Set(ids));
  assert.equal(new Set(photoshootShots.map(s => s.aspect)).size, 6);
  for (const s of photoshootShots) {
    assert.ok(photoshootCategories.some(c => c.id === s.category));
    assert.ok(s.usage && s.camera && s.direction);
    assert.match(photoshootPrompt(s, 'Keep the same source cast and light.'), /Intended use:/);
    assert.ok(generationSizes[s.aspect]);
  }
  assert.ok(photoshootPasses.every(p => p.shotIds.length === 2));
  const history = [{stage:'compose',jobs:[
    ...['establishing','portrait','social-feed','story-vertical','obsolete'].map(shot_id => ({shot_id,status:'ready'})),
    {shot_id:'detail',status:'failed'}]}, {stage:'variation',jobs:[{shot_id:'breakfast',status:'ready'}]}] as never;
  assert.equal(photographedShotIds(history).size, 4);
  assert.deepEqual(nextPhotoshootIds(history), ['detail','breakfast']);
  const all = [{stage:'compose',jobs:ids.map(shot_id => ({shot_id,status:'ready'}))}] as never;
  assert.deepEqual(nextPhotoshootIds(all), []);
});
