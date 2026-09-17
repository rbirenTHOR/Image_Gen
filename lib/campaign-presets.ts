import type { Asset } from "@/lib/domain";

export type CampaignPreset = {
  id: string;
  name: string;
  description: string;
  defaultName: string;
  rvLabel: string;
  styleLabel: string;
  composeBrief: string;
  aspect: "landscape_4_3" | "landscape_16_9" | "square_hd" | "portrait_4_3";
  count: number;
  mode: "standalone" | "lifestyle";
  fallbackShots?: { label: string; direction: string }[];
  rvMatch?: (asset: Asset) => boolean;
  landscapeMatch?: (asset: Asset) => boolean;
};

const normalized = (value = "") => value.trim().toLowerCase();
const eagleMatch = (asset: Asset) =>
  asset.kind === "rv" &&
  normalized(asset.brand) === "jayco" &&
  normalized(asset.model).includes("eagle") &&
  normalized(asset.year) === "2026";
const northPointMatch = (asset: Asset) =>
  asset.kind === "landscape" &&
  normalized(asset.name).includes("north point lifestyle setup");
const centurionMatch = (asset: Asset) =>
  asset.kind === "landscape" &&
  normalized(asset.name).includes("centurion lifestyle setup");
const condorMatch = (asset: Asset) =>
  asset.kind === "landscape" &&
  normalized(asset.name).includes("condor lifestyle setup");
const identityDirection =
  "Use the selected 2026 Jayco Eagle Fifth Wheel as the only product identity. The other selected Jayco photograph supplies the campaign setting, light, palette, camera language, environmental scale and editorial texture; replace any different RV in it completely with the Eagle. Preserve the Eagle's exact white-and-black livery, Jayco bird logo, JAYCO and EAGLE lettering, sculpted fifth-wheel front cap, pin box, slide-outs, windows, entry door, awnings, tandem axles, wheels, landing legs, roofline and compartment seams. Ground every tire and landing leg naturally with believable contact shadows. Natural high-end Jayco campaign photography with believable materials and no CGI gloss.";
const standaloneDirection = `${identityDirection} The Eagle is the only subject. Remove every person and campsite prop. No second RV, tow vehicle, people, pets, chairs, rugs, tables, firepit, camping gear, utility hookups or added props.`;
const eaglePreset = (
  preset: Omit<
    CampaignPreset,
    "rvLabel" | "styleLabel" | "rvMatch" | "landscapeMatch"
  >,
): CampaignPreset => ({
  ...preset,
  rvLabel: "2026 Jayco Eagle Fifth Wheel",
  styleLabel: "Jayco North Point wooded mountain field",
  rvMatch: eagleMatch,
  landscapeMatch: northPointMatch,
});

