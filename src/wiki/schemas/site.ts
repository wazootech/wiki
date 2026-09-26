import type { Config } from "./wiki_config.ts";

export interface TocItem {
  readonly title: string;
  readonly slug: string;
  readonly level: number;
}

export interface VirtualPage {
  readonly file_slug: string;
  readonly title: string;
  readonly markdown: string;
  readonly html: string;
  readonly frontmatter: Record<string, unknown>;
  readonly source_path: string | null;
  readonly layout_path: string | null;
  readonly layout_stem: string;
  readonly wiki_ids: readonly string[];
  readonly outline: readonly TocItem[];
  readonly backlink_slugs: readonly string[];
}

export interface WikiSite {
  readonly pages: readonly VirtualPage[];
  readonly config: Config;
  readonly pages_by_route: ReadonlyMap<string, VirtualPage>;
  readonly routes_by_wiki_id: ReadonlyMap<string, string>;
}
