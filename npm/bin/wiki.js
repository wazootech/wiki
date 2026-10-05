#!/usr/bin/env node

const { spawn } = require('child_process');
const { denoInvocation } = require('../dist/runtime.js');

let invocation;
try {
  invocation = denoInvocation(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
  return;
}

const child = spawn(invocation.executable, invocation.args, { stdio: 'inherit' });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('close', (code) => {
  process.exitCode = code ?? 1;
});
