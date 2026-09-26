import { spawn } from "node:child_process";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { createWikiCommand } from "./runtime";
import { WikiCommandError } from "./errors";
import type { RunOptions, WikiCommandResult } from "./types";

/** Execute a Wiki CLI command and collect its output.
 *
 * Spawns the bundled Deno runtime with the package-local TypeScript engine,
 * buffers stdout/stderr, and returns a typed result. Errors and timeouts
 * produce a {@link WikiCommandError}.
 *
 * @param args - Arguments to pass to the Wiki CLI.
 * @param options - Execution options (cwd, env, timeout, stdin, signal).
 */
export function runWiki(
  args: readonly string[],
  options: RunOptions = {},
): Promise<WikiCommandResult> {
  const command = createWikiCommand(args);
  const executable = command[0]!;
  const commandArgs = command.slice(1);
  const child = spawn(executable, commandArgs, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ["pipe", "pipe", "pipe"],
    signal: options.signal,
  });

  let stdout = "";
  let stderr = "";
  let settled = false;
  let timeout: NodeJS.Timeout | undefined;

  if (options.stdin === undefined) {
    child.stdin.end();
  } else {
    child.stdin.end(options.stdin);
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

/** Spawn a Wiki CLI command with inherited stdio.
 *
 * Unlike {@link runWiki} the child's stdio is connected to the parent
 * process, making it suitable for long-running commands such as
 * ``wiki serve``.
 *
 * @param args - Arguments to pass to the Wiki CLI.
 * @param options - Spawn options (cwd, env).
 * @returns The spawned child process.
 */
export function spawnWiki(
  args: readonly string[],
  options: SpawnOptions = {},
): ChildProcess {
  const command = createWikiCommand(args);
  const executable = command[0]!;
  const commandArgs = command.slice(1);
  return spawn(executable, commandArgs, {
    stdio: "inherit",
    ...options,
    env: { ...process.env, ...options.env },
  });
}
