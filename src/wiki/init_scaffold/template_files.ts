import { join } from "@std/path";
import { isDirectory, isSymlink } from "../fspath.ts";
import type { ScaffoldResult } from "../schemas/reports.ts";
import { rollback } from "./fs_ops.ts";
import { WIKI_TEMPLATES_DIR } from "./template_repo.ts";

export function copyTemplateFile(
  source: string,
  destination: string,
  created: string[],
): void {
  const bytes = Deno.readFileSync(source);
  const file = Deno.openSync(destination, {
    write: true,
    createNew: true,
  });
  created.push(destination);
  try {
    let offset = 0;
    while (offset < bytes.length) {
      const written = file.writeSync(bytes.subarray(offset));
      if (written === 0) {
        throw new Error(`Could not finish writing ${destination}`);
      }
      offset += written;
    }
  } finally {
    file.close();
  }
  const mode = Deno.statSync(source).mode;
  if (mode !== null) Deno.chmodSync(destination, mode & 0o777);
}

export function removeTemplateDirectory(path: string): void {
  try {
    Deno.removeSync(path, { recursive: true });
  } catch (firstError) {
    const makeWritable = (entry: string): void => {
      if (isSymlink(entry)) return;
      if (isDirectory(entry)) {
        for (const child of Deno.readDirSync(entry)) {
          makeWritable(join(entry, child.name));
        }
      }
      const mode = Deno.statSync(entry).mode;
      if (mode !== null) Deno.chmodSync(entry, mode | 0o200);
    };
    try {
      makeWritable(path);
      Deno.removeSync(path, { recursive: true });
    } catch {
      throw firstError;
    }
  }
}

export function templateFailure(
  errorMessage: string,
  created: readonly string[] = [],
): ScaffoldResult {
  const rollbackErrors = rollback(created);
  if (rollbackErrors.length > 0) {
    errorMessage += `; rollback incomplete: ${rollbackErrors.join("; ")}`;
  }
  return {
    ok: false,
    written_paths: [],
    message: "",
    error_message: errorMessage,
  };
}

export function resolveTemplateDir(
  cloneDir: string,
  templateName: string,
): string | null {
  for (
    const candidate of [
      join(cloneDir, WIKI_TEMPLATES_DIR, templateName),
      join(cloneDir, templateName),
    ]
  ) {
    if (isDirectory(candidate) && !isSymlink(candidate)) return candidate;
  }
  return null;
}

export function availableTemplateNames(cloneDir: string): string[] {
  const templatesDir = join(cloneDir, WIKI_TEMPLATES_DIR);
  const listingDir = isDirectory(templatesDir) && !isSymlink(templatesDir)
    ? templatesDir
    : cloneDir;
  return [...Deno.readDirSync(listingDir)]
    .filter((entry) => entry.isDirectory && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .filter((name) => name !== WIKI_TEMPLATES_DIR)
    .sort();
}
