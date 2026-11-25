import type { CommandResult } from "./types.ts";

const TEXT_DECODER = new TextDecoder();
const TEXT_ENCODER = new TextEncoder();

function quoteArgument(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function commandDescription(
  executable: string,
  args: readonly string[],
): string {
  return [executable, ...args].map(quoteArgument).join(" ");
}

export async function runDenoCommand(
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

export async function confirmDefaultYes(message: string): Promise<boolean> {
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
