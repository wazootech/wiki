const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Wiki, WikiCommandError } = require('./dist/index.js');

const packageRoot = path.resolve(__dirname, '..');
const engineVersion = require('../deno.json').version;

async function main() {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-node-only-'));
  const wikiRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-npm-query-'));
  try {
    fs.symlinkSync(process.execPath, path.join(binDir, 'node'));
    const cli = spawnSync(
      process.execPath,
      [path.join(packageRoot, 'npm', 'bin', 'wiki.js'), '--version'],
      {
        encoding: 'utf8',
        env: { ...process.env, PATH: binDir },
        timeout: 120_000,
      },
    );
    assert.strictEqual(cli.status, 0, cli.stderr || cli.error?.message);
    assert.strictEqual(cli.stdout, `wiki, version ${engineVersion}\n`);

    const wikiDir = path.join(wikiRoot, 'wiki');
    fs.mkdirSync(wikiDir);
    fs.writeFileSync(path.join(wikiRoot, 'wiki.yml'), 'wiki:\n  input: [wiki]\n');
    fs.writeFileSync(
      path.join(wikiDir, 'Ada.md'),
      '---\ntype: schema:Person\nname: Ada\n---\n# Ada\n',
    );

    const wiki = new Wiki();
    const query = await wiki.run(
      ['-c', 'wiki.yml', 'query', '--no-inference', '--format', 'json'],
      {
        cwd: wikiRoot,
        stdin:
          'SELECT ?name WHERE { ?person a <https://schema.org/Person> ; <https://schema.org/name> ?name }',
        timeoutMs: 120_000,
      },
    );
    assert.strictEqual(query.ok, true, query.stderr);
    assert.strictEqual(
      JSON.parse(query.stdout).results.bindings[0].name.value,
      'Ada',
    );
    assert.ok(query.command.every((part) => !part.includes('python')));

    const usage = await wiki.run(['not-a-command'], { throwOnError: false });
    assert.strictEqual(usage.ok, false);
    assert.strictEqual(usage.exitCode, 2);
    assert.match(usage.stderr, /No such command 'not-a-command'/);

    await assert.rejects(
      wiki.run(['not-a-command']),
      (error) =>
        error instanceof WikiCommandError && error.result.exitCode === 2,
    );

    const abortController = new AbortController();
    abortController.abort();
    await assert.rejects(
      wiki.run(['--version'], { signal: abortController.signal }),
      (error) =>
        error instanceof WikiCommandError && error.result.exitCode === -1,
    );

    const timeoutError = await wiki.run(
      ['--version'],
      { timeoutMs: 1, throwOnError: false },
    );
    assert.strictEqual(timeoutError.ok, false);
    assert.strictEqual(timeoutError.exitCode, -1);
    assert.match(timeoutError.stderr, /Command timed out/);

    console.log('npm Deno runner regression ok');
  } finally {
    fs.rmSync(binDir, { recursive: true, force: true });
    fs.rmSync(wikiRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
