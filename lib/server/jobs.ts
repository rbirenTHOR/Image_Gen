import { z } from "zod";
import { providerFetch } from "./provider-fetch";
import { all, one, run, runtime, ApiError } from "./runtime";
import { getAsset, getProject } from "./library";
import { planComposition } from "./composition-plan";
import { modelImages } from "./model-images";
import { resolvePhotoshootShots, photoshootPrompt } from "@/lib/photoshoot";
import { getCampaignPreset } from "@/lib/campaign-presets";
import {
  modelFor,
  buildPrompt,
  providerInput,
  requestSchema,
  type Batch,
  type Job,
} from "@/lib/domain";
type StoredJob = Job & {
  status_url: string | null;
  response_url: string | null;
  lease_until: number;
  attempts: number;
};
type StoredBatch = Batch & { owner_id: string; aspect: string };
async function falFetch(url: string, options: RequestInit = {}) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "queue.fal.run" ||
    parsed.port ||
    parsed.username
  )
    throw new ApiError(
      502,
      "The image provider returned an invalid job address.",
    );
  const key = runtime().FAL_KEY || process.env.FAL_KEY;
  if (!key) throw new ApiError(503, "Image generation has not been connected.");
  return providerFetch(url, {
    ...options,
    headers: {
      Authorization: "Key " + key,
      "Content-Type": "application/json",
      ...options.headers,
    },
    signal: AbortSignal.timeout(25000),
  });
}
export async function batchView(id: string, owner: string) {
  const b = await one<StoredBatch>(
    "SELECT * FROM batches WHERE id=? AND owner_id=?",
    id,
    owner,
  );
  if (!b) throw new ApiError(404, "Generation batch not found.");
  const jobs = await all<Job>(
    "SELECT id,batch_id,slot,status,result_asset_id,error,created_at,updated_at,request_id,elapsed_ms,shot_label,generation_prompt,shot_id,output_aspect FROM jobs WHERE batch_id=? ORDER BY slot",
    id,
  );
  return { ...b, jobs };
}
async function submitJob(job: StoredJob, b: StoredBatch, images: string[]) {
  try {
    const response = await falFetch("https://queue.fal.run/" + b.endpoint, {
      method: "POST",
      body: JSON.stringify(
        providerInput(
          b.stage,
          job.generation_prompt || buildPrompt(b.stage, b.prompt, job.slot),
          job.output_aspect || b.aspect,
          images,
        ),
      ),
    });
    if (!response.ok) {
      const known = response.status >= 400 && response.status < 500;
      await run(
        "UPDATE jobs SET status=?,error=?,updated_at=? WHERE id=?",
        known ? "failed" : "unknown",
        known
          ? response.status === 429
            ? "Provider is busy. Retry this image shortly."
            : response.status === 401
              ? "The provider rejected the connection. Check the fal key."
              : "The provider rejected this image request. Adjust the brief or retry."
          : "Submission could not be confirmed. Do not resubmit; check the provider request history first.",
        Date.now(),
        job.id,
      );
      return;
    }
    const result = (await response.json()) as {
      request_id?: string;
      status_url?: string;
      response_url?: string;
    };
    if (!result.request_id || !result.status_url || !result.response_url)
      throw new Error("Missing request receipt");
    await run(
      "UPDATE jobs SET request_id=?,status_url=?,response_url=?,status=?,error=NULL,updated_at=?,poll_after=? WHERE id=?",
      result.request_id,
      result.status_url,
      result.response_url,
      "queued",
      Date.now(),
      Date.now() + 2000,
      job.id,
    );
  } catch {
    await run(
      "UPDATE jobs SET status=?,error=?,updated_at=? WHERE id=?",
      "unknown",
      "Submission could not be confirmed. Check the provider history before retrying to avoid another charge.",
      Date.now(),
      job.id,
    );
  }
}
export async function startBatch(raw: unknown, owner: string, flow?: {shots: import("@/lib/photoshoot").PhotoshootShot[]; inputs:string[]; snapshot:string; revision:number}) {
  const data = (flow ? requestSchema.extend({ count: z.number().int().min(1).max(30) }) : requestSchema).parse(raw);
  if (flow && (flow.shots.length !== data.count || new Set(flow.shots.map(s => s.id)).size !== data.count))
    throw new ApiError(400, "Every selected deliverable must have one unique shot.");
  // Submit the whole shoot to the durable provider queue. This is an outstanding
  // request budget, not a rendering concurrency limit; fal schedules execution.
  const initialCount = data.count;
  const outstandingLimit = flow ? 60 : 8;
  let shootShots = flow?.shots;
  if (data.shot_ids) {
    if (data.stage !== "compose" || data.shot_ids.length !== data.count)
      throw new ApiError(400, "Photoshoot shots must match the composition image count.");
    try { shootShots = resolvePhotoshootShots(data.shot_ids); }
    catch (error) { throw new ApiError(400, (error as Error).message); }
  }
  if (!(runtime().FAL_KEY || process.env.FAL_KEY))
    throw new ApiError(503, "Image generation has not been connected.");
  const exists = await one<StoredBatch>(
    "SELECT * FROM batches WHERE id=?",
    data.id,
  );
  if (exists) {
    if (exists.owner_id !== owner)
      throw new ApiError(409, "This request identifier is already in use.");
    const existingJobs = (await batchView(data.id, owner)).jobs;
    if (
      (exists.workflow_json || "") !== (flow?.snapshot || "") ||
      exists.project_id !== data.project_id ||
      exists.stage !== data.stage ||
      exists.prompt !== data.prompt ||
      exists.aspect !== data.aspect ||
      existingJobs.length !== data.count ||
      JSON.stringify(existingJobs.map(j => j.shot_id || "")) !==
        JSON.stringify(shootShots?.map(s => s.id) ?? Array(data.count).fill("")) ||
      (data.stage === "variation" &&
        exists.inputs_json !==
          JSON.stringify([...new Set(data.reference_ids ?? [])]))
    )
      throw new ApiError(
        409,
        "This request has already been submitted with different settings.",
      );
    return batchView(data.id, owner);
  }
  const p = await getProject(data.project_id, owner);
  let inputs: string[] = [];
  if (data.stage === "compose") {
    if (!p.rv_id || !p.landscape_id)
      throw new ApiError(400, "Choose an RV and a landscape first.");
    inputs = flow?.inputs ?? [p.rv_id, p.landscape_id];
  }
  if (data.stage === "people" || data.stage === "objects") {
    if (!p.composition_id || !p.current_id)
      throw new ApiError(
        400,
        "Choose a composition before adding people or objects.",
      );
    inputs = [p.current_id];
    if (data.stage === "objects" && data.reference_id) {
      const prop = await getAsset(data.reference_id, owner);
      if (prop.kind !== "prop")
        throw new ApiError(400, "Choose an object reference.");
      inputs.push(prop.id);
    }
  }
  if (data.stage === "variation") {
    inputs = [...new Set(data.reference_ids ?? [])];
    if (!inputs.length)
      throw new ApiError(400, "Attach an image to create variations.");
    for (const image of inputs) await getAsset(image, owner);
  }
  const count = await one<{ n: number }>(
    "SELECT COUNT(*) n FROM jobs j JOIN batches b ON b.id=j.batch_id WHERE b.owner_id=? AND j.status IN ('submitting','queued','generating','saving')",
    owner,
  );
  if ((count?.n ?? 0) + initialCount > outstandingLimit)
    throw new ApiError(
      429,
      `This selection exceeds the ${outstandingLimit}-request outstanding budget. Let current images finish before starting another shoot.`,
    );
  const images = await modelImages(inputs, owner, !!flow);
  const campaignPreset = getCampaignPreset(p.preset_id);
  const lifestyleCompose =
    data.stage === "compose" && (!!shootShots || campaignPreset?.mode === "lifestyle");
  const shots =
    data.stage === "compose"
      ? await planComposition(
          images,
          data.prompt,
          data.count,
          lifestyleCompose,
          shootShots ?? campaignPreset?.fallbackShots,
          !!shootShots,
          flow ? JSON.parse(flow.snapshot).identity_ids.length : 0,
          !!flow,
        )
      : null;
  const endpoint = modelFor(data.stage),
    now = Date.now();
  const statements = [
    runtime()
      .DB.prepare(
        "INSERT INTO batches(id,owner_id,project_id,stage,prompt,endpoint,quality,aspect,inputs_json,created_at,workflow_json,workflow_revision) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM jobs j JOIN batches b ON b.id=j.batch_id WHERE b.owner_id=? AND j.status IN ('submitting','queued','generating','saving')) <= ?",
      )
      .bind(
        data.id,
        owner,
        p.id,
        data.stage,
        data.prompt,
        endpoint,
        data.stage === "people" ? "native" : "max",
        data.aspect,
        JSON.stringify(inputs),
        now,
        flow?.snapshot ?? "",
        flow?.revision ?? 0,
        owner,
        outstandingLimit - initialCount,
      ),
  ];
  const ids = Array.from({length:data.count}, () => crypto.randomUUID());
  for (let slot = 0; slot < data.count; slot++)
    statements.push(
      runtime()
        .DB.prepare(
          "INSERT INTO jobs(id,batch_id,slot,status,created_at,updated_at,shot_label,generation_prompt,shot_id,output_aspect) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(ids[slot], data.id, slot, slot < initialCount ? "submitting" : "waiting", now, now,
          shootShots?.[slot].label ?? shots?.[slot].label ?? "",
          buildPrompt(data.stage, data.prompt, slot,
            shootShots ? photoshootPrompt(shootShots[slot], data.prompt, shots?.[slot].direction) : shots?.[slot].direction,
            lifestyleCompose, !!shootShots),
          shootShots?.[slot].id ?? "", shootShots?.[slot].aspect ?? data.aspect),
    );
  try {
    await runtime().DB.batch(statements);
  } catch (error) {
    if (
      await one(
        "SELECT id FROM batches WHERE id=? AND owner_id=?",
        data.id,
        owner,
      )
    )
      return startBatch(data, owner, flow);
    const running = await one<{ n: number }>(
      "SELECT COUNT(*) n FROM jobs j JOIN batches b ON b.id=j.batch_id WHERE b.owner_id=? AND j.status IN ('submitting','queued','generating','saving')",
      owner,
    );
    if ((running?.n ?? 0) + initialCount > outstandingLimit)
      throw new ApiError(
        429,
        `This selection exceeds the ${outstandingLimit}-request outstanding budget. Let current images finish before starting another shoot.`,
      );
    throw error;
  }
  const b = await one<StoredBatch>("SELECT * FROM batches WHERE id=?", data.id);
  const jobs = await all<StoredJob>(
    "SELECT * FROM jobs WHERE batch_id=? ORDER BY slot",
    data.id,
  );
  await Promise.allSettled(jobs.filter(j => j.status === "submitting").map((j) => submitJob(j, b!, images)));
  return batchView(data.id, owner);
}
async function saveImage(
  job: StoredJob,
  b: StoredBatch,
  result: {
    images?: {
      url: string;
      content_type?: string;
      width?: number;
      height?: number;
    }[];
  },
) {
  const image = result.images?.[0];
  if (!image?.url)
    throw new ApiError(502, "The provider completed without an image.");
  const u = new URL(image.url);
  if (
    u.protocol !== "https:" ||
    !(
      u.hostname === "fal.media" ||
      u.hostname.endsWith(".fal.media") ||
      u.hostname.endsWith(".falusercontent.com")
    )
  )
    throw new ApiError(
      502,
      "The provider returned an unexpected image address.",
    );
  const response = await providerFetch(image.url, {
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok)
    throw new ApiError(
      503,
      "Image transfer failed. Your generation is complete; retry saving it.",
    );
  const maxBytes = 40 * 1024 * 1024;
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes)
    throw new ApiError(503, "The generated file is too large to save.");
  if (!response.body) throw new ApiError(503, "The generated file is empty.");
  const mime =
    image.content_type || response.headers.get("content-type") || "image/jpeg";
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime))
    throw new ApiError(
      502,
      "The provider returned an unsupported image format.",
    );
  const id = job.id,
    key = "generated/" + id;
  // fal may omit width/height. Capture only the PNG header as bytes stream
  // to storage; never load or re-encode the whole image to inspect its size.
  const prefix = new Uint8Array(24);
  let prefixLength = 0;
  const imageStream = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const count = Math.min(prefix.length - prefixLength, chunk.byteLength);
        if (count) {
          prefix.set(chunk.subarray(0, count), prefixLength);
          prefixLength += count;
        }
        controller.enqueue(chunk);
      },
    }),
  );
  if (Number.isSafeInteger(contentLength) && contentLength > 0) {
    // R2 requires a known-length stream; FixedLengthStream also rejects a
    // truncated or oversized transfer before the object can be committed.
    const { FixedLengthStream } = globalThis as unknown as {
      FixedLengthStream: new (
        length: number,
      ) => TransformStream<Uint8Array, Uint8Array>;
    };
    await runtime().BUCKET.put(
      key,
      imageStream.pipeThrough(new FixedLengthStream(contentLength)),
      {
        httpMetadata: { contentType: mime },
      },
    );
  } else {
    // Chunked responses have no known length. Bound each in-flight upload to
    // one 5 MiB part instead of buffering four full-resolution PNGs.
    const upload = await runtime().BUCKET.createMultipartUpload(key, {
      httpMetadata: { contentType: mime },
    });
    const reader = imageStream.getReader();
    const parts: { partNumber: number; etag: string }[] = [];
    let buffer = new Uint8Array(5 * 1024 * 1024),
      filled = 0,
      received = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxBytes)
          throw new ApiError(503, "The generated file is too large to save.");
        for (let offset = 0; offset < value.length; ) {
          const count = Math.min(buffer.length - filled, value.length - offset);
          buffer.set(value.subarray(offset, offset + count), filled);
          filled += count;
          offset += count;
          if (filled === buffer.length) {
            parts.push(await upload.uploadPart(parts.length + 1, buffer));
            buffer = new Uint8Array(buffer.length);
            filled = 0;
          }
        }
      }
      if (!received) throw new ApiError(503, "The generated file is empty.");
      if (filled)
        parts.push(
          await upload.uploadPart(parts.length + 1, buffer.subarray(0, filled)),
        );
      await upload.complete(parts);
    } catch (error) {
      await reader.cancel().catch(() => {});
      await upload.abort().catch(() => {});
      throw error;
    }
  }
  const png =
    prefixLength === 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => prefix[i] === byte);
  const header = new DataView(prefix.buffer);
  const width = png ? header.getUint32(16) : (image.width ?? 0);
  const height = png ? header.getUint32(20) : (image.height ?? 0);
  const kind =
    b.stage === "landscape"
      ? "landscape"
      : b.stage === "prop"
        ? "prop"
        : b.stage === "compose"
          ? "composition"
          : ["campaign", "variation"].includes(b.stage)
            ? "campaign"
            : "lifestyle";
  const inputs = JSON.parse(b.inputs_json) as string[];
  const name = job.shot_id && job.shot_label ? job.shot_label :
    (b.stage === "landscape"
      ? "Landscape"
      : b.stage === "compose"
        ? "Composition"
        : b.stage === "people"
          ? "People"
          : b.stage === "objects"
            ? "Objects"
            : b.stage === "campaign"
              ? "Campaign"
              : b.stage === "variation"
                ? "Variation"
                : "Prop") +
    " · Take " +
    (job.slot + 1);
  await runtime().DB.batch([

    runtime()
      .DB.prepare(
        "INSERT OR IGNORE INTO assets(id,owner_id,kind,name,source,r2_key,mime,width,height,prompt,endpoint,quality,parent_id,project_id,batch_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        b.owner_id,
        kind,
        name,
        "generated",
        key,
        mime,
        width,
        height,
        job.generation_prompt || buildPrompt(b.stage, b.prompt, job.slot),
        b.endpoint,
        b.quality,
        inputs[0] ?? null,
        b.project_id,
        b.id,
        Date.now(),
      ),
    ...(["compose", "people", "objects", "campaign", "variation"].includes(b.stage) ? [runtime().DB.prepare("INSERT OR IGNORE INTO campaign_assets(id,project_id,asset_id,created_at) VALUES(?,?,?,?)").bind(b.project_id+":"+id,b.project_id,id,Date.now())] : []),
    runtime()
      .DB.prepare(
        "UPDATE assets SET width=?,height=? WHERE id=? AND owner_id=? AND (width=0 OR height=0)",
      )
      .bind(width, height, id, b.owner_id),
    runtime()
      .DB.prepare(
        "UPDATE jobs SET status=?,result_asset_id=?,error=NULL,updated_at=?,elapsed_ms=?,lease_until=0 WHERE id=?",
      )
      .bind("ready", id, Date.now(), Date.now() - job.created_at, id),
  ]);
}
async function syncJob(job: StoredJob, b: StoredBatch) {
  if (!job.request_id) {
    if (job.status === "submitting" && Date.now() - job.created_at > 90000)
      await run(
        "UPDATE jobs SET status=?,error=?,updated_at=? WHERE id=? AND request_id IS NULL",
        "unknown",
        "Submission was interrupted. Check provider history before resubmitting.",
        Date.now(),
        job.id,
      );
    return;
  }
  if (!["queued", "generating", "saving", "save_failed"].includes(job.status))
    return;
  const now = Date.now();
  const claim = await one<StoredJob>(
    "UPDATE jobs SET lease_until=?,poll_after=? WHERE id=? AND lease_until<? AND poll_after<? RETURNING *",
    now + 60000,
    now + 3500,
    job.id,
    now,
    now,
  );
  if (!claim) return;
  try {
    const res = await falFetch(job.status_url!);
    if (!res.ok) {
      if (res.status === 404)
        throw new ApiError(502, "The provider could not find this request.");
      throw new Error("Provider status temporarily unavailable");
    }
    const status = (await res.json()) as { status: string };
    if (status.status === "COMPLETED") {
      await run(
        "UPDATE jobs SET status=?,updated_at=? WHERE id=?",
        "saving",
        now,
        job.id,
      );
      const response = await falFetch(job.response_url!);
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500)
          throw new ApiError(
            422,
            "The provider could not generate this image. Retry this image or adjust the brief.",
          );
        throw new Error("Provider result unavailable");
      }
      await saveImage(job, b, await response.json());
    } else if (status.status === "IN_PROGRESS" || status.status === "IN_QUEUE")
      await run(
        "UPDATE jobs SET status=?,error=NULL,updated_at=? WHERE id=?",
        status.status === "IN_PROGRESS" ? "generating" : "queued",
        now,
        job.id,
      );
    else if (["FAILED", "CANCELLED"].includes(status.status))
      throw new ApiError(
        422,
        "This image did not complete. You can retry this image.",
      );
  } catch (e) {
    const current = await one<StoredJob>(
      "SELECT * FROM jobs WHERE id=?",
      job.id,
    );
    if (e instanceof ApiError && e.status === 422)
      await run(
        "UPDATE jobs SET status=?,error=?,updated_at=? WHERE id=?",
        "failed",
        e.message,
        Date.now(),
        job.id,
      );
    else if (current?.status === "saving" || current?.status === "save_failed")
      await run(
        "UPDATE jobs SET status=?,error=?,updated_at=? WHERE id=?",
        "save_failed",
        "The image was generated but could not be saved. Retry saving; no new generation will be requested.",
        Date.now(),
        job.id,
      );
    else
      await run(
        "UPDATE jobs SET error=? WHERE id=?",
        "Connection interrupted. Your request is retained and will be checked again.",
        job.id,
      );
  } finally {
    await run("UPDATE jobs SET lease_until=0 WHERE id=?", job.id);
  }
}
// Claim each waiting job atomically. Concurrent tabs/polls cannot submit it twice.
// The snapshot and per-shot prompts were persisted when the user clicked Generate.
async function advanceCampaign(b: StoredBatch) {
  if (!b.workflow_json) return;
  const waiting = await all<StoredJob>("SELECT * FROM jobs WHERE batch_id=? AND status='waiting' ORDER BY slot LIMIT 30", b.id);
  if (!waiting.length) return;
  const active = await one<{ n: number }>("SELECT COUNT(*) n FROM jobs WHERE batch_id=? AND status IN ('submitting','queued','generating','saving')", b.id);
  if ((active?.n ?? 0) >= 30) return;
  const images = await modelImages(JSON.parse(b.inputs_json) as string[], b.owner_id, true);
  const claimed: StoredJob[] = [];
  for (const job of waiting) {
    const next = await one<StoredJob>(
      "UPDATE jobs SET status='submitting',created_at=?,updated_at=? WHERE id=? AND status='waiting' AND (SELECT COUNT(*) FROM jobs WHERE batch_id=? AND status IN ('submitting','queued','generating','saving')) < 30 AND (SELECT COUNT(*) FROM jobs j JOIN batches b ON b.id=j.batch_id WHERE b.owner_id=? AND j.status IN ('submitting','queued','generating','saving')) < ? RETURNING *",
      Date.now(), Date.now(), job.id, b.id, b.owner_id, 60,
    );
    if (next) claimed.push(next);
  }
  await Promise.allSettled(claimed.map(job => submitJob(job, b, images)));
}
export async function reconcileBatch(id: string, owner: string) {
  const b = await one<StoredBatch>(
    "SELECT * FROM batches WHERE id=? AND owner_id=?",
    id,
    owner,
  );
  if (!b) throw new ApiError(404, "Batch not found.");
  const jobs = await all<StoredJob>("SELECT * FROM jobs WHERE batch_id=?", id);
  await Promise.allSettled(jobs.map((j) => syncJob(j, b)));
  await advanceCampaign(b);
  return batchView(id, owner);
}
export async function retryJob(id: string, owner: string) {
  const b = await one<StoredBatch>(
    "SELECT b.* FROM batches b JOIN jobs j ON j.batch_id=b.id WHERE j.id=? AND b.owner_id=?",
    id,
    owner,
  );
  if (!b) throw new ApiError(404, "Image request not found.");
  const job = await one<StoredJob>("SELECT * FROM jobs WHERE id=?", id);
  if (job?.status === "save_failed") {
    await run("UPDATE jobs SET poll_after=0 WHERE id=?", id);
    await syncJob(job, b);
    return batchView(b.id, owner);
  }
  if (job?.status !== "failed")
    throw new ApiError(
      409,
      "Only a failed image can be regenerated. Your other images are unchanged.",
    );
  const images = await modelImages(
    JSON.parse(b.inputs_json) as string[],
    owner,
    !!b.workflow_json,
  );
  const claimed = await one<StoredJob>(
    "UPDATE jobs SET status=?,request_id=NULL,status_url=NULL,response_url=NULL,error=NULL,created_at=?,updated_at=?,attempts=attempts+1 WHERE id=? AND status=? AND (SELECT COUNT(*) FROM jobs WHERE batch_id=? AND status IN ('submitting','queued','generating','saving')) < ? AND (SELECT COUNT(*) FROM jobs j JOIN batches b ON b.id=j.batch_id WHERE b.owner_id=? AND j.status IN ('submitting','queued','generating','saving')) < ? RETURNING *",
    "submitting",
    Date.now(),
    Date.now(),
    id,
    "failed",
    b.id,
    b.workflow_json ? 30 : 8,
    owner,
    b.workflow_json ? 60 : 8,
  );
  if (!claimed) throw new ApiError(409, "This image is already being retried or current images must finish before retrying.");
  await submitJob(claimed, b, images);
  return batchView(b.id, owner);
}
