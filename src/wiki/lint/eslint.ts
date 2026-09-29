import { basename, join } from "@std/path";
import type { Config } from "../config.ts";
import { markdownBody } from "../document.ts";
import { normalizeHeadingForDuplicate, parseHeadings } from "../headings.ts";
import { readTextTolerant } from "../parser.ts";
import { iterMarkdownFiles, routeForDocumentFile } from "../paths.ts";
import { pyReprString } from "../pyrepr.ts";
import type { Severity } from "../schemas/rules.ts";

function eslintSeverity(severity: Severity): "error" | "off" | "warn" {
  if (severity === "error") return "error";
  if (severity === "warning") return "warn";
  return "off";
}

export async function lintHeadingLevelsWithEslint(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
  severity: Severity = "warning",
): Promise<string[]> {
  if (severity === "off") return [];

  const [{ ESLint }, { default: markdown }] = await Promise.all([
    import("eslint"),
    import("@eslint/markdown"),
  ]);
  const eslint = new ESLint({
    allowInlineConfig: false,
    overrideConfigFile: true,
    overrideConfig: [{
      files: ["**/*.md"],
      language: "markdown/gfm",
      plugins: { markdown },
      rules: {
        "markdown/heading-increment": [eslintSeverity(severity), {
          frontmatterTitle: "",
        }],
      },
    }],
  });

  const warnings: string[] = [];
  let index = 0;
  for (const filePath of iterMarkdownFiles(config)) {
    const route = routeForDocumentFile(config, filePath);
    if (fileFilter !== null && !fileFilter.has(route)) continue;

    const body = markdownBody(readTextTolerant(filePath));
    const [result] = await eslint.lintText(body, {
      filePath: join(Deno.cwd(), `wiki-lint-${index++}.md`),
    });
    if (result === undefined) continue;

    for (const message of result.messages) {
      const line = message.line ?? 1;
      if (message.ruleId !== "markdown/heading-increment") {
        warnings.push(`In ${basename(filePath)}:${line}: ${message.message}`);
        continue;
      }
      const match = /^Heading level skipped from (\d+) to (\d+)\.$/.exec(
        message.message,
      );
      if (match === null) {
        warnings.push(`In ${basename(filePath)}:${line}: ${message.message}`);
        continue;
      }
      const previousLevel = Number(match[1]);
      const level = Number(match[2]);
      warnings.push(
        `In ${basename(filePath)}:${line}: ` +
          `Heading h${level} skips level h${previousLevel + 1}; ` +
          "increase depth by one at a time.",
      );
    }
  }

  return warnings;
}

export async function lintDuplicateHeadingsWithEslint(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
  severity: Severity = "warning",
): Promise<string[]> {
  if (severity === "off") return [];

  const [{ ESLint }, { default: markdown }] = await Promise.all([
    import("eslint"),
    import("@eslint/markdown"),
  ]);
  const eslint = new ESLint({
    allowInlineConfig: false,
    overrideConfigFile: true,
    overrideConfig: [{
      files: ["**/*.md"],
      language: "markdown/gfm",
      plugins: { markdown },
      rules: {
        "markdown/no-duplicate-headings": eslintSeverity(severity),
      },
    }],
  });

  const warnings: string[] = [];
  let index = 0;
  for (const filePath of iterMarkdownFiles(config)) {
    const route = routeForDocumentFile(config, filePath);
    if (fileFilter !== null && !fileFilter.has(route)) continue;

    const body = markdownBody(readTextTolerant(filePath));
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
      filePath: join(Deno.cwd(), `wiki-lint-duplicates-${index++}.md`),
    });
    if (result === undefined) continue;

    for (const message of result.messages) {
      if (message.ruleId !== "markdown/no-duplicate-headings") continue;
      const line = message.line ?? 1;
      const heading = headingByLine.get(line);
      const firstLine = firstLineByDuplicate.get(line);
      if (heading === undefined || firstLine === undefined) continue;
      warnings.push(
        `In ${
          basename(filePath)
        }:${line}: Duplicate heading h${heading.level} ` +
          `${pyReprString(heading.text)} (first at line ${firstLine}).`,
      );
    }
  }

  return warnings;
}
