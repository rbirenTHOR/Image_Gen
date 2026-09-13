/** Display labels are soft limits; never discard useful shot directions because
 * the provider used a longer title than the interface needs. */
export function parseCompositionShots(value: unknown, count = 4) {
  const shots = (value as {shots?:unknown[]})?.shots;
  if (!Array.isArray(shots) || shots.length !== count) throw new Error('shot_count');
  const normalized = shots.map((value, slot) => {
    const s=value as {label?:unknown;direction?:unknown};
    if (typeof s?.direction !== 'string' || s.direction.trim().length < 30 || s.direction.length > 12000) throw new Error('shot_direction');
    const label=typeof s.label === 'string' ? s.label.trim().replace(/\s+/g,' ') : '';
    return {label:(label || `Placement ${slot+1}`).slice(0,65),direction:s.direction.trim()};
  });
  if (new Set(normalized.map(s=>s.direction.toLowerCase())).size !== count) throw new Error('duplicate_directions');
  return normalized;
}

export const placementPresets = [
  {label:'Preset · Natural fit',direction:'Inspect image 1 for the RV and image 2 for the ground and camera perspective. Use the most plausible visible level patch consistent with the requested distance. Anchor tire contact at a visible ground landmark, then derive scale from depth and nearby objects. Keep the source RV proportions and visible side, with uniform scaling only. Physical fit is more important than a dramatic composition.'},
  {label:'Preset · Alternate position',direction:'Inspect both references. Offer a modest lateral alternative on the same feasible ground plane only where the terrain allows. At the same depth retain the same physical scale. Respect the user distance and location constraints. Preserve the rigid RV proportions, supported source angle and backdrop camera. If there is only one feasible patch, stay within it instead of forcing a different side.'},
  {label:'Preset · Nearer ground',direction:'Inspect both references. If usable ground permits, move modestly nearer along the same ground plane, deriving a consistent increase in projected size from the new tire contact point. Respect a distant-only request. Preserve the RV aspect, wheel spacing and source view; do not force a large foreground product shot or alter the backdrop camera. Use the original usable patch when no nearer patch exists.'},
  {label:'Preset · Deeper ground',direction:'Inspect both references. If usable ground permits, move modestly deeper into the scene, shrinking the entire RV uniformly in relation to the ground-plane horizon. Anchor all wheels to a visible contact landmark. Preserve the supported viewing angle, source proportions, landscape camera and user placement constraints. Stay on the same feasible patch if there is no deeper supported ground.'},
];
