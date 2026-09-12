# Photographic quality evaluation

Run from the project root. This tool is excluded from `npm test`. The default writes an immutable plan and makes no provider calls:

```sh
node --experimental-strip-types scripts/realism-eval.mjs --run work/my-realism-check
```

The explicit paid run below creates 12 Sunburst Max images (three environments, two prompt versions, two samples each) and six high-detail OpenAI comparisons. It reads the existing ignored local credentials without printing them:

```sh
node --env-file=.dev.vars --experimental-strip-types scripts/realism-eval.mjs --run work/my-realism-check --generate --review
```

Reuse the same folder to resume. Completed image requests and reviews are retained. An uncertain submission is never automatically sent again; inspect the provider history to reconcile it. A new folder creates a new paid evaluation. Never run two processes against the same folder at once.

`results.json` contains the exact prompt and provider-input snapshots, receipts, verified native dimensions, results and blinded reviews. Original PNGs and a local `index.html` comparison are saved beside it. The review order alternates so neither prompt is consistently image A or B. Prompt version labels are hidden from the reviewer. The candidate lives in `cases.ts` and is experimental until reviewed; running the evaluator does not change the app.

Assess adherence separately from realism. The requirement for RV-sized firm ground can legitimately resemble a maintained turnout. Automated reviewers sometimes penalize that appearance; read their reasons rather than treating a score as objective truth. Review vegetation, ground, geology, weather and depth yourself as well.

There is no matched seed, no real-photo ground truth, and only two samples per prompt per environment. Results are qualitative evidence, not a statistically established gain. A good background does not prove that a later RV, people or object edit preserves it. Composition needs a separate reference-based check.

Keep the output folder under ignored `work/` or `output/`. Receipts and temporary image URLs belong in local evaluation artifacts, not public app data. Do not commit keys or `.dev.vars`.
