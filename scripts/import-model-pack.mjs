import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

function argument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const manifestArgument = argument("manifest");
if (!manifestArgument)
  throw new Error("Pass --manifest with a model-pack JSON file.");
const manifestPath = resolve(manifestArgument);
const baseUrl = argument("base-url", "http://localhost:3000").replace(/\/$/, "");
const cookie = argument("cookie", process.env.STUDIO_COOKIE || "__sites_local_auth=1");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const sourceDir = resolve(dirname(manifestPath), manifest.source_dir || ".");

async function request(path, options = {}) {
  const response = await fetch(baseUrl + "/api/studio/" + path, {
    ...options,
    headers: { Cookie: cookie, ...(options.headers || {}) },
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(`${response.status} ${path}: ${value.error || "Request failed"}`);
  return value;
}

let state = await request("state");
const assignments = [];
for (const [index, entry] of manifest.assets.entries()) {
  const name = entry.name || basename(entry.file).replace(/\.[^.]+$/, "");
  let asset = state.assets.find(
    (item) =>
      item.name === name &&
      item.brand === manifest.brand &&
      item.model === manifest.model &&
      item.year === manifest.model_year,
  );
  if (!asset) {
    const filePath = resolve(sourceDir, entry.file);
    const bytes = await readFile(filePath);
    const extension = filePath.split(".").at(-1)?.toLowerCase();
    const mime =
      extension === "png"
        ? "image/png"
        : extension === "webp"
          ? "image/webp"
          : "image/jpeg";
    const form = new FormData();
    form.set("file", new File([bytes], basename(filePath), { type: mime }));
    form.set("kind", "rv");
    form.set("name", name);
    form.set("brand", manifest.brand || "");
    form.set("model", manifest.model || "");
    form.set("year", manifest.model_year || "");
    form.set("angle", entry.view || "");
    form.set("environment", entry.environment || "");
    form.set("lighting", entry.lighting || "");
    asset = await request("assets", { method: "POST", body: form });
    process.stdout.write(`Uploaded ${entry.file}\n`);
  } else {
    process.stdout.write(`Reused ${entry.file}\n`);
  }
  assignments.push({
    asset_id: asset.id,
    role: entry.role,
    view: entry.view || "",
    room: entry.room || "",
    priority: entry.priority ?? index,
    approved_for_generation: entry.approved_for_generation !== false,
  });
}

state = await request("state");
let pack = state.model_packs.find((item) => item.name === manifest.name);
if (pack) {
  pack = await request(`model-packs/${pack.id}/assets`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assets: assignments }),
  });
  process.stdout.write(`Updated model pack ${pack.name}\n`);
} else {
  pack = await request("model-packs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: manifest.name,
      brand: manifest.brand || "",
      model: manifest.model || "",
      model_year: manifest.model_year || "",
      product_class: manifest.product_class || "",
      assets: assignments,
    }),
  });
  process.stdout.write(`Created model pack ${pack.name}\n`);
}

let project = state.projects.find((item) => item.name === manifest.campaign_name);
if (manifest.campaign_name && !project)
  project = await request("projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: manifest.campaign_name }),
  });
if (project) {
  await request(`projects/${project.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_pack_id: pack.id }),
  });
  await request(`projects/${project.id}/gallery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      asset_ids: assignments
        .filter((item) => item.role !== "evaluation")
        .map((item) => item.asset_id),
      saved: true,
    }),
  });
  process.stdout.write(
    `Campaign ready: ${baseUrl}/?project=${project.id}&view=campaign\n`,
  );
}
