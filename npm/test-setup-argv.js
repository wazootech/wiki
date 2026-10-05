const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { denoInvocation } = require('./dist/runtime.js');

const argument = 'text with spaces; not shell syntax';
const invocation = denoInvocation([argument]);
const packageRoot = path.resolve(__dirname, '..');
const packageRequire = createRequire(path.join(packageRoot, 'package.json'));

const expectedDeno = packageRequire('deno/install_api.cjs').runInstall();
assert.strictEqual(invocation.executable, expectedDeno);
assert.deepStrictEqual(invocation.args.slice(0, 4), [
  'run',
  '--allow-all',
  '--config',
  path.join(packageRoot, 'deno.json'),
]);
assert.deepStrictEqual(invocation.args.slice(4, 7), [
  '--lock',
  path.join(packageRoot, 'deno.lock'),
  path.join(packageRoot, 'src', 'wiki', 'cli.ts'),
]);
assert.strictEqual(invocation.args.at(-1), argument);
for (const index of [3, 5, 6]) {
  assert.ok(path.isAbsolute(invocation.args[index]));
}
console.log('npm Deno invocation regression ok');
