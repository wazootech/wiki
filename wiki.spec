# PyInstaller spec for standalone wiki CLI. Invoked by scripts/build-standalone.py.

import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None
root = Path(SPECPATH)
src = root / "src"

hiddenimports = collect_submodules("wiki")
hiddenimports += collect_submodules("rdflib")
hiddenimports += collect_submodules("pyshacl")
hiddenimports += collect_submodules("owlrl")
hiddenimports += [
    "wiki.mdformat_wikilink",
    "mdformat_frontmatter",
    "mdformat_gfm",
    "pygments.lexers",
    "pygments.formatters",
    "tzdata",
]

datas = collect_data_files("wiki", includes=["templates/**"])
datas += collect_data_files("pyshacl")
datas += collect_data_files("rdflib")

a = Analysis(
    [str(root / "scripts" / "pyinstaller_entry.py")],
    pathex=[str(src)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="wiki",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
