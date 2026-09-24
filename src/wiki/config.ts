/**
 * Central config: the module every other port imports the wiki configuration
 * from.
 *
 * Port of `src/wiki/config.py`, which exists mainly to re-export from the
 * schemas package and to hold the two default config blocks. Keeping the same
 * one-hop shape means call sites in the port look like call sites in the
 * original, which is what makes a diff between them readable.
 */

import { Context, DEFAULT_NAMESPACES } from "./context.ts";
import {
  type CheckConfig,
  defaultCheckConfig,
  defaultLintConfig,
  type LintConfig,
} from "./schemas/rules.ts";

export { Context, DEFAULT_NAMESPACES };
export {
  Config,
  CONFIG_FILENAMES,
  DEFAULT_BASE_URL,
  DEFAULT_LINK_STYLE,
  DEFAULT_URL_STYLE,
  findConfigPath,
  formatConfigValidationError,
  normalizeApiPath,
  normalizeUrlStyle,
  VALID_URL_STYLES,
} from "./schemas/wiki_config.ts";
export type { FmtConfig } from "./schemas/wiki_config.ts";

/** The filename pattern the shipped scaffolds use. */
export const DEFAULT_FILENAME_PATTERN = "[A-Za-z0-9_()-]+\\.md";

/** The default `check:` block. */
export const DEFAULT_CHECK_CONFIG: CheckConfig = defaultCheckConfig();

/** The default `lint:` block. */
export const DEFAULT_LINT_CONFIG: LintConfig = defaultLintConfig();
