import { getFlow, saveFlow, generateFlow } from "@/lib/server/campaign-flow";
import { ensureNatureLibrary, imageObject } from "@/lib/server/nature-library";
import { searchLandscapes, importLandscape } from '@/lib/server/landscape-discovery';
import {
  campaignData,
  saveCampaignImages,
  createTurn,
  retryTurn,
  generateTurn,
  approveCampaignImage,
} from "@/lib/server/campaigns";
import { providerFetch } from "@/lib/server/provider-fetch";
import { imageDimensions } from "@/lib/image-metadata";
import { z } from "zod";
import {
  authorize,
  all,
  one,
  run,
  runtime,
  json,
  ApiError,
} from "@/lib/server/runtime";
import {
  getAsset,
  getProject,
  ensureSeeds,
  publicAsset,
  detectImage,
} from "@/lib/server/library";
import {
  startBatch,
  reconcileBatch,
  batchView,
  retryJob,
} from "@/lib/server/jobs";
import {
  createModelPack,
  createModelPackSchema,
  getModelPack,
  listModelPacks,
  modelPackAssignmentSchema,
  replaceModelPackAssets,
  updateModelPack,
  updateModelPackSchema,
} from "@/lib/server/model-packs";
import {
  assetUploadSchema,
  stages,
  photographicBrief,
  promptEnhancementGuide,
  environmentBrief,
  type Asset,
  type Project,
  type Batch,
} from "@/lib/domain";
import {
  getCampaignPreset,
  resolveCampaignPreset,
} from "@/lib/campaign-presets";
export const dynamic = "force-dynamic";
async function state(owner: string) {
  const [assets, projects, memberships, modelPacks] = await Promise.all([
    all<Asset>(
      "SELECT * FROM assets WHERE owner_id=? OR owner_id=? ORDER BY created_at DESC",
      owner,
      "shared",
    ),
    all<Project>(
      "SELECT p.*, (SELECT COUNT(*) FROM campaign_assets c WHERE c.project_id=p.id AND c.removed_at IS NULL) saved_count FROM projects p WHERE owner_id=? ORDER BY updated_at DESC",
      owner,
    ),
    all<{ asset_id: string; project_id: string }>(
      "SELECT c.asset_id,c.project_id FROM campaign_assets c JOIN projects p ON p.id=c.project_id WHERE p.owner_id=? AND c.removed_at IS NULL",
      owner,
    ),
    listModelPacks(owner),
  ]);
  return {
    assets: assets.map((a) => ({
      ...publicAsset(a),
      campaign_ids: memberships
        .filter((m) => m.asset_id === a.id)
        .map((m) => m.project_id),
    })),
    projects,
    model_packs: modelPacks,
    connections: {
      fal: !!(runtime().FAL_KEY || process.env.FAL_KEY),
      openai: !!(runtime().OPENAI_API_KEY || process.env.OPENAI_API_KEY),
    },
  };
}
async function createProject(owner: string, name: string, presetId = "") {
  const id = crypto.randomUUID(),
    now = Date.now();
  const preset = getCampaignPreset(presetId);
  const candidates = preset
    ? await all<Asset>(
        "SELECT * FROM assets WHERE owner_id=? OR owner_id=? ORDER BY created_at DESC",
        owner,
        "shared",
      )
    : [];
  const resolved = preset
    ? resolveCampaignPreset(preset, candidates)
    : { rv: undefined, landscape: undefined };
  const step = resolved.landscape ? "compose" : resolved.rv ? "landscape" : "rv";
  await run(
    "INSERT INTO projects(id,owner_id,name,step,rv_id,landscape_id,preset_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    id,
    owner,
    name,
    step,
    resolved.rv?.id ?? null,
    resolved.landscape?.id ?? null,
    preset?.id ?? "",
    now,
    now,
  );
  return getProject(id, owner);
}
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const owner = await authorize(request);
    const { path } = await context.params;
    const [resource, id, action] = path;
    const method = request.method;
    if (resource === 'landscape-search' && method === 'GET')
      return json(await searchLandscapes(Object.fromEntries(new URL(request.url).searchParams), owner));
    if (resource === 'landscape-import' && method === 'POST')
      return json(await importLandscape(await request.json(), owner), 201);
    if (resource === "bootstrap" && method === "POST") {
      await ensureSeeds();
      await ensureNatureLibrary();
      if (
        !(await one("SELECT id FROM projects WHERE owner_id=? LIMIT 1", owner))
      )
        await createProject(owner, "A season outside");
      return json(await state(owner));
    }
    if (resource === "projects" && action === "gallery" && method === "GET")
      return json(await campaignData(id, owner));
    if (resource === "projects" && action === "gallery" && method === "POST")
      return json(await saveCampaignImages(id, owner, await request.json()));
    if (
      resource === "projects" &&
      action === "chat" &&
      method === "POST" &&
      !path[3]
    )
      return json(await createTurn(id, owner, await request.json()), 201);
    if (
      resource === "projects" &&
      action === "chat" &&
      method === "POST" &&
      path[4] === "retry"
    )
      return json(await retryTurn(id, path[3], owner));
    if (
      resource === "projects" &&
      action === "chat" &&
      method === "POST" &&
      path[4] === "generate"
    )
      return json(
        await generateTurn(id, path[3], owner, await request.json()),
        201,
      );
    if (
      resource === "projects" &&
      action === "approve-image" &&
      method === "POST"
    )
      return json(await approveCampaignImage(id, owner, await request.json()));
    if (resource === "projects" && action === "workflow") {
      if (method === "GET") return json(await getFlow(id, owner));
      if (method === "PUT") return json(await saveFlow(id, owner, await request.json()));
      if (method === "POST" && path[3] === "generate") return json(await generateFlow(id, owner, await request.json()), 201);
    }
    if (resource === "state" && method === "GET")
      return json(await state(owner));
    if (resource === "model-packs" && method === "GET" && !id)
      return json(await listModelPacks(owner));
    if (resource === "model-packs" && method === "POST" && !id)
      return json(
        await createModelPack(
          owner,
          createModelPackSchema.parse(await request.json()),
        ),
        201,
      );
    if (resource === "model-packs" && method === "PATCH" && id && !action)
      return json(
        await updateModelPack(
          id,
          owner,
          updateModelPackSchema.parse(await request.json()),
        ),
      );
    if (
      resource === "model-packs" &&
      action === "assets" &&
      method === "PUT"
    ) {
      const data = z
        .object({ assets: z.array(modelPackAssignmentSchema).max(200) })
        .strict()
        .parse(await request.json());
      return json(await replaceModelPackAssets(id, owner, data.assets));
    }
    if (resource === "media" && method === "GET") {
      const a = await getAsset(id, owner);
      const download = new URL(request.url).searchParams.has("download");
      if (download && !a.approved)
        throw new ApiError(400, "Approve this image before exporting it.");
      const object = await imageObject(a);
      if (!object)
        throw new ApiError(404, "The image file could not be found.");
      const headers: Record<string, string> = {
        "Content-Type": a.mime,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      };
      if (download)
        headers["Content-Disposition"] =
          `attachment; filename="${a.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.${a.mime === "image/png" ? "png" : a.mime === "image/webp" ? "webp" : "jpg"}"`;
      return new Response(object.body as ReadableStream, { headers });
    }
    if (resource === "assets" && method === "POST") {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || !file.size)
        throw new ApiError(400, "Choose an image to upload.");
      if (file.size > 12 * 1024 * 1024)
        throw new ApiError(400, "Please upload an image under 12 MB.");
      const data = assetUploadSchema.parse(
        Object.fromEntries(
          [
            "kind",
            "name",
            "brand",
            "model",
            "year",
            "angle",
            "environment",
            "lighting",
          ].map((k) => [k, form.get(k) || ""]),
        ),
      );
      const bytes = new Uint8Array(await file.arrayBuffer()),
        mime = detectImage(bytes);
      if (!mime)
        throw new ApiError(400, "Upload a valid JPG, PNG or WebP image.");
      const dimensions = imageDimensions(bytes, mime);
      const assetId = crypto.randomUUID(),
        key = "uploads/" + assetId;
      await runtime().BUCKET.put(key, bytes, {
        httpMetadata: { contentType: mime },
      });
      await run(
        "INSERT INTO assets(id,owner_id,kind,name,brand,model,year,angle,environment,lighting,source,r2_key,mime,width,height,in_library,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        assetId,
        owner,
        data.kind,
        data.name,
        data.brand,
        data.model,
        data.year,
        data.angle,
        data.environment,
        data.lighting,
        "uploaded",
        key,
        mime,
        dimensions.width,
        dimensions.height,
        1,
        Date.now(),
      );
      return json(publicAsset(await getAsset(assetId, owner)), 201);
    }
    if (resource === "assets" && method === "PATCH") {
      const a = await getAsset(id, owner);
      if (a.owner_id !== owner)
        throw new ApiError(403, "Shared starter images cannot be changed.");
      const data = z
        .object({
          name: z.string().trim().min(1).max(120).optional(),
          in_library: z.boolean().optional(),
        })
        .strict()
        .parse(await request.json());
      await run(
        "UPDATE assets SET name=?,in_library=? WHERE id=? AND owner_id=?",
        data.name ?? a.name,
        data.in_library === undefined ? a.in_library : Number(data.in_library),
        id,
        owner,
      );
      return json(publicAsset(await getAsset(id, owner)));
    }
    if (resource === "projects" && method === "POST" && !id) {
      const data = z
        .object({
          name: z.string().trim().min(1).max(100),
          preset_id: z.string().trim().max(100).optional(),
        })
        .strict()
        .parse(await request.json());
      if (data.preset_id && !getCampaignPreset(data.preset_id))
        throw new ApiError(400, "Campaign preset not found.");
      return json(await createProject(owner, data.name, data.preset_id), 201);
    }
    if (resource === "projects" && method === "PATCH" && !action) {
      const p = await getProject(id, owner);
      const data = z
        .object({
          name: z.string().trim().min(1).max(100).optional(),
          step: z.enum(stages).optional(),
          model_pack_id: z.string().uuid().nullable().optional(),
        })
        .strict()
        .parse(await request.json());
      const step = data.step ?? p.step;
      const modelPackId =
        data.model_pack_id === undefined ? p.model_pack_id : data.model_pack_id;
      if (modelPackId) await getModelPack(modelPackId, owner);
      if (step !== "rv" && !p.rv_id)
        throw new ApiError(400, "Choose an RV first.");
      if (["compose", "lifestyle", "review"].includes(step) && !p.landscape_id)
        throw new ApiError(400, "Choose a landscape first.");
      if (["lifestyle", "review"].includes(step) && !p.composition_id)
        throw new ApiError(400, "Choose a composition first.");
      await run(
        "UPDATE projects SET name=?,step=?,model_pack_id=?,updated_at=?,version=version+1 WHERE id=? AND owner_id=?",
        data.name ?? p.name,
        step,
        modelPackId,
        Date.now(),
        id,
        owner,
      );
      return json(await getProject(id, owner));
    }
    if (resource === "projects" && action === "select" && method === "POST") {
      const p = await getProject(id, owner);
      const data = z
        .object({
          stage: z.enum(["rv", "landscape", "compose", "lifestyle"]),
          asset_id: z.string().min(1),
        })
        .parse(await request.json());
      const a = await getAsset(data.asset_id, owner);
      let fields: {
        rv: string | null;
        landscape: string | null;
        composition: string | null;
        current: string | null;
        step: string;
      } = {
        rv: p.rv_id,
        landscape: p.landscape_id,
        composition: p.composition_id,
        current: p.current_id,
        step: p.step,
      };
      if (data.stage === "rv") {
        if (a.kind !== "rv") throw new ApiError(400, "Choose an RV reference.");
        fields = {
          rv: a.id,
          landscape: p.landscape_id,
          composition: a.id === p.rv_id ? p.composition_id : null,
          current: a.id === p.rv_id ? p.current_id : null,
          step: "landscape",
        };
      }
      if (data.stage === "landscape") {
        if (!p.rv_id) throw new ApiError(400, "Choose your RV first.");
        if (a.kind !== "landscape")
          throw new ApiError(400, "Choose a landscape.");
        fields = {
          ...fields,
          landscape: a.id,
          composition: a.id === p.landscape_id ? p.composition_id : null,
          current: a.id === p.landscape_id ? p.current_id : null,
          step: "compose",
        };
      }
      if (data.stage === "compose") {
        if (a.kind !== "composition" || a.project_id !== p.id)
          throw new ApiError(400, "Choose a composition from this campaign.");
        const b = await one<Batch>(
          "SELECT * FROM batches WHERE id=?",
          a.batch_id,
        );
        const inputs = JSON.parse(b?.inputs_json ?? "[]");
        if (inputs[0] !== p.rv_id || inputs[1] !== p.landscape_id)
          throw new ApiError(
            409,
            "That take uses earlier source images. Generate a new composition for the current selection.",
          );
        fields = {
          ...fields,
          composition: a.id,
          current: a.id,
          step: "lifestyle",
        };
      }
      if (data.stage === "lifestyle") {
        if (
          !["composition", "lifestyle"].includes(a.kind) ||
          a.project_id !== p.id
        )
          throw new ApiError(
            400,
            "Choose an accepted scene from this campaign.",
          );
        let ancestor: Asset | null = a;
        let count = 0;
        while (
          ancestor &&
          ancestor.id !== p.composition_id &&
          ancestor.parent_id &&
          count++ < 30
        )
          ancestor = await getAsset(ancestor.parent_id, owner);
        if (ancestor?.id !== p.composition_id)
          throw new ApiError(
            409,
            "That version belongs to an earlier composition.",
          );
        fields = { ...fields, current: a.id, step: "lifestyle" };
      }
      const workflow = p.workflow_json ? JSON.parse(p.workflow_json) : null;
      if (workflow) {
        if (workflow.rv_id !== fields.rv) workflow.identity_ids = [];
        workflow.rv_id = fields.rv;
        workflow.scene_id = fields.landscape;
      }
      const result = await run(
        "UPDATE projects SET rv_id=?,landscape_id=?,composition_id=?,current_id=?,step=?,updated_at=?,version=version+1,workflow_json=?,workflow_revision=workflow_revision+1 WHERE id=? AND owner_id=? AND version=?",
        fields.rv,
        fields.landscape,
        fields.composition,
        fields.current,
        fields.step,
        Date.now(),
        workflow ? JSON.stringify(workflow) : "",
        id,
        owner,
        p.version,
      );
      if (!result.meta.changes)
        throw new ApiError(
          409,
          "This campaign changed in another window. Refresh and select again.",
        );
      if (["compose", "lifestyle"].includes(data.stage))
        await runtime().DB.batch([
          runtime()
            .DB.prepare("UPDATE assets SET accepted=1 WHERE id=?")
            .bind(a.id),
          runtime()
            .DB.prepare(
              "INSERT INTO campaign_assets(id,project_id,asset_id,created_at,removed_at) VALUES(?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET removed_at=NULL",
            )
            .bind(p.id + ":" + a.id, p.id, a.id, Date.now()),
        ]);
      return json(await getProject(id, owner));
    }
    if (resource === "projects" && action === "batches" && method === "GET") {
      await getProject(id, owner);
      const batches = await all<{ id: string }>(
        "SELECT id FROM batches WHERE project_id=? AND owner_id=? ORDER BY created_at DESC",
        id,
        owner,
      );
      return json(
        await Promise.all(batches.map((b) => batchView(b.id, owner))),
      );
    }
    if (resource === "batches" && method === "POST" && !id)
      return json(await startBatch(await request.json(), owner), 201);
    if (resource === "batches" && method === "GET" && id)
      return json(await reconcileBatch(id, owner));
    if (resource === "jobs" && method === "POST" && action === "retry")
      return json(await retryJob(id, owner));
    if (resource === "enhance" && method === "POST") {
      const data = z
        .object({
          stage: z.enum(["landscape", "compose", "people", "objects", "prop"]),
          brief: z.string().trim().min(5).max(6000),
        })
        .parse(await request.json());
      const e = runtime();
      const key = e.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      if (!key)
        throw new ApiError(
          503,
          "Prompt enhancement is not connected. You can edit the brief manually.",
        );
      const response = await providerFetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: e.PROMPT_MODEL || process.env.PROMPT_MODEL || "gpt-5.4-mini",
            store: false,
            max_output_tokens: 1400,
            reasoning: { effort: "low" },
            instructions: `You write concise, precise photographic prompts for RV marketing. Enhance the user's brief for the ${data.stage} stage. Preserve their location, people counts, RV identity, requested actions and exclusions. Do not add extra subjects or change intent. This stage is separate from other stages. For landscapes exclude all vehicles, people and man-made objects; reserve level foreground. For composition preserve RV details and exclude people and props. For people or objects preserve the accepted RV and scene and add only the requested elements. ${photographicBrief} ${promptEnhancementGuide} ${data.stage === "landscape" ? environmentBrief : ""} Return only a complete editable prompt of 90-160 words, with no commentary. Avoid repeating the same constraint in different words.`,
            input: data.brief,
          }),
          signal: AbortSignal.timeout(45000),
        },
      );
      if (!response.ok)
        throw new ApiError(
          502,
          "Prompt enhancement did not complete. Your original brief is preserved; try again or edit it yourself.",
        );
      const result = (await response.json()) as {
        output?: { content?: { type: string; text?: string }[] }[];
      };
      const text = result.output
        ?.flatMap((o) => o.content ?? [])
        .filter((c) => c.type === "output_text")
        .map((c) => c.text)
        .join("\n");
      if (!text) throw new ApiError(502, "No enhanced prompt was returned.");
      return json({ prompt: text });
    }
    if (resource === "approve" && method === "POST") {
      const data = z
        .object({
          project_id: z.string(),
          asset_id: z.string(),
          checks: z.object({
            rv: z.literal(true),
            scene: z.literal(true),
            crop: z.literal(true),
          }),
        })
        .parse(await request.json());
      const p = await getProject(data.project_id, owner),
        a = await getAsset(data.asset_id, owner);
      if (
        !p.composition_id ||
        p.current_id !== a.id ||
        a.project_id !== p.id ||
        !["composition", "lifestyle"].includes(a.kind)
      )
        throw new ApiError(
          400,
          "Select a finished scene in this campaign before approving.",
        );
      await runtime().DB.batch([
        runtime()
          .DB.prepare(
            "INSERT INTO approvals(id,owner_id,asset_id,project_id,checks_json,created_at) VALUES(?,?,?,?,?,?)",
          )
          .bind(
            crypto.randomUUID(),
            owner,
            a.id,
            p.id,
            JSON.stringify(data.checks),
            Date.now(),
          ),
        runtime()
          .DB.prepare("UPDATE assets SET approved=1,accepted=1 WHERE id=?")
          .bind(a.id),
        runtime()
          .DB.prepare(
            "UPDATE projects SET step=?,updated_at=?,version=version+1 WHERE id=?",
          )
          .bind("review", Date.now(), p.id),
      ]);
      return json(publicAsset(await getAsset(a.id, owner)));
    }
    throw new ApiError(404, "Studio action not found.");
  } catch (error) {
    if (error instanceof z.ZodError)
      return json(
        {
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        400,
      );
    if (error instanceof ApiError)
      return json({ error: error.message }, error.status);
    console.error(
      "Studio operation failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return json(
      {
        error:
          "The studio could not complete this action. Your saved work is retained. Please try again.",
      },
      500,
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
