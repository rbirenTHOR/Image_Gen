# THOR RV Studio

An authenticated RV marketing studio using the selected Option B design: warm ivory, terracotta, editorial typography and a five-step campaign workflow.

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
- Every Sunburst request explicitly sets `quality: "max"` and `num_images: 1`. Four independent requests are submitted concurrently.
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
