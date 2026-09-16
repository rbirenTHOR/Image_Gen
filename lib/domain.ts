import { z } from "zod";
export const GENERATE_ENDPOINT = "openai/gpt-image-2.5/sunburst/text-to-image";
export const EDIT_ENDPOINT = "openai/gpt-image-2.5/sunburst/edit";
export const PEOPLE_ENDPOINT = "meta/muse-image/edit";
// fal: dimensions divisible by 16, edge <=3840, total pixels <=8,294,400.
// Preserve the exact chosen aspect ratio while using the largest valid size.
export const generationSizes: Record<
  string,
  { width: number; height: number }
> = {
  landscape_4_3: { width: 3264, height: 2448 },
  landscape_16_9: { width: 3840, height: 2160 },
  square_hd: { width: 2880, height: 2880 },
  portrait_4_3: { width: 2448, height: 3264 },
};
export function generationSizeLabel(aspect: string) {
  const size = generationSizes[aspect];
  return size
    ? `${size.width} × ${size.height} · PNG`
    : "High resolution · PNG";
}
export const stages = [
  "rv",
  "landscape",
  "compose",
  "lifestyle",
  "review",
] as const;
export type Stage = (typeof stages)[number];
export type GenerationStage =
  | "landscape"
  | "compose"
  | "people"
  | "objects"
  | "prop"
  | "campaign"
  | "variation";
export interface Asset {
  photo_source_json?: string;
  thumbnail_url?: string;
  photo_source?: import("./nature-catalog").NaturePhoto;
  campaign_ids?: string[];
  id: string;
  owner_id: string;
  kind: string;
  name: string;
  brand: string;
  model: string;
  year: string;
  angle: string;
  environment: string;
  lighting: string;
  source: string;
  r2_key: string;
  mime: string;
  width: number;
  height: number;
  prompt: string;
  endpoint: string;
  quality: string;
  parent_id: string | null;
  project_id: string | null;
  batch_id: string | null;
  in_library: number;
  accepted: number;
  approved: number;
  created_at: number;
  url: string;
}
export interface Project {
  saved_count?: number;
  id: string;
  name: string;
  step: Stage;
  rv_id: string | null;
  landscape_id: string | null;
  composition_id: string | null;
  current_id: string | null;
  model_pack_id: string | null;
  preset_id: string;
  updated_at: number;
  version: number;
}
export const modelPackRoles = [
  "base",
  "identity",
  "detail",
  "interior",
  "style",
  "evaluation",
] as const;
export type ModelPackRole = (typeof modelPackRoles)[number];
export interface ModelPackAsset {
  id: string;
  pack_id: string;
  asset_id: string;
  role: ModelPackRole;
  view: string;
  room: string;
  priority: number;
  approved_for_generation: number;
  created_at: number;
}
export interface ModelPack {
  id: string;
  name: string;
  brand: string;
  model: string;
  model_year: string;
  product_class: string;
  status: string;
  created_at: number;
  updated_at: number;
  assets: ModelPackAsset[];
}
const modelPackRoleOrder: Record<ModelPackRole, number> = {
  base: 0,
  identity: 1,
  detail: 2,
  interior: 3,
  style: 4,
  evaluation: 5,
};
/**
 * Build the ordered fal reference list for a model pack. Image 1 is always the
 * explicit campaign base when one is supplied. Evaluation images remain held
 * out, and only approved assets can reach generation.
 */
