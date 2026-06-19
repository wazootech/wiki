const assert = require('assert');
const { Wiki } = require('./cjs');

class TestWiki extends Wiki {
  constructor(options, result) {
    super(options);
    this.result = result || { ok: true, exitCode: 0, stdout: '', stderr: '', command: [] };
    this.calls = [];
  }

  run(args) {
    this.calls.push(args);
    return Promise.resolve({ ...this.result, command: args });
  }
}

async function main() {
  const wiki = new TestWiki({ config: 'docs/wiki.yml', wikiInputs: ['docs/wiki'], cwd: 'repo' });
  assert.deepStrictEqual(wiki.args('check', ['--strict', 'docs/wiki/Page.md']), [
    '--wiki-inputs',
    'docs/wiki',
    '--config',
    'docs/wiki.yml',
    'check',
    '--strict',
    'docs/wiki/Page.md',
  ]);

  await wiki.build({ outputDir: '_site', baseUrl: '', urlStyle: 'file', render: true, cache: true, noCheck: true });
  assert.deepStrictEqual(wiki.calls.at(-1), [
    '--wiki-inputs',
    'docs/wiki',
    '--config',
    'docs/wiki.yml',
    'build',
    '--output-dir',
    '_site',
    '--site-base-url',
    '',
    '--site-url-style',
    'file',
    '--render',
    '--cache',
    '--no-check',
  ]);

  await wiki.link({ apply: true, fixBroken: true, dryRun: true, check: true, verbose: true, files: ['Page.md'] });
  assert.deepStrictEqual(wiki.calls.at(-1), [
    '--wiki-inputs',
    'docs/wiki',
    '--config',
    'docs/wiki.yml',
    'link',
    '--apply',
    '--fix-broken',
    '--dry-run',
    '--check',
    '--verbose',
    'Page.md',
  ]);

  const exportWiki = new TestWiki({}, { ok: true, exitCode: 0, stdout: '{"ok":true}', stderr: '', command: [] });
  const exportResult = await exportWiki.export();
  assert.deepStrictEqual(exportResult.data, { ok: true });

  const queryWiki = new TestWiki({}, { ok: true, exitCode: 0, stdout: '{"head":{},"results":{}}', stderr: '', command: [] });
  const queryResult = await queryWiki.query({ query: 'SELECT ?s WHERE { ?s ?p ?o }', format: 'json' });
  assert.deepStrictEqual(queryResult, { head: {}, results: {} });

  const initWiki = new TestWiki();
  await initWiki.init({
    git: true,
    repo: 'wazootech/wiki',
    linkStyle: 'standard',
    wikiInputs: ['wiki', 'docs/wiki'],
    graphImplicitTypes: ['schema:Thing'],
    graphIncludeFileExtension: false,
  });
  assert.deepStrictEqual(initWiki.calls.at(-1), [
    'init',
    '--git',
    '--repo',
    'wazootech/wiki',
    '--link-style',
    'standard',
    '--wiki-inputs',
    'wiki',
    '--wiki-inputs',
    'docs/wiki',
    '--graph-implicit-types',
    'schema:Thing',
    '--no-graph-include-file-extension',
  ]);

  console.log('npm Wiki API regression ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
