import { UpgradeError } from "../errors.ts";

interface ParsedVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly (string | number)[];
}

const VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function parseVersion(version: string): ParsedVersion | null {
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

export function compareVersions(
  left: ParsedVersion,
  right: ParsedVersion,
): number {
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function latestVersionFromMetadata(metadata: unknown): string {
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
