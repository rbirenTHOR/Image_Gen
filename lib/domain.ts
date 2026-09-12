import { z } from "zod";
export const GENERATE_ENDPOINT = "openai/gpt-image-2.5/sunburst/text-to-image";
export const EDIT_ENDPOINT = "openai/gpt-image-2.5/sunburst/edit";
export const PEOPLE_ENDPOINT = "meta/muse-image/edit";
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
  updated_at: number;
  version: number;
}
export interface Job {
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
export const requestSchema = z.object({
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
export const photographicBrief = `Create an authentic commercial outdoor photograph. Natural eye-level camera, realistic 28–35mm perspective and believable scale. Physically plausible sun direction and ground-contact shadows, deep natural depth of field, realistic surface textures, restrained saturation and highlight rolloff. Preserve small photographic imperfections. Avoid CGI appearance, artificial HDR, waxy surfaces, repeated textures, excessive sharpening, exaggerated skies and cinematic color grading.`;
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
) {
  const instructions: Record<GenerationStage, string> = {
    campaign:
      "Create a new commercial campaign image from the creative direction. Include only subjects requested by the user. Do not invent brand lettering or product specifications.",
    variation:
      "Edit image 1 according to the creative direction. Further images, if present, are supporting references in their supplied order, not separate images to edit. Preserve the identity and geometry of any RV, its graphics, windows, doors, wheels and accessories. Change only the requested elements. Use image 1 as the base scene; do not combine unrelated supporting subjects unless requested. Match light, scale, perspective and ground contact.",
    landscape:
      "Create a clean reusable landscape plate. Provide generous relatively level foreground for a large RV. No RVs, vehicles, people, animals, buildings, camping equipment, signs, typography or other man-made objects. Geography and vegetation must be plausible for the described place.",
    compose:
      "Image 1 is the source RV; image 2 is the selected landscape. Place that exact RV into that landscape, matching camera perspective, scale, light and ground contact. Preserve the RV body geometry, graphics, badges, lettering, windows, doors, wheels, accessories and color as accurately as possible. Keep the landscape composition recognizable. No people or added props. Additional images, if present, are supporting RV reference views.",
    people:
      "Edit only the requested people into image 1. Preserve the RV, its graphics, landscape, camera viewpoint and composition. Match scale, ambient light, sun direction and shadows. Natural skin texture, realistic hair, candid posture, clothing with believable wrinkles. No waxy skin or exaggerated smiles.",
    objects:
      "Edit only the requested physical objects into image 1. Image 2, if present, is a reference for the requested object. Preserve the RV, all existing people, landscape and composition. Match perspective, scale, lighting, occlusion and ground contact. Do not redraw unrelated details.",
    prop: "Create a realistic isolated physical prop reference for an RV lifestyle photoshoot. Show the requested object clearly against a simple neutral background. No text, branding or people.",
  };
  const variations = [
    "Favor an understated, balanced interpretation.",
    "Explore a subtly different natural arrangement within the requested brief.",
    "Explore a different plausible placement within the same framing constraints.",
    "Explore another restrained photographic interpretation; preserve all required subjects.",
  ];
  return `${instructions[stage]}\n\nCREATIVE DIRECTION\n${brief}\n\nPHOTOGRAPHIC STANDARD\n${photographicBrief}\n\nVARIATION ${slot + 1}\n${variations[slot]}`;
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
    input.image_size = aspect;
    input.output_format = "jpeg";
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
