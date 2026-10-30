import type { Config } from "../config.ts";
import type { Severity } from "../schemas/rules.ts";
import { lintMarkdownWithEslint } from "./eslint/markdown.ts";

export {
  type MarkdownLintIssues,
  type MarkdownLintSeverities,
} from "./eslint/types.ts";
export { lintMarkdownWithEslint } from "./eslint/markdown.ts";

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
