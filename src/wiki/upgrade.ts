import { UpgradeError } from "./errors.ts";
import { basename, dirname, join, normalize } from "@std/path";

import { VERSION } from "./version.ts";

export const JSR_METADATA_URL = "https://jsr.io/@wazoo/wiki/meta.json";
export const JSR_PACKAGE = "@wazoo/wiki";
export const GITHUB_RELEASES_URL =
  "https://github.com/wazootech/wiki/releases/latest";

export interface UpgradeOptions {
  readonly checkOnly: boolean;
  readonly yes: boolean;
  readonly verbose: boolean;
}

export interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type InstallTarget =
  | { readonly kind: "global"; readonly root: string }
  | { readonly kind: "standalone"; readonly path: string }
  | { readonly kind: "non-global" };

export interface UpgradeDependencies {
  readonly fetchMetadata: (url: string) => Promise<Response>;
  readonly runCommand: (
    executable: string,
    args: readonly string[],
  ) => Promise<CommandResult>;
  readonly confirm: (message: string) => Promise<boolean>;
  readonly findInstallTarget: () => Promise<InstallTarget>;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly currentVersion: string;
  readonly denoExecutable: string;
}

interface ParsedVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly (string | number)[];
}

const VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const TEXT_DECODER = new TextDecoder();
const TEXT_ENCODER = new TextEncoder();

function parseVersion(version: string): ParsedVersion | null {
  const match = VERSION_PATTERN.exec(version);
  if (!match) return null;
  const prerelease = match[4]
    ? match[4].split(".").map((identifier) => {
      if (/^\d+$/.test(identifier)) {
        if (identifier.length > 1 && identifier.startsWith("0")) return null;
        return Number(identifier);
      }
      return identifier;
    })
    : [];
  if (prerelease.some((identifier) => identifier === null)) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: prerelease as (string | number)[],
  };
}

function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    if (left.prerelease.length === right.prerelease.length) return 0;
    return left.prerelease.length === 0 ? 1 : -1;
  }
  const sharedLength = Math.min(
    left.prerelease.length,
    right.prerelease.length,
  );
  for (let index = 0; index < sharedLength; index++) {
    const leftPart = left.prerelease[index]!;
    const rightPart = right.prerelease[index]!;
    if (leftPart === rightPart) continue;
    if (typeof leftPart === "number" && typeof rightPart === "number") {
      return leftPart < rightPart ? -1 : 1;
    }
    if (typeof leftPart === "number") return -1;
    if (typeof rightPart === "number") return 1;
    return leftPart < rightPart ? -1 : 1;
  }
  if (left.prerelease.length === right.prerelease.length) return 0;
  return left.prerelease.length < right.prerelease.length ? -1 : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function latestVersionFromMetadata(metadata: unknown): string {
  if (!isRecord(metadata) || !isRecord(metadata.versions)) {
    throw new UpgradeError("Invalid JSR package metadata: missing versions.");
  }
  const eligible: { version: string; parsed: ParsedVersion }[] = [];
  for (const [version, details] of Object.entries(metadata.versions)) {
    const parsed = parseVersion(version);
    if (!parsed || !isRecord(details) || details.yanked === true) continue;
    eligible.push({ version, parsed });
  }
  if (eligible.length === 0) {
    throw new UpgradeError("Invalid JSR package metadata: no usable versions.");
  }
  const stable = eligible.filter(({ parsed }) =>
    parsed.prerelease.length === 0
  );
  const candidates = stable.length > 0 ? stable : eligible;
  candidates.sort((left, right) => compareVersions(right.parsed, left.parsed));
  return candidates[0]!.version;
}

async function readLatestVersion(
  fetchMetadata: UpgradeDependencies["fetchMetadata"],
): Promise<string> {
  let response: Response;
  try {
    response = await fetchMetadata(JSR_METADATA_URL);
  } catch (error) {
    throw new UpgradeError(
      `Cannot reach JSR to check for updates: ${errorMessage(error)}.`,
      { cause: error },
    );
  }
  if (!response.ok) {
    if (response.status === 404) {
      throw new UpgradeError(
        `${JSR_PACKAGE} is not published on JSR (HTTP 404).`,
      );
    }
    throw new UpgradeError(
      `Cannot reach JSR to check for updates: HTTP ${response.status} ${response.statusText}.`,
    );
  }
  let metadata: unknown;
  try {
    metadata = await response.json();
  } catch (error) {
    throw new UpgradeError(
      `Invalid JSR package metadata: ${errorMessage(error)}.`,
      { cause: error },
    );
  }
  return latestVersionFromMetadata(metadata);
}

