import type { Path } from "../fspath.ts";
import { readTextTolerant } from "../parser.ts";
import type { VirtualPage } from "./types.ts";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll(
      "'",
      "&#x27;",
    );
}

function templateText(path: Path | null): string {
  if (path !== null && path.isFile()) return readTextTolerant(path);
  return Deno.readTextFileSync(new URL("../index.html", import.meta.url));
}

export function renderLayout(
  title: string,
  baseUrl: string,
  content: string,
  templatePath: Path | null,
): string {
  const tokens = new Map([
    ["%wiki.base_url%", escapeHtml(baseUrl)],
    ["%wiki.body%", content],
    ["%wiki.head%", `<title>${escapeHtml(title)} - Wiki CLI</title>`],
  ]);
  let result = templateText(templatePath);
  for (
    const [token, value] of [...tokens].sort((left, right) =>
      right[0].length - left[0].length
    )
  ) {
    result = result.replaceAll(token, value);
  }
  return result;
}

export function renderPageLayout(
  page: VirtualPage,
  baseUrl: string,
  defaultLayout: Path | null,
): string {
  return renderLayout(
    page.title,
    baseUrl,
    page.html,
    page.layout_path ?? defaultLayout,
  );
}
