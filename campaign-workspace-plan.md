# Campaign gallery and creative chat

## Audit

The original project has one `current_id` for the staged editing workflow. All takes persist as assets, but the interface makes saving look exclusive. The campaign list opens the linear wizard, and there is no durable conversation or gallery membership. New work must preserve existing campaigns, selected sources, approvals and job receipts.

## Implementation

- Add independent campaign-image membership. Save one, several, or an entire batch. Removing a gallery entry never deletes its original image or provider history.
- Open campaigns into a modern gallery and creative chat workspace. Keep the staged RV workflow accessible through “Build a scene.”
- Show saved images and all campaign takes, multi-select, clear reference attachments, image inspection, and per-image review/export.
- Persist chat turns, image references, editable enhanced prompts and generation batches. The assistant can inspect attached images and use earlier discussion. Image generation is an explicit action with visible routing and four-image count.
- Use fal GPT Image 2.5 Sunburst with explicit Max for both new campaign images and image-based variations, including people requested in campaign chat. Preserve the existing wizard’s Meta Muse people step.
- New variations are separate assets with source lineage. Multi-image references are explicit, bounded and ownership checked.
- Reuse queued jobs, incremental completion, retry and storage recovery. Never regenerate on reload or automatically approve output.
- Append database migrations; seed existing accepted pictures into gallery membership lazily and idempotently without rewriting existing records.

## Audit and release checks

Check migration compatibility, cross-owner access, idempotent saves and chat submission, reference validation, multiple saved takes, old wizard regression, chat continuity, real Max generation, reload recovery, failed jobs, desktop/mobile layout, keyboard controls, approval and export. Build and publish to the existing private Site.
