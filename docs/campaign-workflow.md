# Campaign workspace

The primary workflow is **RV → Scene & lifestyle → Shoot plan → Results**. Campaigns open their last saved section. The campaign home defaults to a blank campaign; existing setup presets remain available.

- RV: choose an original inventory photo, upload a photo, reuse a previous campaign's original RV, or use an approved reference pack. Pack selection sends the primary RV and one supporting identity/detail image; style, interior and evaluation references are excluded from automatic identity selection.
- Scene & lifestyle: choose a saved setting/Jayco shoot, a previous campaign image, upload a setting, or search/import a real location. Choose a reusable Mountain retreat, Golden desert escape or Family & dogs setup without changing the selected RV. Set whether to borrow its look or preserve its location, then direct people, activity, objects and the overall campaign. An optional object reference is sent with an explicit role.
- Shoot plan: start with two shots; add a lifestyle, web/social or full 18-shot package, or individual/custom shots. Rename, reorder, remove, change native image shape and edit shot direction. Select at most two images for each paid pass. Selecting a package never triggers generation.
- Results: generated photos are automatically retained as unapproved drafts, grouped by planned shot. Previous versions remain visible when the brief changes. Use Review & approve for source comparison, actual-size inspection, approval and master download. Plan a new version to regenerate one role; Reuse this setup restores the configuration that produced an image. Edits to a planned image through chat remain grouped as versions of the original shot. Existing chat refinements and gallery tools are under Refine images & manage gallery; legacy setting/prop generation and crop/export tools remain under Advanced image tools.

## Persistence and deployment

Apply `drizzle/0007_productive_hercules.sql` before deploying the updated app. It adds workflow JSON/revision fields to projects and immutable workflow snapshots to generation batches. No existing assets, approvals, memberships or batches are deleted.

On first opening a legacy campaign, the app reconstructs the brief from its latest compose batch, preserves its selected sources, and derives its requested roles from historical jobs. If no roles exist, it starts with a two-shot preview. Existing photos without a complete workflow snapshot are labeled as legacy rather than counted as verified coverage of the current brief.

Updates use optimistic concurrency; another window's changes cannot silently be overwritten. Autosaves are serialized and visible in the header. Navigating through the app flushes pending edits; unsaved unloads prompt the browser. A rejected save leaves the edited form on screen.

The generation endpoint reads the saved plan, validates references against ownership, caps a pass at two shots and records per-shot prompts/formats plus the full campaign snapshot before provider submission. Retries use those saved inputs. The client retains an unconfirmed generation request in session storage across reloads; Recover last request reuses its identifier and does not create a second paid batch.

The original files retain their dimensions. Native requested generation sizes are distinct from later export cropping; preview thumbnails are not delivery files.

## Validation

`tests/e2e/campaign-flow.spec.ts` covers persisted direction/shot plans, revision conflicts, immutable historical settings, two-image limits, idempotent replay, automatic draft retention, desktop/mobile navigation, approval/master download and lost-response recovery after reload. Provider calls in these tests use the isolated fake provider and never incur fal charges. `tests/e2e/photoshoot.spec.ts` also exercises per-shot native-format payloads, fallback planning, retry identity and ground-suitability rejection.
