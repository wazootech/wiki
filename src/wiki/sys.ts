/**
 * The runtime edge: every call into the host operating system, on `node:`
 * builtins so the engine runs on Deno and, later, on Bun and Node.
 *
 * The names and behavior follow the Deno APIs the engine was written against,
 * so the places where `node:` differs are handled here once: text reads drop a
 * byte-order mark, `removeSync` removes an empty directory without
 * `recursive`, file information exposes booleans, and a missing command throws.
 */
import { Buffer } from "node:buffer";
import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { Readable, Writable } from "node:stream";

export type Path = string | URL;

/** NotFound is thrown by the engine itself for a path that is gone. */
class NotFound extends Error {
  readonly code = "ENOENT";
  override name = "NotFound";
}

export const errors = { NotFound };

/** isNotFound reports whether `error` means a file or command is missing. */
export function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    (error as { code?: unknown }).code === "ENOENT";
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

const bytesOf = (buffer: Buffer): Uint8Array<ArrayBuffer> =>
  new Uint8Array(
    buffer.buffer as ArrayBuffer,
    buffer.byteOffset,
    buffer.length,
  );

const withoutBom = (text: string): string =>
  text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

export function readFileSync(path: Path): Uint8Array<ArrayBuffer> {
  return bytesOf(fs.readFileSync(path));
}

export async function readFile(path: Path): Promise<Uint8Array<ArrayBuffer>> {
  return bytesOf(await fsp.readFile(path));
}

export function readTextFileSync(path: Path): string {
  return withoutBom(fs.readFileSync(path, "utf8"));
}

export async function readTextFile(path: Path): Promise<string> {
  return withoutBom(await fsp.readFile(path, "utf8"));
}

export interface WriteOptions {
  append?: boolean;
  createNew?: boolean;
  mode?: number;
}

function writeFlags(options: WriteOptions) {
  const flag = options.createNew ? "wx" : options.append ? "a" : "w";
  return options.mode === undefined ? { flag } : { flag, mode: options.mode };
}

export function writeFileSync(
  path: Path,
  data: Uint8Array,
  options: WriteOptions = {},
): void {
  fs.writeFileSync(path, data, writeFlags(options));
}

export async function writeFile(
  path: Path,
  data: Uint8Array,
  options: WriteOptions = {},
): Promise<void> {
  await fsp.writeFile(path, data, writeFlags(options));
}

export function writeTextFileSync(
  path: Path,
  text: string,
  options: WriteOptions = {},
): void {
  fs.writeFileSync(path, text, writeFlags(options));
}

export async function writeTextFile(
  path: Path,
  text: string,
  options: WriteOptions = {},
): Promise<void> {
  await fsp.writeFile(path, text, writeFlags(options));
}

export interface NewFile {
  writeSync(bytes: Uint8Array): number;
  close(): void;
}

/** openSync creates a file that must not exist yet and returns a writer. */
export function openSync(
  path: Path,
  _options: { write: true; createNew: true },
): NewFile {
  const descriptor = fs.openSync(path, "wx");
  return {
    writeSync: (bytes) => fs.writeSync(descriptor, bytes),
    close: () => fs.closeSync(descriptor),
  };
}

export function mkdirSync(
  path: Path,
  options: { recursive?: boolean; mode?: number } = {},
): void {
  fs.mkdirSync(path, options);
}

export async function mkdir(
  path: Path,
  options: { recursive?: boolean; mode?: number } = {},
): Promise<void> {
  await fsp.mkdir(path, options);
}

/** removeSync removes a file, a link or an empty directory, or a whole tree. */
export function removeSync(
  path: Path,
  options: { recursive?: boolean } = {},
): void {
  if (options.recursive) fs.rmSync(path, { recursive: true });
  else if (fs.lstatSync(path).isDirectory()) fs.rmdirSync(path);
  else fs.unlinkSync(path);
}

export async function remove(
  path: Path,
  options: { recursive?: boolean } = {},
): Promise<void> {
  if (options.recursive) await fsp.rm(path, { recursive: true });
  else if ((await fsp.lstat(path)).isDirectory()) await fsp.rmdir(path);
  else await fsp.unlink(path);
}

