import { z } from "zod";
import { photoshootShots, type PhotoshootShot } from "./photoshoot";
import type { Batch } from "./domain";
export const flowSections = ["rv", "scene", "plan", "results"] as const;
export const aspectOptions = [
  ["landscape_16_9", "Wide · 16:9"],
  ["landscape_4_3", "Editorial · 4:3"],
  ["portrait_4_3", "Portrait · 3:4"],
  ["square_hd", "Square · 1:1"],
  ["portrait_4_5", "Feed · 4:5"],
  ["portrait_9_16", "Story · 9:16"],
] as const;
const shotSchema = z
  .object({
    id: z.string().min(1).max(100),
    role: z.string().max(100),
    label: z.string().trim().min(1).max(120),
    aspect: z.enum([
      "landscape_16_9",
      "landscape_4_3",
      "portrait_4_3",
      "square_hd",
      "portrait_4_5",
      "portrait_9_16",
    ]),
    direction: z.string().max(4000),
  })
  .strict();
export const flowSchema = z
  .object({
    section: z.enum(flowSections),
    brief: z.string().max(6000),
    rv_id: z.string().max(100).nullable(),
    scene_id: z.string().max(100).nullable(),
    identity_ids: z.array(z.string().max(100)).max(1),
    prop_ids: z.array(z.string().max(100)).max(1),
    scene_mode: z.enum(["look", "place"]),
    people: z.string().max(1000),
    props: z.string().max(1000),
    shots: z
      .array(shotSchema)
      .min(1)
      .max(30)
      .refine(
        (s) => new Set(s.map((x) => x.id)).size === s.length,
        "Shot IDs must be unique.",
      ),
  })
  .strict();
export type CampaignFlowState = z.infer<typeof flowSchema>;
export type PlannedShot = CampaignFlowState["shots"][number];
export type FlowDocument = {
  persisted?: boolean;
  revision: number;
  state: CampaignFlowState;
};
export function plannedShot(role: string): PlannedShot {
  const s = photoshootShots.find((s) => s.id === role)!;
  return {
    id: s.id,
    role: s.id,
    label: s.label,
    aspect: s.aspect,
    direction: s.direction,
  };
}
export const shootPackages = [
  { name: "Two-shot preview", roles: ["establishing", "portrait"] },
  {
    name: "Lifestyle story · 6",
    roles: [
      "establishing",
      "portrait",
      "detail",
      "action",
      "camp-level",
      "quiet-reading",
    ],
  },
  {
    name: "Web & social · 6",
    roles: [
      "hero-left",
      "hero-right",
      "social-feed",
      "story-vertical",
      "detail",
      "portrait",
    ],
  },
  { name: "Full shoot · 18", roles: photoshootShots.map((s) => s.id) },
];
export function flowPrompt(s: CampaignFlowState) {
  return [
    s.brief ||
      "Create a professional RV lifestyle campaign with natural color and candid photographic moments.",
    s.scene_mode === "place"
      ? "Preserve the reference location, terrain, lighting and camp arrangement. Camera positions can vary within this same physical place."
      : "Use the scene reference for its photographic aesthetic, natural color, lighting, environment and lifestyle. Compose distinct camera positions and varied framing.",
    `People and activity: ${s.people || "Use the scene reference as casting guidance; feature only the people needed for each shot."}`,
    `Props and styling: ${s.props || "Use restrained, believable camp details from the scene reference."}`,
    "Reference 1 defines the selected RV identity; reference 2 defines the scene/look only. Never copy the RV from reference 2. People and props in the RV identity image are not casting requirements.",
    s.identity_ids.length
      ? "Reference 3 is additional identity evidence for the same RV, not a scene or casting reference."
      : "",
    s.prop_ids.length
      ? `Reference ${3 + s.identity_ids.length} defines a requested object only; preserve its design without copying its background.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function resolvedShot(
  s: PlannedShot,
  state?: CampaignFlowState,
): PhotoshootShot {
  const base =
    photoshootShots.find((p) => p.id === s.role) ?? photoshootShots[0];
  return {
    ...base,
    id: s.id,
    label: s.label,
    aspect: s.aspect,
    format: aspectOptions.find(([key]) => key === s.aspect)![1],
    usage: s.role === "custom" ? "Custom campaign deliverable" : base.usage,
    direction:
      s.direction +
      `\nCompose specifically for ${aspectOptions.find(([key]) => key === s.aspect)![1]}. This chosen image shape overrides any generic orientation mentioned in the role above.` +
      (state
        ? `\nCAST AND STYLING REQUIREMENTS: ${state.people || "Use only the people needed for this shot."} Props: ${state.props || "Follow restrained scene styling."} These explicit campaign requirements override generic casting or prop suggestions above. When no people or no pets are requested, omit them even from a lifestyle role and tell the story through the environment and objects.`
        : ""),
  };
}
export function flowSignature(s: CampaignFlowState) {
  return JSON.stringify({
    rv: s.rv_id,
    scene: s.scene_id,
    identity: s.identity_ids,
    props: s.prop_ids,
    prompt: flowPrompt(s),
  });
}
export function matchingShot(
  batch: Batch,
  shot: PlannedShot,
  state: CampaignFlowState,
) {
  if (!batch.workflow_json) return false;
  try {
    const prior = JSON.parse(batch.workflow_json) as CampaignFlowState;
    return (
      flowSignature(prior) === flowSignature(state) &&
      JSON.stringify(prior.shots.find((s) => s.id === shot.id)) ===
        JSON.stringify(shot)
    );
  } catch {
    return false;
  }
}

export const lifestyleSetups = [
  {
    name: "Mountain retreat",
    match: "Jayco North Point lifestyle setup",
    brief:
      "A quiet mountain retreat. Borrow the source shoot’s wooded field, muted green palette, soft daylight, relaxed wardrobe and candid editorial character. Keep real skin and fabric texture, accurate ground contact and restrained reflections. Vary scale and camera viewpoint throughout the shoot.",
    people:
      "Two adults relaxing at camp, sharing coffee or reading. Only the people relevant to each frame should appear. No children or pets.",
    props:
      "Camp chairs, coffee mugs and a woven blanket; restrained camp styling.",
  },
  {
    name: "Golden desert escape",
    match: "Jayco Centurion lifestyle setup",
    brief:
      "An active desert escape with natural golden light and the source shoot’s warm, restrained color. Tell a varied story from arriving after a ride to winding down beside camp. Preserve believable terrain, ordinary outdoor wardrobe and candid gestures.",
    people:
      "Two adults arriving from a bicycle ride or talking at camp. Tight shots can show one person; keep the other outside the frame. No children or pets.",
    props:
      "Two bicycles, understated camp chairs and a small portable firepit when appropriate to the shot.",
  },
  {
    name: "Family & dogs",
    match: "Jayco Condor lifestyle setup",
    brief:
      "A lived-in family camp in the source shoot’s desert setting. Carry forward its muted earthy palette, wardrobe, natural light and documentary warmth. Alternate environmental views, human interactions, activity and intimate tactile details.",
    people:
      "Two adults, one child and two dogs. Select only the people or pets relevant to each frame; do not squeeze everyone into tight portraits.",
    props:
      "Simple camp chairs, a blanket and dog leashes when walking; preserve restrained source styling.",
  },
];
