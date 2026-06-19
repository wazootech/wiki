import type { WikiCommandResult } from "./types";
export declare class WikiCommandError extends Error {
    readonly result: WikiCommandResult;
    constructor(result: WikiCommandResult);
}
export declare class WikiSetupError extends Error {
    constructor(message: string);
}
