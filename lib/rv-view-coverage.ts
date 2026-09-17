import { z } from "zod";

// One photographed view is evidence, not permission to reconstruct a 3D vehicle.
export const rvViewGuard = "RV VIEW LIMITS TAKE PRIORITY over any requested lens, camera height, angle or creative direction. Preserve the chosen source view's side, front-to-side perspective, roof visibility and fixed distances between the door, windows, axles and front cap. Never rotate, mirror, foreshorten, widen or compress the vehicle to fit. Change framing, output shape, people, activity and foreground instead. A tight lifestyle photo may crop the supported RV wall or omit the RV when the requested viewpoint cannot show it faithfully. Never infer an unseen side, roof, interior or opened feature. Never combine different source angles into one vehicle.";

const viewSchema = z.object({
  reference: z.number().int().positive(),
  usable: z.boolean(),
  visible_view: z.string().min(10).max(1200),
  fixed_landmarks: z.string().min(10).max(1800),
  limitations: z.string().min(10).max(1800),
}).strict();
const evidenceSchema = z.object({
  views: z.array(viewSchema).min(1).max(2),
  shots: z.array(z.object({
    source_reference: z.number().int().positive(),
    adaptation: z.string().min(10).max(1800),
  }).passthrough()),
}).passthrough();

export function assessedViewDirections(value: unknown, identityCount: number, count: number) {
  const evidence = evidenceSchema.parse(value);
  const allowed = [1, ...Array.from({length: identityCount}, (_, i) => i + 3)];
  if (evidence.views.length !== allowed.length ||
      new Set(evidence.views.map(v => v.reference)).size !== allowed.length ||
      evidence.views.some(v => !allowed.includes(v.reference)) ||
      evidence.shots.length !== count) throw new Error("rv_view_evidence");
  return evidence.shots.map(shot => {
    const view = evidence.views.find(v => v.reference === shot.source_reference && v.usable);
    if (!view) throw new Error("rv_view_evidence");
    return `RV SOURCE FOR THIS SHOT: reference ${view.reference} only controls the rendered vehicle perspective.\nObserved view: ${view.visible_view}\nFixed landmarks: ${view.fixed_landmarks}\nSource limitations: ${view.limitations}\nRequired shot adaptation: ${shot.adaptation}\n${rvViewGuard}`;
  });
}
