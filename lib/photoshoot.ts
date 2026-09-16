import type { Batch } from './domain';

export type ShotAspect = 'landscape_16_9' | 'landscape_4_3' | 'portrait_4_3' | 'square_hd' | 'portrait_4_5' | 'portrait_9_16';
export type PhotoshootShot = {
  id: string;
  label: string;
  aspect: ShotAspect;
  format: string;
  camera: string;
  summary: string;
  direction: string;
  category: string;
  usage: string;
};

/** Each frame is generated at its own native dimensions, never cropped from a hero. */
export const photoshootShots: PhotoshootShot[] = [
  {
    category: 'campaign', usage: 'Campaign opener · web hero · presentation',
    id: 'establishing', label: 'The whole escape', aspect: 'landscape_16_9', format: 'Wide · 16:9',
    camera: '28mm · eye level · deep focus',
    summary: 'An expansive camp scene with people living in the landscape.',
    direction: 'WIDE ENVIRONMENTAL ESTABLISHING SHOT. Use a 28mm documentary lens at standing eye level, approximately f/8. Show the complete RV at modest environmental scale with generous landscape and a candid camp activity by the reference cast. The RV should occupy roughly half the frame width where physically plausible, rather than fill the frame. Let people set out chairs, arrive from a ride or tend to dogs as supported by the reference. Keep the ground, atmosphere and natural light readable. No one poses for the camera.',
  },
  {
    category: 'people', usage: 'Editorial portrait · brochure · brand story',
    id: 'portrait', label: 'A moment together', aspect: 'portrait_4_3', format: 'Portrait · 3:4',
    camera: '50mm · close human perspective · soft background',
    summary: 'A candid person or pet interaction, with the RV as intimate context.',
    direction: 'VERTICAL HUMAN STORY. Use a 50mm lens at the subject\'s eye level, approximately f/2.8. Move close to one or two people sharing a specific unposed moment at the curbside camp: a quiet conversation, a mug passed between hands, or a person crouching to greet a dog when pets appear in the reference. People and the interaction dominate the frame. Feature only one adult with one dog when pets are part of the reference; otherwise feature two adults interacting. Let the rest of the cast stay outside this tight frame. Intentionally crop the RV to a recognizable section of its supported curbside wall or entry behind them; do not squeeze the entire RV into the portrait. Retain accurate visible markings and natural falloff in background detail. This is a new close camera position, not a vertical crop of the wide establishing shot.',
  },
  {
    category: 'rituals', usage: 'Carousel detail · email tile · social square',
    id: 'detail', label: 'Small camp rituals', aspect: 'square_hd', format: 'Square · 1:1',
    camera: '85mm · tactile detail · shallow focus',
    summary: 'Hands, coffee, fabric and a small lived-in moment at camp.',
    direction: 'SQUARE TACTILE LIFESTYLE DETAIL. Use an 85mm close lens, approximately f/4, at seated height. Photograph anatomically believable hands passing a ceramic mug or folding a camp blanket beside the curbside entry. Tight framing centers the action, fabric weave and ordinary material detail. Only a partial, accurately rendered portion of the RV is visible as contextual background. Preserve the reference wardrobe and restrained prop language. No full vehicle, wide camp tableau, added text or product redesign.',
  },
  {
    category: 'people', usage: 'Editorial feature · activity story',
    id: 'action', label: 'Out for the day', aspect: 'landscape_4_3', format: 'Editorial · 4:3',
    camera: '35mm · off-center action · medium depth',
    summary: 'A walk, a bicycle or dogs in motion, caught between poses.',
    direction: 'CANDID ACTION EDITORIAL. Use a 35mm lens, approximately f/5.6, at waist-to-chest height. Catch the reference cast walking diagonally through the foreground, handling bicycles if supported, or walking dogs if they appear in the reference. Use asymmetric framing with clear separation between limbs, wheels and leashes. Keep natural gestures, believable walking balance and purposeful gazes away from camera. The RV occupies a secondary midground plane with correct supported curbside geometry. Avoid a lineup of people facing the lens.',
  },
  {
    category: 'perspectives', usage: 'Immersive web image · brochure spread',
    id: 'camp-level', label: 'From the camp chair', aspect: 'landscape_16_9', format: 'Wide · 16:9',
    camera: '35mm · seated viewpoint · layered foreground',
    summary: 'An immersive low viewpoint with chairs and people in the foreground.',
    direction: 'SEATED CAMP VIEWPOINT. Use a 35mm lens from seated chest height, approximately f/5.6. Include a soft, partial camp-chair edge in the near foreground, one adult in three-quarter profile in the middle plane, and a recognizable curbside portion of the RV behind. Photograph a relaxed conversation as an observer within camp. Correct perspective for this modestly lower camera without inventing an unseen RV side. Keep faces unobscured, layers distinct and source color natural. Do not repeat a standing full-vehicle hero composition.',
  },
  {
    category: 'atmosphere', usage: 'Closing image · editorial portrait',
    id: 'fireside', label: 'The day winds down', aspect: 'portrait_4_3', format: 'Portrait · 3:4',
    camera: '50mm · seated portrait · gentle light falloff',
    summary: 'A quiet fireside portrait with warm, restrained camp atmosphere.',
    direction: 'VERTICAL FIRESIDE PORTRAIT. Use a 50mm lens at seated eye level, approximately f/2.8. Frame two adults in quiet conversation around a small portable firepit, with the fire below their faces and a partial recognizable RV curbside behind. Use the source shoot\'s late-day color response with modest warm practical light, natural skin and soft shadows. Keep the fire small and plausible; no orange glow over the whole frame. Let gestures and faces carry the story while keeping the RV contextual, not full-frame.',
  },
  {
    id: "hero-left",
    label: "Room for the story",
    aspect: "landscape_16_9",
    format: "Wide · 16:9",
    category: "campaign",
    usage: "Website hero · email header",
    camera: "35mm · eye level · scene-led",
    summary: "A lived-in campsite on the right, with open landscape to the left.",
    direction: "LEFT-OPEN CAMPAIGN HERO. Use a 35mm lens at standing eye level, f/8. Place the supported RV view and one candid adult activity in the right half; let real terrain and sky flow through the left half with low visual complexity. Keep the complete RV naturally scaled, away from frame edges. Preserve environmental depth and the source light, with lived-in camp details. The left side is still a real landscape, never a flat band. No added headline or graphics. Recompose the camera without mirroring the RV or its lettering.",
  },
  {
    id: "hero-right",
    label: "The other side of the story",
    aspect: "landscape_16_9",
    format: "Wide · 16:9",
    category: "campaign",
    usage: "Alternate website hero · presentation cover",
    camera: "50mm · distant observer · gentle compression",
    summary: "An offset camp scene with breathing room on the right.",
    direction: "RIGHT-OPEN CAMPAIGN HERO. Step farther back with a 50mm lens, f/8, from a supported side angle. Keep the RV and a small candid camp interaction in the left half, leaving naturally quieter landscape in the right half. Give the foreground a subtle contextual layer and avoid the same centered tableau as the establishing frame. Move the camera within the supported exterior view; never horizontally flip or fabricate an unseen side. No flat bands, generated headline or graphics.",
  },
  {
    id: "social-feed",
    label: "A pause worth sharing",
    aspect: "portrait_4_5",
    format: "Feed · 4:5",
    category: "social",
    usage: "Social feed · paid social · carousel cover",
    camera: "50mm · waist-up interaction · shallow focus",
    summary: "A tight, vertical human moment designed for a feed.",
    direction: "FEED-FIRST HUMAN MOMENT. Compose natively at 4:5 with a 50mm lens, f/2.8. Two reference adults share an amused glance as one passes a small snack at the camp table. Frame waist-up, with one clearly readable interaction and a recognizable partial curbside RV wall behind. Keep faces and hands away from crop edges, and use the source wardrobe and skin tones. The wall is contextual, not an invented doorway. No full RV squeezed into the portrait. Avoid posed smiles, food advertising styling, duplicate limbs and extra people.",
  },
  {
    id: "story-vertical",
    label: "Ready for what is next",
    aspect: "portrait_9_16",
    format: "Story · 9:16",
    category: "social",
    usage: "Stories · vertical ad background · mobile",
    camera: "35mm · full-height person · layered depth",
    summary: "A standing candid moment composed for a tall mobile screen.",
    direction: "FULL-HEIGHT VERTICAL STORY. Compose natively at 9:16 using a 35mm lens at chest height, f/4. One reference adult bends slightly to pick up their day bag from a camp chair, preparing for an outing. Include natural head-to-foot body scale, a readable hand-to-bag interaction and a partial supported RV wall as midground context. Keep the face, hands and bag in the central three-quarters of the image so screen overlays can avoid them; the entire frame remains real scenery. This is one still photograph, not a video storyboard. No new equipment, open doors or invented interior.",
  },
  {
    id: "breakfast",
    label: "Coffee before the day",
    aspect: "portrait_4_5",
    format: "Feed · 4:5",
    category: "rituals",
    usage: "Lifestyle carousel · email · seasonal campaign",
    camera: "50mm · table height · selective focus",
    summary: "A quiet coffee ritual with the camp waking up around it.",
    direction: "COFFEE RITUAL. Use a 50mm lens at table height, f/4. A reference adult pours coffee into a mug on a small camp table, with their face partly visible above the hands and the exact RV wall softly behind. Show one physically connected pour and plausible finger positions. Keep the light and time consistent with the source; do not force sunrise if it was photographed later. Limit props to a mug and simple flask or pot, plus existing camp items. Warmth comes from human activity, not orange grading.",
  },
  {
    id: "shared-table",
    label: "Make room at the table",
    aspect: "landscape_4_3",
    format: "Editorial · 4:3",
    category: "rituals",
    usage: "Brochure lifestyle · family story · editorial",
    camera: "35mm · table-corner viewpoint · medium focus",
    summary: "A casual meal caught between serving and conversation.",
    direction: "SHARED TABLE EDITORIAL. Use a 35mm lens at seated eye level from the corner of a camp table, f/5.6. Two reference adults pass a simple bowl during a casual meal; other cast only if clearly supported by the source. Keep food restrained and hands separated. A diagonal table edge creates depth toward the accurately rendered RV in the background. Preserve source clothing and light. Favor an imperfect in-between gesture over a posed group portrait. Do not open a door or hatch to stage the activity.",
  },
  {
    id: "quiet-reading",
    label: "Time to do nothing",
    aspect: "portrait_4_3",
    format: "Portrait · 3:4",
    category: "perspectives",
    usage: "Editorial page · relaxation story",
    camera: "85mm · side profile · soft depth",
    summary: "A single person absorbed in reading, with the RV gently behind.",
    direction: "QUIET READING PORTRAIT. Use an 85mm lens from a modest distance, f/2.8, at seated eye level. One reference adult in side profile reads a paperback in a camp chair, legs and arms comfortably supported. Crop around the upper body and chair, with a recognizable partial RV wall behind. Let the other cast remain outside this intimate frame. Maintain source light and clothing; the pages need no legible invented text. Use ordinary skin texture, restrained color and gentle background falloff.",
  },
  {
    id: "over-shoulder",
    label: "See it from here",
    aspect: "landscape_4_3",
    format: "Editorial · 4:3",
    category: "perspectives",
    usage: "Travel story · brochure transition",
    camera: "50mm · over shoulder · layered focus",
    summary: "The viewer joins a conversation from inside the campsite.",
    direction: "OVER-THE-SHOULDER OBSERVER. Use a 50mm lens at seated height, f/4. A small out-of-focus adult shoulder frames one edge while another reference adult beyond it gestures in conversation. Keep the distant face unobscured and the exact RV in a third contextual plane. Show enough shoulder to feel present without making an anonymous obstruction dominate. Use the reference wardrobe and supported exterior side. Do not repeat the full vehicle or two-person portrait framing.",
  },
  {
    id: "product-profile",
    label: "The RV at camp",
    aspect: "landscape_4_3",
    format: "Editorial · 4:3",
    category: "product",
    usage: "Product page · dealer marketing · brochure",
    camera: "50mm · supported exterior angle · deep focus",
    summary: "A clear product frame grounded in the lived-in campsite.",
    direction: "ENVIRONMENTAL PRODUCT PORTRAIT. Use a 50mm lens, f/8, with the source-supported exterior angle and camera elevation. Photograph the complete exact RV clearly with honest proportions, grounded wheels and readable source branding. Let camp chairs or a mug at the edge suggest people living here, but no person blocks the body, axles or entry. Preserve the lifestyle reference location and color; no sterile white backdrop or showroom lighting. Keep every door, slide-out and accessory in its source state. Avoid low heroic distortion and unsupported rear or aerial views.",
  },
  {
    id: "product-detail",
    label: "The details that belong",
    aspect: "square_hd",
    format: "Square · 1:1",
    category: "product",
    usage: "Product detail tile · brochure inset",
    camera: "85mm · supported exterior detail · controlled focus",
    summary: "A close study of a real visible badge, finish or fitting.",
    direction: "OBSERVED PRODUCT DETAIL. Use an 85mm close lens, f/5.6. Select a clearly resolved exterior badge or physical fitting that is actually visible in image 1, with adjacent panel geometry for scale. Preserve its exact lettering, position, material and finish. If no badge is resolved, frame a wider supported panel-and-window detail rather than inventing microtext, hardware, a feature or a specification. Carry the source campsite color in reflections without replacing the product surface. No open doors, invented interiors, composite feature panels or added text.",
  },
  {
    id: "walking-away",
    label: "The path back to camp",
    aspect: "landscape_16_9",
    format: "Wide · 16:9",
    category: "people",
    usage: "Travel feature · panoramic campaign image",
    camera: "85mm · distant viewpoint · compressed layers",
    summary: "A candid walk through the scene, with the RV beyond.",
    direction: "COMPRESSED WALK-BACK STORY. Use an 85mm lens from farther away, f/5.6, looking along a visible safe path toward camp. Photograph the reference adults from a rear three-quarter human view walking toward the RV; pets only when supported by the reference. Layer path, people and exact RV at distinct depths, with natural gait and separated limbs. Keep the RV at its source-supported exterior side, even though the people face away. Do not fabricate roads or scenery. Differentiate this from a foreground action frame through distance and compressed perspective.",
  },
  {
    id: "place-texture",
    label: "The feeling of being there",
    aspect: "square_hd",
    format: "Square · 1:1",
    category: "atmosphere",
    usage: "Carousel transition · mood image · editorial inset",
    camera: "50mm · ground-level texture · selective focus",
    summary: "A quiet texture image that gives the shoot breathing room.",
    direction: "SENSE-OF-PLACE STILL LIFE. Use a 50mm lens low beside camp, f/4. Frame a small still life of source-supported ground texture, the foot of a camp chair and a relaxed adult hand resting at the edge of the frame. Let a recognizable sliver of the RV stay in soft background context. Use only vegetation or terrain that actually belongs to this setting. Prioritize fabric, stone or soil texture and a sense of recent human presence. No new scenery, floating props, artificial mist or generic scenic postcard.",
  },
];

