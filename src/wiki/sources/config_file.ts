import { basename, extname } from "@std/path";
import { pathExists } from "../fspath.ts";
import { parse as parseToml } from "@std/toml";
import { parse as parseYaml } from "@std/yaml";
import { isSeq, parseDocument } from "yaml";
import type { Config } from "../config.ts";
import { readTextTolerant } from "../parser.ts";
import { describeValue } from "../describe.ts";
import type { SourceConfig } from "../schemas/sources.ts";
import { configPath, isRecord } from "./basics.ts";

export function loadDataFile(path: string): Record<string, unknown> {
  const raw = readTextTolerant(path);
  let data: unknown;
  if (extname(path).toLowerCase() === ".json") data = JSON.parse(raw);
  else if (extname(path).toLowerCase() === ".toml") data = parseToml(raw);
  else data = parseYaml(raw);
  if (!isRecord(data)) {
    throw new Error(`${basename(path)}: top-level content must be a mapping`);
  }
  return data;
}

function requireYamlConfig(path: string): void {
  if (extname(path).toLowerCase() === ".toml") {
    throw new Error(
      "Source management requires a YAML config file. " +
        "Edit wiki.toml manually or use wiki.yml for source management.",
    );
  }
}

function writeYamlConfig(path: string, data: Record<string, unknown>): void {
  const source = readTextTolerant(path);
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new Error(
      `${basename(path)}: ${
        document.errors.map((error) => error.message).join("; ")
      }`,
    );
  }

  const nextSources = data["sources"];
  const currentSources = document.get("sources", true);
  if (nextSources === undefined) {
    document.delete("sources");
  } else if (isSeq(currentSources) && Array.isArray(nextSources)) {
    const previous = currentSources.toJSON() as unknown[];
    if (nextSources.length === previous.length + 1) {
      const names = new Set(
        previous.filter(isRecord).map((entry) => entry["name"]),
      );
      const added = nextSources.find((entry) =>
        isRecord(entry) && !names.has(entry["name"])
      );
      if (added === undefined) document.set("sources", nextSources);
      else currentSources.add(added);
    } else if (nextSources.length === previous.length - 1) {
      const names = new Set(
        nextSources.filter(isRecord).map((entry) => entry["name"]),
      );
      const removedIndex = previous.findIndex((entry) =>
        isRecord(entry) && !names.has(entry["name"])
      );
      if (removedIndex < 0) document.set("sources", nextSources);
      else currentSources.items.splice(removedIndex, 1);
    } else {
      document.set("sources", nextSources);
    }
  } else {
    document.set("sources", nextSources);
  }

  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const serialized = document.toString({
    flowCollectionPadding: false,
    lineWidth: 0,
  });
  Deno.writeTextFileSync(
    path,
    newline === "\n" ? serialized : serialized.replaceAll("\n", newline),
  );
}

export function addToConfig(config: Config, source: SourceConfig): void {
  const path = configPath(config);
  requireYamlConfig(path);
  if (!pathExists(path)) throw new Error("No wiki config file found");

  const data = loadDataFile(path);
  const rawSources = data["sources"];
  const sources = rawSources == null ? [] : rawSources;
  if (!Array.isArray(sources)) {
    throw new Error("sources must be a list in the config file");
  }
  for (const existing of sources) {
    if (isRecord(existing) && existing["name"] === source.name) {
      throw new Error(
        `Source ${
          describeValue(source.name)
        } already exists in the config file`,
      );
    }
  }

  const entry: Record<string, unknown> = {
    name: source.name,
    type: "git",
    url: source.url,
  };
  if (source.ref) entry["ref"] = source.ref;
  if (source.path) entry["path"] = source.path;
  sources.push(entry);
  data["sources"] = sources;
  writeYamlConfig(path, data);
}

export function removeFromConfig(config: Config, name: string): void {
  const path = configPath(config);
  requireYamlConfig(path);
  if (!pathExists(path)) return;

  const data = loadDataFile(path);
  const sources = data["sources"];
  if (!Array.isArray(sources)) return;

  const remaining = sources.filter((entry) =>
    !(isRecord(entry) && entry["name"] === name)
  );
  if (remaining.length === sources.length) {
    throw new Error(`Source ${describeValue(name)} not found in config file`);
  }
  if (remaining.length > 0) data["sources"] = remaining;
  else delete data["sources"];
  writeYamlConfig(path, data);
}
