import { basename, join } from "@std/path";
import type { Linter } from "eslint";
import type { Config } from "../config.ts";
import { markdownBody } from "../document.ts";
import { normalizeHeadingForDuplicate, parseHeadings } from "../headings.ts";
import { readTextTolerant } from "../parser.ts";
import { iterMarkdownFiles, routeForDocumentFile } from "../paths.ts";
import { quoteString } from "../describe.ts";
import type { Severity } from "../schemas/rules.ts";

function eslintSeverity(severity: Severity): "error" | "off" | "warn" {
  if (severity === "error") return "error";
  if (severity === "warning") return "warn";
  return "off";
}

export interface MarkdownLintSeverities {
  readonly heading_levels: Severity;
  readonly duplicate_headings: Severity;
}

export interface MarkdownLintIssues {
  readonly heading_levels: string[];
  readonly duplicate_headings: string[];
}

export async function lintMarkdownWithEslint(
  config: Config,
  fileFilter: ReadonlySet<string> | null,
  severities: MarkdownLintSeverities,
): Promise<MarkdownLintIssues> {
  const headingLevelsEnabled = severities.heading_levels !== "off";
  const duplicateHeadingsEnabled = severities.duplicate_headings !== "off";
  const issues: MarkdownLintIssues = {
    heading_levels: [],
    duplicate_headings: [],
  };
  if (!headingLevelsEnabled && !duplicateHeadingsEnabled) return issues;

  const [{ ESLint }, { default: markdown }] = await Promise.all([
    import("eslint"),
    import("@eslint/markdown"),
  ]);
  const rules: Linter.RulesRecord = {
    ...(headingLevelsEnabled
      ? {
        "markdown/heading-increment": [
          eslintSeverity(severities.heading_levels),
          { frontmatterTitle: "" },
        ],
      }
      : {}),
    ...(duplicateHeadingsEnabled
      ? {
        "markdown/no-duplicate-headings": eslintSeverity(
          severities.duplicate_headings,
        ),
      }
      : {}),
  };
  const eslint = new ESLint({
    allowInlineConfig: false,
    overrideConfigFile: true,
    overrideConfig: [{
      files: ["**/*.md"],
      language: "markdown/gfm",
      plugins: { markdown },
      rules,
    }],
  });

  let fileIndex = 0;
  for (const filePath of iterMarkdownFiles(config)) {
    const route = routeForDocumentFile(config, filePath);
    if (fileFilter !== null && !fileFilter.has(route)) continue;

    const body = markdownBody(readTextTolerant(filePath));
    const eslintPath = join(Deno.cwd(), `wiki-lint-${fileIndex++}.md`);

    if (headingLevelsEnabled) {
      const [result] = await eslint.lintText(body, { filePath: eslintPath });
      for (const message of result?.messages ?? []) {
        if (message.ruleId !== "markdown/heading-increment") continue;
        const line = message.line ?? 1;
        const match = /^Heading level skipped from (\d+) to (\d+)\.$/.exec(
          message.message,
        );
        if (match === null) {
          issues.heading_levels.push(
            `In ${basename(filePath)}:${line}: ${message.message}`,
          );
          continue;
        }
        const previousLevel = Number(match[1]);
        const level = Number(match[2]);
        issues.heading_levels.push(
          `In ${basename(filePath)}:${line}: ` +
            `Heading h${level} skips level h${previousLevel + 1}; ` +
            "increase depth by one at a time.",
        );
      }
    }

    if (duplicateHeadingsEnabled) {
      const headings = parseHeadings(body);
      const lines = body.split(/\r\n|\r|\n/);
      const firstLines = new Map<string, number>();
      const headingByLine = new Map<number, (typeof headings)[number]>();
      const firstLineByDuplicate = new Map<number, number>();

      for (const heading of headings) {
        const lineIndex = heading.line_no - 1;
        if (lineIndex < 0 || lineIndex >= lines.length) continue;
        const isAtx = /^ {0,3}#{1,6}(?:\s|$)/.test(lines[lineIndex]!);
        if (!isAtx && lineIndex + 1 < lines.length) lines[lineIndex + 1] = "";
        if (heading.level <= 1) {
          lines[lineIndex] = "";
          continue;
        }
        const key = normalizeHeadingForDuplicate(heading.text);
        if (key === "") {
          lines[lineIndex] = "";
          continue;
        }
        const firstLine = firstLines.get(key);
        if (firstLine === undefined) {
          firstLines.set(key, heading.line_no);
        } else {
          firstLineByDuplicate.set(heading.line_no, firstLine);
        }
        headingByLine.set(heading.line_no, heading);
        lines[lineIndex] = `${"#".repeat(heading.level)} ${key}`;
      }

      const [result] = await eslint.lintText(lines.join("\n"), {
        filePath: eslintPath,
      });
      for (const message of result?.messages ?? []) {
        if (message.ruleId !== "markdown/no-duplicate-headings") continue;
        const line = message.line ?? 1;
        const heading = headingByLine.get(line);
        const firstLine = firstLineByDuplicate.get(line);
        if (heading === undefined || firstLine === undefined) continue;
        issues.duplicate_headings.push(
          `In ${
            basename(filePath)
          }:${line}: Duplicate heading h${heading.level} ` +
            `${quoteString(heading.text)} (first at line ${firstLine}).`,
        );
      }
    }
  }

  return issues;
}

export async function lintHeadingLevelsWithEslint(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
  severity: Severity = "warning",
): Promise<string[]> {
  return (await lintMarkdownWithEslint(config, fileFilter, {
    heading_levels: severity,
    duplicate_headings: "off",
  })).heading_levels;
}

export async function lintDuplicateHeadingsWithEslint(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
  severity: Severity = "warning",
): Promise<string[]> {
  return (await lintMarkdownWithEslint(config, fileFilter, {
    heading_levels: "off",
    duplicate_headings: severity,
  })).duplicate_headings;
}
