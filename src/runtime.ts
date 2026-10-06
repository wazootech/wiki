import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

/** Thrown when the bundled Deno runtime or local Wiki engine cannot start. */
export class WikiSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WikiSetupError";
  }
}

const packageRoot = path.resolve(__dirname, "..");
const packageRequire = createRequire(path.join(packageRoot, "package.json"));
const engineEntry = path.join(packageRoot, "src", "wiki", "cli.ts");
const denoConfig = path.join(packageRoot, "deno.json");
const denoLock = path.join(packageRoot, "deno.lock");
let denoExecutable: string | undefined;

export function getDenoExecutable(): string {
  if (denoExecutable) return denoExecutable;
  try {
    const installApiPath = packageRequire.resolve("deno/install_api.cjs");
    const installApi = packageRequire(installApiPath) as {
      runInstall(): string;
    };
    denoExecutable = installApi.runInstall();
    if (!fs.existsSync(denoExecutable)) {
      throw new Error(`Deno executable not found at ${denoExecutable}`);
    }
    return denoExecutable;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (isUnsupportedPlatform(detail)) {
      // A reinstall cannot fix this: the platform itself has no Deno binary.
      throw new WikiSetupError(
        `Unable to start the bundled Deno runtime: ${detail}. ` +
          `wazootech-wiki ships the platform-matched Deno runtime for ` +
          `Windows/macOS/Linux on x64 or ARM64 (Linux needs glibc); ` +
          `this platform is not supported, so reinstalling changes nothing. ` +
          `Run the Wiki engine from a Deno source checkout instead.`,
      );
    }
    throw new WikiSetupError(
      `Unable to start the bundled Deno runtime: ${detail}. Reinstall wazootech-wiki to restore its runtime dependency.`,
    );
  }
}

/**
 * `true` when the install failure is about the platform, not the install.
 *
 * The `deno` package's installer throws `Musl is not supported` on musl
 * Linux and `Unsupported architecture` off x64/ARM64; matching on those
 * messages is the only signal it gives, and both are pinned by the
 * `deno@2.9.6` dependency.
 */
function isUnsupportedPlatform(detail: string): boolean {
  return (
    detail.includes("Musl is not supported") ||
    detail.includes("Unsupported architecture")
  );
}

/**
 * Build the argv that runs the packaged Wiki CLI under the bundled Deno.
 *
 * This exists for `bin/wiki.js` alone. The engine is Deno-only — it uses
 * `Deno.*` globals and `.ts` import extensions Node cannot resolve — so the
 * executable has to shell out. It is deliberately *not* a library entrypoint:
 * library consumers embed `src/wiki/mod.ts` and call the engine in process,
 * because a subprocess wrapper can only return exit codes and captured
 * strings where the real API returns typed results.
 */
export function createWikiCommand(args: readonly string[]): string[] {
  const packagedFiles: readonly [string, string][] = [
    ["Deno config", denoConfig],
    ["Deno lockfile", denoLock],
    ["Wiki engine", engineEntry],
  ];
  for (const [name, filePath] of packagedFiles) {
    if (!fs.existsSync(filePath)) {
      throw new WikiSetupError(
        `The packaged ${name} is missing at ${filePath}. Reinstall wazootech-wiki.`,
      );
    }
  }
  return [
    getDenoExecutable(),
    "run",
    "--node-modules-dir=none",
    "--allow-all",
    "--config",
    denoConfig,
    "--lock",
    denoLock,
    "--frozen",
    engineEntry,
    ...args,
  ];
}
