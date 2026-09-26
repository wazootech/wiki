import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { WikiSetupError } from "./errors";

const packageRoot = path.resolve(__dirname, "..", "..");
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
    throw new WikiSetupError(
      `Unable to start the bundled Deno runtime: ${detail}. Reinstall wazootech-wiki to restore its runtime dependency.`,
    );
  }
}

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
