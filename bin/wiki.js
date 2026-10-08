#!/usr/bin/env node

const { spawn } = require('child_process');
const { createWikiCommand } = require('../dist/runtime.js');

let command;
try {
  command = createWikiCommand(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const child = spawn(command[0], command.slice(1), { stdio: 'inherit' });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', (error) => {
  console.error(`Unable to start the Wiki CLI: ${error.message}`);
  process.exitCode = 1;
});
child.on('close', (code, signal) => {
  process.exitCode = code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1);
});
