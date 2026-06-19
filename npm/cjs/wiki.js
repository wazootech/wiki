"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Wiki = void 0;
const runner_1 = require("./runner");
function pushFlag(args, flag, value) {
    if (value === undefined)
        return;
    if (typeof value === "boolean") {
        if (value)
            args.push(flag);
        return;
    }
    args.push(flag, String(value));
}
function pushRepeated(args, flag, values) {
    for (const value of values ?? []) {
        args.push(flag, value);
    }
}
function appendFiles(args, files) {
    if (files?.length)
        args.push(...files);
}
function parseJsonOutput(result) {
    return { ...result, data: JSON.parse(result.stdout) };
}
class Wiki {
    config;
    wikiInputs;
    cwd;
    env;
    runtime;
    constructor(options = {}) {
        this.config = options.config;
        this.wikiInputs = options.wikiInputs ?? [];
        this.cwd = options.cwd;
        this.env = options.env;
        this.runtime = options.runtime ?? {};
    }
    static load(options = {}) {
        return new Wiki(options);
    }
    withRuntime(options) {
        return new Wiki({
            config: this.config,
            wikiInputs: this.wikiInputs,
            cwd: this.cwd,
            env: this.env,
            runtime: { ...this.runtime, ...options },
        });
    }
    args(subcommand, subcommandArgs = []) {
        const args = [];
        pushRepeated(args, "--wiki-inputs", this.wikiInputs);
        pushFlag(args, "--config", this.config);
        args.push(subcommand, ...subcommandArgs);
        return args;
    }
    run(args, options = {}) {
        return (0, runner_1.runWiki)(args, {
            cwd: options.cwd ?? this.cwd,
            env: { ...this.env, ...options.env },
            stdin: options.stdin,
            timeoutMs: options.timeoutMs,
            throwOnError: options.throwOnError,
            signal: options.signal,
        });
    }
    check(options = {}) {
        const args = [];
        pushFlag(args, "--verbose", options.verbose);
        pushFlag(args, "--strict", options.strict);
        appendFiles(args, options.files);
        return this.run(this.args("check", args));
    }
    lint(options = {}) {
        const args = [];
        pushFlag(args, "--verbose", options.verbose);
        pushFlag(args, "--strict", options.strict);
        appendFiles(args, options.files);
        return this.run(this.args("lint", args));
    }
    async preflight(options = {}) {
        const lint = await this.lint(options);
        const check = await this.check(options);
        return { lint, check };
    }
    build(options = {}) {
        const args = [];
        pushFlag(args, "--output-dir", options.outputDir);
        pushFlag(args, "--site-base-url", options.baseUrl ?? this.runtime.baseUrl);
        pushFlag(args, "--site-url-style", options.urlStyle ?? this.runtime.urlStyle);
        pushFlag(args, "--render", options.render);
        pushFlag(args, "--reload", options.reload);
        pushFlag(args, "--cache", options.cache);
        pushFlag(args, "--no-check", options.noCheck);
        pushFlag(args, "--verbose", options.verbose);
        return this.run(this.args("build", args));
    }
    fmt(options = {}) {
        const args = [];
        pushFlag(args, "--check", options.check);
        pushFlag(args, "--verbose", options.verbose);
        appendFiles(args, options.files);
        return this.run(this.args("fmt", args));
    }
    format(options = {}) {
        return this.fmt(options);
    }
    render(options = {}) {
        const args = [];
        pushFlag(args, "--no-inference", options.noInference);
        pushFlag(args, "--reload", options.reload);
        pushFlag(args, "--cache", options.cache);
        pushFlag(args, "--check", options.check);
        pushFlag(args, "--verbose", options.verbose);
        appendFiles(args, options.files);
        return this.run(this.args("render", args));
    }
    async export(options = {}) {
        const args = [];
        pushFlag(args, "--output", options.output);
        pushFlag(args, "--format", options.format);
        pushFlag(args, "--mode", options.mode);
        appendFiles(args, options.files);
        const result = await this.run(this.args("export", args));
        const shouldParseJson = options.parseJson ?? (options.format === undefined || options.format === "dict" || options.format === "json-ld");
        if (shouldParseJson) {
            return parseJsonOutput(result);
        }
        return result;
    }
    link(options = {}) {
        const args = [];
        pushFlag(args, "--apply", options.apply);
        pushFlag(args, "--fix-broken", options.fixBroken);
        pushFlag(args, "--dry-run", options.dryRun);
        pushFlag(args, "--check", options.check);
        pushFlag(args, "--verbose", options.verbose);
        appendFiles(args, options.files);
        return this.run(this.args("link", args));
    }
    async query(options) {
        const args = [];
        pushFlag(args, "--format", options.format);
        pushFlag(args, "--output", options.output);
        pushFlag(args, "--no-inference", options.noInference);
        pushFlag(args, "--reload", options.reload);
        pushFlag(args, "--cache", options.cache);
        pushFlag(args, "--jq", options.jq);
        pushFlag(args, "--pretty", options.pretty);
        pushFlag(args, "--verbose", options.verbose);
        args.push(options.query);
        const result = await this.run(this.args("query", args));
        if (options.parseJson ?? options.format === "json") {
            return JSON.parse(result.stdout);
        }
        return result.stdout;
    }
    serve(options = {}) {
        const args = [];
        pushFlag(args, "--host", options.host);
        pushFlag(args, "--port", options.port);
        pushFlag(args, "--site-base-url", options.baseUrl ?? this.runtime.baseUrl);
        pushFlag(args, "--site-url-style", options.urlStyle ?? this.runtime.urlStyle);
        pushFlag(args, "--watch", options.watch);
        return (0, runner_1.spawnWiki)(this.args("serve", args), {
            cwd: options.cwd ?? this.cwd,
            env: { ...this.env, ...options.env },
        });
    }
    init(options = {}) {
        const args = [];
        pushFlag(args, "--git", options.git);
        pushFlag(args, "--repo", options.repo);
        pushFlag(args, "--graph-context-wiki", options.graphContextWiki);
        pushFlag(args, "--site-base-url", options.siteBaseUrl);
        pushFlag(args, "--site-url-style", options.siteUrlStyle);
        pushFlag(args, "--graph-content-predicate", options.graphContentPredicate);
        pushFlag(args, "--link-style", options.linkStyle);
        pushRepeated(args, "--wiki-inputs", options.wikiInputs);
        pushFlag(args, "--graph-base-iri", options.graphBaseIri);
        pushRepeated(args, "--graph-implicit-types", options.graphImplicitTypes);
        pushFlag(args, "--graph-implicit-types-policy", options.graphImplicitTypesPolicy);
        if (options.graphIncludeFileExtension !== undefined) {
            args.push(options.graphIncludeFileExtension ? "--graph-include-file-extension" : "--no-graph-include-file-extension");
        }
        return this.run(this.args("init", args));
    }
    upgrade(options = {}) {
        const args = [];
        pushFlag(args, "--check", options.check);
        pushFlag(args, "--yes", options.yes);
        pushFlag(args, "--verbose", options.verbose);
        return this.run(this.args("upgrade", args));
    }
}
exports.Wiki = Wiki;
