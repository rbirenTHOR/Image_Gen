# THOR RV Studio — user journey audit

September 12, 2026 · Creation, campaigns, chat and export

The studio now has a repeatable browser regression suite covering the complete creation flow and campaign workflow, including failures and recovery. The audit combines browser actions, automated accessibility checks, screenshot review, API checks and a separate real-provider image-generation run.

**Verified results:** 39/39 browser checks passed across the three layouts; 8/8 domain tests and 20/20 API checks passed. The separate real-provider journey passed with four native 3840 × 2160 PNGs. TypeScript and the production build passed. No serious or critical accessibility violations remained in the states checked by the suite.

## What works well

- **The sequence is understandable.** Choose an RV, choose a setting, compose the photograph, optionally add people or objects, then review and export. People are a separate pass over the selected photograph.
- **Selection and collection serve different needs.** Multiple finished images can be saved while one image is selected for the next editing step. Campaign imports and multi-upload preserve multiple photographs.
- **Chat gives the user control before spending on images.** References are ordered, the first is the base, the assistant prepares an editable prompt, and image generation requires its own action. A message drafted while a reply arrives is preserved.
- **Recovery is targeted.** A failed generation retries one slot. An interrupted save retrieves the existing result without creating another paid image. Chat retry does not trigger image generation.
- **Review and export have useful safeguards.** Source comparison, actual-size viewing, approval checkboxes and crop review are available. The downloaded original retains its native resolution.
- **Campaign and creation screens share a consistent visual theme.** Warm surfaces, restrained accents and serif headings carry across the workflow, including dark mode.

## Problems found and changes made

| Finding | Effect on the user | Change |
|---|---|---|
| Refresh discarded the active Library or Campaigns screen | Users had to find their place again | URL state now restores the screen and library category; browser Back/Forward restores navigation |
| Future workflow steps appeared available before prerequisites existed | Clicking led to a preventable error | Unavailable steps are disabled and explain the missing RV, setting or photograph |
| “Keep” meant both saving and continuing | Unclear whether several images could be retained | Cards say **Save**; the next action says **Continue with this photo** or **Use this version**; guidance explains saving several and selecting one |
| The next action was far below four large results | Excess scrolling after comparing photographs | The workflow action footer stays within reach while scrolling |
| Empty library searches had no explanation or recovery | A blank result area felt broken | “No matching images” and **Clear search** reset search and filters |
| Closing controlled dialogs lost keyboard focus | Keyboard users lost their place | Dialogs return focus to the connected element that opened them |
| Muted/status text and success notifications had insufficient contrast in light mode | Small text was harder to read | Slightly deeper neutral text, corrected inactive-tab colors and darker success text; notifications follow system theme |
| Crop slider labels were attached to the wrapper instead of the control | Screen readers could not identify which crop position to adjust | The interactive slider thumbs now receive their labels; keyboard adjustment is covered |
| Some tab controls referred to nonexistent panels | Assistive technology received invalid relationships | Library, additions, campaign filters and mobile panels now have explicit matching labels and controls |
| Wide-image thumbnails cropped the photo edges | The gallery could misrepresent RV framing | Generated-result and campaign previews contain the full frame; gallery hover no longer zooms into a crop |
| Notifications occupied the bottom action area | Messages could cover continuation or chat controls | Notifications now appear at the top |

## Coverage and evidence

The automated browser matrix uses Chrome at desktop light, iPhone 13 viewport/touch emulation, and desktop dark. Each configuration covers:

1. Private sign-in and entry to the studio.
2. Uploading an RV, searching for it and choosing it.
3. Enhancing and editing a landscape prompt, submitting four parallel Max requests and reloading during generation.
4. Choosing a landscape, composing four takes, saving all and selecting one.
5. Adding people and then objects as separate passes.
6. Comparing the original RV, approving, downloading the original, changing crop and rechecking framing.
7. Importing several campaign images, attaching ordered references, chatting, generating variations, saving several and reloading.
8. Removing a campaign save while preserving the underlying original.
9. Retrying generation, file saving, chat and failed browser previews.
10. Browser Back/Forward and refresh restoration.
11. Multi-upload, individual campaign approval and native-size inspection/download.
12. Rejecting an invalid upload and correcting it in the same form.
13. Empty search, prerequisite guidance, keyboard focus, responsive overflow and accessibility checks across the main states.

See [suite instructions](tests/e2e/README.md), [interactive browser report](output/playwright/journey-report/index.html), [machine-readable browser results](output/playwright/journey-results.json) and [real-provider results](output/playwright/live-results.json). Screenshots accompany successful checkpoints; failures include traces and screenshots. Baseline evidence is retained under `output/playwright/baseline/`. Browser evidence folders are excluded from development file watching so collecting traces does not reload an open preview.

The repeatable suite runs the actual application, API, D1 and R2 in a disposable local environment. Only external provider responses are simulated. Its repeated sample JPEG is a functional fixture, not a claim about generated visual quality. It cannot spend generation credits and does not touch production campaigns.

The separate real-provider browser run used an OpenAI conversation and one fal batch of four Sunburst Max images. It saved all four, opened native-size inspection, exercised approval, downloaded a PNG and independently verified the PNG header at **3840 × 2160**. All four stored images reported those native dimensions. The run resumed its existing batch after tightening a test wait, avoiding another paid generation. See the [final gallery screenshot](output/playwright/live-gallery-final.png).

The existing eight domain tests and 20 API access/recovery checks also passed. They verify Max routing and dimensions, model-specific inputs, ownership, authentication, invalid requests, approval gates and duplicate-safe recovery.

## Remaining improvements, in priority order

These are follow-up opportunities, not claims that the automated checks cover them:

1. **Persist unsent creative work.** Submitted conversations and saved images survive reload; unsent messages and locally edited prompts do not yet have draft autosave. Add per-campaign draft recovery and a clear “Draft saved” indicator.
2. **Make long campaigns easier to scan.** Search and saved/all filters work, but large collections would benefit from sorting, labels, favorites and version grouping. Test with hundreds of real assets before choosing pagination or virtualization.
3. **Give long-running generations more context.** Status and per-image recovery work. A concise elapsed-time indicator and completion notification would make slow 4K jobs easier to leave and return to. Do not present an invented percentage or guaranteed completion time.
4. **Support more efficient final comparison.** Actual-size and source comparison are available; synchronized zoom/pan and a before/after slider would make badge and bodywork checks faster.
5. **Broaden device and accessibility testing.** This run uses Chrome, including mobile emulation. Physical iOS Safari, Android, Firefox, a manual screen-reader pass, on-screen keyboard behavior and slow/unstable network profiles remain to be checked.

The local browser sign-in validates the app’s gate and local auth flow, not the hosted ChatGPT SSO service. Automated approval clicks verify behavior in QA; they do not certify vehicle lettering, physical accuracy or marketing suitability. Real RV details still require human review before an image is used externally.
