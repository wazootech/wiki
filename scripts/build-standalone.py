#!/usr/bin/env python3
"""Build a standalone wiki executable with PyInstaller and package a release archive."""

from __future__ import annotations

import argparse
import hashlib
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import tomllib
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST_DIR = ROOT / "dist" / "standalone"
BUILD_DIR = ROOT / "build" / "standalone"


def project_version() -> str:
    data = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    return str(data["project"]["version"])


def platform_slug() -> tuple[str, str]:
    system = sys.platform
    machine = platform.machine().lower()
    if system == "win32":
        return "windows", "x64" if machine in {"amd64", "x86_64"} else machine
    if system == "darwin":
        arch = "arm64" if machine == "arm64" else "x64"
        return "macos", arch
    if system.startswith("linux"):
        return "linux", "x64" if machine in {"amd64", "x86_64"} else machine
    return system.replace("-", "_"), machine


def artifact_basename(version: str) -> str:
    os_name, arch = platform_slug()
    return f"wazootech-wiki-{version}-{os_name}-{arch}"


def run_pyinstaller() -> Path:
    exe_name = "wiki.exe" if sys.platform == "win32" else "wiki"
    out_dir = BUILD_DIR / "pyinstaller"
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")

    subprocess.check_call(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            "--distpath",
            str(out_dir),
            "--workpath",
            str(BUILD_DIR / "work"),
            str(ROOT / "wiki.spec"),
        ],
        cwd=ROOT,
        env=env,
    )

    exe = out_dir / exe_name
    if not exe.is_file():
        raise SystemExit(f"PyInstaller did not produce {exe}")
    return exe


def package_archive(exe: Path, version: str) -> Path:
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    slug = artifact_basename(version)
    os_name, _ = platform_slug()

    if os_name == "windows":
        archive = DIST_DIR / f"{slug}.zip"
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.write(exe, arcname=exe.name)
        return archive

    archive = DIST_DIR / f"{slug}.tar.gz"
    with tarfile.open(archive, "w:gz") as tf:
        tf.add(exe, arcname=exe.name)
    return archive


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def smoke_test(exe: Path, *, deep: bool = False) -> None:
    subprocess.check_call([str(exe), "--help"], cwd=ROOT)
    if deep:
        subprocess.check_call(
            [str(exe), "-c", "docs/wiki.yaml", "check", "--strict"],
            cwd=ROOT,
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-smoke", action="store_true")
    parser.add_argument("--smoke-check", action="store_true", help="Also run docs/wiki.yaml check")
    parser.add_argument("--print-sha256", action="store_true")
    args = parser.parse_args()

    version = project_version()
    exe = run_pyinstaller()
    if not args.skip_smoke:
        smoke_test(exe, deep=args.smoke_check)

    archive = package_archive(exe, version)
    digest = sha256_file(archive)

    print(f"Built: {archive}")
    print(f"Size:  {archive.stat().st_size:,} bytes")
    print(f"SHA256: {digest}")

    if args.print_sha256:
        sums = DIST_DIR / "SHA256SUMS"
        line = f"{digest}  {archive.name}\n"
        with sums.open("a", encoding="utf-8") as fh:
            fh.write(line)


if __name__ == "__main__":
    main()
