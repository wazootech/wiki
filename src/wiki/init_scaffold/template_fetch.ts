import { join, resolve } from "@std/path";
import { isDirectory, pathExists } from "../fspath.ts";
import { errorText } from "../errors.ts";
import type { ScaffoldResult } from "../schemas/reports.ts";
import { conflict, ensureDirectory } from "./fs_ops.ts";
import {
  cloneTemplateRepository,
  TEMPLATE_NAME_PATTERN,
  type TemplateDependencies,
  templateEntries,
  WIKI_TEMPLATES_REPO,
} from "./template_repo.ts";
import {
  availableTemplateNames,
  copyTemplateFile,
  removeTemplateDirectory,
  resolveTemplateDir,
  templateFailure,
} from "./template_files.ts";

export function fetchTemplate(
  targetDirectory: string,
  templateName: string,
  dependencies: TemplateDependencies = {},
): ScaffoldResult {
  if (!TEMPLATE_NAME_PATTERN.test(templateName)) {
    return templateFailure(`Invalid template name '${templateName}'.`);
  }

  const root = resolve(targetDirectory);
  if (pathExists(root) && !isDirectory(root)) {
    return templateFailure(`${root} exists and is not a directory.`);
  }
  const existingConflict = conflict(root);
  if (existingConflict !== null) return templateFailure(existingConflict);

  const tempRoot = Deno.makeTempDirSync({ prefix: "wiki-template-" });
  const cloneDir = join(tempRoot, "wiki-templates");
  const created: string[] = [];
  try {
    const clone = (dependencies.cloneRepository ?? cloneTemplateRepository)(
      cloneDir,
    );
    if (clone.code !== 0) {
      const details = clone.stderr.trim();
      return templateFailure(
        details
          ? `Failed to clone ${WIKI_TEMPLATES_REPO}: ${details}`
          : `Failed to clone ${WIKI_TEMPLATES_REPO}.`,
      );
    }
    const templateDir = resolveTemplateDir(cloneDir, templateName);
    if (templateDir === null) {
      const available = availableTemplateNames(cloneDir);
      return templateFailure(
        `Template '${templateName}' not found in wiki-templates. Available: ${
          available.join(", ")
        }`,
      );
    }

    const entries = templateEntries(templateDir);
    if (entries.length === 0) {
      return templateFailure(`Template '${templateName}' is empty.`);
    }
    for (const entry of entries) {
      const destination = join(root, ...entry.path);
      if (pathExists(destination)) {
        return templateFailure(
          `Template path '${destination}' already exists. Use a new directory or remove the conflicting path.`,
        );
      }
    }

    ensureDirectory(root, created);
    const written: string[] = [];
    for (const entry of entries) {
      const destination = join(root, ...entry.path);
      if (entry.directory) {
        Deno.mkdirSync(destination);
        created.push(destination);
      } else {
        copyTemplateFile(entry.source, destination, created);
        written.push(destination);
      }
    }
    return {
      ok: true,
      written_paths: written,
      message:
        `Initialized wiki from template '${templateName}' (wazootech/wiki-templates).`,
    };
  } catch (error) {
    return templateFailure(
      `Failed to initialize from template '${templateName}': ${
        errorText(error)
      }`,
      created,
    );
  } finally {
    try {
      removeTemplateDirectory(tempRoot);
    } catch (error) {
      console.error(
        `Warning: could not remove template checkout ${tempRoot}: ${
          errorText(error)
        }`,
      );
    }
  }
}
