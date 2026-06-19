"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WikiSetupError = exports.WikiCommandError = void 0;
class WikiCommandError extends Error {
    result;
    constructor(result) {
        const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`;
        super(`wiki command failed: ${detail}`);
        this.name = "WikiCommandError";
        this.result = result;
    }
}
exports.WikiCommandError = WikiCommandError;
class WikiSetupError extends Error {
    constructor(message) {
        super(message);
        this.name = "WikiSetupError";
    }
}
exports.WikiSetupError = WikiSetupError;