export function selectModelPackReferences(
  assignments: ModelPackAsset[],
  baseId?: string | null,
  preferredView = "",
) {
  const normalizedView = preferredView.trim().toLowerCase();
  const eligible = assignments
    .filter(
      (item) =>
        item.approved_for_generation === 1 && item.role !== "evaluation",
    )
    .sort((a, b) => {
      const aView =
        normalizedView && a.view.toLowerCase() === normalizedView ? 0 : 1;
      const bView =
        normalizedView && b.view.toLowerCase() === normalizedView ? 0 : 1;
      return (
        modelPackRoleOrder[a.role] - modelPackRoleOrder[b.role] ||
        aView - bView ||
        a.priority - b.priority ||
        a.created_at - b.created_at
      );
    });
  const first =
    baseId || eligible.find((item) => item.role === "base")?.asset_id || null;
  const ids = first ? [first] : [];
  for (const item of eligible) {
    if (!ids.includes(item.asset_id)) ids.push(item.asset_id);
    if (ids.length === 4) break;
  }
  return ids;
}
export interface Job {
  shot_label?: string;
  generation_prompt?: string;
  id: string;
  batch_id: string;
  slot: number;
  status: string;
  result_asset_id: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
  request_id: string | null;
  elapsed_ms: number | null;
}
export interface Batch {
  id: string;
  project_id: string;
  stage: GenerationStage;
  prompt: string;
  endpoint: string;
  quality: string;
  created_at: number;
  inputs_json: string;
  jobs: Job[];
}
export const activeStatus = (s: string) =>
  ["submitting", "queued", "generating", "saving"].includes(s);
