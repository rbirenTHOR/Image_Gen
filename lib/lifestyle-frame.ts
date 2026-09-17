import type { CampaignFlowState, PlannedShot } from './campaign-flow.ts';
import { photographicBrief } from './domain.ts';
import { rvPresenceDirection } from './photoshoot.ts';

/** No placement wrapper or vehicle-view contract in a frame explicitly excluding vehicles. */
export function lifestyleFramePrompt(state: CampaignFlowState, shot: PlannedShot, assessment: string) {
  const cast = state.cast_reference_id ? 2 + state.prop_ids.length : 0;
  return [
    'Create one photograph in a coordinated lifestyle campaign. Image 1 is the source campaign photograph: borrow its setting, light, color, styling and candid photographic character. It may contain an RV; do not reproduce that vehicle. Frame people, activity or details away from all motor vehicles. Requested bicycles may remain.',
    rvPresenceDirection('none'),
    state.scene_mode === 'place' ? 'Stay in the same location and light, framing a vehicle-free part of it.' : 'Use the source campaign aesthetic with the requested setting.',
    state.prop_ids.length ? 'Image 2 is the object reference only.' : '',
    cast ? `Image ${cast} is people and wardrobe only; ignore its vehicle and composition.` : '',
    `CAMPAIGN DIRECTION\n${state.brief}\nPeople and activity: ${state.people}\nProps and styling: ${state.props}`,
    `THIS SHOT: ${shot.label}. Output shape: ${shot.aspect}.`,
    `ASSESSED LIFESTYLE DIRECTION\n${assessment}`,
    photographicBrief,
    'The shot-specific action and crop control this image. Preserve the shared campaign wardrobe and light, but vary gestures and framing. No collage, motor vehicle, RV wall, wheel, door, vehicle branding or product silhouette, even if older campaign text asks for it. Do not back away to show the campsite. A detail frame must stay a detail.',
  ].filter(Boolean).join('\n\n');
}
