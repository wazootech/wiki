import { basename, dirname, join, normalize } from "@std/path";
import { VERSION } from "../version.ts";
import {
  ALTERNATE_CHANNELS,
  GITHUB_RELEASES_URL,
  type InstallTarget,
  PYPI_UPGRADE,
  type UpgradeDependencies,
} from "./types.ts";
import { confirmDefaultYes, runDenoCommand } from "./process.ts";
import { isPypiInstall } from "./pypi.ts";

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
    return isPypiInstall(executable)
      ? { kind: "pypi", path: executable }
      : { kind: "standalone", path: executable };
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

export const defaultDependencies: UpgradeDependencies = {
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

export function updateUnavailableMessage(
  target: InstallTarget,
  latest: string,
): string {
  if (target.kind === "pypi") {
    return [
      "This wiki binary was installed from PyPI (wazootech-wiki), so wiki upgrade cannot replace it.",
      PYPI_UPGRADE,
    ].join("\n");
  }
  if (target.kind === "standalone") {
    return [
      "This is a standalone wiki binary; Deno install cannot replace it.",
      `Download the latest release from ${GITHUB_RELEASES_URL}`,
      "Verify SHA256SUMS, replace the binary, and ensure it is on your PATH.",
      // On Windows, `uv tool` and `pipx` copy the binary out of the venv, so
      // `isPypiInstall` cannot see its RECORD; name the PyPI route anyway.
      `If it came from PyPI, upgrade it there instead. ${PYPI_UPGRADE}`,
    ].join("\n");
  }
  return [
    "This wiki CLI is not installed as a global Deno command, so wiki upgrade cannot replace it.",
    ALTERNATE_CHANNELS[0]!,
    "To install or update a global Deno command, run:",
    `  deno install --global --force --allow-all --name wiki jsr:@wazoo/wiki@${latest}/cli`,
  ].join("\n");
}
