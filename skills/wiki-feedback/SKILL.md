---
name: wiki-feedback
description: >-
  Drafts and files repeatable Wiki CLI integration/template proposals. Use when the user asks
  to evaluate a new integration, create a wiki-*-template issue, compare an external tool with
  the Wiki toolchain, or turn integration feedback into a GitHub issue. Reviews existing
  template issues first, identifies the integration category, preserves Wiki CLI's source-layer
  boundary, and recommends the GitHub issue form for final filing.
---

# Wiki Feedback Skill

Use this skill for Wiki CLI ecosystem feedback, especially new integration or template proposals.

## Core rule

Every integration proposal must make the boundary explicit:

- Wiki CLI owns the semantic Markdown source layer: `wiki.yml`, documents, frontmatter, SHACL, JSON Schema, lint, fmt, SPARQL, RDF/JSON-LD export, render, build, and serve.
- The integration owns a distinct role: runtime memory, retrieval, publishing surface, agent workflow, issue-tracker bridge, domain model, or downstream application.
- Derived indexes, generated memories, PR comments, vector stores, and external runtimes are not the canonical Wiki corpus unless explicitly promoted into Wiki pages and validated.

## Workflow

1. Review existing open issues with label `template`.
2. Classify the proposed integration:
   - Agent workflow / coding agent
   - Runtime memory / retrieval
   - Static site / publishing surface
   - Issue tracker / work management
   - Domain-specific knowledgebase
   - Ontology / linked data
   - RAG / GraphRAG / search
3. Identify nearby existing issues and avoid duplicate scope.
4. Draft the proposal using `.github/ISSUE_TEMPLATE/integration-template.yml`.
5. Recommend filing through the GitHub issue form when the user wants durable feedback.
6. If asked to execute, create the issue with label `template`.

## Proposal sections

Use these sections when drafting by hand:

1. Goal
2. Why this matters
3. Boundary between Wiki CLI and the integration
4. Recommended architecture
5. Template repository
6. Template contents
7. Wiki corpus examples
8. Validation and CI
9. README positioning
10. Non-goals
11. Acceptance criteria
12. Open questions
13. Related issues and references

## Quality bar

A good proposal:

- states the proposed repo name as `wazootech/wiki-<integration>-template`;
- explains what Wiki CLI owns and what the integration owns;
- includes deterministic validation commands;
- avoids requiring private credentials in CI;
- includes provenance and citation expectations;
- names related template issues;
- cites primary external documentation;
- explains whether the template is standalone or should fold into an existing template.

## Default validation block

```bash
wiki -c wiki.yml fmt --check
wiki -c wiki.yml lint --strict
wiki -c wiki.yml check --strict
wiki -c wiki.yml render --check
```

Use `docs/wiki.yml` instead of `wiki.yml` when the template follows this repository's dogfooding layout.

## Filing guidance

Prefer the GitHub issue form:

`.github/ISSUE_TEMPLATE/integration-template.yml`

If filing via `gh issue create`, preserve the same structure and apply the `template` label.
