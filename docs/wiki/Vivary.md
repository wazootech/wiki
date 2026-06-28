---
type: schema:SoftwareApplication
name: Vivary
softwareVersion: 0.1.0
description: A standard and scaffolder for agent-native workspaces — typed knowledge graph, self-improving loop, graph-aware review, and blast-radius impact.
codeRepository: https://github.com/Jeff-Kazzee/vivary
---

# Vivary

[Vivary](https://vivary.vercel.app/) is **the create-t3-app for agent workspaces**: a standard plus scaffolder that wires standalone modules into a normalized, portable workspace your AI agent can navigate, verify, and improve. Plain Markdown, any editor, any agent runtime — no lock-in.

Source and docs: [github.com/Jeff-Kazzee/vivary](https://github.com/Jeff-Kazzee/vivary), by [Jeff Kazzee](Jeff_Kazzee.md). PyPI packages use the `vivary-*` prefix; npm scaffolds use `@vivary/*`.

```bash
npm create @vivary my-workspace
pip install vivary-tropo vivary-ozone vivary-exo create-vivary
create-vivary init my-workspace --preset coding
```

MIT · Python 3.11+ · zero third-party dependencies on the core engines · on [PyPI](https://pypi.org/project/vivary-tropo/) and npm.

## The problem Vivary solves

Every AI-agent project starts the same way: a pile of spec files, a `notes.md`, some rules, a memory dump. Then it rots. Vivary makes the workspace a **known, structured, navigable thing** — the way [create-t3-app](https://create.t3.gg/) did for web stacks.

The irreducible baseline for any agent workspace:

> A self-improving loop running over a typed, navigable knowledge graph, with one visible state surface and human gates.

Everything Vivary ships is a facet of that sentence. The design law (from [Jeff Kazzee](Jeff_Kazzee.md)'s [throughline](https://github.com/Jeff-Kazzee/throughline)): the framework must cost almost nothing to load, or it steals the context the work needs.

## Four layers, named for the sky

A *vivary* is a self-contained world with stacked atmospheric layers. Each layer is a standalone, zero-dependency CLI. **Baseline = tropo + strato**; ozone and exo snap on when you need review gates or multi-agent coordination.

| Layer        | Package                    | Role                                                    |
| ------------ | -------------------------- | ------------------------------------------------------- |
| Troposphere  | **tropo** (`vivary-tropo`) | Typed knowledge graph — ground truth                    |
| Stratosphere | **strato**                 | Agent OS — loop, state, memory, gates, self-improvement |
| The filter   | **ozone** (`vivary-ozone`) | Graph-aware review and blast-radius impact              |
| Exosphere    | **exo** (`vivary-exo`)     | Coordination when one agent becomes many                |

```
        exo      ── multi-agent orchestration            (optional)
       ozone     ── review: code + editorial / gates     (optional)
       strato    ── agent OS: state · memory · loop     (baseline)
       tropo     ── typed knowledge graph               (baseline)
```

## Install and scaffold

**Python 3.11+** is required.

```bash
# Install CLIs
pip install vivary-tropo vivary-ozone vivary-exo create-vivary

# Run without installing
uvx vivary-tropo check --root my-workspace

# create-t3-app-style scaffold (npm)
npm create @vivary my-workspace
# or: npx @vivary/create my-workspace

# Create a workspace locally
create-vivary init my-workspace --preset coding
create-vivary doctor my-workspace
```

Presets share the same agent-OS shell and differ only by starter graph:

| Preset         | Module              | First change        | Verification       |
| -------------- | ------------------- | ------------------- | ------------------ |
| `coding`       | `codebase`          | `local-ci-baseline` | `local-checks`     |
| `second-brain` | `knowledge-base`    | `capture-routine`   | `retrieval-smoke`  |
| `writing`      | `manuscript-system` | `draft-review-loop` | `editorial-review` |

`create-vivary init` writes `AGENTS.md`, `SOUL.md`, `STATE.md`, private `USER.md` / `MEMORY.md` boundaries, strato runtime skills (`.claude/skills/`, `.agents/skills/`), `tropo.toml`, and a starter typed graph under `modules/`, `changes/`, `decisions/`, `verification/`, and `gates/`. Pass `--obsidian` for an optional [Obsidian](Obsidian.md) vault config — never required.

## tropo — the typed knowledge graph

**tropo** is the typed knowledge graph layer. The filesystem *is* the schema: a document's type is the folder it lives in; metadata is only what cannot be derived from path, git, or the first `# H1`.

```
people/jeff.md           →  type = person   (the folder says so)
projects/tropo/README.md →  type = project
meetings/2026-06-12.md   →  type = meeting
```

A clean note can have **zero frontmatter** and still be fully typed and valid. Frontmatter is the exception, not the rule.

### Commands

| Command            | Purpose                                                                           |
| ------------------ | --------------------------------------------------------------------------------- |
| `tropo check`      | Validate every document and the graph — **opinionated: warnings fail by default** |
| `tropo signal`     | Print only irreducible metadata (noise stripped)                                  |
| `tropo types`      | Resolved type registry                                                            |
| `tropo stats`      | Document counts and health summary                                                |
| `tropo graph`      | Emit typed nodes and edges (`--json`)                                             |
| `tropo blast <id>` | Blast radius — everything that refs a node transitively                           |
| `tropo view`       | Self-contained HTML graph visualization                                           |
| `tropo plan`       | Simulate a change and show semantic delta                                         |
| `tropo fix`        | Strip redundant frontmatter (`--dry-run` to preview)                              |
| `tropo init`       | Scaffold `tropo.toml` (optional `--packs`)                                        |

Example gate output:

```text
$ tropo check
changes/billing.md:3 error E101: missing required field 'status'
modules/auth.md:5 warning W220: ref 'sessoin' matches no document id
tropo: 12 document(s), 1 error(s), 1 warning(s)  →  exit 1
```

### Finding codes

| Code | Level   | Meaning                                      |
| ---- | ------- | -------------------------------------------- |
| E101 | error   | Missing required field                       |
| E103 | error   | Field violates type spec                     |
| W201 | warning | Untyped document                             |
| W202 | warning | Unknown field for this type                  |
| W210 | warning | Field equals derived value (run `tropo fix`) |
| W220 | warning | Broken ref (edge to missing id)              |

Configuration lives in **`tropo.toml`**: composable type **packs**, subtree **overlays** (tighten-only — like `tsconfig` inheritance), derived fields (`id`, `title`, `created`, `updated`), and graph field types `ref` / `ref-list` that become edges.

## strato — the agent OS

**strato** is not a separate PyPI engine in v0.1; it ships as workspace templates and runtime skills fused from [throughline](https://github.com/Jeff-Kazzee/throughline) (per-turn loop) and [flywheel](https://github.com/Jeff-Kazzee/flywheel) (heartbeat distillation into memory and skills).

The operating loop in `AGENTS.md`:

> **Ask → retrieve → act → verify → learn → gate.**

- **Retrieve** with `tropo graph` / `tropo blast` — the graph is the first source of truth.
- **Verify** with `tropo check` + `ozone review` before a gate.
- **Learn** — distill verification results and gate outcomes back into memory, skills, or the graph. See [Learning Systems](Learning_Systems.md) for the distinction between continual and recursive learning.
- **Gate** — name blast radius (`ozone impact`) for risky changes; stop at human gates (memory writes, publishing, installs, git push/PR, destructive ops).

Visible state surfaces: `STATE.md` (Focus / Status / Next), `SOUL.md` (principles), gitignored `USER.md` and `MEMORY.md` for private identity and durable memory.

## ozone — review by blast radius

Where `tropo check` asks *"is each document valid?"*, **ozone** reviews the **whole graph**: relationship gaps a per-document check cannot see, and the **blast radius** of a change.

```text
$ ozone impact billing
billing  →  4 node(s) depend on it
  1  invoice    (change, via related_changes)
  1  checkout   (module,  via related_modules)
  2  receipt    (change,  via related_changes)
```

| Command             | Purpose                                           |
| ------------------- | ------------------------------------------------- |
| `ozone review`      | Advisory graph review ( `--strict` for CI gate )  |
| `ozone impact <id>` | Dependents of a node with distance and edge field |
| `ozone packs`       | List rule packs (e.g. `structure`)                |

The `structure` pack flags `change-unverified`, `change-ungated`, orphans, and broken edges. Code review and editorial review are the same layer with different rule packs — medium-agnostic by design.

## exo — multi-agent coordination

**exo** engages only when one agent becomes many. It does not run agents; it reasons read-only over the shared tropo graph.

| Command         | Purpose                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------- |
| `exo conflicts` | Active work items that share outbound targets                                               |
| `exo board`     | Work grouped by `status` (and `@assignee` when declared)                                    |
| `exo roles`     | Bounded contracts — Orchestrator, Scout, Researcher, Builder, Verifier, Reviewer, Archivist |

Most workspaces never need exo. Single-agent setups stop at **tropo + strato**.

## Design principles

- **Signal over noise.** If a value can be derived, never make a human write it.
- **Location is type.** The directory tree is the type hierarchy.
- **Tighten, never loosen.** Overlays and packs add constraints only.
- **Zero-dependency, CI-clean.** Honest exit codes; `--json` on every command.
- **No lock-in.** Plain Markdown + YAML; [Obsidian](Obsidian.md), Claude Code, Codex, or no editor at all.
- **Medium-agnostic.** The same graph and review serve code and prose.

## Vivary vs [Wiki CLI](Wiki_CLI.md)

| Dimension       | Vivary (tropo)                                 | [Wiki CLI](Wiki_CLI.md)                  |
| --------------- | ---------------------------------------------- | ---------------------------------------- |
| Primary goal    | Standardized **agent workspace**               | Semantic wiki **toolchain**              |
| Schema model    | Folder-as-type + `tropo.toml` packs            | SHACL, JSON Schema, `wiki.yaml`          |
| Metadata style  | Derive type, dates, title; minimal frontmatter | YAML-LD frontmatter + shapes             |
| Graph           | Typed nodes/edges from `ref` fields            | Full RDF compile + [SPARQL](SPARQL.md)   |
| Validation      | `tropo check` (strict gate)                    | `wiki check`, `wiki lint`                |
| Review / impact | `ozone review`, `ozone impact`, `tropo blast`  | Link graph, SHACL, broken-link lint      |
| Agent loop      | strato templates + skills (`AGENTS.md`, loop)  | [Wiki Skills](Wiki_Skills.md) (optional) |
| Publishing      | Not the focus (workspace OS)                   | `wiki build`, static HTML, RDF export    |
| Dependencies    | Zero on core engines                           | PyPI `wazootech-wiki`                    |

**Wiki CLI** targets wikis that become queryable, publishable [semantic web](Semantic_Web.md) artifacts; Vivary targets the **agent-native workspace** pattern in the [LLM Wiki](LLM_Wiki.md) era — compounding loop + typed graph + human gates — without RDF compilation.

The stacks can complement each other: Vivary for day-to-day agent workspace hygiene; Wiki CLI when the same Markdown should become a validated public wiki with SPARQL and static site output.

## Lineage

Vivary composes ideas from [Jeff Kazzee](Jeff_Kazzee.md)'s earlier tools:

- **braincheck → loam → tropo** — knowledge-layer validation lineage evolving from frontmatter-everywhere to folder-as-type to typed graph edges
- **throughline + flywheel → strato** — self-improving loop at turn speed and heartbeat speed
- **ozone, exo** — graph-native review and coordination (new in Vivary)

## Related

- [Jeff Kazzee](Jeff_Kazzee.md) — author and tool lineage
- [Wiki CLI](Wiki_CLI.md) — semantic compiler for Markdown wikis
- [LLM Wiki](LLM_Wiki.md) — compounding agent-maintained knowledge pattern
- [Agent Memory Filesystems](Agent_Memory_Filesystems.md) — filesystem-metaphor memory tools compared
- [Obsidian](Obsidian.md) — optional authoring surface (`create-vivary init --obsidian`)
- [Personal Knowledge](Personal_Knowledge.md) — domain context for second-brain presets
- [Software Application Shape](Software_Application_Shape.md) — SHACL shape for this page
