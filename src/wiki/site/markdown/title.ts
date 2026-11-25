import { parseHeadings } from "../../headings.ts";
import type { TocItem } from "../types.ts";

export function titleFromMarkdown(markdown: string, fallback: string): string {
  const heading = parseHeadings(markdown).find((item) => item.level === 1);
  if (heading !== undefined) return heading.text.trim();
  const stem = fallback ? fallback.split("/").at(-1) ?? "Index" : "Index";
  return stem.replaceAll("_", " ").replaceAll("-", " ").trim() || "Index";
}

function normalizeTitle(text: string): string {
  return text.trim().normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ");
}

function headingTextForTitle(text: string): string {
  return normalizeTitle(text.replace(/`([^`\n]+)`/g, "$1"));
}

function stripLeadingTitleHeading(markdown: string, title: string): string {
  if (normalizeTitle(title) === "") return markdown;
  const lines = markdown.split("\n");
  let index = 0;
  while (index < lines.length && lines[index]!.trim() === "") index += 1;
  const line = lines[index];
  const match = line === undefined ? null : /^(#{1,6})\s+(.+)$/.exec(line);
  if (match === null || match[1]!.length !== 1) return markdown;
  if (headingTextForTitle(match[2]!) !== normalizeTitle(title)) return markdown;
  index += 1;
  while (index < lines.length && lines[index]!.trim() === "") index += 1;
  return lines.slice(index).join("\n");
}

export function outlineForMarkdown(markdown: string): TocItem[] {
  return parseHeadings(markdown)
    .filter((heading) => heading.level >= 2 && heading.level <= 6)
    .map((heading) => ({
      title: heading.text.trim(),
      slug: heading.slug,
      level: heading.level,
    }));
}

export function stripLeadingTitle(markdown: string, title: string): string {
  return stripLeadingTitleHeading(markdown, title);
}
