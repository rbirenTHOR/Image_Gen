import { z } from "zod";
import {
  flowSchema,
  setupProblem,
  flowPrompt,
  plannedShot,
  resolvedShot,
  type FlowDocument,
  type CampaignFlowState,
} from "@/lib/campaign-flow";
import { photoshootShots } from "@/lib/photoshoot";
import { all, one, run, ApiError } from "./runtime";
import { getAsset, getProject } from "./library";
import { startBatch, batchView } from "./jobs";
import { getCampaignPreset } from "@/lib/campaign-presets";
export async function getFlow(
  pid: string,
  owner: string,
): Promise<FlowDocument> {
  const p = await getProject(pid, owner);
  if (p.workflow_json)
    return {
      persisted: true,
      revision: p.workflow_revision ?? 0,
      state: flowSchema.parse(JSON.parse(p.workflow_json)),
    };
  const recent = await one<{ prompt: string }>(
    "SELECT prompt FROM batches WHERE project_id=? AND stage=? ORDER BY created_at DESC LIMIT 1",
    pid,
    "compose",
  );
  const roles = await all<{ shot_id: string }>(
    "SELECT DISTINCT j.shot_id FROM jobs j JOIN batches b ON b.id=j.batch_id WHERE b.project_id=? AND j.shot_id!=?",
    pid,
    "",
  );
  const known = roles
    .map((r) => r.shot_id)
    .filter((id) => photoshootShots.some((s) => s.id === id));
  const preset = getCampaignPreset(p.preset_id);
  return {
    persisted: false,
    revision: p.workflow_revision ?? 0,
    state: {
      section: recent
        ? "results"
        : p.rv_id
          ? p.landscape_id
            ? "plan"
            : "scene"
          : "rv",
      rv_id: p.rv_id,
      scene_id: p.landscape_id,
      identity_ids: [],
      prop_ids: [],
      setup: p.landscape_id
        ? {
            mode: "custom",
            name: "Custom setup",
            derived_from: "Earlier campaign",
          }
        : { mode: "unselected" },
      scene_mode: "look",
      people: "",
      props: "",
      brief:
        recent?.prompt ||
        preset?.composeBrief
          .split("Create two clearly different shots:")[0]
          .trim() ||
        "",
      shots: (known.length
        ? known
        : [
            "establishing",
            "portrait",
            "detail",
            "action",
            "social-feed",
            "story-vertical",
          ]
      ).map(plannedShot),
    },
  };
}
async function validateRefs(s: CampaignFlowState, owner: string) {
  for (const id of [
    s.rv_id,
    s.scene_id,
    ...s.identity_ids,
    ...s.prop_ids,
  ].filter((x): x is string => !!x))
    await getAsset(id, owner);
  if (s.rv_id && (await getAsset(s.rv_id, owner)).kind !== "rv")
    throw new ApiError(400, "Select an original RV image from inventory.");
  for (const id of s.prop_ids)
    if ((await getAsset(id, owner)).kind !== "prop")
      throw new ApiError(400, "Select an object reference.");
  const ids = [s.rv_id, s.scene_id, ...s.identity_ids, ...s.prop_ids].filter(
    Boolean,
  );
  if (new Set(ids).size !== ids.length)
    throw new ApiError(400, "Each reference needs one distinct role.");
}
export async function saveFlow(pid: string, owner: string, raw: unknown) {
  await getProject(pid, owner);
  const data = z
    .object({
      persisted: z.boolean().optional(),
      revision: z.number().int().min(0),
      state: flowSchema,
    })
    .strict()
    .parse(raw);
  if (data.state.setup?.mode === "existing") {
    const problem = setupProblem(data.state);
    if (problem) throw new ApiError(400, problem);
  }
  await validateRefs(data.state, owner);
  const result = await run(
    "UPDATE projects SET workflow_json=?,workflow_revision=workflow_revision+1,step=CASE WHEN ? IS NULL THEN 'rv' WHEN ? IS NULL THEN 'landscape' WHEN composition_id IS NULL OR rv_id IS NOT ? OR landscape_id IS NOT ? THEN 'compose' ELSE step END,composition_id=CASE WHEN rv_id IS NOT ? OR landscape_id IS NOT ? THEN NULL ELSE composition_id END,current_id=CASE WHEN rv_id IS NOT ? OR landscape_id IS NOT ? THEN NULL ELSE current_id END,rv_id=?,landscape_id=?,updated_at=?,version=version+1 WHERE id=? AND owner_id=? AND workflow_revision=?",
    JSON.stringify(data.state),
    data.state.rv_id,
    data.state.scene_id,
    data.state.rv_id,
    data.state.scene_id,
    data.state.rv_id,
    data.state.scene_id,
    data.state.rv_id,
    data.state.scene_id,
    data.state.rv_id,
    data.state.scene_id,
    Date.now(),
    pid,
    owner,
    data.revision,
  );
  if (!result.meta.changes)
    throw new ApiError(
      409,
      "This campaign changed in another window. Reload before saving; your unsaved changes are still on this screen.",
    );
  return { persisted: true, revision: data.revision + 1, state: data.state };
}
export async function generateFlow(pid: string, owner: string, raw: unknown) {
  const data = z
    .object({
      id: z.string().uuid(),
      revision: z.number().int().min(0),
      shot_ids: z.array(z.string()).min(1).max(2),
    })
    .strict()
    .parse(raw);
  await getProject(pid, owner);
  const existing = await one<{
    project_id: string;
    workflow_json: string;
    workflow_revision: number;
  }>(
    "SELECT project_id,workflow_json,workflow_revision FROM batches WHERE id=? AND owner_id=?",
    data.id,
    owner,
  );
  if (existing) {
    const b = await batchView(data.id, owner);
    if (
      existing.project_id !== pid ||
      !existing.workflow_json ||
      existing.workflow_revision !== data.revision ||
      JSON.stringify(b.jobs.map((j) => j.shot_id)) !==
        JSON.stringify(data.shot_ids)
    )
      throw new ApiError(
        409,
        "This generation request already has different settings.",
      );
    return b;
  }
  const doc = await getFlow(pid, owner);
  if (doc.revision !== data.revision)
    throw new ApiError(
      409,
      "Save the latest campaign settings before generating.",
    );
  const s = doc.state;
  const problem = setupProblem(s);
  if (problem) throw new ApiError(400, problem);
  await validateRefs(s, owner);
  if (!s.rv_id || !s.scene_id)
    throw new ApiError(400, "Choose an RV and setting first.");
  const selected = data.shot_ids.map((id) => s.shots.find((s) => s.id === id));
  if (
    selected.some((s) => !s) ||
    new Set(data.shot_ids).size !== data.shot_ids.length
  )
    throw new ApiError(400, "Select one or two shots from your plan.");
  return startBatch(
    {
      id: data.id,
      project_id: pid,
      stage: "compose",
      prompt: flowPrompt(s),
      count: selected.length,
      aspect: selected[0]!.aspect,
    },
    owner,
    {
      shots: selected.map((s) => resolvedShot(s!, doc.state)),
      inputs: [s.rv_id, s.scene_id, ...s.identity_ids, ...s.prop_ids],
      snapshot: JSON.stringify(s),
      revision: doc.revision,
    },
  );
}