export interface FileInfo {
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
  mtime: Date | null;
  atime: Date | null;
  birthtime: Date | null;
  mode: number | null;
  dev: number;
  ino: number | null;
}

function infoOf(stats: fs.Stats): FileInfo {
  return {
    isFile: stats.isFile(),
    isDirectory: stats.isDirectory(),
    isSymlink: stats.isSymbolicLink(),
    size: stats.size,
    mtime: stats.mtime,
    atime: stats.atime,
    birthtime: stats.birthtime,
    mode: stats.mode,
    dev: stats.dev,
    ino: stats.ino,
  };
}

export function statSync(path: Path): FileInfo {
  return infoOf(fs.statSync(path));
}

export async function stat(path: Path): Promise<FileInfo> {
  return infoOf(await fsp.stat(path));
}

export function lstatSync(path: Path): FileInfo {
  return infoOf(fs.lstatSync(path));
}

export interface DirEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
}

export function readDirSync(path: Path): ArrayIterator<DirEntry> {
  return fs.readdirSync(path, { withFileTypes: true }).map((entry) => ({
    name: entry.name,
    isFile: entry.isFile(),
    isDirectory: entry.isDirectory(),
    isSymlink: entry.isSymbolicLink(),
  })).values();
}

export interface WalkEntry extends DirEntry {
  path: string;
}

/** walkSync yields `root` and everything under it, never following links. */
export function* walkSync(root: string): IterableIterator<WalkEntry> {
  const name = root.split(/[\\/]/).filter(Boolean).pop() ?? root;
  yield {
    path: root,
    name,
    isFile: false,
    isDirectory: true,
    isSymlink: false,
  };
  for (const entry of readDirSync(root)) {
    if (entry.isSymlink) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory) yield* walkSync(path);
    else yield { path, ...entry };
  }
}

export function makeTempDirSync(options: { prefix?: string } = {}): string {
  return fs.mkdtempSync(join(tmpdir(), options.prefix ?? "tmp"));
}

export function makeTempDir(
  options: { prefix?: string } = {},
): Promise<string> {
  return fsp.mkdtemp(join(tmpdir(), options.prefix ?? "tmp"));
}

export function symlinkSync(
  target: string,
  path: string,
  options?: { type: "file" | "dir" | "junction" },
): void {
  fs.symlinkSync(target, path, options?.type);
}

export const realPathSync = (path: Path): string =>
  fs.realpathSync.native(path);
export const renameSync = (from: Path, to: Path): void =>
  fs.renameSync(from, to);
export const copyFileSync = (from: Path, to: Path): void =>
  fs.copyFileSync(from, to);
export const chmodSync = (path: Path, mode: number): void =>
  fs.chmodSync(path, mode);
export const utimeSync = (
  path: Path,
  atime: number | Date,
  mtime: number | Date,
): void => fs.utimesSync(path, atime, mtime);

// ---------------------------------------------------------------------------
// Process
// ---------------------------------------------------------------------------

export const args: string[] = process.argv.slice(2);
export const pid: number = process.pid;
export const cwd = (): string => process.cwd();
export function exit(code?: number): never {
  return process.exit(code);
}
export const execPath = (): string => process.execPath;
export const memoryUsage = () => process.memoryUsage();
/** How many processes the host can run at once. */
export const parallelism = (): number => availableParallelism();

export const env = {
  get: (key: string): string | undefined => process.env[key],
  set: (key: string, value: string): void => {
    process.env[key] = value;
  },
  delete: (key: string): void => {
    delete process.env[key];
  },
};

export const build = {
  os: process.platform === "win32" ? "windows" : process.platform,
  arch: process.arch === "x64"
    ? "x86_64"
    : process.arch === "arm64"
    ? "aarch64"
    : process.arch,
};

export const version = { deno: process.versions["deno"] ?? "" };

export const stdin = {
  isTerminal: (): boolean => process.stdin.isTTY === true,
  get readable(): ReadableStream<Uint8Array<ArrayBuffer>> {
    return Readable.toWeb(process.stdin) as ReadableStream<
      Uint8Array<ArrayBuffer>
    >;
  },
};

