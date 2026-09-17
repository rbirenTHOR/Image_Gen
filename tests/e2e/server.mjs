/** Isolated real app/API/D1/R2 with deterministic provider responses. No real keys or network generation. */
import {
  mkdtemp,
  cp,
  writeFile,
  readFile,
  symlink,
  mkdir,
  rm,
  readdir,
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
    (await readdir(resolve(dir, "drizzle"))).filter(f=>f.endsWith(".sql")).sort().map((f) =>
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
let controls = { delay: 900, failSubmit: 0, failSave: 0, failChat: 0, failNature: 0 },
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
    if (u.hostname === 'commons.wikimedia.org' && u.pathname === '/w/api.php') {
      records.push({kind:'discovery',query:u.searchParams.get('gsrsearch'),pageids:u.searchParams.get('pageids')});
      if(controls.failDiscovery>0){controls.failDiscovery--;return json({error:'temporary outage'},503);}
      const item=(id,extra={})=>({pageid:id,title:'File:Alaska open meadow '+id+'.jpg',index:id,imageinfo:[{
        url:'https://upload.wikimedia.org/wikipedia/commons/a/a1/Discovery_'+id+'.jpg',
        thumburl:'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a1/Discovery_'+id+'.jpg/1280px-Discovery_'+id+'.jpg',
        width:8200,height:5500,size:jpeg.length,mime:'image/jpeg',
        extmetadata:{Artist:{value:'<a href="https://example.com">Test photographer</a>'},LicenseShortName:{value:'CC0'},ImageDescription:{value:'Alaska meadow with open ground and distant mountains.'},Categories:{value:'Nature photographs'}},...extra}]});
      const requested=Number(u.searchParams.get('pageids'));
      if(requested){
        const p=item(requested);
        if(controls.changedLicense)p.imageinfo[0].extmetadata.LicenseShortName.value='CC BY-SA 4.0';
        return json({query:{pages:[p]}});
      }
      const q=u.searchParams.get('gsrsearch')??'';
      if(q.toLowerCase().includes('burning') && (q.includes('concert')||q.includes('open')||q.includes('hastemplate:')))return json({query:{pages:[]}});
      if(q.includes('nomatchingbackdrop'))return json({query:{pages:[]}});
      const base=Number((q.match(/case(\d+)/)||[])[1]??1)*100;
      const offset=Number(u.searchParams.get('gsroffset')||0);
      const good=item(900000+base+offset);
      const badLicense=item(900001+base+offset);badLicense.imageinfo[0].extmetadata.LicenseShortName.value='CC BY-SA 4.0';
      const badAI=item(900002+base+offset);badAI.imageinfo[0].extmetadata.Categories.value='AI-generated images';
      const badURL=item(900003+base+offset,{url:'http://127.0.0.1/private.jpg'});
      const low=item(900004+base+offset,{width:4000,height:2600});
      return json({query:{pages:[good,badLicense,badAI,badURL,low]},...(offset?{}:{continue:{gsroffset:40}})});
    }
    if (u.hostname === "upload.wikimedia.org") {
      records.push({kind: "nature-original", url: u.toString()});
      if (controls.failNature > 0) { controls.failNature--; return json({error:"Fixture source unavailable"},503); }
      const source = controls.largeNature ? Buffer.concat([jpeg,Buffer.alloc(26_000_000)]) : jpeg;
      res.writeHead(200, {"Content-Type": "image/jpeg", "Content-Length": source.length});
      return res.end(source);
    }
    if (u.hostname === "rest.fal.ai") return json({upload_url:"https://fal.media/e2e/reference-upload",file_url:"https://fal.media/e2e/reference"});
    if (u.hostname === "fal.run") {
      const input=JSON.parse(body); records.push({kind:"compression",input});
      return json({image:{url:"https://fal.media/e2e/compressed.jpg",width:8368,height:5584},compressed_size:jpeg.length});
    }
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
        maxOutputTokens: requestInput.max_output_tokens,
        plan: requestInput.text?.format?.name === "rv_composition_plan",
        instructions: requestInput.instructions,
        referenceLabels: requestInput.input?.flatMap(m => Array.isArray(m.content) ? m.content.filter(c => c.type === "input_text").map(c => c.text) : []) || [],
        requestedCount: requestInput.text?.format?.schema?.properties?.shots?.maxItems,
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
      const plan = input.text?.format?.name === "rv_composition_plan";
      if (plan && controls.incompletePlan) { controls.incompletePlan--; return json({status:'incomplete',output:[]}); }
      if (plan && controls.failPlan) return json({error:"Planning unavailable"},503);
      const hasViews = !!input.text?.format?.schema?.properties?.views;
      const identityRefs = hasViews ? [1, ...Array.from({length: input.text.format.schema.properties.views.maxItems - 1}, (_, i) => i + 3)] : [];
      const text = plan ? JSON.stringify({
        feasible: !controls.noGround, reason: controls.noGround ? "Choose a landscape with visible level ground." : "",
        ...(hasViews ? {continuity: "The same two adults wear neutral olive outdoor layers and gray trousers throughout. Repeat the same blue camp chairs and compact camp table in soft mountain daylight.", views: identityRefs.map(reference => ({reference, usable: reference === 1 || !controls.mismatchedView,
          visible_view: reference === 1 ? "Curbside front three-quarter at source camera height." : "Curbside rear three-quarter at source camera height.",
          fixed_landmarks: "Door behind the front window; fixed wheelbase and body proportions.",
          limitations: "No unseen side, roof reconstruction or opening the closed door."}))} : {}),
        shots: controls.noGround ? [] : Array.from({length: input.text.format.schema.properties.shots.maxItems}, (_, i) => ({
          label: `Supported shot ${i + 1}`,
          direction: `Shot ${i + 1}: Frame a distinct candid activity on the visible level gravel clearing. Keep the chosen source RV perspective and fixed landmark spacing, and match wheel contact and daylight shadows.`,
          ...(hasViews ? {source_reference: controls.invalidView ? 2 : identityRefs.length > 1 && !controls.mismatchedView && i % 2 ? 3 : 1,
            adaptation: "Retain source RV camera elevation; vary foreground activity and crop the supported wall for intimate frames."} : {})
        }))
      }) : input.text?.format
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