export const photoshootCategories = [
  {id:'campaign', label:'Campaign heroes'}, {id:'people', label:'People & activity'},
  {id:'rituals', label:'Camp rituals'}, {id:'perspectives', label:'Intimate viewpoints'},
  {id:'product', label:'Product coverage'}, {id:'atmosphere', label:'Atmosphere'},
  {id:'social', label:'Social & mobile'},
];

/** Purpose-led pairs; selecting one never submits a generation. */
export const photoshootPasses = [
  {id:'opening', label:'Campaign opener', summary:'Place and people: an expansive hero with a close human story.', shotIds:['establishing','portrait']},
  {id:'rituals', label:'Everyday rituals', summary:'A tactile square detail and a vertical coffee moment.', shotIds:['detail','breakfast']},
  {id:'activity', label:'Out exploring', summary:'Foreground activity and a compressed walk back to camp.', shotIds:['action','walking-away']},
  {id:'immersive', label:'Slow down', summary:'A layered seated view and a quiet solo portrait.', shotIds:['camp-level','quiet-reading']},
  {id:'web', label:'Web & email heroes', summary:'Left-open and right-open compositions, photographed separately.', shotIds:['hero-left','hero-right']},
  {id:'social', label:'Social & Stories', summary:'Native 4:5 feed and 9:16 Story frames with different actions.', shotIds:['social-feed','story-vertical']},
  {id:'product', label:'Product at camp', summary:'The complete RV and a supported exterior detail.', shotIds:['product-profile','product-detail']},
  {id:'gathering', label:'Time together', summary:'A shared table and an intimate fireside closing portrait.', shotIds:['shared-table','fireside']},
  {id:'editorial', label:'Editorial texture', summary:'An over-shoulder viewpoint and a quiet sense-of-place detail.', shotIds:['over-shoulder','place-texture']},
];