export const stdout = {
  write: (bytes: Uint8Array): Promise<number> =>
    new Promise((resolve, reject) => {
      process.stdout.write(
        bytes,
        (error) => error ? reject(error) : resolve(bytes.length),
      );
    }),
  get writable(): WritableStream<Uint8Array> {
    return Writable.toWeb(process.stdout) as WritableStream<Uint8Array>;
  },
};

export const addSignalListener = (
  signal: "SIGINT" | "SIGTERM",
  listener: () => void,
): void => {
  process.on(signal, listener);
};
export const removeSignalListener = (
  signal: "SIGINT" | "SIGTERM",
  listener: () => void,
): void => {
  process.off(signal, listener);
};

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export interface CommandOptions {
  args?: string[];
  cwd?: string | URL;
  env?: Record<string, string>;
  clearEnv?: boolean;
  stdin?: "null" | "piped" | "inherit";
  stdout?: "null" | "piped" | "inherit";
  stderr?: "null" | "piped" | "inherit";
  /** Aborting it kills the process. */
  signal?: AbortSignal;
}

export interface CommandOutput {
  code: number;
  success: boolean;
  stdout: Uint8Array<ArrayBuffer>;
  stderr: Uint8Array<ArrayBuffer>;
}

const pipeOf = (
  mode: CommandOptions["stdin"],
  fallback: "pipe" | "ignore" | "inherit",
) =>
  mode === "piped"
    ? "pipe" as const
    : mode === "null"
    ? "ignore" as const
    : mode ?? fallback;

const EMPTY = new Uint8Array(0);

function outputOf(
  code: number | null,
  stdout: Buffer | null,
  stderr: Buffer | null,
): CommandOutput {
  // A process ended by a signal has no exit code.
  const status = code ?? 1;
  return {
    code: status,
    success: status === 0,
    stdout: stdout ? bytesOf(stdout) : EMPTY,
    stderr: stderr ? bytesOf(stderr) : EMPTY,
  };
}

/** Command runs a program, following the shape of `Deno.Command`. */
export class Command {
  constructor(
    private readonly program: string,
    private readonly options: CommandOptions = {},
  ) {}

  #spawnOptions(inherit: boolean) {
    const { cwd, env, clearEnv, stdin, stdout, stderr, signal } = this.options;
    return {
      ...(signal === undefined ? {} : { signal }),
      ...(cwd === undefined ? {} : { cwd }),
      env: clearEnv ? env ?? {} : { ...process.env, ...env },
      stdio: [
        pipeOf(stdin, inherit ? "inherit" : "ignore"),
        pipeOf(stdout, inherit ? "inherit" : "pipe"),
        pipeOf(stderr, inherit ? "inherit" : "pipe"),
      ],
    };
  }

  outputSync(): CommandOutput {
    const result = spawnSync(this.program, this.options.args ?? [], {
      ...this.#spawnOptions(false),
      maxBuffer: 256 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    return outputOf(result.status, result.stdout, result.stderr);
  }

  output(): Promise<CommandOutput> {
    return this.#start(false).output();
  }

  spawn(): {
    stdin: WritableStream<Uint8Array>;
    output(): Promise<CommandOutput>;
  } {
    return this.#start(true);
  }

  #start(inherit: boolean) {
    const child = spawn(
      this.program,
      this.options.args ?? [],
      this.#spawnOptions(inherit),
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
    const done = new Promise<CommandOutput>((resolve, reject) => {
      // An abort kills the process, and `close` then reports how it ended.
      child.on("error", (error) => {
        if (error.name !== "AbortError") reject(error);
      });
      child.on("close", (code) => {
        resolve(
          outputOf(
            code,
            child.stdout ? Buffer.concat(stdout) : null,
            child.stderr ? Buffer.concat(stderr) : null,
          ),
        );
      });
    });
    // A rejection nobody awaits yet must not take the process down.
    done.catch(() => {});
    return {
      get stdin(): WritableStream<Uint8Array> {
        if (!child.stdin) throw new TypeError("stdin is not piped");
        return Writable.toWeb(child.stdin) as WritableStream<Uint8Array>;
      },
      output: () => done,
    };
  }
}
