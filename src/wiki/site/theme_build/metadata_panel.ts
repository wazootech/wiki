import type { Config } from "../../config.ts";
import { exportFrontmatter } from "../../export.ts";
import type { MetadataView } from "../../schemas/metadata.ts";
import type { VirtualPage } from "../types.ts";
import { escapeHtml, type ThemeMetadataOptions } from "./defaults.ts";

function metadataViewDomId(page: VirtualPage): string {
  const safeSlug =
    (page.file_slug || "index").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(
      /^-+|-+$/g,
      "",
    ) || "index";
  return `metadata-format-${safeSlug.toLowerCase()}`;
}

/**
 * Wrap metadata text in the copyable `<pre>` the layout styles.
 *
 * `codeHtml` is inserted verbatim, so pass highlighted or escaped HTML.
 */
function renderCopyablePre(
  rawText: string,
  codeHtml: string,
  preClass = "",
  codeClass = "",
): string {
  const preClassAttribute = preClass ? ` class="${escapeHtml(preClass)}"` : "";
  const codeClassAttribute = codeClass
    ? ` class="${escapeHtml(codeClass)}"`
    : "";
  return `<pre data-copy="${
    escapeHtml(rawText)
  }"${preClassAttribute}><code${codeClassAttribute}>${codeHtml}</code></pre>\n`;
}

async function metadataText(
  page: VirtualPage,
  config: Config,
  view: MetadataView,
): Promise<string> {
  if (page.source_path === null) return "";
  const result = await exportFrontmatter(config, [page.source_path], {
    format: view.format,
    mode: view.mode,
  });
  if (!result.ok) {
    throw new Error(
      result.error_message ??
        `Could not export ${view.label} metadata for ${page.file_slug}`,
    );
  }
  if (view.format !== "json-ld") return result.output;
  const payload = JSON.parse(result.output) as { rdf: unknown };
  return typeof payload.rdf === "string"
    ? payload.rdf
    : JSON.stringify(payload.rdf, null, 2);
}

export async function buildMetadataPanelHtml(
  page: VirtualPage,
  config: Config,
  options:
    & Required<Pick<ThemeMetadataOptions, "views" | "selected_view">>
    & Pick<ThemeMetadataOptions, "note" | "highlight">,
): Promise<string> {
  if (Object.keys(page.frontmatter).length === 0) return "";
  const groupId = metadataViewDomId(page);
  const highlight = options.highlight ??
    ((text: string) => escapeHtml(text));
  const radios: string[] = [];
  const panels: string[] = [];
  for (const view of options.views) {
    const inputId = `${groupId}-${view.id}`;
    const checked = view.id === options.selected_view
      ? ' checked="checked"'
      : "";
    radios.push(
      `<input class="metadata-format-input" type="radio" name="${groupId}" id="${inputId}" value="${view.id}"${checked}><label class="metadata-format-label" for="${inputId}">${
        escapeHtml(view.label)
      }</label>`,
    );
    const text = await metadataText(page, config, view);
    panels.push(
      `<div class="metadata-format-panel metadata-format-panel-${view.id}">${
        renderCopyablePre(
          text,
          highlight(text, view),
          "highlight",
          `language-${view.lexer}`,
        )
      }</div>`,
    );
  }
  const note = options.note === false
    ? ""
    : `\n  <p class="metadata-format-note">RDF/XML serialization is deferred.</p>`;
  return `<section class="page-meta metadata-panel">
<div class="metadata-format-switch" role="group" aria-label="Metadata RDF format">
  <div class="metadata-format-toolbar">
    <span class="metadata-format-heading">Format</span>
    <div class="metadata-format-options">${radios.join("")}</div>
  </div>${note}
  <div class="metadata-format-panels">
    ${panels.join("\n    ")}
  </div>
</div>
</section>`;
}
