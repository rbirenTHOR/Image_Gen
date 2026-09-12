# RV Studio validation and refinement — 12 September 2026

The expanded checks found and fixed loss of unsent campaign work. They also confirmed that the current landscape prompt should be retained instead of the shorter experimental alternative. Composition now explicitly matches glass and body reflections to the selected setting. GPT Image 2.5 Sunburst Max via fal remains the image model; Meta Muse remains the separate people step.

## Image quality evidence

Sixteen real fal images completed and were visually inspected: 12 landscapes and four RV composites. Every original PNG was verified as 3840 × 2160. The visual inspection used displayed image previews; it was not an exhaustive pixel-by-pixel examination. No source images were sharpened or upscaled for the comparison.

The landscape test covered forest, high desert and overcast Oregon coast. Each environment used the same creative brief for both prompt versions, with two samples per version. Model, Max quality, output dimensions and format were held fixed. Six high-detail automated comparisons hid the prompt version from the reviewer and alternated A/B ordering.

| Environment | Sample 1 | Sample 2 |
| --- | --- | --- |
| Forest | Tie | Current preferred |
| Desert | Shorter candidate preferred | Tie |
| Coast | Current preferred | Current preferred |

The review considered both photographic plausibility and adherence to the requested scene. Current won three pairs, candidate one, and two were ties. Those are qualitative judgments, not statistically significant measurements. Some reviewer criticism of flat, maintained-looking clearings conflicts with the legitimate need for firm RV-sized ground. Visual inspection did not show a consistent candidate advantage, so the shorter prompt was **not** adopted.

Positives: generally coherent soft or directional light, plausible geography, subdued coastal color, usable foregrounds, and preserved native image dimensions. Remaining weaknesses: repeated or smoothed ground texture, idealized vegetation, and occasional exaggerated scenery. Ordinary natural detail does not mean uniformly sharp distant objects.

The four composition checks used the built-in, unbranded AI travel-trailer sample with the forest and coastal plates, first with the existing composition prompt and then with the reflection refinement. The revised forest windows showed stronger surrounding-tree reflections; the coastal windows reflected the cloudy setting. Background layout remained recognizable, but fine foreground texture was re-rendered and softened. These two pairs do not establish a general improvement or validate real manufacturer lettering. The reflection instruction is a focused constraint, not a guarantee of physical accuracy.

All exact requests, receipts, originals and reviews are retained locally under ignored `work/realism-validation/`, `work/realism-composite-validation/` and `work/realism-reflection-validation/`. The background folder includes an `index.html` comparison. The reusable evaluator and its instructions are in `scripts/realism-eval.mjs` and `tests/realism/README.md`. It is excluded from ordinary tests and requires explicit paid-run flags.

## Journey fixes

- Unsent chat text and its ordered image references now survive refresh and leaving/returning to the campaign in the same browser tab.
- Edited enhanced prompts and selected output formats are recovered before generation. Drafts are isolated by campaign.
- Already-submitted prompts display the saved server direction rather than stale local edits.
- Chat waits for campaign initialization before sending. Malformed or unavailable draft storage is handled without blocking the application.
- Added an explicit lost-response journey: the API finishes generation submission, the browser loses the response, and recovery retrieves exactly the original four requests.

Draft recovery uses browser session storage. It does not sync between devices and is normally cleared when the tab session ends. Originals and saved campaign assets remain on the server as before.

## Test results and limits

Eight domain tests passed, followed by the 51-case browser matrix: 49 passed and two new mobile tests failed because their helper checked for the chat tab before the workspace had mounted. The helper now waits for the workspace. All nine refinement cases then passed across desktop light, mobile light and desktop dark, including both originally failing cases. Thus all 51 journeys have passing results across the full run and focused rerun; this was not a single uninterrupted 51-pass run. The final reflection-only prompt change was checked with the real fal calls and domain tests; the other browser journeys were not repeated for that text change.

Type checking and the production build passed. The full journeys cover creation, uploads, enhanced prompts, parallel choices, people and objects, multiple saved photos, chat variations, approval, downloads, recovery, navigation, responsive overflow, keyboard paths and serious/critical automated accessibility violations. Browser tests use disposable local storage and a controlled provider transport; they do not modify the production campaign or measure real AI image quality. Mobile coverage is Chrome viewport/touch emulation, not physical iPhone/Safari coverage. This pass did not repeat real Meta Muse people generation or a production browser smoke test.

## Remaining quality limit

Prompt instructions do not lock background pixels during a generative composite. Fine terrain texture can still soften when the RV is inserted, even when the layout and lighting are retained. A future masked/local compositing path would need a separate implementation and validation to protect untouched pixels. No automatic whole-image sharpening, model substitution or claimed perfect preservation was introduced.
