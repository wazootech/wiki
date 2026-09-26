import { join, relative } from "@std/path";
import { normalizeTreePath, normalizeTreeText } from "./normalize.ts";

export interface TreeChange {
  readonly path: string;
  readonly kind: "created" | "changed" | "deleted";
  readonly beforeHash?: string;
  readonly afterHash?: string;
}

export interface TreeDiff {
  readonly digest: string;
  readonly changes: readonly TreeChange[];
}

export type TreeSnapshot = ReadonlyMap<string, string>;

const encoder = new TextEncoder();
const cacheDirectories = new Set([
  ".cache",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  "__pycache__",
]);

function isNondeterministicCachePath(path: string): boolean {
  const parts = normalizeTreePath(path).split("/");
  return parts.some((part, index) =>
    (part === ".wiki" && parts[index + 1] === "cache") ||
    cacheDirectories.has(part)
  );
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function digestFile(path: string, root: string): Promise<string> {
  const bytes = await Deno.readFile(path);
  let normalized = bytes;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    normalized = encoder.encode(normalizeTreeText(text, root));
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
  }
  return await sha256(normalized);
}

export async function snapshotTree(root: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();

  async function visit(directory: string): Promise<void> {
    for await (const entry of Deno.readDir(directory)) {
      const absolutePath = join(directory, entry.name);
      const path = normalizeTreePath(relative(root, absolutePath));
      if (isNondeterministicCachePath(path)) continue;
      if (entry.isDirectory) {
        await visit(absolutePath);
      } else if (entry.isFile) {
        snapshot.set(path, await digestFile(absolutePath, root));
      } else if (entry.isSymlink) {
        const target = await Deno.readLink(absolutePath);
        snapshot.set(path, await sha256(encoder.encode(target)));
      }
    }
  }

  await visit(root);
  return new Map(
    [...snapshot].sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0
    ),
  );
}

function normalizeSnapshot(snapshot: TreeSnapshot): Map<string, string> {
  const normalized = new Map<string, string>();
  for (const [rawPath, hash] of snapshot) {
    const path = normalizeTreePath(rawPath);
    if (normalized.has(path)) {
      throw new Error(
        `tree snapshot contains duplicate normalized path: ${path}`,
      );
    }
    normalized.set(path, hash);
  }
  return new Map(
    [...normalized].sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0
    ),
  );
}

export async function diffTreeSnapshots(
  before: TreeSnapshot,
  after: TreeSnapshot,
): Promise<TreeDiff> {
  const beforeFiles = normalizeSnapshot(before);
  const afterFiles = normalizeSnapshot(after);
  const paths = [...new Set([...beforeFiles.keys(), ...afterFiles.keys()])]
    .sort();
  const changes: TreeChange[] = [];

  for (const path of paths) {
    const beforeHash = beforeFiles.get(path);
    const afterHash = afterFiles.get(path);
    if (beforeHash === undefined && afterHash !== undefined) {
      changes.push({ path, kind: "created", afterHash });
    } else if (beforeHash !== undefined && afterHash === undefined) {
      changes.push({ path, kind: "deleted", beforeHash });
    } else if (
      beforeHash !== undefined && afterHash !== undefined &&
      beforeHash !== afterHash
    ) {
      changes.push({ path, kind: "changed", beforeHash, afterHash });
    }
  }

  const files = [...afterFiles];
  const digestInput = JSON.stringify({
    files,
    changes: changes.map(({ path, kind, beforeHash, afterHash }) => [
      path,
      kind,
      beforeHash ?? null,
      afterHash ?? null,
    ]),
  });
  return { digest: await sha256(encoder.encode(digestInput)), changes };
}
