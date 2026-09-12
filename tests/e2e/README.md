# THOR RV Studio browser journeys

Run from the `rv-studio` project with Node 22.13+ and Google Chrome installed.

```sh
npm ci
npm test
```

`npm test` runs eight domain checks followed by the browser journeys. `npm run test:e2e` runs just the browser suite. Use `npm run test:e2e:headed` to watch or `npm run test:report` to open the last HTML report. Tests run serially on desktop light, mobile light (iPhone 13 viewport/touch emulation in Chrome), and desktop dark. This is not a physical iPhone or Safari test.

The harness launches the real app and real API with temporary D1/R2 storage. It seeds the current migrations in a disposable checkout and substitutes only the external provider transport. Dummy keys, a loopback-only provider stub and a destination allowlist prevent paid image generation. Your saved campaigns and normal local database are not copied or changed. Ports 6173 and 6199 must be free. The temporary app is removed when the suite exits.

Generation fixtures simulate four independently submitted jobs, delayed completion, provider rejection, interrupted file saving and chat failure. They deliberately return the same sample JPEG: these assertions validate application behavior and request parameters, not AI image fidelity or actual provider latency.

Coverage includes sign-in, uploads, libraries and search, enhanced prompts, reload during generation, selecting and saving multiple takes, RV composition, optional people and objects, source comparison, approval gates, original/cropped downloads, campaign imports, multi-upload, ordered references, chat, variations, retry behavior, saved-state persistence, browser navigation, responsive overflow, keyboard focus and automated accessibility checks.

The refinement cases additionally exercise unsent message/reference recovery, campaign isolation, edited prompt and aspect recovery, and a lost generation response. The lost-response test lets the API finish, drops its response in the browser, then verifies that recovery retrieves exactly the original four image requests. Drafts are scoped to the current browser tab and campaign; they are not a cross-device autosave service.

The clean-checkout suite now contains 17 journeys across three configurations (51 cases), plus the eight domain checks.

Successful checkpoints save screenshots. Failures add screenshots and Playwright traces. The HTML/JSON reports live under `output/playwright/`, which is intentionally ignored by Git. Accessibility checks wait for finite UI transitions before measuring contrast; serious and critical WCAG A/AA violations fail the suite. Automated checks do not replace a manual screen-reader audit.

## Optional paid provider check

This separate test is excluded from `npm test`. It uses real configured local keys and creates one QA campaign, one OpenAI reply and four fal Max 4K images. It exercises save, native-size inspection, approval UI and PNG download. It never targets the deployed production campaign. Running it again creates a new paid batch; retries are disabled.

Start the normal app at port 5173 with its existing provider configuration. In this portable environment, start `python3 scripts/dev-provider-bridge.py` before `npm run dev -- --port 5173`. The bridge uses the ignored local `.dev.vars`; never commit that file.

```sh
RUN_LIVE_PROVIDER_TESTS=1 npx playwright test --config playwright.live.config.ts
```

Without the explicit flag the paid test skips. To resume a previous paid batch without generating another one, provide its QA campaign ID in `LIVE_QA_PROJECT`; this reopens the existing campaign and continues the save/inspection/download assertions. Native dimensions and downloaded PNG headers are verified independently of the preview size. Results live in `output/playwright/live-results.json` and `output/playwright/live-results/`. Approval clicks in QA verify the workflow only; marketing still needs human review of real RV markings and scene details.

The older `api-safety.py` and `campaign-safety.py` checks require the existing local live-test fixtures and port 5173. They are not part of the clean-checkout command above.

## Photographic quality evaluation

See `tests/realism/README.md` for the separate, resumable real-provider comparison. It tests generated image quality with three environments and repeated samples, while the browser suite tests application behavior with fixed images.
