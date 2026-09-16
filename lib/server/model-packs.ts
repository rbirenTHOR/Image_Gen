import { z } from "zod";
import {
  modelPackRoles,
  type ModelPack,
  type ModelPackAsset,
} from "@/lib/domain";
import { getAsset } from "@/lib/server/library";
import { all, one, run, runtime, ApiError } from "@/lib/server/runtime";

type ModelPackRow = Omit<ModelPack, "assets"> & { owner_id: string };

export const modelPackAssignmentSchema = z.object({
  asset_id: z.string().min(1).max(100),
  role: z.enum(modelPackRoles).default("identity"),
  view: z.string().trim().max(60).default(""),
  room: z.string().trim().max(60).default(""),
  priority: z.number().int().min(0).max(10_000).default(0),
  approved_for_generation: z.boolean().default(true),
});

export const createModelPackSchema = z.object({
  name: z.string().trim().min(1).max(120),
  brand: z.string().trim().max(80).default(""),
  model: z.string().trim().max(80).default(""),
  model_year: z.string().trim().max(8).default(""),
  product_class: z.string().trim().max(80).default(""),
  assets: z.array(modelPackAssignmentSchema).max(200).default([]),
});

export const updateModelPackSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    brand: z.string().trim().max(80).optional(),
    model: z.string().trim().max(80).optional(),
    model_year: z.string().trim().max(8).optional(),
    product_class: z.string().trim().max(80).optional(),
    status: z.enum(["active", "archived"]).optional(),
  })
  .strict();

async function packRow(id: string, owner: string) {
  const pack = await one<ModelPackRow>(
    "SELECT * FROM model_packs WHERE id=? AND owner_id=?",
    id,
    owner,
  );
  if (!pack) throw new ApiError(404, "Model pack not found.");
  return pack;
}

async function assignments(packId: string) {
  return all<ModelPackAsset>(
    "SELECT * FROM model_pack_assets WHERE pack_id=? ORDER BY priority,created_at",
    packId,
  );
}

function publicPack(row: ModelPackRow, assets: ModelPackAsset[]): ModelPack {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    model: row.model,
    model_year: row.model_year,
    product_class: row.product_class,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    assets,
  };
}

export async function getModelPack(id: string, owner: string) {
  const row = await packRow(id, owner);
  return publicPack(row, await assignments(id));
}

export async function listModelPacks(owner: string) {
  const rows = await all<ModelPackRow>(
    "SELECT * FROM model_packs WHERE owner_id=? ORDER BY updated_at DESC",
    owner,
  );
  const assetRows = rows.length
    ? await all<ModelPackAsset>(
        `SELECT m.* FROM model_pack_assets m JOIN model_packs p ON p.id=m.pack_id WHERE p.owner_id=? ORDER BY m.priority,m.created_at`,
        owner,
      )
    : [];
  return rows.map((row) =>
    publicPack(
      row,
      assetRows.filter((asset) => asset.pack_id === row.id),
    ),
  );
}

async function validateAssignments(
  owner: string,
  values: z.infer<typeof modelPackAssignmentSchema>[],
) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.asset_id))
      throw new ApiError(400, "Each image can appear only once in a model pack.");
    seen.add(value.asset_id);
    await getAsset(value.asset_id, owner);
  }
}

export async function createModelPack(
  owner: string,
  input: z.infer<typeof createModelPackSchema>,
) {
  await validateAssignments(owner, input.assets);
  const id = crypto.randomUUID();
  const now = Date.now();
  const statements = [
    runtime()
      .DB.prepare(
        "INSERT INTO model_packs(id,owner_id,name,brand,model,model_year,product_class,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        owner,
        input.name,
        input.brand,
        input.model,
        input.model_year,
        input.product_class,
        "active",
        now,
        now,
      ),
    ...input.assets.map((asset, index) =>
      runtime()
        .DB.prepare(
          "INSERT INTO model_pack_assets(id,pack_id,asset_id,role,view,room,priority,approved_for_generation,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          id,
          asset.asset_id,
          asset.role,
          asset.view,
          asset.room,
          asset.priority || index,
          Number(asset.approved_for_generation),
          now + index,
        ),
    ),
  ];
  await runtime().DB.batch(statements);
  return getModelPack(id, owner);
}

export async function updateModelPack(
  id: string,
  owner: string,
  input: z.infer<typeof updateModelPackSchema>,
) {
  const current = await packRow(id, owner);
  await run(
    "UPDATE model_packs SET name=?,brand=?,model=?,model_year=?,product_class=?,status=?,updated_at=? WHERE id=? AND owner_id=?",
    input.name ?? current.name,
    input.brand ?? current.brand,
    input.model ?? current.model,
    input.model_year ?? current.model_year,
    input.product_class ?? current.product_class,
    input.status ?? current.status,
    Date.now(),
    id,
    owner,
  );
  return getModelPack(id, owner);
}

export async function replaceModelPackAssets(
  id: string,
  owner: string,
  values: z.infer<typeof modelPackAssignmentSchema>[],
) {
  await packRow(id, owner);
  await validateAssignments(owner, values);
  const now = Date.now();
  await runtime().DB.batch([
    runtime()
      .DB.prepare("DELETE FROM model_pack_assets WHERE pack_id=?")
      .bind(id),
    ...values.map((asset, index) =>
      runtime()
        .DB.prepare(
          "INSERT INTO model_pack_assets(id,pack_id,asset_id,role,view,room,priority,approved_for_generation,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          id,
          asset.asset_id,
          asset.role,
          asset.view,
          asset.room,
          asset.priority || index,
          Number(asset.approved_for_generation),
          now + index,
        ),
    ),
    runtime()
      .DB.prepare("UPDATE model_packs SET updated_at=? WHERE id=?")
      .bind(now, id),
  ]);
  return getModelPack(id, owner);
}
