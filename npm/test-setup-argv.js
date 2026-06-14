const assert = require('assert');
const { pipInstallArgv } = require('./setup');

const malicious = 'wazootech-wiki==1.0.0; echo pwned';
const argv = pipInstallArgv(malicious);

assert.deepStrictEqual(argv, ['-m', 'pip', 'install', malicious]);
assert.strictEqual(argv.length, 4);
console.log('npm/setup argv regression ok');