export const generationCountSchema = z.number().int().min(1).max(4).default(2);
export const requestSchema = z.object({
  count: generationCountSchema,
  id: z.string().uuid(),
  project_id: z.string().min(1).max(100),
  stage: z.enum([
    "landscape",
    "compose",
    "people",
    "objects",
    "prop",
    "campaign",
    "variation",
  ]),
  prompt: z.string().trim().min(10).max(12000),
  aspect: z
    .enum(["landscape_4_3", "landscape_16_9", "square_hd", "portrait_4_3"])
    .default("landscape_4_3"),
  reference_id: z.string().max(100).optional(),
  reference_ids: z.array(z.string().min(1).max(100)).max(4).optional(),
});
export const placementGeometryBrief = `Treat the RV as one rigid object: preserve its observed body length-to-height ratio, wheel diameter, axle spacing, roofline and visible side. Use uniform scaling, never stretch, squash, bend or widen the body to fit a space. First identify the backdrop camera height, horizon or vanishing direction, ground slope and a continuous load-bearing contact area. Match the source RV camera elevation and visible roof/side perspective to the destination; do not paste an elevated dealer photograph into an eye-level scene unchanged. Preserve the supported view without inventing an unseen side. Establish the tire contact line on a named visible patch of ground, then derive vehicle scale from that depth and local reference objects. At greater distance the full vehicle shrinks consistently and the contact line approaches the ground-plane horizon; do not choose screen position and width independently. Use visible road width, nearby vehicles or other reliable scale cues when available, but do not invent dimensions or assume every tree is the same size. Anchor every visible tire and support to the same ground plane with compact contact shadows and a consistent cast shadow; allow foreground terrain to occlude the lowest edges where appropriate. Keep wheels round in their projected plane, the chassis level with the local ground, and no floating, buried tires or giant/toy proportions. Match local contrast, grain, atmospheric depth and reflections. Physical fit takes priority over composition variety. If output aspect differs, crop the plate conservatively without stretching either reference.`;
export const photographicBrief = `Render a believable camera photograph with natural color and ordinary real-world detail. Use one coherent light source, physically consistent shadows, gentle highlight rolloff and believable material reflections. Texture should follow the object and its distance from the camera, rather than look uniformly sharp. Keep subtle irregularities and natural tonal variation. Avoid painterly blending, airbrushed surfaces, CGI gloss, HDR halos and oversharpening. For edits, retain the source camera, exposure and color balance unless the requested change requires otherwise.`;
export const environmentBrief = `Build a geographically coherent place. Nearby gravel has irregular stone sizes, embedded edges and small contact shadows; soil, grass and rock remain distinct materials. Trees have asymmetric branches and varied spacing, with foliage resolving into plausible clusters rather than repeating stamps or smeared green masses. Rock formations have consistent strata and erosion. Water reflects the actual sky and surroundings with modest surface variation. Foreground detail is more legible than distant detail; distant terrain loses contrast and fine texture gradually through real atmospheric perspective. Keep the horizon, cloud scale and vegetation plausible. Do not add water, trees or mountains when they are absent from the requested setting.`;
export const promptEnhancementGuide = `Translate the user's intent into concrete photographic instructions, not a list of quality adjectives. Specify the requested place, realistic materials, a coherent light direction and believable spatial relationships. Avoid adding dramatic skies, orange-and-teal grading, excessive golden glow, artificial mist, perfect symmetry or an idealized postcard composition. Preserve explicitly requested weather, time of day and artistic intent. Prefer positive descriptions of the desired result to long negative lists. For existing photos, describe only the requested change and identify what must remain unchanged; do not prescribe a new lens, viewpoint or global lighting by default.`;
export const realismRefinement = `Make the background look more like a real location photograph. Correct painterly foliage, smeared terrain, overly saturated color and inconsistent light if present. Use believable vegetation, irregular ground textures and natural atmospheric depth. Preserve the exact RV, lettering, graphics, people, objects, layout and viewpoint. Change only the environmental rendering that needs correction; do not invent scenery or sharpen every surface equally.`;
export function modelFor(stage: GenerationStage) {
  return stage === "people"
    ? PEOPLE_ENDPOINT
    : stage === "landscape" || stage === "prop" || stage === "campaign"
      ? GENERATE_ENDPOINT
      : EDIT_ENDPOINT;
}
export function buildPrompt(
  stage: GenerationStage,
  brief: string,
  slot: number,
  placement?: string,
  allowLifestyle = false,
) {
  const composeInstruction = allowLifestyle
    ? "Image 1 is the exact RV identity reference; image 2 is an approved Jayco lifestyle reference that may contain a different RV. Replace the RV in image 2 completely with the RV from image 1 while preserving image 1's body geometry, graphics, badges, lettering, windows, doors, wheels, accessories and color. Transfer only the requested setting, light, color response, camera language, people, wardrobe, activity and prop styling from image 2. Follow the creative direction for the exact cast, activity and shot role. Match perspective, scale, occlusion, reflections and ground contact. Keep people candid and anatomically realistic, with believable interaction, fabric and shadows. Do not retain, hybridize or duplicate the RV from image 2."
    : "Image 1 is the source RV; image 2 is the selected landscape. Place that exact RV into that landscape, matching camera perspective, scale, light and ground contact. Preserve the RV body geometry, graphics, badges, lettering, windows, doors, wheels, accessories and color as accurately as possible. Update reflections in glass and glossy body panels to match the selected landscape and its sky; retain the physical window shapes, tint and decals instead of copying reflections from the RV's original setting. Treat image 2 as the background plate to preserve, not inspiration for a new landscape. Keep its horizon, terrain, vegetation, sky and photographic texture; change only the vehicle footprint, necessary occlusion and local contact shadows. No people or added props. Additional images, if present, are supporting RV reference views.";
  const instructions: Record<GenerationStage, string> = {
    campaign:
      "Create a new commercial campaign image from the creative direction. Include only subjects requested by the user. Do not invent brand lettering or product specifications.",
    variation:
      "Edit image 1 according to the creative direction. Further images, if present, are supporting references in their supplied order, not separate images to edit. Preserve the identity and geometry of any RV, its graphics, windows, doors, wheels and accessories. Change only the requested elements. Use image 1 as the base scene; do not combine unrelated supporting subjects unless requested. Match light, scale, perspective and ground contact. Preserve untouched landscape detail and avoid cumulative smoothing or restyling across edits.",
    landscape:
      "Create a clean reusable landscape plate. Provide generous relatively level foreground for a large RV. No RVs, vehicles, people, animals, buildings, camping equipment, signs, typography or other man-made objects. Geography and vegetation must be plausible for the described place. Photograph a plausible real location at standing eye level with a normal 35mm perspective and moderate landscape depth of field, approximately f/8. Leave usable ground without turning it into a perfectly smooth or staged platform.",
    compose: composeInstruction,
    people:
      "Edit only the requested people into image 1. Preserve the RV, its graphics, landscape, camera viewpoint and composition. Match scale, ambient light, sun direction and shadows. Natural skin texture, realistic hair, candid posture, clothing with believable wrinkles. Preserve background texture outside the added people and their immediate shadows. No waxy skin or exaggerated smiles.",
    objects:
      "Edit only the requested physical objects into image 1. Image 2, if present, is a reference for the requested object. Preserve the RV, all existing people, landscape and composition. Match perspective, scale, lighting, occlusion and ground contact. Do not redraw, soften or regrade unrelated details.",
    prop: "Create a realistic isolated physical prop reference for an RV lifestyle photoshoot. Show the requested object clearly against a simple neutral background. No text, branding or people.",
  };
  const isEdit = ["compose", "people", "objects", "variation"].includes(stage);
  const compositionVariations = [
    "Use the most physically plausible usable ground patch and scale for this RV and source camera. Respect the requested distance; anchor wheels to a visible landmark before deriving scale.",
    "Offer another feasible placement on the same ground plane. Move laterally only where the terrain and source viewing angle support it; maintain the physical vehicle size at the same depth.",
    "If the terrain allows, use a modestly nearer contact point and derive the corresponding scale from the same camera geometry. Otherwise use a restrained alternative on the usable patch.",
    "If the terrain allows, use a modestly deeper contact point, reducing vehicle size consistently with perspective. Do not force a new orientation or unsupported position for variety.",
  ];
  const variations = stage === "compose" ? compositionVariations : isEdit
    ? [
        "Use a restrained execution of the requested edit; keep the source framing and all untouched scenery.",
        "Offer a second execution of only the requested change; preserve camera, horizon and untouched textures.",
        "Offer a subtle alternative within the requested edit area; retain source lighting unless changing it was requested.",
        "Offer another plausible execution without redesigning the scene or restyling the unedited surroundings.",
      ]
    : [
        "Use a balanced, naturally occurring arrangement with modest visual drama.",
        "Use a slightly different plausible foreground arrangement without changing the requested weather or region.",
        "Vary natural spacing and framing subtly; keep ordinary terrain and believable depth.",
        "Offer another credible location photograph with understated light and irregular natural detail.",
      ];
  const environment =
    stage === "landscape" || stage === "campaign"
      ? `\n\nENVIRONMENT\n${environmentBrief}`
      : "";
  return `${instructions[stage]}${stage === "compose" ? "\n\nPLACEMENT GEOMETRY\n" + placementGeometryBrief : ""}\n\nCREATIVE DIRECTION\n${brief}\n\nPHOTOGRAPHIC STANDARD\n${photographicBrief}${environment}\n\nVARIATION ${slot + 1}\n${stage === "compose" && placement ? placement : variations[slot]}${stage === "compose" ? "\nPlacement must obey explicit user constraints and visible terrain. Do not force a vehicle onto water, steep slopes or vegetation. Keep the backdrop camera and horizon fixed; create variation through vehicle position, distance and modest supported orientation. Do not mirror lettering or invent unseen vehicle details. Produce one photograph, never a collage." : ""}`;
}
export function providerInput(
  stage: GenerationStage,
  prompt: string,
  aspect: string,
  images: string[],
) {
  const input: Record<string, unknown> = { prompt, num_images: 1 };
  if (stage === "people") {
    input.image_urls = images;
  } else {
    input.quality = "max";
    const size = generationSizes[aspect];
    if (!size) throw new Error("Unsupported image aspect ratio");
    input.image_size = { ...size };
    input.output_format = "png";
    if (stage === "compose" || stage === "objects" || stage === "variation")
      input.image_urls = images;
  }
  return input;
}
export const assetUploadSchema = z.object({
  kind: z.enum(["rv", "landscape", "prop", "campaign"]),
  name: z.string().trim().min(1).max(120),
  brand: z.string().max(80).default(""),
  model: z.string().max(80).default(""),
  year: z.string().max(8).default(""),
  angle: z.string().max(60).default(""),
  environment: z.string().max(80).default(""),
  lighting: z.string().max(80).default(""),
});

export interface CampaignTurn {
  id: string;
  project_id: string;
  user_text: string;
  reply: string;
  prompt: string;
  suggestions_json: string;
  references_json: string;
  status: string;
  error: string | null;
  batch_id: string | null;
  aspect: string;
  created_at: number;
  updated_at: number;
}
export interface CampaignData {
  saved_ids: string[];
  turns: CampaignTurn[];
}
