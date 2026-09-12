import { providerFetch } from "./provider-fetch";
import { all, one, run, runtime, ApiError } from "./runtime";
import { getAsset, getProject } from "./library";
import { modelImages } from "./model-images";
import {
  modelFor,
  buildPrompt,
  providerInput,
  requestSchema,
  type Batch,
  type Job,
  type GenerationStage,
  type Asset,
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
    "SELECT id,batch_id,slot,status,result_asset_id,error,created_at,updated_at,request_id,elapsed_ms FROM jobs WHERE batch_id=? ORDER BY slot",
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
          buildPrompt(b.stage, b.prompt, job.slot),
          b.aspect,
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
export async function startBatch(raw: unknown, owner: string) {
  const data = requestSchema.parse(raw);
  if (!(runtime().FAL_KEY || process.env.FAL_KEY))
    throw new ApiError(503, "Image generation has not been connected.");
  const exists = await one<StoredBatch>(
    "SELECT * FROM batches WHERE id=?",
    data.id,
  );
  if (exists) {
    if (exists.owner_id !== owner)
      throw new ApiError(409, "This request identifier is already in use.");
    if (
      exists.project_id !== data.project_id ||
      exists.stage !== data.stage ||
      exists.prompt !== data.prompt ||
      exists.aspect !== data.aspect ||
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
    inputs = [p.rv_id, p.landscape_id];
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
  if ((count?.n ?? 0) >= 8)
    throw new ApiError(
      429,
      "Two batches are already working. Let one finish before starting another.",
    );
  const images = await modelImages(inputs, owner);
  const endpoint = modelFor(data.stage),
    now = Date.now();
  const statements = [
    runtime()
      .DB.prepare(
        "INSERT INTO batches(id,owner_id,project_id,stage,prompt,endpoint,quality,aspect,inputs_json,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM jobs j JOIN batches b ON b.id=j.batch_id WHERE b.owner_id=? AND j.status IN ('submitting','queued','generating','saving')) < 8",
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
        owner,
      ),
  ];
  const ids = [0, 1, 2, 3].map(() => crypto.randomUUID());
  for (let slot = 0; slot < 4; slot++)
    statements.push(
      runtime()
        .DB.prepare(
          "INSERT INTO jobs(id,batch_id,slot,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(ids[slot], data.id, slot, "submitting", now, now),
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
      return batchView(data.id, owner);
    const running = await one<{ n: number }>(
      "SELECT COUNT(*) n FROM jobs j JOIN batches b ON b.id=j.batch_id WHERE b.owner_id=? AND j.status IN ('submitting','queued','generating','saving')",
      owner,
    );
    if ((running?.n ?? 0) >= 8)
      throw new ApiError(
        429,
        "Two batches are already working. Let one finish before starting another.",
      );
    throw error;
  }
  const b = await one<StoredBatch>("SELECT * FROM batches WHERE id=?", data.id);
  const jobs = await all<StoredJob>(
    "SELECT * FROM jobs WHERE batch_id=? ORDER BY slot",
    data.id,
  );
  await Promise.allSettled(jobs.map((j) => submitJob(j, b!, images)));
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
  const name =
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
        buildPrompt(b.stage, b.prompt, job.slot),
        b.endpoint,
        b.quality,
        inputs[0] ?? null,
        b.project_id,
        b.id,
        Date.now(),
      ),
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
export async function reconcileBatch(id: string, owner: string) {
  const b = await one<StoredBatch>(
    "SELECT * FROM batches WHERE id=? AND owner_id=?",
    id,
    owner,
  );
  if (!b) throw new ApiError(404, "Batch not found.");
  const jobs = await all<StoredJob>("SELECT * FROM jobs WHERE batch_id=?", id);
  await Promise.allSettled(jobs.map((j) => syncJob(j, b)));
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
  );
  const claimed = await one<StoredJob>(
    "UPDATE jobs SET status=?,request_id=NULL,status_url=NULL,response_url=NULL,error=NULL,created_at=?,updated_at=?,attempts=attempts+1 WHERE id=? AND status=? RETURNING *",
    "submitting",
    Date.now(),
    Date.now(),
    id,
    "failed",
  );
  if (!claimed) throw new ApiError(409, "This image is already being retried.");
  await submitJob(claimed, b, images);
  return batchView(b.id, owner);
}
