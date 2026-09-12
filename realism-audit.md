# Photographic realism refinement — 12 September 2026

The image provider remains GPT Image 2.5 Sunburst Max through fal. The application already requests native high-resolution PNG output; increasing a quality flag is not a further available improvement. More pixels do not correct painted-looking foliage or implausible terrain.

## Changes

- Grounded photographic instructions describe material texture, irregular vegetation, coherent light and gradual atmospheric depth. The landscape defaults use restrained light and ordinary terrain.
- RV composition treats the selected landscape as a background to retain. People, props and campaign edits preserve unrequested scenery and avoid cumulative smoothing or global restyling. These are model instructions, not a pixel-preservation guarantee.
- Campaign chat examines references with `detail: high`. Prompt enhancement favors specific changes and avoids imposing a new camera or dramatic grading on an existing photograph.
- The campaign photo inspector has **Make more lifelike**. It attaches the selected photo and prepares a focused chat request. The user can edit and send it, review the enhanced direction, then generate four variants. Opening this action makes no paid generation request and does not modify the original.

## Real-provider check

Four images were generated: two with the previous instructions and two with the revised instructions, all using the same alpine-lake brief, Sunburst Max, 3840 × 2160 and PNG. All four completed and their native dimensions were verified. No matched seed was available. This small qualitative comparison is not a benchmark across environments.

Visual inspection found plausible light and depth in both groups, with residual idealized trees and distant texture. The revised results had some more varied terrain, but the improvement was not consistent. A separate high-detail vision comparison of the second old/new pair slightly preferred the old image, calling the difference close. The revision must not be described as a proven photorealism gain.

The four unmodified images, request records and comparison review are retained locally under ignored `work/realism-comparison/`. Automated journey fixtures validate behavior, not generated image quality.

## Remaining limits

Existing images are unchanged until the user requests an edit. Generative editing can still alter badges, lettering or background detail. Inspect the original-resolution results before approving marketing assets. For a particular real location, an uploaded location photograph provides a stronger factual reference than a newly invented environment; the later composite still needs review.

## Validation

Eight unit tests passed. In the 42-case desktop-light, mobile-light and desktop-dark browser run, 41 passed; the cold-start Back/Forward case exposed a framework navigation race. The same-document history handler was corrected and all nine focused repetitions passed across the three configurations. The other 41 cases were not rerun after this isolated navigation change. The new refinement action passed in all three configurations, including reference attachment, high-detail chat input and no automatic image generation. Type checking and the production build passed. A real OpenAI request also accepted and analyzed the full-resolution references with high detail.

## Sources

- [fal Sunburst generation schema](https://fal.ai/models/openai/gpt-image-2.5/sunburst/text-to-image/api)
- [fal Sunburst editing schema](https://fal.ai/models/openai/gpt-image-2.5/sunburst/edit/api)
- [OpenAI image-input detail](https://developers.openai.com/api/docs/guides/images-vision)
