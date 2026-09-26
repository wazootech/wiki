import { dirname, fromFileUrl, join } from "@std/path";

const ROOT = dirname(dirname(fromFileUrl(import.meta.url)));
const SEMVER = /^\d+\.\d+\.\d+$/;

interface VersionSurface {
  name: string;
  version: string;
  write(version: string): Promise<void>;
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${name} must contain a JSON object`);
  }
  return value as Record<string, unknown>;
}

async function jsonSurface(
  path: string,
  label: string,
): Promise<VersionSurface> {
  const file = join(ROOT, path);
  const parsed = record(JSON.parse(await Deno.readTextFile(file)), label);
  if (typeof parsed.version !== "string") {
    throw new Error(`${label} has no string version field`);
  }
  return {
    name: label,
    version: parsed.version,
    write: async (version) => {
      parsed.version = version;
      await Deno.writeTextFile(file, `${JSON.stringify(parsed, null, 2)}\n`);
    },
  };
}

async function packageLockSurface(): Promise<VersionSurface[]> {
  const file = join(ROOT, "package-lock.json");
  const parsed = record(
    JSON.parse(await Deno.readTextFile(file)),
    "package-lock.json",
  );
  const packages = record(parsed.packages, "package-lock.json packages");
  const rootPackage = record(packages[""], "package-lock.json root package");
  if (
    typeof parsed.version !== "string" ||
    typeof rootPackage.version !== "string"
  ) {
    throw new Error(
      "package-lock.json must have top-level and root package versions",
    );
  }
  const write = async (version: string) => {
    parsed.version = version;
    rootPackage.version = version;
    await Deno.writeTextFile(file, `${JSON.stringify(parsed, null, 2)}\n`);
  };
  return [
    { name: "package-lock.json", version: parsed.version, write },
    {
      name: "package-lock.json (root package)",
      version: rootPackage.version,
      write,
    },
  ];
}

async function sourceSurface(): Promise<VersionSurface> {
  const file = join(ROOT, "src/wiki/version.ts");
  const content = await Deno.readTextFile(file);
  const matches = [
    ...content.matchAll(/^export const VERSION = "([^"]+)";$/gm),
  ];
  if (matches.length !== 1) {
    throw new Error(
      "src/wiki/version.ts must contain one VERSION string export",
    );
  }
  const version = matches[0]![1]!;
  return {
    name: "src/wiki/version.ts",
    version,
    write: async (next) => {
      const updated = content.replace(
        /^export const VERSION = "[^"]+";$/m,
        `export const VERSION = "${next}";`,
      );
      await Deno.writeTextFile(file, updated);
    },
  };
}

async function docsSurface(): Promise<VersionSurface> {
  const file = join(ROOT, "docs/wiki/wiki.md");
  const content = await Deno.readTextFile(file);
  const matches = [...content.matchAll(/^softwareVersion:\s*(\S+)\s*$/gm)];
  if (matches.length !== 1) {
    throw new Error("docs/wiki/wiki.md must contain one softwareVersion field");
  }
  const version = matches[0]![1]!;
  return {
    name: "docs/wiki/wiki.md",
    version,
    write: async (next) => {
      await Deno.writeTextFile(
        file,
        content.replace(
          /^softwareVersion:\s*\S+\s*$/m,
          `softwareVersion: ${next}`,
        ),
      );
    },
  };
}

export async function versionSurfaces(): Promise<VersionSurface[]> {
  return [
    await jsonSurface("deno.json", "deno.json"),
    await jsonSurface("package.json", "package.json"),
    ...await packageLockSurface(),
    await sourceSurface(),
    await docsSurface(),
  ];
}

export async function checkVersions(): Promise<Map<string, string>> {
  const versions = await versionSurfaces();
  return new Map(versions.map(({ name, version }) => [name, version]));
}

export async function currentVersion(): Promise<string> {
  const versions = await versionSurfaces();
  const values = new Set(versions.map(({ version }) => version));
  if (values.size !== 1) {
    throw new Error(
      `Version mismatch detected:\n${
        versions.map(({ name, version }) => `  ${name}: ${version}`).join("\n")
      }`,
    );
  }
  const version = versions[0]?.version;
  if (version === undefined || !SEMVER.test(version)) {
    throw new Error(
      `Invalid version in release surfaces: ${version ?? "none"}`,
    );
  }
  return version;
}

export async function updateVersions(version: string): Promise<void> {
  if (!SEMVER.test(version)) {
    throw new Error(`Version must be X.Y.Z: ${version}`);
  }
  const surfaces = await versionSurfaces();
  for (const surface of surfaces) await surface.write(version);
  console.log(
    `Updated ${surfaces.map(({ name }) => name).join(", ")} -> ${version}`,
  );
}

async function main(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      "Usage: deno run -A scripts/set_version.ts <X.Y.Z> | --check [--github-output FILE]",
    );
    return;
  }
  const check = args[0] === "--check";
  let githubOutput: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--github-output") {
      githubOutput = args[index + 1];
      if (githubOutput === undefined) {
        throw new Error("--github-output requires a file path");
      }
      index += 1;
    }
  }
  if (check) {
    const version = await currentVersion();
    console.log(`All release version strings are in sync: ${version}`);
    if (githubOutput !== undefined) {
      await Deno.writeTextFile(githubOutput, `version=${version}\n`, {
        append: true,
      });
    }
    return;
  }
  if (args.length !== 1) {
    throw new Error(
      "Usage: deno run -A scripts/set_version.ts <X.Y.Z> | --check",
    );
  }
  await updateVersions(args[0]!);
}

if (import.meta.main) {
  try {
    await main(Deno.args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exitCode = 1;
  }
}
