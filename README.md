# THOR RV Studio

An authenticated RV marketing studio using the selected Option B design: warm ivory, terracotta, editorial typography and a five-step campaign workflow.

## Campaign gallery and creative chat

Open **Campaigns** and choose a campaign to enter its gallery and chat workspace. Save any number of images independently of the wizard's current selection. Each take has a Keep action in the wizard, and entire completed batches can be saved together. Existing accepted and approved images are brought into the gallery when first opened; other old results remain available under All takes.

Select several gallery pictures with their checkboxes to save them together or attach up to four references. **Riff on this** attaches a single photo as the base. The first reference is the image to edit; additional references guide the result. **New image** clears the references. The creative partner inspects attached images, considers recent discussion, and returns an editable enhanced prompt. **Generate 4 images** submits four independent Max requests. Save individual results or all completed images, then continue the conversation with a chosen result. Chat history and provider receipts survive reloads. Text entered while a reply is pending is retained.

Campaign chat uses Sunburst Max for all image operations, including people when requested. A reference-backed variation uses the fal edit endpoint; a new image uses text-to-image. Chat planning uses the existing OpenAI text connection. It never submits image generation automatically. Each generated image has its own source lineage and can be saved, inspected, approved and downloaded without changing the wizard's current take. The wizard remains available through Build a scene / Create.

### Model packs

A model pack turns approved library images for one RV model into a reusable fal reference set. Attach a pack in campaign chat to place the current scene or selected base first, followed by up to three supporting images. Reference order is deterministic: product identity comes before detail, interior and style images; a matching camera view wins within each role. Duplicate, unapproved and evaluation images are excluded. This keeps the existing four-image fal request contract and manual attachment flow intact.

When two or more references are attached, **Save as model pack** stores them for reuse in other campaigns. The first image becomes the pack base and later images become identity references. The model-pack API also supports richer roles (`base`, `identity`, `detail`, `interior`, `style`, `evaluation`), view and room labels, priority, approval status, archiving and full assignment replacement. Evaluation images are deliberately held out so the same photographs used to judge fidelity do not influence generation.

For a large source library, preserve original photographs as the archive and import web-sized generation proxies into the studio. Assign exterior identity views, interior rooms and detail shots explicitly; keep near-duplicates and low-quality frames out of generation. Start with these reference packs and measure product fidelity on held-out images before considering a Jayco-wide style LoRA. A model-specific tune should follow only if repeated reference-driven campaigns still fail on the same identity details.

The Add images dialog supports multi-select library imports and up to ten uploads at once. Removing an image from the gallery removes only its membership; its original file, history and other campaign memberships remain intact. Approval is separate from saving. Campaign upload originals and generated masters are preserved.

## Workflow

1. Select an RV reference from the library or upload a JPG, PNG or WebP (maximum 12 MB). Original files and brand/model/year/angle metadata are preserved.
2. Choose a saved landscape or generate four new options. Use a photographic preset, edit the brief, optionally enhance it, then review the full prompt.
3. Generate four RV + landscape compositions. Select one before proceeding.
4. Optionally add people or physical objects in separate four-image passes. Object references can be uploaded or generated. Accepted versions can be restored.
5. Inspect against the source RV at actual size, complete the three review checks, and explicitly approve. Export the original image or a repositionable social crop.

Three AI landscape plates and a clearly labeled generic AI trailer sample are included. Replace the sample with real unit photography before producing branded assets. Existing Fabric app data was not migrated; its source and database were not available in this workspace.

## Model routing

- Landscapes and reusable objects: `openai/gpt-image-2.5/sunburst/text-to-image` through fal.
- RV compositing and scene objects: `openai/gpt-image-2.5/sunburst/edit` through fal.
- Every Sunburst request explicitly sets `quality: "max"`, `num_images: 1`, lossless PNG output, and native high-resolution dimensions: 3264×2448 (4:3), 3840×2160 (16:9), 2880×2880 (square), or 2448×3264 (portrait). Four independent requests are submitted concurrently. Higher resolution increases generation time and provider usage; existing files retain their original resolution.
- References above 2 MB are streamed to fal with a 24-hour expiration preference before editing/chat, avoiding repeated base64 copies of large images in Worker memory. The private R2 original remains the master. Generated files are preserved without resizing or recompression.
- People: `meta/muse-image/edit` through fal, using only the selected scene.
- Optional prompt enhancement: OpenAI Responses API, `gpt-5.4-mini`, configurable with `PROMPT_MODEL`.

Provider rates apply. The interface does not claim fixed prices or fabricated completion percentages. It shows actual submission, queue, generation, saving and completion states, elapsed time and completed-image counts.