export const campaignPresets: CampaignPreset[] = [
  eaglePreset({
    id: "jayco-eagle-north-point",
    name: "Eagle · Editorial hero set",
    description:
      "Two product-only hero shots using the approved North Point lifestyle shoot.",
    defaultName: "2026 Eagle — North Point editorial hero set",
    aspect: "landscape_4_3",
    count: 2,
    mode: "standalone",
    composeBrief: `${standaloneDirection} Create a coordinated two-shot editorial hero set. Take 1 is a balanced full product hero in a front three-quarter curbside view. Take 2 is a wider environmental hero with stronger landscape context and clean copy space. The camera distance, RV placement and visual hierarchy must be clearly different.`,
  }),
  eaglePreset({
    id: "jayco-eagle-north-point-wide",
    name: "Eagle · Wide launch set",
    description:
      "Two 16:9 launch-banner shots with generous landscape and headline space.",
    defaultName: "2026 Eagle — North Point wide launch set",
    aspect: "landscape_16_9",
    count: 2,
    mode: "standalone",
    composeBrief: `${standaloneDirection} Create a coordinated two-shot wide launch set in 16:9. Take 1 is a left-copy product hero with the Eagle on the right. Take 2 is a cinematic environmental establishing frame with the Eagle smaller and lower in frame. Make camera distance and hierarchy clearly different while preserving plausible scale.`,
  }),
  eaglePreset({
    id: "jayco-eagle-north-point-social",
    name: "Eagle · Social square set",
    description:
      "Two square campaign shots for feed posts and carousel covers.",
    defaultName: "2026 Eagle — North Point social square set",
    aspect: "square_hd",
    count: 2,
    mode: "standalone",
    composeBrief: `${standaloneDirection} Create a coordinated two-shot square social set. Take 1 is a centered product-forward hero with the complete Eagle readable at feed size. Take 2 is a wider environmental frame with clean copy space above. Make scale and composition clearly different while keeping full wheel and landing-leg contact.`,
  }),
  eaglePreset({
    id: "jayco-eagle-north-point-story",
    name: "Eagle · Vertical story set",
    description:
      "Two vertical campaign shots with safe space for story and paid-social copy.",
    defaultName: "2026 Eagle — North Point vertical story set",
    aspect: "portrait_4_3",
    count: 2,
    mode: "standalone",
    composeBrief: `${standaloneDirection} Create a coordinated two-shot vertical campaign set. Take 1 is a centered story hero with the complete Eagle in the lower two-thirds and natural copy space above. Take 2 is a closer product-led frame from a modestly lower camera height while keeping wheels, landing legs, front cap and rear wall visible.`,
  }),
  {
    id: "jayco-eagle-north-point-lifestyle",
    name: "Eagle · Mountain camp lifestyle",
    description:
      "Two distinct lifestyle shots inspired by the North Point mountain-field shoot.",
    defaultName: "2026 Eagle — mountain camp lifestyle",
    rvLabel: "2026 Jayco Eagle Fifth Wheel",
    styleLabel: "North Point mountain camp cast, props and grade",
    aspect: "landscape_4_3",
    count: 2,
    mode: "lifestyle",
    fallbackShots: [
      {
        label: "Wide family camp setup",
        direction:
          "Create the broad environmental shot requested for take 1. Keep the complete Eagle modestly scaled in the mountain field, with two adults and one child naturally settling into a restrained chair-and-table camp setup. Show generous mountain, tree and grass context. Use the visible level foreground for every tire and landing-leg contact, preserve the source camera height and keep the people secondary to the RV.",
      },
      {
        label: "Closer curbside doorway moment",
        direction:
          "Create the closer curbside doorway shot requested for take 2. Move the camera meaningfully nearer than take 1 while keeping the front cap, tandem axles and entry visible. Show one adult stepping naturally from the Eagle while the other adult and child interact quietly nearby. Preserve the mountain setting and candid grade, use realistic anatomy and shadows, and keep the Eagle as the clear visual anchor.",
      },
    ],
    rvMatch: eagleMatch,
    landscapeMatch: northPointMatch,
    composeBrief: `${identityDirection} Build a believable lived-in mountain camp around the Eagle using the North Point image for color grade, wardrobe restraint, prop density and candid editorial tone. Create two clearly different shots: take 1 is a broad environmental frame with two adults and one child naturally settling into camp near a restrained chair-and-table setup; take 2 is a closer curbside doorway moment with one adult stepping from the RV while the others interact quietly nearby. Preserve the Eagle as the visual anchor. People must feel incidental and candid, with realistic anatomy, ordinary outdoor clothing and natural shadows.`,
  },
  {
    id: "jayco-eagle-centurion-lifestyle",
    name: "Eagle · Golden desert camp",
    description:
      "Two golden-hour lifestyle shots using Centurion's active desert-camp visual language.",
    defaultName: "2026 Eagle — golden desert lifestyle",
    rvLabel: "2026 Jayco Eagle Fifth Wheel",
    styleLabel: "Centurion golden desert camp, wardrobe and props",
    aspect: "landscape_16_9",
    count: 2,
    mode: "lifestyle",
    fallbackShots: [
      {
        label: "Wide bicycle arrival tableau",
        direction:
          "Create the wide golden-hour arrival tableau requested for take 1. Place the complete Eagle on the usable desert camp ground with generous sky and landscape context. Show two adults naturally handling or standing near bicycles as if finishing a ride, without posing for camera. Keep the RV prominent but environmental, preserve its exact identity, and match long warm shadows and grounded scale.",
      },
      {
        label: "Closer fireside conversation",
        direction:
          "Create the closer fireside shot requested for take 2 from a distinctly nearer camera position and lower visual hierarchy. Frame two adults seated in candid conversation beside a minimal firepit-and-chair setup, with a large legible curbside portion of the Eagle behind them. Preserve the Eagle graphics and geometry, warm late-day color, believable firelight restraint, realistic anatomy and contact shadows.",
      },
    ],
    rvMatch: eagleMatch,
    landscapeMatch: centurionMatch,
    composeBrief: `${identityDirection} Use the selected Centurion Dropbox photograph only for warm desert color, long late-day shadows, simple camp styling, wardrobe and candid activity. Replace the Centurion motorhome with the Eagle. Create two clearly different shots: take 1 is a wide golden-hour arrival tableau with the Eagle, two adults and bicycles arranged naturally without posing; take 2 is a closer fireside frame with two adults seated in conversation beside a minimal chair-and-firepit setup. Keep the Eagle accurate and prominent, with realistic people, props, light and contact shadows.`,
  },
  {
    id: "jayco-eagle-condor-lifestyle",
    name: "Eagle · Desert family and dogs",
    description:
      "Two candid family-and-pet shots using the Condor desert campaign's styling and palette.",
    defaultName: "2026 Eagle — desert family and dogs lifestyle",
    rvLabel: "2026 Jayco Eagle Fifth Wheel",
    styleLabel: "Condor desert family, dogs, wardrobe and grade",
    aspect: "landscape_4_3",
    count: 2,
    mode: "lifestyle",
    fallbackShots: [
      {
        label: "Wide family-and-dogs camp",
        direction:
          "Create the wide campsite tableau requested for take 1. Show the complete Eagle at a believable environmental scale with two adults and two distinct dogs moving naturally across the usable desert foreground. Leave breathing room around the group, keep props minimal, preserve clear blue-sky color and use coherent late-afternoon shadows. The Eagle remains the visual anchor and only RV.",
      },
      {
        label: "Closer curbside dog moment",
        direction:
          "Create the closer human-and-dog moment requested for take 2. Move meaningfully nearer and frame one adult interacting candidly with one dog near the Eagle curbside entry while the second adult and dog remain subtle supporting context. Keep a large recognizable portion of the Eagle behind them, with accurate graphics, anatomy, leash or hand contact, scale and natural shadows.",
      },
    ],
    rvMatch: eagleMatch,
    landscapeMatch: condorMatch,
    composeBrief: `${identityDirection} Use the selected Condor Dropbox photograph only for desert palette, blue-sky color response, wardrobe, dog handling and relaxed editorial energy. Replace the Condor RV with the Eagle. Create two clearly different shots: take 1 is a wide campsite tableau with two adults and two dogs moving naturally beside the Eagle; take 2 is a closer candid human-and-dog moment near the curbside entry with the Eagle still legible behind them. Avoid looking at camera, staged smiles, duplicated animals or busy prop clutter. Match anatomy, leash contact, scale and shadows.`,
  },
  {
    id: "blank",
    name: "Blank campaign",
    description: "Choose the RV, setting and direction yourself.",
    defaultName: "Untitled campaign",
    rvLabel: "Choose an RV",
    styleLabel: "Choose a setting",
    aspect: "landscape_4_3",
    count: 2,
    mode: "standalone",
    composeBrief: "",
  },
];

export function getCampaignPreset(id?: string | null) {
  return campaignPresets.find((preset) => preset.id === id);
}

export function resolveCampaignPreset(
  preset: CampaignPreset,
  assets: Asset[],
) {
  return {
    rv: preset.rvMatch ? assets.find(preset.rvMatch) : undefined,
    landscape: preset.landscapeMatch
      ? assets.find(preset.landscapeMatch)
      : undefined,
  };
}
