import type { Batch } from './domain';

export type ShotAspect = 'landscape_16_9' | 'landscape_4_3' | 'portrait_4_3' | 'square_hd';
export type PhotoshootShot = {
  id: string;
  label: string;
  aspect: ShotAspect;
  format: string;
  camera: string;
  summary: string;
  direction: string;
};

/** Each frame is generated at its own native dimensions, never cropped from a hero. */
export const photoshootShots: PhotoshootShot[] = [
  {
    id: 'establishing', label: 'The whole escape', aspect: 'landscape_16_9', format: 'Wide · 16:9',
    camera: '28mm · eye level · deep focus',
    summary: 'An expansive camp scene with people living in the landscape.',
    direction: 'WIDE ENVIRONMENTAL ESTABLISHING SHOT. Use a 28mm documentary lens at standing eye level, approximately f/8. Show the complete RV at modest environmental scale with generous landscape and a candid camp activity by the reference cast. The RV should occupy roughly half the frame width where physically plausible, rather than fill the frame. Let people set out chairs, arrive from a ride or tend to dogs as supported by the reference. Keep the ground, atmosphere and natural light readable. No one poses for the camera.',
  },
  {
    id: 'portrait', label: 'A moment together', aspect: 'portrait_4_3', format: 'Portrait · 3:4',
    camera: '50mm · close human perspective · soft background',
    summary: 'A candid person or pet interaction, with the RV as intimate context.',
    direction: 'VERTICAL HUMAN STORY. Use a 50mm lens at the subject\'s eye level, approximately f/2.8. Move close to one or two people sharing a specific unposed moment at the curbside camp: a quiet conversation, a mug passed between hands, or a person crouching to greet a dog when pets appear in the reference. People and the interaction dominate the frame. Feature only one adult with one dog when pets are part of the reference; otherwise feature two adults interacting. Let the rest of the cast stay outside this tight frame. Intentionally crop the RV to a recognizable section of its supported curbside wall or entry behind them; do not squeeze the entire RV into the portrait. Retain accurate visible markings and natural falloff in background detail. This is a new close camera position, not a vertical crop of the wide establishing shot.',
  },
  {
    id: 'detail', label: 'Small camp rituals', aspect: 'square_hd', format: 'Square · 1:1',
    camera: '85mm · tactile detail · shallow focus',
    summary: 'Hands, coffee, fabric and a small lived-in moment at camp.',
    direction: 'SQUARE TACTILE LIFESTYLE DETAIL. Use an 85mm close lens, approximately f/4, at seated height. Photograph anatomically believable hands passing a ceramic mug or folding a camp blanket beside the curbside entry. Tight framing centers the action, fabric weave and ordinary material detail. Only a partial, accurately rendered portion of the RV is visible as contextual background. Preserve the reference wardrobe and restrained prop language. No full vehicle, wide camp tableau, added text or product redesign.',
  },
  {
    id: 'action', label: 'Out for the day', aspect: 'landscape_4_3', format: 'Editorial · 4:3',
    camera: '35mm · off-center action · medium depth',
    summary: 'A walk, a bicycle or dogs in motion, caught between poses.',
    direction: 'CANDID ACTION EDITORIAL. Use a 35mm lens, approximately f/5.6, at waist-to-chest height. Catch the reference cast walking diagonally through the foreground, handling bicycles if supported, or walking dogs if they appear in the reference. Use asymmetric framing with clear separation between limbs, wheels and leashes. Keep natural gestures, believable walking balance and purposeful gazes away from camera. The RV occupies a secondary midground plane with correct supported curbside geometry. Avoid a lineup of people facing the lens.',
  },
  {
    id: 'camp-level', label: 'From the camp chair', aspect: 'landscape_16_9', format: 'Wide · 16:9',
    camera: '35mm · seated viewpoint · layered foreground',
    summary: 'An immersive low viewpoint with chairs and people in the foreground.',
    direction: 'SEATED CAMP VIEWPOINT. Use a 35mm lens from seated chest height, approximately f/5.6. Include a soft, partial camp-chair edge in the near foreground, one adult in three-quarter profile in the middle plane, and a recognizable curbside portion of the RV behind. Photograph a relaxed conversation as an observer within camp. Correct perspective for this modestly lower camera without inventing an unseen RV side. Keep faces unobscured, layers distinct and source color natural. Do not repeat a standing full-vehicle hero composition.',
  },
  {
    id: 'fireside', label: 'The day winds down', aspect: 'portrait_4_3', format: 'Portrait · 3:4',
    camera: '50mm · seated portrait · gentle light falloff',
    summary: 'A quiet fireside portrait with warm, restrained camp atmosphere.',
    direction: 'VERTICAL FIRESIDE PORTRAIT. Use a 50mm lens at seated eye level, approximately f/2.8. Frame two adults in quiet conversation around a small portable firepit, with the fire below their faces and a partial recognizable RV curbside behind. Use the source shoot\'s late-day color response with modest warm practical light, natural skin and soft shadows. Keep the fire small and plausible; no orange glow over the whole frame. Let gestures and faces carry the story while keeping the RV contextual, not full-frame.',
  },
];

export const defaultPhotoshootIds = ['establishing', 'portrait'];

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
  const completed = new Set(batches.filter(b => b.stage === 'compose').flatMap(b =>
    b.jobs.filter(j => j.status === 'ready' && j.shot_id).map(j => j.shot_id)));
  return photoshootShots.filter(s => !completed.has(s.id)).slice(0, 2).map(s => s.id);
}

export const photoshootContinuity = 'Treat this as one location shoot. Use image 1 for the exact RV identity and image 2 for place, source palette, light direction, cast styling, wardrobe and props. Preserve the same cast description, clothing colors, weather and location across frames. Prefer activities and animals supported by the reference; do not add pets or children unless requested or visible there. Vary viewpoint, lens perspective, framing and depth of field according to the assigned shot. Crop the vehicle intentionally for intimate shots while preserving all visible geometry and graphics; do not invent unsupported interiors or unseen sides. Treat the entry door, windows, slide-outs, badges and compartments as fixed architectural landmarks: never relocate, resize or reorder them to fit the frame. Keep the door closed if the RV identity photo shows it closed. Move the camera or crop different landmarks out instead of compressing the vehicle or moving its entry toward the front cap. No staged smiles or stock-photo posing. Each output is one photograph.';

export function photoshootPrompt(shot: PhotoshootShot, brief: string, assessment?: string) {
  return `${photoshootContinuity}\n\nCAMPAIGN DIRECTION\n${brief}\n\n${assessment ? `SCENE FEASIBILITY NOTES\n${assessment}\n\n` : ''}ASSIGNED SHOT — ${shot.label}\nNative output: ${shot.format}.\n${shot.direction}\nThis assigned shot controls camera, framing, subject hierarchy and action. Render only this shot, not other shots mentioned in the campaign direction. Match the source palette and lighting; use natural skin, credible anatomy and physical ground contact. No collage or split screen.`;
}
