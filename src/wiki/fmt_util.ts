import { basename } from "@std/path";
import type { Config } from "./config.ts";
import { DEFAULT_FMT_OPTIONS, type FmtOptions } from "./fmt_config.ts";
import { formatMarkdownText } from "./formatter.ts";
import { BOM } from "./parser.ts";
import { getLogger } from "./logging.ts";

const logger = getLogger("wiki.fmt_util");

export function resolveFmtOptions(
  config: Config,
): [Required<FmtOptions>, string] {
  if (config.fmt !== null) {
    return [
      { ...DEFAULT_FMT_OPTIONS, ...config.fmt.options },
      "inline fmt in wiki config",
    ];
  }
  return [{ ...DEFAULT_FMT_OPTIONS }, "Wiki CLI fmt defaults"];
}

export function describeFmtSource(config: Config): string {
  return resolveFmtOptions(config)[1];
}

export function formatMarkdown(
  original: string,
  filePath: string,
  config: Config,
): string {
  const withoutBom = original.startsWith(BOM)
    ? original.slice(BOM.length)
    : original;
  const [options] = resolveFmtOptions(config);
  const formatted = formatMarkdownText(withoutBom, filePath, options);
  if (formatted !== withoutBom) {
    logger.debug(`formatted ${basename(filePath)}`);
  }
  return formatted;
}