## Storage, access and recovery

The Sites deployment uses a D1 database (`DB`) and a private R2 bucket (`BUCKET`). API requests require authenticated ChatGPT identity; queries and media are scoped to that identity. Shared starter images are immutable. API keys stay in server-side secrets. The deployed Site starts owner-private.

Campaign selections, jobs, provider receipts, image provenance, accepted versions and approvals persist. Reopening a campaign resumes polling saved jobs. fal continues generating while the browser is closed; result transfer resumes when the campaign is reopened. A completed image that fails to save can be downloaded from the same provider request again. Retrying a confirmed failed generation affects only that slot. Uncertain submissions are retained for provider-history reconciliation instead of automatically billing another request. Reusing a batch identifier returns its existing jobs. Changing source selections invalidates downstream selections.

Text edits are held in the current browser session until generation; the submitted prompt is then stored with the batch. The app does not promise exact RV lettering preservation: source comparison and explicit review are part of approval.

## Local setup

Requires Node 22.13+ and Python 3 for API integration tests.

```sh
npm run install:ci
cp .env.example .dev.vars
# Populate FAL_KEY and OPENAI_API_KEY locally. Never commit this file.
npx wrangler d1 migrations apply DB --local
npm run dev
```

Use the local sign-in button for the starter's development identity. Production uses Sites authentication. Keep local development bound to a trusted environment.

If local workerd cannot establish outbound TLS, start `python3 scripts/dev-provider-bridge.py` before `npm run dev`. It configures ignored local variables and runs a token-protected, allowlisted loopback bridge at port 17889. Hosted deployment does not use this bridge; do not set `DEV_PROVIDER_PROXY` or `DEV_PROVIDER_TOKEN` in hosted secrets. Remove these two local variables to restore direct fetch.

## Validation

```sh
npx tsc --noEmit
node --experimental-strip-types --test tests/domain.test.ts
npm run build
```

With the development server, local sign-in and valid provider keys:

```sh
python3 tests/live-flow.py
python3 tests/api-safety.py
```

`live-flow.py` submits paid fal/OpenAI requests: four landscapes, four compositions, four people edits, four object edits and four object references. It resumes existing request IDs from ignored `work/live-test-report.json`; preserve that file after an interruption. It checks model routing, idempotence, storage, explicit selection, approval, download, version restoration and upstream invalidation. `api-safety.py` exercises ownership and invalid input and modifies only isolated/local SQLite fixtures. It requires a completed live report for the save-recovery test and does not generate new images. Run these scripts only against the local development instance.

Browser QA covers uploads and metadata search, selection checkpoints, desktop/mobile layout, image inspection, approval controls, crop download, campaign reopening and interrupted preview recovery. Evidence and test reports remain in ignored `output/` and `work/` directories.

## Deployment

This checkout is registered to the existing Sites project in `.openai/hosting.json`. Preserve that project ID. Hosted secrets are `FAL_KEY`, `OPENAI_API_KEY` and optional `PROMPT_MODEL`. Do not create another Site for updates. Commit and push the exact source state, build and package it with the Sites helpers, save that commit/archive as a version, then deploy while preserving the audience. SQL migrations in `drizzle/` are part of the deployment.

## Campaign release audit

The campaign extension uses additive migration `0001_huge_slipstream.sql`: gallery memberships, durable chat turns, and a constant-default initialization flag. Previous migrations are unchanged. The gallery backfill runs once per campaign and respects removed-entry tombstones.

`tests/campaign-flow.py` is a resumable paid integration audit: eight fal images plus OpenAI conversation requests. It tests multiple saved pictures, idempotence, reference validation, new image and edit routing at Max, source lineage, independent approval and conversation persistence. Preserve `work/campaign-test-report.json` when resuming. `tests/campaign-safety.py` checks authentication, ownership, bulk validation, immutable submitted directions, explicit bases, approval rules and interrupted-reply recovery using local fixtures. The existing wizard domain and API tests remain applicable.

Campaign browser QA covers ordered multi-reference selection, live chat, draft preservation during replies, two-photo uploads, reload persistence, desktop/mobile layout, image review and campaign reopening. Native WebMCP remains guarded when unavailable in the browser.

## Native resolution audit

`tests/resolution-flow.py` submits one resumable four-image Max edit batch at 3840×2160, verifies the actual PNG headers and stored dimensions, confirms receipt reuse, and passes all four large references into creative chat. PNG dimensions are read from the image header when fal omits metadata. Save recovery was also verified for chunked transfers using the same provider receipt and an unchanged SHA-256 hash.
