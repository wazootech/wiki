import { join } from "@std/path";
import { errorText } from "../errors.ts";
import { decoder } from "./options.ts";

export interface TemplateCloneResult {
  readonly code: number;
  readonly stderr: string;
}

export interface TemplateDependencies {
  readonly cloneRepository?: (destination: string) => TemplateCloneResult;
}

interface TemplateEntry {
  readonly source: string;
  readonly path: readonly string[];
  readonly directory: boolean;
}

export const WIKI_TEMPLATES_REPO =
  "https://github.com/wazootech/wiki-templates.git";
export const WIKI_TEMPLATES_DIR = "templates";
export const TEMPLATE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function cloneTemplateRepository(
  destination: string,
): TemplateCloneResult {
  try {
    const result = new Deno.Command("git", {
      args: [
        "clone",
        "--depth",
        "1",
        "--branch",
        "main",
        WIKI_TEMPLATES_REPO,
        destination,
      ],
      stdout: "null",
      stderr: "piped",
    }).outputSync();
    return { code: result.code, stderr: decoder.decode(result.stderr) };
  } catch (error) {
    return {
      code: 1,
      stderr: errorText(error),
    };
  }
}

export function templateEntries(
  directory: string,
  parent: readonly string[] = [],
  topLevel = true,
  result: TemplateEntry[] = [],
): TemplateEntry[] {
  for (const entry of Deno.readDirSync(directory)) {
    if (topLevel && entry.name.startsWith(".") && entry.name !== ".gitignore") {
      continue;
    }
    const source = join(directory, entry.name);
    if (entry.isSymlink) {
      throw new Error(
        `Template entry '${
          [...parent, entry.name].join("/")
        }' is a symlink and cannot be copied safely.`,
      );
    }
    const path = [...parent, entry.name];
    if (entry.isDirectory) {
      result.push({ source, path, directory: true });
      templateEntries(source, path, false, result);
    } else if (entry.isFile) {
      result.push({ source, path, directory: false });
    }
  }
  return result;
}
