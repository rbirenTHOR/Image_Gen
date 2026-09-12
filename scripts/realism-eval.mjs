// Paid provider evaluation is opt-in. Default creates an immutable plan only.
// Run with Node's type stripping; credentials come from environment variables.
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  buildPrompt,
  providerInput,
  modelFor,
  environmentBrief,
} from "../lib/domain.ts";
import { scenes, candidateEnvironment } from "../tests/realism/cases.ts";

const args = process.argv.slice(2);
const dir = resolve(
  args[args.indexOf("--run") + 1] || "work/realism-validation",
);
if (!args.includes("--run"))
  throw new Error("Supply --run work/your-evaluation-folder");
await mkdir(dir, { recursive: true });
const file = join(dir, "results.json");
let plan;
try {
  plan = JSON.parse(await readFile(file, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  plan = {
    version: 1,
    created: new Date().toISOString(),
    endpoint: modelFor("landscape"),
    jobs: [],
    reviews: {},
  };
  for (const scene of scenes)
    for (let repeat = 0; repeat < 2; repeat++)
      for (const variant of ["current", "candidate"]) {
        const prompt = buildPrompt("landscape", scene.brief, repeat);
        plan.jobs.push({
          id: `${scene.id}-${repeat + 1}-${variant}`,
          scene: scene.id,
          repeat,
          variant,
          state: "new",
          input: providerInput(
            "landscape",
            variant === "candidate"
              ? prompt.replace(environmentBrief, candidateEnvironment)
              : prompt,
            "landscape_16_9",
            [],
          ),
        });
      }
}
// Serialize writes so parallel completion cannot corrupt receipts.
let writes = Promise.resolve();
function save() {
  const snapshot = JSON.stringify(plan, null, 2);
  writes = writes.then(async () => {
    await writeFile(file + ".tmp", snapshot);
    await rename(file + ".tmp", file);
  });
  return writes;
}
await save();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function jsonFetch(url, key, body) {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { Authorization: key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
  return response.json();
}
async function parallel(items, limit, fn) {
  let index = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (index < items.length) await fn(items[index++]);
    }),
  );
}
if (args.includes("--generate")) {
  if (!process.env.FAL_KEY)
    throw new Error("FAL_KEY is required for paid generation");
  const key = "Key " + process.env.FAL_KEY;
  await parallel(plan.jobs, 4, async (job) => {
    if (job.state === "ready") return;
    if (["unknown", "submitting"].includes(job.state) && !job.status_url)
      throw new Error(
        `${job.id}: uncertain submission; reconcile receipt manually, do not resubmit`,
      );
    if (job.state === "new") {
      job.state = "submitting";
      await save();
      try {
        Object.assign(
          job,
          await jsonFetch(
            "https://queue.fal.run/" + plan.endpoint,
            key,
            job.input,
          ),
          { state: "submitted" },
        );
        await save();
        console.log(job.id + " submitted");
      } catch (e) {
        job.state = "unknown";
        job.error = e.message;
        await save();
        throw e;
      }
    }
    for (let poll = 0; poll < 180; poll++) {
      const status = await jsonFetch(job.status_url, key);
      if (status.status === "COMPLETED") {
        const result = await jsonFetch(job.response_url, key);
        if (!result.images?.[0]?.url)
          throw new Error(`${job.id}: missing result image`);
        job.image_url = result.images[0].url;
        const response = await fetch(job.image_url, {
          signal: AbortSignal.timeout(90000),
        });
        if (!response.ok)
          throw new Error(`${job.id}: image download HTTP ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        if (
          !buffer
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        )
          throw new Error("Expected original PNG");
        const width = buffer.readUInt32BE(16),
          height = buffer.readUInt32BE(20);
        if (width !== 3840 || height !== 2160)
          throw new Error("Unexpected native dimensions");
        await writeFile(join(dir, job.id + ".png"), buffer);
        Object.assign(job, {
          state: "ready",
          width,
          height,
          bytes: buffer.length,
        });
        await save();
        console.log(job.id + " ready · 3840 × 2160");
        return;
      }
      await pause(4000);
    }
    throw new Error(`${job.id}: still pending; resume from this run folder`);
  });
}
if (args.includes("--review")) {
  if (!process.env.OPENAI_API_KEY)
    throw new Error("OPENAI_API_KEY is required for paid review");
  const pairs = scenes.flatMap((scene, i) =>
    [0, 1].map((repeat) => ({
      id: `${scene.id}-${repeat + 1}`,
      scene,
      repeat,
      reverse: (i + repeat) % 2 === 1,
    })),
  );
  await parallel(pairs, 2, async (pair) => {
    if (plan.reviews[pair.id]) return;
    const jobs = plan.jobs.filter(
      (j) => j.scene === pair.scene.id && j.repeat === pair.repeat,
    );
    if (jobs.length !== 2 || jobs.some((j) => j.state !== "ready"))
      throw new Error("Complete generation before review");
    if (pair.reverse) jobs.reverse();
    const result = await jsonFetch(
      "https://api.openai.com/v1/responses",
      "Bearer " + process.env.OPENAI_API_KEY,
      {
        model: process.env.PROMPT_MODEL || "gpt-5.4-mini",
        store: false,
        reasoning: { effort: "low" },
        max_output_tokens: 1800,
        instructions:
          "Assess photographic plausibility of two AI images. Neither is a real photograph. You do not know their prompt versions. Evaluate irregular material texture, vegetation structure, light and reflections, distance softness versus painterly smearing, and adherence to the supplied location brief. Do not reward uniform sharpness or scenic beauty. Return JSON only: {winner: 'A'|'B'|'tie', confidence: 'low'|'medium'|'high', A: {realism: 1-5, adherence: 1-5, issues: string[]}, B: {realism: 1-5, adherence: 1-5, issues: string[]}, reason: string}. Be critical and use tie when differences are small. This is a qualitative review, not proof of general quality.",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Location brief: ${pair.scene.brief}\nImages are A, then B.`,
              },
              ...jobs.map((j) => ({
                type: "input_image",
                image_url: j.image_url,
                detail: "high",
              })),
            ],
          },
        ],
      },
    );
    const raw = result.output
      .flatMap((o) => o.content || [])
      .filter((c) => c.type === "output_text")
      .map((c) => c.text)
      .join("\n");
    let review;
    try {
      review = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ""));
    } catch {
      review = { raw, parseFailed: true };
    }
    plan.reviews[pair.id] = {
      order: jobs.map((j) => j.variant),
      model: process.env.PROMPT_MODEL || "gpt-5.4-mini",
      ...review,
    };
    await save();
    console.log(
      pair.id + " review " + (review.winner || "needs manual reading"),
    );
  });
}
const escape = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
await writeFile(
  join(dir, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>RV Studio realism validation</title><style>body{font:16px system-ui;background:#f5f4ef;color:#202c28;max-width:1440px;margin:40px auto;padding:0 24px}section{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:24px 0}img{width:100%;display:block}figure{margin:0;background:white;padding:12px}figcaption{padding:12px 0}a{color:inherit}pre{white-space:pre-wrap;font:14px system-ui}h1{font-size:36px}p{max-width:900px;line-height:1.5}</style><h1>Photographic realism comparison</h1><p>Same Sunburst Max model, same 3840 × 2160 PNG settings. Three environments, two samples per prompt per environment. Click an image to inspect the original. Samples are stochastic, without matched seeds. Automated reviews are supporting evidence, not human ratings.</p>${scenes
    .map(
      (s) =>
        `<h2>${escape(s.id)}</h2><p>${escape(s.brief)}</p>${[0, 1]
          .map(
            (repeat) =>
              `<section>${plan.jobs
                .filter((j) => j.scene === s.id && j.repeat === repeat)
                .map(
                  (j) =>
                    `<figure><a href="${j.id}.png"><img loading="lazy" src="${j.id}.png" alt="${escape(j.id)}"></a><figcaption>${escape(j.variant)} · sample ${repeat + 1} · ${j.state}</figcaption></figure>`,
                )
                .join(
                  "",
                )}</section><details><summary>Blinded automated review</summary><pre>${escape(JSON.stringify(plan.reviews[s.id + "-" + (repeat + 1)] || "Pending", null, 2))}</pre></details>`,
          )
          .join("")}`,
    )
    .join("")}`,
);
console.log(
  `Evaluation saved: ${dir}. Ready ${plan.jobs.filter((j) => j.state === "ready").length}/${plan.jobs.length}; reviews ${Object.keys(plan.reviews).length}/6.`,
);
