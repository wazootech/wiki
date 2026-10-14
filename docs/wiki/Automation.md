# Automation

Keep your wiki up to date automatically by running a custom ingestion script in CI or on a schedule. This lets you pull from any source (APIs, RSS feeds, databases, internal tools) and optionally generate content with your own AI workflow.

## Concepts

- **Treat content as generated + curated**: Automation writes Markdown into the wiki's input directories, while you can still edit files by hand. Both coexist.
- **BYO AI**: Run your own script (Deno, Node.js, Python, Bash) that calls any LLM, fetches data, and emits Wikipedia-style Markdown files. No vendor lock-in.
- **Validate before committing**: Run `wiki fmt`, `wiki lint --strict`, and `wiki check --strict` so broken links or style issues never land.
- **Safe commits**: Skip CI on automated commits with `[skip ci]`, use a dedicated bot identity, and open a PR if your repo has branch protection.

## GitHub Actions: daily auto-update

This example shows how to update your wiki daily from a custom source and validate/build it with Wiki CLI.

### 1) Create the ingestion script

Create a script (e.g. `scripts/update_daily.ts`) that reads from your source and writes Markdown to your wiki input directory. It can call any API or your own AI pipeline.

```ts
// scripts/update_daily.ts
import { ensureDir, writeTextFile } from "jsr:@std/fs";
import { join } from "jsr:@std/path";

const wikiDir = "./wiki"; // adjust to your input dir

await ensureDir(wikiDir);
await writeTextFile(
  join(wikiDir, "Daily_Digest.md"),
  `# Daily Digest\n\nUpdated: ${new Date().toISOString()}\n`,
);
```

### 2) Add the workflow

Create `.github/workflows/update-wiki.yml` in your wiki repository:

```yaml
name: Daily Wiki Update

on:
  schedule:
    # Runs daily at 00:00 UTC
    - cron: "0 0 * * *"
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Deno
        uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x

      - name: Run custom ingestion (BYO AI / any source)
        run: |
          # Your custom script writes Markdown into the wiki input dir
          deno run -A scripts/update_daily.ts

      - name: Format
        run: deno run -A jsr:@wazoo/wiki fmt

      - name: Lint (strict)
        run: deno run -A jsr:@wazoo/wiki lint --strict

      - name: Check (strict)
        run: deno run -A jsr:@wazoo/wiki check --strict

      - name: Build
        run: deno run -A jsr:@wazoo/wiki build

      - name: Commit and push if changed
        run: |
          if ! git diff --quiet; then
            git config user.name "github-actions[bot]"
            git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
            git add .
            git commit -m "chore: daily wiki update [skip ci]"
            git push
          else
            echo "No changes to commit"
          fi
```

Notes for dogfooding this repo: if you're running these commands against `docs/wiki.yml`, pass `-c docs/wiki.yml` (e.g. `deno run -A jsr:@wazoo/wiki -c docs/wiki.yml fmt`). GitHub Actions automatically provides `GITHUB_TOKEN` with the permissions granted to the job, so you don't need to set it explicitly.

### 3) Tips

- **Branch protection**: If your main branch is protected, grant `pull-requests: write` and use [create-pull-request](https://github.com/peter-evans/create-pull-request) instead of pushing directly.
- **Secrets**: Store API keys (e.g. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) in GitHub Actions secrets and pass them to your script.
- **Other triggers**: Use `workflow_dispatch` for manual runs, or `repository_dispatch`/webhooks to trigger on external events.
- **Different runtimes**: You can also use Node.js (`actions/setup-node`) or Python (`actions/setup-python`) for your ingestion script. Wiki CLI runs via Deno in this example.

## Local automation

You can run the same loop locally with a cron job or task runner:

```bash
deno run -A scripts/update_daily.ts
wiki fmt
wiki lint --strict
wiki check --strict
wiki build
```
