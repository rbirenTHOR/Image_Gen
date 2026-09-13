/** Display labels are soft limits; never discard useful shot directions because
 * the provider used a longer title than the interface needs. */
export function parseCompositionShots(value: unknown) {
  const shots = (value as {shots?:unknown[]})?.shots;
  if (!Array.isArray(shots) || shots.length !== 4) throw new Error('shot_count');
  const normalized = shots.map((value, slot) => {
    const s=value as {label?:unknown;direction?:unknown};
    if (typeof s?.direction !== 'string' || s.direction.trim().length < 30 || s.direction.length > 12000) throw new Error('shot_direction');
    const label=typeof s.label === 'string' ? s.label.trim().replace(/\s+/g,' ') : '';
    return {label:(label || `Placement ${slot+1}`).slice(0,65),direction:s.direction.trim()};
  });
  if (new Set(normalized.map(s=>s.direction.toLowerCase())).size !== 4) throw new Error('duplicate_directions');
  return normalized;
}

export const placementPresets = [
  {label:'Preset · Wide left',direction:'Inspect image 1 for the RV and image 2 for usable terrain. Create a wide establishing placement toward the left third of feasible level ground, with the entire RV roughly 18–24% of frame width. Keep source camera, horizon, light and RV visible side. Explicit user instructions override this default size and side; for a distant-only brief, keep it distant. Match perspective and wheel contact. Do not force placement on vegetation, water or slopes.'},
  {label:'Preset · Balanced right',direction:'Inspect both references. Place the full RV toward the right third on a feasible level ground plane, roughly 28–34% of frame width, leaving open landscape to its left. If that side is obstructed, choose a different usable lateral location or depth. Explicit user instructions override the default size and side; distant-only requests must remain distant. Preserve the backdrop, visible RV side and light, with believable wheel contact.'},
  {label:'Preset · Closer view',direction:'Inspect both references. Create a nearer product view by placing the whole RV on feasible foreground ground, roughly 42–50% of frame width, without moving the backdrop camera. Keep room around the RV and preserve its identity and visible side. If the user requests distant placement, use the nearer edge of their distant range instead. Respect fixed placement constraints and visible terrain; match perspective, ground contact and shadows.'},
  {label:'Preset · Farther into scene',direction:'Inspect both references. Place the entire RV deeper into a usable clearing or visible ground corridor, roughly 12–17% of frame width. Let the existing foreground lead toward it. Use only modest orientation changes supported by the RV reference; never mirror graphics or invent unseen sides. Keep landscape, light and camera consistent. User-specified location and scale override these defaults; never invent a road or use unsafe ground to force the placement.'},
];
