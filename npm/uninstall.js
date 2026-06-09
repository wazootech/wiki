const fs = require('fs');
const path = require('path');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const VENV_DIR = path.join(PACKAGE_ROOT, '.venv');

if (fs.existsSync(VENV_DIR)) {
  console.error('Removing wazootech-wiki Python environment...');
  fs.rmSync(VENV_DIR, { recursive: true, force: true });
}