function quoteArgument(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function commandDescription(
  executable: string,
  args: readonly string[],
): string {
  return [executable, ...args].map(quoteArgument).join(" ");
}

async function runDenoCommand(
  executable: string,
  args: readonly string[],
): Promise<CommandResult> {
  const result = await new Deno.Command(executable, {
    args: [...args],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code: result.code,
    stdout: TEXT_DECODER.decode(result.stdout),
    stderr: TEXT_DECODER.decode(result.stderr),
  };
}

async function confirmDefaultYes(message: string): Promise<boolean> {
  if (!Deno.stdin.isTerminal()) {
    throw new Error(
      "confirmation required in a non-interactive session; rerun with --yes",
    );
  }
  const reader = Deno.stdin.readable.getReader();
  try {
    while (true) {
      await Deno.stdout.write(TEXT_ENCODER.encode(`${message} [Y/n] `));
      const chunks: Uint8Array[] = [];
      let byteCount = 0;
      let reachedLineEnd = false;
      while (!reachedLineEnd) {
        const { value, done } = await reader.read();
        if (done || !value) {
          throw new Error("confirmation input ended; rerun with --yes");
        }
        const newline = value.indexOf(10);
        const chunk = newline < 0 ? value : value.subarray(0, newline);
        chunks.push(chunk);
        byteCount += chunk.length;
        reachedLineEnd = newline >= 0;
      }
      const line = new Uint8Array(byteCount);
      let offset = 0;
      for (const chunk of chunks) {
        line.set(chunk, offset);
        offset += chunk.length;
      }
      const answer = TEXT_DECODER.decode(line).trim().toLowerCase();
      if (answer === "" || answer === "y" || answer === "yes") return true;
      if (answer === "n" || answer === "no") return false;
    }
  } finally {
    reader.releaseLock();
  }
}

function isDenoExecutable(path: string): boolean {
  return /^deno(?:[-.]|$)/i.test(basename(path));
}

function candidateNames(): readonly string[] {
  return Deno.build.os === "windows"
    ? ["wiki.cmd", "wiki.bat", "wiki.ps1", "wiki"]
    : ["wiki"];
}

async function isWikiDenoShim(path: string): Promise<boolean> {
  try {
    const text = await Deno.readTextFile(path);
    return /\bdeno(?:\.exe)?\b/i.test(text) &&
      /(?:jsr:|https:\/\/jsr\.io\/)@wazoo\/wiki(?:@|\/)/i.test(text);
  } catch {
    return false;
  }
}

async function findDefaultInstallTarget(): Promise<InstallTarget> {
  const executable = Deno.execPath();
  if (!isDenoExecutable(executable)) {
    return { kind: "standalone", path: executable };
  }
  try {
    const pathValue = Deno.env.get("PATH") ?? "";
    const separator = Deno.build.os === "windows" ? ";" : ":";
    const pathEntries = pathValue.split(separator).filter(Boolean);
    const configuredRoot = Deno.env.get("DENO_INSTALL_ROOT");
    const searchEntries = configuredRoot
      ? [join(configuredRoot, "bin"), ...pathEntries]
      : pathEntries;
    const seen = new Set<string>();
    for (const directory of searchEntries) {
      const normalizedDirectory = normalize(directory);
      if (seen.has(normalizedDirectory)) continue;
      seen.add(normalizedDirectory);
      for (const name of candidateNames()) {
        const candidate = join(normalizedDirectory, name);
        try {
          const info = await Deno.stat(candidate);
          if (!info.isFile) continue;
        } catch {
          continue;
        }
        if (await isWikiDenoShim(candidate)) {
          const root = configuredRoot &&
              normalize(join(configuredRoot, "bin")) === normalizedDirectory
            ? configuredRoot
            : dirname(normalizedDirectory);
          return { kind: "global", root };
        }
        return { kind: "non-global" };
      }
    }
  } catch {
    return { kind: "non-global" };
  }
  return { kind: "non-global" };
}

const defaultDependencies: UpgradeDependencies = {
  fetchMetadata: (url) =>
    fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    }),
  runCommand: runDenoCommand,
  confirm: confirmDefaultYes,
  findInstallTarget: findDefaultInstallTarget,
  stdout: (text) => console.log(text),
  stderr: (text) => console.error(text),
  currentVersion: VERSION,
  denoExecutable: Deno.execPath(),
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function updateUnavailableMessage(
  target: InstallTarget,
  latest: string,
): string {
  if (target.kind === "standalone") {
    return [
      "This is a standalone wiki binary; Deno install cannot replace it.",
      `Download the latest release from ${GITHUB_RELEASES_URL}`,
      "Verify SHA256SUMS, replace the binary, and ensure it is on your PATH.",
    ].join("\n");
  }
  return [
    "This wiki CLI is not installed as a global Deno command, so wiki upgrade cannot replace it.",
    "For an npm install, run npm update -g wazootech-wiki (global) or npm update wazootech-wiki (project-local).",
    "To install or update a global Deno command, run:",
    `  deno install --global --force --allow-all --name wiki jsr:@wazoo/wiki@${latest}/cli`,
  ].join("\n");
}

export async function runUpgrade(
  options: UpgradeOptions,
  dependencies: Partial<UpgradeDependencies> = {},
): Promise<number> {
  const deps = { ...defaultDependencies, ...dependencies };
  let latest: string;
  try {
    latest = await readLatestVersion(deps.fetchMetadata);
  } catch (error) {
    deps.stderr(`Error: ${errorMessage(error)}`);
    return 1;
  }

  const current = parseVersion(deps.currentVersion);
  if (!current) {
    deps.stderr(
      `Error: cannot determine current version (${deps.currentVersion}).`,
    );
    return 1;
  }
  const newest = parseVersion(latest);
  if (!newest) {
    deps.stderr(`Error: invalid latest version returned by JSR (${latest}).`);
    return 1;
  }
  const outdated = compareVersions(current, newest) < 0;
  if (outdated) {
    deps.stdout(`Update available: ${deps.currentVersion} -> ${latest}`);
  } else {
    deps.stdout(`You're up to date (${deps.currentVersion}).`);
  }

  if (options.checkOnly) return outdated ? 1 : 0;
  if (!outdated) return 0;

  if (!options.yes) {
    let confirmed: boolean;
    try {
      confirmed = await deps.confirm("Upgrade now?");
    } catch (error) {
      deps.stderr(`Error: ${errorMessage(error)}.`);
      return 1;
    }
    if (!confirmed) {
      deps.stdout("Upgrade cancelled.");
      return 0;
    }
  }

  let target: InstallTarget;
  try {
    target = await deps.findInstallTarget();
  } catch (error) {
    deps.stderr(
      `Upgrade failed: cannot determine installation target: ${
        errorMessage(error)
      }`,
    );
    return 1;
  }
  if (target.kind !== "global") {
    deps.stderr(`Error: ${updateUnavailableMessage(target, latest)}`);
    return 1;
  }

  const packageSpecifier = `jsr:@wazoo/wiki@${latest}/cli`;
  const commandArgs = [
    "install",
    "--global",
    "--force",
    "--no-config",
    "--allow-all",
    "--name",
    "wiki",
    "--root",
    target.root,
    packageSpecifier,
  ];
  if (options.verbose) {
    deps.stdout(
      `Running: ${commandDescription(deps.denoExecutable, commandArgs)}`,
    );
  }

  let result: CommandResult;
  try {
    result = await deps.runCommand(deps.denoExecutable, commandArgs);
  } catch (error) {
    deps.stderr(`Upgrade failed: ${errorMessage(error)}`);
    return 1;
  }
  if (options.verbose) {
    if (result.stdout) deps.stdout(result.stdout.trimEnd());
    if (result.stderr) deps.stderr(result.stderr.trimEnd());
  }
  if (result.code !== 0) {
    const details = [result.stderr.trim(), result.stdout.trim()].filter(Boolean)
      .join("\n");
    deps.stderr(
      `Upgrade failed (Deno exited with code ${result.code})${
        details ? `: ${details}` : "."
      }`,
    );
    return 1;
  }
  deps.stdout(`Upgraded to ${latest}.`);
  return 0;
}
