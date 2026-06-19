import type { ChildProcess, SpawnOptions } from "node:child_process";
import type { RunOptions, WikiCommandResult } from "./types";
export declare function getVenvPython(): string;
export declare function ensurePythonReady(): string;
export declare function runWiki(args: readonly string[], options?: RunOptions): Promise<WikiCommandResult>;
export declare function spawnWiki(args: readonly string[], options?: SpawnOptions): ChildProcess;
