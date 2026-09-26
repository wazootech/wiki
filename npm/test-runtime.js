const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWikiCommand } = require('./dist/runtime.js');

const packageRoot = path.resolve(__dirname, '..');
const command = createWikiCommand(['--help']);
const [deno, ...args] = command;
const config = path.join(packageRoot, 'deno.json');
const lock = path.join(packageRoot, 'deno.lock');
const entrypoint = path.join(packageRoot, 'src', 'wiki', 'cli.ts');

assert.ok(path.isAbsolute(deno));
assert.ok(fs.existsSync(deno));
assert.deepEqual(args.slice(0, 8), [
  'run',
  '--node-modules-dir=none',
  '--allow-all',
  '--config',
  config,
  '--lock',
  lock,
  '--frozen',
]);
assert.equal(args[8], entrypoint);
assert.deepEqual(args.slice(9), ['--help']);
assert.ok(fs.existsSync(config));
assert.ok(fs.existsSync(lock));
assert.ok(fs.existsSync(entrypoint));

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-npm-runtime-'));
const emptyPath = path.join(tempRoot, 'bin');
fs.mkdirSync(emptyPath);
const env = { ...process.env, PATH: emptyPath };

try {
  const python = spawnSync(process.platform === 'win32' ? 'python.exe' : 'python', ['--version'], {
    cwd: tempRoot,
    env,
    encoding: 'utf8',
  });
  assert.equal(python.error?.code, 'ENOENT', 'Python should not be available on PATH');

  const systemDeno = spawnSync('deno', ['--version'], { cwd: tempRoot, env, encoding: 'utf8' });
  assert.equal(systemDeno.error?.code, 'ENOENT', 'a system Deno should not be available on PATH');

  const result = spawnSync(deno, args, {
    cwd: tempRoot,
    env,
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage: wiki/);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('npm Deno runtime regression ok (Python and system Deno absent from PATH)');
