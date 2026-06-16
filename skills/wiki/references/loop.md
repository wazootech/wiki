# Loop Closure — execute, reconcile, issues

The advisor's job doesn't end at the plan. This file covers the three follow-through flows: dispatching an executor and reviewing its work (`execute`), keeping the plan backlog alive (`reconcile`), and publishing plans where work gets picked up (`--issues`).

The founding rule remains: **the advisor never edits source files.** In `execute`, a *separate executor subagent* edits code/markdown in an isolated git worktree; the advisor dispatches, reviews, and renders a verdict.

## Execute plan: dispatch and review

### Preconditions (check all before dispatching)

- The repository is a git repository (worktree isolation requires it). If not: stop and say so.
- The plan file exists and its dependencies show DONE in `plans/README.md`.
- Run the plan's drift check yourself. If in-scope files changed since `Planned at`, reconcile the plan first.

### Dispatch

Spawn **one** executor subagent with `isolation: "worktree"`.

The subagent prompt must contain:

1. **The full plan file text, inlined.**
2. The executor preamble:

> You are the executor for the implementation plan below. Follow it step by
> step. Run every verification command and confirm the expected result before
> moving on. Touch only the files listed as in scope. If any STOP condition
> occurs, stop immediately and report. Do not improvise around obstacles.
> Commit your work in the worktree.
> One override: SKIP the plan's instruction to update `plans/README.md` —
> your reviewer maintains the index. Before reporting, audit every claim in
> your report against an actual tool result from this session — only report
> what you can point to evidence for; if a verification failed or was
> skipped, say so plainly. When finished, reply with exactly the report
> format below.

3. The report format:

```
STATUS: COMPLETE | STOPPED
STEPS: per step — done/skipped + verification command result
STOPPED BECAUSE: (only if STOPPED) which STOP condition, what was observed
FILES CHANGED: list
NOTES: anything the reviewer should know (deviations, surprises, judgment calls)
```

### Review (the advisor's job here)

Review like a tech lead reviewing a PR against the spec — never fix anything yourself:

1. **Re-run every done criterion** in the worktree:
   `wiki -c <config> fmt --check`
   `wiki -c <config> lint --strict`
   `wiki -c <config> check --strict`
2. **Scope compliance**: `git -C <worktree> diff --stat` against the plan's in-scope list. Any file outside scope fails review.
3. **Read the full diff.** Judge it against the intent (does it actually resolve the markdown or config error?) and conventions (Wikipedia-style names, heading cases, standard links).

### Verdict

| Verdict | When | Action |
|---|---|---|
| **APPROVE** | Criteria pass, scope clean, quality holds | Update index status to DONE. Present to the user: diff summary, worktree path/branch, and notes. **Merging is the user's decision — never merge, push, or commit to their branch.** |
| **REVISE** | Fixable gaps | Send feedback to the same executor with specific instructions. Max 2 revision rounds, then BLOCK. |
| **BLOCK** | STOP condition hit or revisions exhausted | Mark BLOCKED in the index with the reason. Refine or rewrite the plan with what was learned. |

---

## Reconcile: keep plans alive

Process changes since the last session. Read `plans/README.md` and every plan file, then update status:

- **DONE** — verify that the done criteria still hold on current HEAD. Mark verified.
- **BLOCKED** — read the reason. Refine the plan around the obstacle, or mark REJECTED.
- **IN PROGRESS** — flag to the user (possible crash mid-run).
- **TODO** — run the drift check. If drifted, verify the finding still exists. If gone, mark REJECTED ("fixed independently").

## Publish plans as GitHub issues

Only run with the user's explicit authorization (the `--issues` flag).

1. Preflight: `gh auth status` succeeds and the repo has a GitHub remote.
2. Visibility check: `gh repo view --json visibility`. If the repo is **public**, warn the user before publishing plans describing security or configuration vulnerabilities.
3. Show the list of titles about to become issues; confirm once.
4. Per plan: `gh issue create --title "<plan title>" --body-file <plan file> --label improve`.
5. Record each issue URL in the plan's Status block and the index.
