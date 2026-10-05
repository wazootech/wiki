import { spawn } from "node:child_process";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { WikiCommandError } from "./errors";
import { denoInvocation } from "./runtime";
import type { RunOptions, WikiCommandResult } from "./types";

/** Execute a Wiki command and collect its output. */
export function runWiki(
  args: readonly string[],
  options: RunOptions = {},
): Promise<WikiCommandResult> {
  const invocation = denoInvocation(args);
  const command = [invocation.executable, ...invocation.args];
  const child = spawn(invocation.executable, invocation.args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    signal: options.signal,
  });

  let stdout = "";
  let stderr = "";
  let settled = false;
  let timeout: NodeJS.Timeout | undefined;

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

    if (options.stdin !== undefined) child.stdin?.end(options.stdin);

    if (options.timeoutMs !== undefined) {
      timeout = setTimeout(() => {
        child.kill("SIGTERM");
        finish({
          ok: false,
          exitCode: -1,
          stdout,
          stderr: `${stderr}\nCommand timed out`.trim(),
          command,
        });
      }, options.timeoutMs);
    }

    child.on("error", (error) => {
      finish({
        ok: false,
        exitCode: -1,
        stdout,
        stderr: error.message,
        command,
      });
    });
    child.on("close", (code) => {
      const exitCode = code ?? -1;
      finish({ ok: exitCode === 0, exitCode, stdout, stderr, command });
    });
  });
}

/** Spawn a Wiki command with inherited stdio. */
export function spawnWiki(
  args: readonly string[],
  options: SpawnOptions = {},
): ChildProcess {
  const invocation = denoInvocation(args);
  return spawn(invocation.executable, invocation.args, {
    stdio: "inherit",
    ...options,
    env: { ...process.env, ...options.env },
  });
}
