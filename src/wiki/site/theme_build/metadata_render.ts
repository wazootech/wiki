import { isExternalLink } from "../../links.ts";
import type { VirtualPage, WikiSite } from "../types.ts";
import { escapeHtml, type InfoboxRow } from "./defaults.ts";
import { renderLinkLike } from "./metadata_values.ts";

function renderMetadataValue(
  value: unknown,
  page: VirtualPage,
  site: WikiSite,
  baseUrl: string,
  urlStyle: string,
): [string, string] {
  if (value === null || value === undefined) return ["", ""];
  if (Array.isArray(value)) {
    const rendered = value.map((item) =>
      renderMetadataValue(item, page, site, baseUrl, urlStyle)
    ).filter((item) => item[1] !== "");
    if (rendered.length === 0) return ["", ""];
    const html = rendered.map(([, itemHtml]) =>
      itemHtml.includes('class="infobox-dict"')
        ? `<li class="infobox-list-block">${itemHtml}</li>`
        : `<li><span class="infobox-chip">${itemHtml}</span></li>`
    ).join("");
    return [
      rendered.map(([text]) => text).filter(Boolean).join(", "),
      `<ul class="infobox-list">${html}</ul>`,
    ];
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const targetId = record["@id"] ?? record.id;
    const label = record.name ?? targetId;
    if (typeof targetId === "string" && label) {
      return renderLinkLike(
        String(label),
        targetId,
        page,
        site,
        baseUrl,
        urlStyle,
      );
    }
    const rows: string[] = [];
    const texts: string[] = [];
    for (const [key, nestedValue] of Object.entries(record)) {
      if (key.startsWith("@")) continue;
      const [text, html] = renderMetadataValue(
        nestedValue,
        page,
        site,
        baseUrl,
        urlStyle,
      );
      if (html === "") continue;
      rows.push(
        `<div class="infobox-dict-row"><span class="infobox-key">${
          escapeHtml(key)
        }</span><span>${html}</span></div>`,
      );
      if (text) texts.push(`${key}: ${text}`);
    }
    if (rows.length === 0) return ["", ""];
    return [
      texts.join("; "),
      `<div class="infobox-dict">${rows.join("")}</div>`,
    ];
  }
  if (typeof value === "boolean") {
    return [value ? "True" : "False", value ? "True" : "False"];
  }
  if (typeof value === "number") {
    return [String(value), escapeHtml(String(value))];
  }
  const text = String(value);
  if (isExternalLink(text) || text.includes(":")) {
    return renderLinkLike(text, text, page, site, baseUrl, urlStyle);
  }
  return [text, escapeHtml(text)];
}

function buildInfoboxRows(
  page: VirtualPage,
  site: WikiSite,
  baseUrl: string,
  urlStyle: string,
  hiddenFields: ReadonlySet<string>,
): InfoboxRow[] {
  const rows: InfoboxRow[] = [];
  for (const [key, value] of Object.entries(page.frontmatter)) {
    if (hiddenFields.has(key)) continue;
    const [text, html] = renderMetadataValue(
      value,
      page,
      site,
      baseUrl,
      urlStyle,
    );
    if (html !== "") rows.push({ label: key, text, html });
  }
  return rows;
}

export function buildInfoboxHtml(
  page: VirtualPage,
  site: WikiSite,
  baseUrl: string,
  urlStyle: string,
  hiddenFields: ReadonlySet<string>,
): string {
  const rows = buildInfoboxRows(page, site, baseUrl, urlStyle, hiddenFields);
  if (rows.length === 0) return "";
  const details = rows.map((row) =>
    `<dt>${escapeHtml(row.label)}</dt><dd>${row.html}</dd>`
  ).join("\n");
  return `<section class="infobox page-meta">
<h2>Infobox</h2>
<dl>
${details}
</dl>
</section>`;
}
