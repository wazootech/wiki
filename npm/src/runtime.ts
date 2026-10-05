import { existsSync } from "node:fs";
import path from "node:path";
import { WikiSetupError } from "./errors";
import { createRequire } from "node:module";

const packageRoot = path.resolve(__dirname, "..", "..");

/** Build an invocation for the package-local Deno runtime and engine. */
export function denoInvocation(args: readonly string[] = []): {
  executable: string;
  args: string[];
} {
  let denoBin: string;
  const packageRequire = createRequire(path.join(packageRoot, "package.json"));
  try {
    denoBin = packageRequire("deno/install_api.cjs").runInstall();
  } catch {
    throw new WikiSetupError(
      "wazootech-wiki Deno runtime dependency is missing; reinstall the package",
    );
  }
  const denoConfig = path.join(packageRoot, "deno.json");
  const denoLock = path.join(packageRoot, "deno.lock");
  const cliEntry = path.join(packageRoot, "src", "wiki", "cli.ts");
  const requiredFiles = [denoBin, denoConfig, denoLock, cliEntry];
  const missing = requiredFiles.filter((file) => !existsSync(file));

  if (missing.length > 0) {
    throw new WikiSetupError(
      `wazootech-wiki Deno runtime is incomplete; missing: ${missing.join(", ")}`,
    );
  }

  return {
    executable: denoBin,
    args: [
      "run",
      "--allow-all",
      "--config",
      denoConfig,
      "--lock",
      denoLock,
      cliEntry,
      ...args,
    ],
  };
}
