import { join, resolve } from "@std/path";
import { isDirectory, pathExists } from "./fspath.ts";
import { errorText } from "./errors.ts";
import type { ScaffoldResult } from "./schemas/reports.ts";
import {
  GITIGNORE_TEMPLATE,
  type InitOptions,
  README_TEMPLATE,
  type ScaffoldSettings,
} from "./init_scaffold/options.ts";
import { defaultGitRunner } from "./init_scaffold/github.ts";
import { renderWikiYaml } from "./init_scaffold/wiki_yaml.ts";
import {
  conflict,
  ensureDirectory,
  removeIfPresent,
  rollback,
  writeNewFile,
} from "./init_scaffold/fs_ops.ts";

export {
  INIT_OPTIONS_TO_CONFIG_PATH,
  type InitOptions,
  type ResolveInitOptions,
  type ScaffoldSettings,
} from "./init_scaffold/options.ts";
export { normalizeBaseUrl } from "./init_scaffold/normalize.ts";
export {
  detectOriginRepo,
  inferGithubPagesUrls,
  parseGithubRepo,
} from "./init_scaffold/github.ts";
export {
  mapInitOptionsToConfig,
  resolveInitOptions,
} from "./init_scaffold/resolve.ts";
export { renderWikiYaml } from "./init_scaffold/wiki_yaml.ts";
export {
  type TemplateCloneResult,
  type TemplateDependencies,
} from "./init_scaffold/template_repo.ts";
export { fetchTemplate } from "./init_scaffold/template_fetch.ts";

export function scaffoldWiki(
  targetDirectory: string,
  initOptions: InitOptions,
  settings: ScaffoldSettings = {},
): ScaffoldResult {
  const root = resolve(targetDirectory);
  const created: string[] = [];
  let gitDirectory: string | null = null;
  let gitExisted = false;
  const failure = (errorMessage: string): ScaffoldResult => {
    const rollbackErrors: string[] = [];
    if (gitDirectory !== null && !gitExisted && pathExists(gitDirectory)) {
      const gitRollbackError = removeIfPresent(gitDirectory, true);
      if (gitRollbackError !== null) rollbackErrors.push(gitRollbackError);
    }
    rollbackErrors.push(...rollback(created));
    if (rollbackErrors.length > 0) {
      errorMessage += `; rollback incomplete: ${rollbackErrors.join("; ")}`;
    }
    return {
      ok: false,
      written_paths: [],
      message: "",
      error_message: errorMessage,
    };
  };

  try {
    if (pathExists(root) && !isDirectory(root)) {
      return {
        ok: false,
        written_paths: [],
        message: "",
        error_message: `${root} exists and is not a directory.`,
      };
    }
    const initialConflict = pathExists(root) ? conflict(root) : null;
    if (initialConflict !== null) {
      return {
        ok: false,
        written_paths: [],
        message: "",
        error_message: initialConflict,
      };
    }

    ensureDirectory(root, created);
    const afterCreateConflict = conflict(root);
    if (afterCreateConflict !== null) return failure(afterCreateConflict);

    const writtenPaths: string[] = [];
    const gitignorePath = join(root, ".gitignore");
    if (!pathExists(gitignorePath)) {
      writeNewFile(gitignorePath, GITIGNORE_TEMPLATE, created);
      writtenPaths.push(gitignorePath);
    }

    const readmePath = join(root, "README.md");
    writeNewFile(readmePath, README_TEMPLATE, created);
    writtenPaths.push(readmePath);

    const wikiDirectory = join(root, "wiki");
    if (!pathExists(wikiDirectory)) {
      Deno.mkdirSync(wikiDirectory);
      created.push(wikiDirectory);
    }
    writtenPaths.push(wikiDirectory);

    const configPath = join(root, "wiki.yml");
    writeNewFile(configPath, renderWikiYaml(initOptions), created);
    writtenPaths.push(configPath);

    if (settings.init_git === true) {
      gitDirectory = join(root, ".git");
      gitExisted = pathExists(gitDirectory);
      let result: { code: number; stderr: string };
      try {
        result = (settings.git_runner ?? defaultGitRunner)(root);
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          return failure(
            "git was requested with --git, but no git executable was found on PATH.",
          );
        }
        return failure(
          `git init failed: ${errorText(error)}`,
        );
      }
      if (result.code !== 0) {
        const stderr = result.stderr.trim() || "unknown git init error";
        return failure(`git init failed: ${stderr}`);
      }
    }

    let message =
      "Initialized wiki config, README.md, and an empty wiki/ directory.";
    if (settings.init_git === true) message += " Ran git init.";
    return {
      ok: true,
      config_path: configPath,
      written_paths: writtenPaths,
      message,
    };
  } catch (error) {
    return failure(
      `Failed to scaffold wiki: ${errorText(error)}`,
    );
  }
}
