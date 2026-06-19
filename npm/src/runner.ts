import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { WikiCommandError, WikiSetupError } from "./errors";
import type { RunOptions, WikiCommandResult } from "./types";

const packageRoot = path.resolve(__dirname, "..", "..");
const venvDir = path.join(packageRoot, ".venv");

export function getVenvPython(): string {
  const exeName = process.platform === "win32" ? "python.exe" : "python";
  const scriptsDir = process.platform === "win32" ? "Scripts" : "bin";
  return path.join(venvDir, scriptsDir, exeName);
}

function venvIsReady(): boolean {
  const pythonExe = getVenvPython();
  if (!fs.existsSync(pythonExe)) return false;
  const result = spawnSync(pythonExe, ["-c", "import wiki; print('ok')"], {
    encoding: "utf-8",
    timeout: 10_000,
  });
  return result.status === 0;
}

export function ensurePythonReady(): string {
  if (venvIsReady()) return getVenvPython();

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const setup = require("../setup");
    setup();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WikiSetupError(`wazootech-wiki Python environment setup failed: ${message}`);
  }

  if (!venvIsReady()) {
    throw new WikiSetupError("wazootech-wiki Python environment is not usable after setup");
  }
  return getVenvPython();
}

export function runWiki(args: readonly string[], options: RunOptions = {}): Promise<WikiCommandResult> {
  const pythonExe = ensurePythonReady();
  const command = [pythonExe, "-m", "wiki", ...args];
  const child = spawn(pythonExe, ["-m", "wiki", ...args], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    signal: options.signal,
  });

  let stdout = "";
  let stderr = "";
  let settled = false;
  let timeout: NodeJS.Timeout | undefined;

  if (options.stdin !== undefined) {
    child.stdin?.end(options.stdin);
  }
  child.stdout?.setEncoding("utf-8");
  child.stderr?.setEncoding("utf-8");
  child.stdout?.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });

  return new Promise((resolve, reject) => {
    const finish = (result: WikiCommandResult): void => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (!result.ok && options.throwOnError !== false) {
        reject(new WikiCommandError(result));
        return;
      }
      resolve(result);
    };

    if (options.timeoutMs !== undefined) {
      timeout = setTimeout(() => {
        child.kill("SIGTERM");
        finish({ ok: false, exitCode: -1, stdout, stderr: `${stderr}\nCommand timed out`.trim(), command });
      }, options.timeoutMs);
    }

    child.on("error", (error) => {
      finish({ ok: false, exitCode: -1, stdout, stderr: error.message, command });
    });
    child.on("close", (code) => {
      const exitCode = code ?? -1;
      finish({ ok: exitCode === 0, exitCode, stdout, stderr, command });
    });
  });
}

export function spawnWiki(args: readonly string[], options: SpawnOptions = {}): ChildProcess {
  const pythonExe = ensurePythonReady();
  return spawn(pythonExe, ["-m", "wiki", ...args], {
    stdio: "inherit",
    ...options,
    env: { ...process.env, ...options.env },
  });
}