export const defaultPhotoshootIds = photoshootPasses[0].shotIds;

export function photographedShotIds(batches: Batch[]) {
  const known = new Set(photoshootShots.map(s => s.id));
  return new Set(batches.filter(b => b.stage === 'compose').flatMap(b =>
    b.jobs.filter(j => j.status === 'ready' && j.shot_id && known.has(j.shot_id)).map(j => j.shot_id!)));
}

export function resolvePhotoshootShots(ids: string[]) {
  if (!ids.length || ids.length > 2 || new Set(ids).size !== ids.length)
    throw new Error('Choose one or two different shots.');
  return ids.map(id => {
    const shot = photoshootShots.find(item => item.id === id);
    if (!shot) throw new Error('Unknown photoshoot shot.');
    return shot;
  });
}

export function nextPhotoshootIds(batches: Batch[]) {
  const completed = photographedShotIds(batches);
  return photoshootPasses.flatMap(p => p.shotIds).filter(id => !completed.has(id)).slice(0, 2);
}

export const photoshootContinuity = 'Treat this as one location shoot. Use image 1 for the exact RV identity and image 2 for place, source palette, light direction, cast styling, wardrobe and props. Preserve the same cast description, clothing colors, weather and location across frames. Prefer activities and animals supported by the reference; do not add pets or children unless requested or visible there. Vary viewpoint, lens perspective, framing and depth of field according to the assigned shot. Crop the vehicle intentionally for intimate shots while preserving all visible geometry and graphics; do not invent unsupported interiors or unseen sides. Treat the entry door, windows, slide-outs, badges and compartments as fixed architectural landmarks: never relocate, resize or reorder them to fit the frame. Keep the door closed if the RV identity photo shows it closed. Move the camera or crop different landmarks out instead of compressing the vehicle or moving its entry toward the front cap. No staged smiles or stock-photo posing. Each output is one photograph.';

export function photoshootPrompt(shot: PhotoshootShot, brief: string, assessment?: string) {
  return `${photoshootContinuity}\n\nCAMPAIGN DIRECTION\n${brief}\n\n${assessment ? `SCENE FEASIBILITY NOTES\n${assessment}\n\n` : ''}ASSIGNED SHOT — ${shot.label}\nIntended use: ${shot.usage}.\nNative output: ${shot.format}.\n${shot.direction}\nThis assigned shot controls camera, framing, subject hierarchy and action. Render only this shot, not other shots mentioned in the campaign direction. Match the source palette and lighting; use natural skin, credible anatomy and physical ground contact. No collage or split screen.`;
}
