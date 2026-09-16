import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    brand: text("brand").notNull().default(""),
    model: text("model").notNull().default(""),
    year: text("year").notNull().default(""),
    angle: text("angle").notNull().default(""),
    environment: text("environment").notNull().default(""),
    lighting: text("lighting").notNull().default(""),
    source: text("source").notNull(),
    photoSourceJson: text("photo_source_json").notNull().default(""),
    r2Key: text("r2_key").notNull(),
    mime: text("mime").notNull(),
    width: integer("width").notNull().default(0),
    height: integer("height").notNull().default(0),
    prompt: text("prompt").notNull().default(""),
    endpoint: text("endpoint").notNull().default(""),
    quality: text("quality").notNull().default(""),
    parentId: text("parent_id"),
    projectId: text("project_id"),
    batchId: text("batch_id"),
    inLibrary: integer("in_library").notNull().default(0),
    accepted: integer("accepted").notNull().default(0),
    approved: integer("approved").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("assets_owner_library").on(t.ownerId, t.inLibrary),
    index("assets_project").on(t.projectId),
  ],
);
export const modelPacks = sqliteTable(
  "model_packs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    brand: text("brand").notNull().default(""),
    model: text("model").notNull().default(""),
    modelYear: text("model_year").notNull().default(""),
    productClass: text("product_class").notNull().default(""),
    status: text("status").notNull().default("active"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("model_packs_owner_updated").on(t.ownerId, t.updatedAt)],
);
export const modelPackAssets = sqliteTable(
  "model_pack_assets",
  {
    id: text("id").primaryKey(),
    packId: text("pack_id")
      .notNull()
      .references(() => modelPacks.id, { onDelete: "cascade" }),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id),
    role: text("role").notNull().default("identity"),
    view: text("view").notNull().default(""),
    room: text("room").notNull().default(""),
    priority: integer("priority").notNull().default(0),
    approvedForGeneration: integer("approved_for_generation")
      .notNull()
      .default(1),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("model_pack_assets_pack_priority").on(t.packId, t.priority),
    uniqueIndex("model_pack_assets_pack_asset").on(t.packId, t.assetId),
  ],
);
export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    step: text("step").notNull().default("rv"),
    rvId: text("rv_id"),
    landscapeId: text("landscape_id"),
    compositionId: text("composition_id"),
    currentId: text("current_id"),
    modelPackId: text("model_pack_id"),
    presetId: text("preset_id").notNull().default(""),
    version: integer("version").notNull().default(0),
    galleryMigrated: integer("gallery_migrated").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("projects_owner_updated").on(t.ownerId, t.updatedAt),
    index("projects_model_pack").on(t.modelPackId),
    index("projects_preset").on(t.presetId),
  ],
);
export const batches = sqliteTable(
  "batches",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    stage: text("stage").notNull(),
    prompt: text("prompt").notNull(),
    endpoint: text("endpoint").notNull(),
    quality: text("quality").notNull(),
    aspect: text("aspect").notNull(),
    inputsJson: text("inputs_json").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("batches_owner_project").on(t.ownerId, t.projectId)],
);
export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id")
      .notNull()
      .references(() => batches.id),
    slot: integer("slot").notNull(),
    requestId: text("request_id"),
    statusUrl: text("status_url"),
    responseUrl: text("response_url"),
    status: text("status").notNull(),
    resultAssetId: text("result_asset_id"),
    error: text("error"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    pollAfter: integer("poll_after").notNull().default(0),
    leaseUntil: integer("lease_until").notNull().default(0),
    elapsedMs: integer("elapsed_ms"),
    attempts: integer("attempts").notNull().default(1),
    shotId: text("shot_id").notNull().default(""),
    outputAspect: text("output_aspect").notNull().default(""),
    shotLabel: text("shot_label").notNull().default(""),
    generationPrompt: text("generation_prompt").notNull().default(""),
  },
  (t) => [index("jobs_batch").on(t.batchId)],
);
export const approvals = sqliteTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id),
    projectId: text("project_id").notNull(),
    checksJson: text("checks_json").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("approvals_owner").on(t.ownerId)],
);
export const campaignAssets = sqliteTable(
  "campaign_assets",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id),
    createdAt: integer("created_at").notNull(),
    removedAt: integer("removed_at"),
  },
  (t) => [index("campaign_assets_project").on(t.projectId, t.removedAt)],
);
export const campaignTurns = sqliteTable(
  "campaign_turns",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    userText: text("user_text").notNull(),
    reply: text("reply").notNull().default(""),
    prompt: text("prompt").notNull().default(""),
    suggestionsJson: text("suggestions_json").notNull().default("[]"),
    referencesJson: text("references_json").notNull(),
    status: text("status").notNull().default("planning"),
    error: text("error"),
    batchId: text("batch_id"),
    aspect: text("aspect").notNull().default("landscape_4_3"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("campaign_turns_project_created").on(t.projectId, t.createdAt)],
);
