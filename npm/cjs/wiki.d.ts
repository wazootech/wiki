import type { ChildProcess } from "node:child_process";
import type { BuildOptions, CheckOptions, ExportOptions, ExportResult, FmtOptions, InitOptions, LinkOptions, LintOptions, PreflightOptions, PreflightResult, QueryOptions, RenderOptions, RunOptions, RuntimeOptions, ServeOptions, UpgradeOptions, WikiCommandResult, WikiLoadOptions } from "./types";
export declare class Wiki {
    readonly config?: string;
    readonly wikiInputs: readonly string[];
    readonly cwd?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly runtime: RuntimeOptions;
    constructor(options?: WikiLoadOptions & {
        runtime?: RuntimeOptions;
    });
    static load(options?: WikiLoadOptions): Wiki;
    withRuntime(options: RuntimeOptions): Wiki;
    args(subcommand: string, subcommandArgs?: readonly string[]): string[];
    run(args: readonly string[], options?: RunOptions): Promise<WikiCommandResult>;
    check(options?: CheckOptions): Promise<WikiCommandResult>;
    lint(options?: LintOptions): Promise<WikiCommandResult>;
    preflight(options?: PreflightOptions): Promise<PreflightResult>;
    build(options?: BuildOptions): Promise<WikiCommandResult>;
    fmt(options?: FmtOptions): Promise<WikiCommandResult>;
    format(options?: FmtOptions): Promise<WikiCommandResult>;
    render(options?: RenderOptions): Promise<WikiCommandResult>;
    export<T = unknown>(options?: ExportOptions): Promise<ExportResult<T>>;
    link(options?: LinkOptions): Promise<WikiCommandResult>;
    query<T = unknown>(options: QueryOptions): Promise<string | T>;
    serve(options?: ServeOptions): ChildProcess;
    init(options?: InitOptions): Promise<WikiCommandResult>;
    upgrade(options?: UpgradeOptions): Promise<WikiCommandResult>;
}
