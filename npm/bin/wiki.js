#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { spawnSync, spawn } = require('child_process');

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const VENV_DIR = path.join(PACKAGE_ROOT, '.venv');

function getVenvPython() {
  const isWin = process.platform === 'win32';
  const exeName = isWin ? 'python.exe' : 'python';
  const scriptsDir = isWin ? 'Scripts' : 'bin';
  return path.join(VENV_DIR, scriptsDir, exeName);
}

function venvIsReady() {
  const pythonExe = getVenvPython();
  if (!fs.existsSync(pythonExe)) return false;
  try {
    const result = spawnSync(pythonExe, ['-c', 'import wiki; print("ok")'], { encoding: 'utf-8', timeout: 10000 });
    return result.status === 0;
  } catch {
    return false;
  }
}

function autoRepair() {
  console.error('wazootech-wiki Python environment missing; repairing...');
  try {
    const setup = require('../setup');
    setup();
  } catch (err) {
    console.error('Auto-repair failed:', err.message);
    console.error('  Run: npm rebuild -g wazootech-wiki');
    return false;
  }
  return venvIsReady();
}

function runWiki() {
  const pythonExe = getVenvPython();
  const args = ['-m', 'wiki', ...process.argv.slice(2)];
  const child = spawn(pythonExe, args, { stdio: 'inherit' });

  ['SIGINT', 'SIGTERM'].forEach((signal) => {
    process.on(signal, () => child.kill(signal));
  });

  child.on('exit', (code) => process.exit(code));
}

if (!venvIsReady()) {
  if (!autoRepair()) {
    process.exit(1);
  }
}

runWiki();
