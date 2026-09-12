/** Isolated real app/API/D1/R2 with deterministic provider responses. No real keys or network generation. */
import {
  mkdtemp,
  cp,
  writeFile,
  readFile,
  symlink,
  mkdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
const root = process.cwd(),
  dir = await mkdtemp(join(tmpdir(), "rv-studio-e2e-"));
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root },
)
  .toString()
  .split("\0")
  .filter(Boolean);
for (const f of files) {
  if (f.startsWith("tests/") || f.startsWith("output/")) continue;
  await mkdir(resolve(dir, f, ".."), { recursive: true });
  await cp(resolve(root, f), resolve(dir, f));
}
await symlink(
  resolve(root, "node_modules"),
  resolve(dir, "node_modules"),
  "dir",
);
await mkdir(resolve(dir, ".sites-runtime"), { recursive: true });
await writeFile(
  resolve(dir, ".sites-runtime/execution-profile.json"),
  JSON.stringify({ profile: "portable", executionProfile: "portable" }),
);
await writeFile(
  resolve(dir, ".dev.vars"),
  'FAL_KEY="e2e-no-real-key"\nOPENAI_API_KEY="e2e-no-real-key"\nDEV_PROVIDER_PROXY="http://127.0.0.1:6199"\nDEV_PROVIDER_TOKEN="e2e-transport"\n',
);
await writeFile(
  resolve(dir, "e2e-wrangler.json"),
  JSON.stringify({
    name: "rv-e2e",
    compatibility_date: "2026-05-15",
    d1_databases: [
      {
        binding: "DB",
        database_name: "site-creator-d1",
        database_id: "00000000-0000-4000-8000-000000000000",
      },
    ],
  }),
);
const sql = (
  await Promise.all(
    ["0000_whole_ben_grimm.sql", "0001_huge_slipstream.sql"].map((f) =>
      readFile(resolve(dir, "drizzle", f), "utf8"),
    ),
  )
).join("\n");
await writeFile(resolve(dir, "schema.sql"), sql);
execFileSync(
  process.execPath,
  [
    resolve(root, "node_modules/wrangler/bin/wrangler.js"),
    "d1",
    "execute",
    "DB",
    "--local",
    "--config",
    "e2e-wrangler.json",
    "--file",
    "schema.sql",
  ],
  {
    cwd: dir,
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: "false",
      WRANGLER_WRITE_LOGS: "false",
    },
    stdio: "pipe",
  },
);
let controls = { delay: 900, failSubmit: 0, failSave: 0, failChat: 0 },
  records = [],
  jobs = new Map();
const jpeg = await readFile(resolve(root, "public/images/sample-rv.jpg"));
const provider = createServer(async (req, res) => {
  try {
    const data = [];
    for await (const c of req) data.push(c);
    const body = Buffer.concat(data);
    const json = (value, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (req.url === "/__control") {
      if (req.method === "POST")
        controls = { ...controls, ...JSON.parse(body) };
      return json({ controls, records });
    }
    if (req.headers["x-bridge-token"] !== "e2e-transport")
      return json({ error: "Forbidden" }, 403);
    const u = new URL(req.headers["x-upstream-url"]);
    if (u.hostname === "queue.fal.run") {
      if (req.method === "POST") {
        const input = JSON.parse(body);
        records.push({
          kind: "image",
          at: Date.now(),
          endpoint: u.pathname,
          input: {
            ...input,
            image_urls: input.image_urls?.map(() => "<reference>"),
          },
        });
        if (controls.failSubmit > 0) {
          controls.failSubmit--;
          return json({ error: "Fixture rejected" }, 422);
        }
        const id = randomUUID();
        jobs.set(id, { at: Date.now(), input });
        return json({
          request_id: id,
          status_url: `https://queue.fal.run/e2e/requests/${id}/status`,
          response_url: `https://queue.fal.run/e2e/requests/${id}`,
        });
      }
      const id = u.pathname.split("/")[3],
        j = jobs.get(id);
      if (!j) return json({}, 404);
      if (u.pathname.endsWith("/status"))
        return json({
          status:
            Date.now() - j.at < controls.delay ? "IN_PROGRESS" : "COMPLETED",
        });
      return json({
        images: [
          {
            url: `https://fal.media/e2e/${id}.jpg`,
            content_type: "image/jpeg",
            width: 1536,
            height: 1024,
          },
        ],
      });
    }
    if (u.hostname === "fal.media") {
      if (controls.failSave > 0) {
        controls.failSave--;
        return json({ error: "Fixture transfer failure" }, 503);
      }
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Content-Length": jpeg.length,
      });
      return res.end(jpeg);
    }
    if (u.hostname === "api.openai.com") {
      const requestInput = JSON.parse(body);
      records.push({
        kind: "chat",
        at: Date.now(),
        visionDetails: Array.isArray(requestInput.input)
          ? requestInput.input.flatMap((m) =>
              Array.isArray(m.content)
                ? m.content
                    .filter((c) => c.type === "input_image")
                    .map((c) => c.detail)
                : [],
            )
          : [],
      });
      await new Promise((r) => setTimeout(r, controls.delay));
      if (controls.failChat > 0) {
        controls.failChat--;
        return json({ error: "Fixture reply failure" }, 503);
      }
      const input = JSON.parse(body);
      const prompt =
        "Preserve the exact RV, body graphics, geometry and camera position. Use soft afternoon sunlight with realistic shadows and naturally detailed grass and gravel. Keep the landscape recognizable and do not add subjects unless explicitly requested. Match scale, perspective and ground contact; avoid oversharpening and artificial colors.";
      const text = input.text?.format
        ? JSON.stringify({
            reply:
              "Keep the RV and framing, and soften the afternoon light. The prompt below is ready to refine before generating.",
            prompt,
            suggestions: [
              "Try golden hour",
              "Keep the RV unchanged",
              "Add two camping chairs",
            ],
          })
        : prompt;
      return json({ output: [{ content: [{ type: "output_text", text }] }] });
    }
    return json({ error: "Unexpected provider destination" }, 403);
  } catch {
    res.writeHead(500);
    res.end("Fixture error");
  }
});
await new Promise((r) => provider.listen(6199, "127.0.0.1", r));
const child = spawn(
  process.execPath,
  [resolve(dir, "scripts/run-framework.mjs"), "dev", "--port", "6173"],
  {
    cwd: dir,
    env: {
      ...process.env,
      FAL_KEY: "e2e-no-real-key",
      OPENAI_API_KEY: "e2e-no-real-key",
    },
    stdio: "inherit",
  },
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  child.kill("SIGTERM");
  provider.close();
  await new Promise((r) => setTimeout(r, 500));
  await rm(dir, { recursive: true, force: true });
  process.exit();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("exit", stop);
console.log(
  "E2E isolated app: http://localhost:6173 (fake providers; temporary database)",
);
