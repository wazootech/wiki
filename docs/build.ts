/**
 * The docs theme for this repository's own wiki (`docs/wiki.yml`).
 *
 * The flow lives in `@wazoo/wiki/theme` (`buildThemeSite`); this file is the
 * theme: which layouts to read, the title suffix, and the two tokens that only
 * a repository with a GitHub remote can fill — the edit link and the redirect
 * target. Keeping this file thin is the point of #409: a template and this
 * repository should not each reimplement the page loop.
 */

import { dirname, fromFileUrl, join, resolve } from "@std/path";
import {
  buildThemedSite,
  Config,
  escapeHtml,
  pageUrl,
  relativeWithin,
  type ThemePageContext,
} from "../src/wiki/theme.ts";

const DOCS_DIR = dirname(fromFileUrl(import.meta.url));
const REPO_ROOT = dirname(DOCS_DIR);
const GITHUB_REPO = "wazootech/wiki";
const GITHUB_BRANCH = "main";

export interface DocsBuildOptions {
  docsDir?: string;
  repoRoot?: string | null;
}

/** Page-menu item linking to the page's Markdown source on GitHub. */
function editLink(context: ThemePageContext, repoRoot: string | null): string {
  const page = context.page;
  if (repoRoot === null || page === null || page.source_path === null) {
    return "";
  }
  try {
    const path = relativeWithin(resolve(page.source_path), resolve(repoRoot))
      .replaceAll("\\", "/");
    const url =
      `https://github.com/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/${path}`;
    return `<li id="ca-edit"><a href="${
      escapeHtml(url)
    }" target="_blank">Edit this page</a></li>`;
  } catch {
    return "";
  }
}

/** Where a `redirect_to` page points, escaped for the `refresh` URL. */
function redirectUrl(context: ThemePageContext): string {
  const redirectTo = context.page === null
    ? ""
    : typeof context.page.frontmatter.redirect_to === "string"
    ? context.page.frontmatter.redirect_to
    : "";
  return redirectTo
    ? escapeHtml(pageUrl(context.baseUrl, redirectTo, context.urlStyle))
    : "";
}

export function buildDocsSite(
  config: Config,
  outputDir: string,
  options: DocsBuildOptions = {},
): Promise<number> {
  const docsDir = resolve(options.docsDir ?? DOCS_DIR);
  const repoRoot = options.repoRoot === undefined
    ? REPO_ROOT
    : options.repoRoot;
  return buildThemedSite(config, outputDir, {
    dir: docsDir,
    redirect_layout: join("layouts", "redirect.html"),
    title_suffix: " - Wiki",
    tokens: (context) =>
      new Map([
        ["%wiki.edit_link%", editLink(context, repoRoot)],
        ["%wiki.redirect_url%", redirectUrl(context)],
      ]),
  });
}

function parseOutputDir(args: string[]): string {
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--output-dir") {
      const value = args[index + 1];
      if (!value) throw new Error("--output-dir requires a path");
      return value;
    }
    if (args[index]?.startsWith("--output-dir=")) {
      return args[index]!.slice("--output-dir=".length);
    }
  }
  return "_site";
}

if (import.meta.main) {
  const config = Config.load(join(DOCS_DIR, "wiki.yml"));
  await buildDocsSite(config, parseOutputDir(Deno.args));
}
