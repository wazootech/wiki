const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { findPython } = require('./python');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const VENV_DIR = path.join(PACKAGE_ROOT, '.venv');

function getVenvPython() {
  const isWin = process.platform === 'win32';
  const exeName = isWin ? 'python.exe' : 'python';
  const scriptsDir = isWin ? 'Scripts' : 'bin';
  return path.join(VENV_DIR, scriptsDir, exeName);
}

function getPackageVersion() {
  return require(path.join(PACKAGE_ROOT, 'package.json')).version;
}

function venvIsUsable() {
  const venvPython = getVenvPython();
  if (!fs.existsSync(venvPython)) return false;
  try {
    const result = spawnSync(venvPython, ['-c', 'import wiki; print("ok")'], { encoding: 'utf-8', timeout: 10000 });
    return result.status === 0;
  } catch {
    return false;
  }
}

function die(message) {
  console.error(message);
  process.exit(1);
}

function run(cmd, description) {
  console.error(`  ${description}...`);
  try {
    execSync(cmd, { stdio: 'inherit', timeout: 300000 });
  } catch (err) {
    const msg = err.status
      ? `  ${description} exited with code ${err.status}`
      : `  Failed to run ${description.toLowerCase()}: ${err.message}`;
    throw new Error(msg);
  }
}

function setup() {
  if (venvIsUsable()) {
    console.error('wazootech-wiki Python environment already exists. Skipping setup.');
    return;
  }

  if (fs.existsSync(getVenvPython())) {
    console.error('wazootech-wiki Python environment incomplete; rebuilding...');
  }

  const pythonInfo = findPython();
  if (!pythonInfo) {
    die(`wazootech-wiki requires Python 3.12 or newer.

Install Python:
  macOS:    brew install python@3.12
  Windows:  winget install Python.Python.3.12
  Linux:    use your distro package manager or https://www.python.org/downloads/

Then rerun: npm install -g wazootech-wiki`);
  }

  const version = getPackageVersion();
  const pythonPath = pythonInfo.path;
  const venvPython = getVenvPython();

  run(`"${pythonPath}" -m venv "${VENV_DIR}"`, 'Creating Python virtual environment');
  run(`"${venvPython}" -m pip install --upgrade pip`, 'Upgrading pip');

  const pkgSpec = process.env.WIKI_PIP_SPEC || `wazootech-wiki==${version}`;
  run(`"${venvPython}" -m pip install ${pkgSpec}`, 'Installing wazootech-wiki');
  console.error(`wazootech-wiki ${version} Python environment ready.`);
}

if (require.main === module) {
  setup();
}

module.exports = setup;
