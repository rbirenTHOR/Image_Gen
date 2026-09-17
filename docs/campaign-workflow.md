# Campaign workspace

The primary workflow is **RV → Shoot setup → Deliverables → Results**. Campaigns open their last saved section. New campaigns start blank, with setup selection only in step 2.

- RV: choose an original inventory photo, upload a photo, reuse a previous campaign's original RV, or use an approved reference pack. Pack selection sends the primary RV and one supporting identity/detail image; style, interior and evaluation references are excluded from automatic identity selection. A supporting view can also be selected or uploaded explicitly in the RV step.
- Shoot setup has two paths. **Use an existing setup** chooses a Jayco recipe or copies a previous campaign’s saved scene direction. The setting, location treatment, brief, people, props and object references move together as an immutable snapshot with source provenance. The selected RV and its supporting identity references stay unchanged. The summary is read-only until **Customize this setup** creates an editable copy.
- **Create a custom setup** exposes image selection/upload/discovery, location treatment, people, props and direction. A previous campaign photograph is explicitly just a photo reference, not its entire setup. Changing the setting clears old direction, cast, props and object references and resets scene-specific shot text. Switching an existing setup does the same reset, then applies all fields from the chosen setup. Output shapes and role IDs stay intact; existing images and historical batch snapshots are preserved.
- Deliverables default to six shots for a new campaign. Selecting a preview, six-shot or 18-shot package sets the plan to those roles, instead of accumulating an unexpected number. Users can change shapes, reorder, remove or add roles. Free-form shot direction on an existing setup requires explicit customization. Use **Select all**, uncheck unwanted roles and **Generate N selected photos** once. All checked roles (up to the 30-shot plan limit) are persisted in one batch. Every selected image is submitted concurrently to the fal queue. Provider account capacity determines actual rendering concurrency; the app does not wait for earlier photos to finish. Existing ready shots selected again create new versions. Package selection itself never generates or charges.
- Results: generated photos are automatically retained as unapproved drafts, grouped by planned shot. Previous versions remain visible when the brief changes. Use Review & approve for source comparison, actual-size inspection, approval and master download. Plan a new version to regenerate one role; Reuse this setup copies the scene direction that produced an image, while keeping the currently selected RV. Edits to a planned image through chat remain grouped as versions of the original shot. Existing chat refinements and gallery tools are under Refine images & manage gallery; legacy setting/prop generation and crop/export tools remain under Advanced image tools.

## Persistence and deployment

Apply `drizzle/0007_productive_hercules.sql` before deploying the updated app. It adds workflow JSON/revision fields to projects and immutable workflow snapshots to generation batches. No existing assets, approvals, memberships or batches are deleted.

On first opening a legacy campaign, the app reconstructs the brief from its latest compose batch, preserves its selected sources, and derives its requested roles from historical jobs. If no roles exist, it starts with a six-shot campaign. Legacy persisted workflows without setup metadata remain custom and keep their original shot plans and directions. Existing photos without a complete workflow snapshot are labeled as legacy rather than counted as verified coverage of the current brief.

Updates use optimistic concurrency; another window's changes cannot silently be overwritten. Autosaves are serialized and visible in the header. Navigating through the app flushes pending edits; unsaved unloads prompt the browser. A rejected save leaves the edited form on screen.

The generation endpoint reads the saved plan, validates references against ownership, validates all selected shot IDs and enforces a 60-outstanding-request owner budget for campaigns (30 per selection), and records per-shot prompts/formats plus the full campaign snapshot before provider submission. Retries use those saved inputs. The client retains an unconfirmed generation request in session storage across reloads; Recover last request reuses its identifier and does not create a second paid batch.

The original files retain their dimensions. Native requested generation sizes are distinct from later export cropping; preview thumbnails are not delivery files.

## Validation

`tests/e2e/campaign-flow.spec.ts` covers persisted direction/shot plans, revision conflicts, immutable historical settings, selected-image counts, idempotent replay, automatic draft retention, desktop/mobile navigation, approval/master download and lost-response recovery after reload. Provider calls in these tests use the isolated fake provider and never incur fal charges. `tests/e2e/photoshoot.spec.ts` also exercises per-shot native-format payloads, fallback planning, retry identity and ground-suitability rejection.

## Setup integrity validation

`tests/campaign-setup.test.ts` tests atomic replacement, field conflict detection, explicit customization, detached saved snapshots, legacy compatibility and historical output matching. The server rejects inconsistent existing-setup fields before saving or generating. Setup metadata is stored in the existing workflow JSON, so no additional database migration is required.

Manual browser QA used an isolated temporary database and simulated providers: choose a preset, replace it with a previous campaign, customize, change the setting and verify old fields clear, select exact deliverable counts, generate all six in three passes, reload, and check mobile layout. These checks do not certify generated visual quality or incur real fal image charges.

## Full-selection generation

All new campaign jobs are persisted before being submitted together with `Promise.allSettled`. References use expiring remote URLs to avoid duplicating large base64 images across a full shoot in Worker memory. A provider failure affects only that image and is never automatically resubmitted by the app. Once accepted, fal owns the queue and execution continues if the browser closes; reopening reconciles results. Submission with an uncertain receipt still requires provider-history review before retrying. Legacy `waiting` jobs resume through atomic claims on polling, now up to the full batch size. Duplicate tabs cannot submit the same waiting job twice. The 60-outstanding-request campaign budget prevents unbounded overlapping shoots; ordinary editing retains its eight-request budget.

API validation covers an 18-role plan with two unchecked (exactly 16 provider requests), concurrent polling, replay after settings change, and a single provider rejection that leaves the other selected shots able to complete. Browser validation covers Select all, unchecking, one-click generation of five shots and reload recovery. All use simulated providers.


## Evidence-based RV viewpoints

Campaign planning now inspects every labeled reference, including the supporting RV photo and any object reference. Before image submission, it must return structured evidence for each RV photo: visible perspective, fixed landmarks, limitations and whether it supports the same unit. Each shot chooses one usable source reference and an adaptation to its requested camera role. Scene and object photos cannot supply RV geometry. Missing, invalid or unavailable assessments stop campaign generation before image charges; legacy non-campaign placement retains its conservative fallback.

A single photographed view does not establish a 3D vehicle. The final generation instructions prioritize its perspective and landmark spacing over generic camera-role instructions. Variety comes from framing, people, activities, image shapes and supported crops. Duplicate photos or detail crops do not unlock unseen sides; conflicting supporting photos cannot be chosen by the plan. This is evidence-guided generation, not a pixel-preserving compositor or a guarantee of geometric fidelity. Outputs still need visual comparison with the source before approval.

Validation includes same-source and alternate-source assignments, rejection of scene-as-RV evidence, incomplete/duplicate view evidence, a mismatched supporting view, unavailable planning with no image submissions, and 16 selected images submitted before any polling with replay protection. A browser walkthrough also removed a supporting view, selected the full 18-shot package, submitted all 18 together and verified all 18 completed. All regression image requests use simulated providers. No new paid image was generated as part of this change.
