"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVenvPython = getVenvPython;
exports.ensurePythonReady = ensurePythonReady;
exports.runWiki = runWiki;
exports.spawnWiki = spawnWiki;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const errors_1 = require("./errors");
const packageRoot = node_path_1.default.resolve(__dirname, "..", "..");
const venvDir = node_path_1.default.join(packageRoot, ".venv");
function getVenvPython() {
    const exeName = process.platform === "win32" ? "python.exe" : "python";
    const scriptsDir = process.platform === "win32" ? "Scripts" : "bin";
    return node_path_1.default.join(venvDir, scriptsDir, exeName);
}
function venvIsReady() {
    const pythonExe = getVenvPython();
    if (!node_fs_1.default.existsSync(pythonExe))
        return false;
    const result = (0, node_child_process_1.spawnSync)(pythonExe, ["-c", "import wiki; print('ok')"], {
        encoding: "utf-8",
        timeout: 10_000,
    });
    return result.status === 0;
}
function ensurePythonReady() {
    if (venvIsReady())
        return getVenvPython();
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const setup = require("../setup");
        setup();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new errors_1.WikiSetupError(`wazootech-wiki Python environment setup failed: ${message}`);
    }
    if (!venvIsReady()) {
        throw new errors_1.WikiSetupError("wazootech-wiki Python environment is not usable after setup");
    }
    return getVenvPython();
}
function runWiki(args, options = {}) {
    const pythonExe = ensurePythonReady();
    const command = [pythonExe, "-m", "wiki", ...args];
    const child = (0, node_child_process_1.spawn)(pythonExe, ["-m", "wiki", ...args], {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
        signal: options.signal,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timeout;
    if (options.stdin !== undefined) {
        child.stdin?.end(options.stdin);
    }
    child.stdout?.setEncoding("utf-8");
    child.stderr?.setEncoding("utf-8");
    child.stdout?.on("data", (chunk) => {
        stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
        stderr += chunk;
    });
    return new Promise((resolve, reject) => {
        const finish = (result) => {
            if (settled)
                return;
            settled = true;
            if (timeout)
                clearTimeout(timeout);
            if (!result.ok && options.throwOnError !== false) {
                reject(new errors_1.WikiCommandError(result));
                return;
            }
            resolve(result);
        };
        if (options.timeoutMs !== undefined) {
            timeout = setTimeout(() => {
                child.kill("SIGTERM");
                finish({ ok: false, exitCode: -1, stdout, stderr: `${stderr}\nCommand timed out`.trim(), command });
            }, options.timeoutMs);
        }
        child.on("error", (error) => {
            finish({ ok: false, exitCode: -1, stdout, stderr: error.message, command });
        });
        child.on("close", (code) => {
            const exitCode = code ?? -1;
            finish({ ok: exitCode === 0, exitCode, stdout, stderr, command });
        });
    });
}
function spawnWiki(args, options = {}) {
    const pythonExe = ensurePythonReady();
    return (0, node_child_process_1.spawn)(pythonExe, ["-m", "wiki", ...args], {
        stdio: "inherit",
        ...options,
        env: { ...process.env, ...options.env },
    });
}
