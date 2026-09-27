import { basename, join } from "@std/path";
import type { Config } from "../config.ts";
import { markdownBody } from "../document.ts";
import { readTextTolerant } from "../parser.ts";
import { iterMarkdownFiles, routeForDocumentFile } from "../paths.ts";
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
