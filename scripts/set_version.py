#!/usr/bin/env python3
"""Script to update or verify version strings across the codebase.

Usage:
    python scripts/set_version.py 0.1.16
    python scripts/set_version.py --check
"""

import json
import re
import sys
from pathlib import Path


def get_repo_root() -> Path:
    return Path(__file__).resolve().parent.parent

def check_versions() -> dict[str, str]:
    root = get_repo_root()
    versions = {}

    # 1. pyproject.toml
    pyproject_path = root / "pyproject.toml"
    if pyproject_path.exists():
        content = pyproject_path.read_text(encoding="utf-8")
        match = re.search(r'(?m)^version\s*=\s*"(.*?)"', content)
        if match:
            versions["pyproject.toml"] = match.group(1)

    # 2. package.json
    package_path = root / "package.json"
    if package_path.exists():
        content = package_path.read_text(encoding="utf-8")
        try:
            data = json.loads(content)
            versions["package.json"] = data.get("version", "")
        except json.JSONDecodeError:
            pass

    # 3. package-lock.json
    package_lock_path = root / "package-lock.json"
    if package_lock_path.exists():
        content = package_lock_path.read_text(encoding="utf-8")
        try:
            data = json.loads(content)
            versions["package-lock.json"] = data.get("version", "")
            versions["package-lock.json (packages)"] = data.get("packages", {}).get("", {}).get("version", "")
        except json.JSONDecodeError:
            pass

    # 4. src/wiki/__init__.py
    init_path = root / "src" / "wiki" / "__init__.py"
    if init_path.exists():
        content = init_path.read_text(encoding="utf-8")
        match = re.search(r'(?m)^__version__\s*=\s*"(.*?)"', content)
        if match:
            versions["src/wiki/__init__.py"] = match.group(1)

    # 5. docs/wiki/wiki.md
    wiki_cli_path = root / "docs" / "wiki" / "wiki.md"
    if wiki_cli_path.exists():
        content = wiki_cli_path.read_text(encoding="utf-8")
        match = re.search(r'(?m)^softwareVersion:\s*(\S+)', content)
        if match:
            versions["docs/wiki/wiki.md"] = match.group(1)

    # 6. uv.lock
    uv_lock_path = root / "uv.lock"
    if uv_lock_path.exists():
        content = uv_lock_path.read_text(encoding="utf-8")
        match = re.search(r'(?m)^name = "wazootech-wiki"\nversion = "([^"]+)"', content)
        if match:
            versions["uv.lock"] = match.group(1)

    return versions

def update_versions(new_version: str) -> None:
    root = get_repo_root()

    # Validate version format roughly (e.g. 0.1.16)
    if not re.match(r'^\d+\.\d+\.\d+$', new_version):
        print(f"Error: Version '{new_version}' does not match expected semver pattern (X.Y.Z).", file=sys.stderr)
        sys.exit(1)

    # 1. pyproject.toml
    pyproject_path = root / "pyproject.toml"
    if pyproject_path.exists():
        content = pyproject_path.read_text(encoding="utf-8")
        new_content, count = re.subn(r'(?m)^version\s*=\s*".*?"', f'version = "{new_version}"', content)
        if count > 0:
            pyproject_path.write_text(new_content, encoding="utf-8")
            print(f"Updated pyproject.toml -> {new_version}")

    # 2. package.json
    package_path = root / "package.json"
    if package_path.exists():
        content = package_path.read_text(encoding="utf-8")
        data = json.loads(content)
        data["version"] = new_version
        # Dump with 2 spaces and trailing newline
        package_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        print(f"Updated package.json -> {new_version}")

    # 3. package-lock.json
    package_lock_path = root / "package-lock.json"
    if package_lock_path.exists():
        content = package_lock_path.read_text(encoding="utf-8")
        data = json.loads(content)
        data["version"] = new_version
        if "packages" in data and "" in data["packages"]:
            data["packages"][""]["version"] = new_version
        package_lock_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        print(f"Updated package-lock.json -> {new_version}")

    # 4. src/wiki/__init__.py
    init_path = root / "src" / "wiki" / "__init__.py"
    if init_path.exists():
        content = init_path.read_text(encoding="utf-8")
        new_content, count = re.subn(r'(?m)^__version__\s*=\s*".*?"', f'__version__ = "{new_version}"', content)
        if count > 0:
            init_path.write_text(new_content, encoding="utf-8")
            print(f"Updated src/wiki/__init__.py -> {new_version}")

    # 5. docs/wiki/wiki.md
    wiki_cli_path = root / "docs" / "wiki" / "wiki.md"
    if wiki_cli_path.exists():
        content = wiki_cli_path.read_text(encoding="utf-8")
        new_content, count = re.subn(r'(?m)^softwareVersion:\s*\S+', f'softwareVersion: {new_version}', content)
        if count > 0:
            wiki_cli_path.write_text(new_content, encoding="utf-8")
            print(f"Updated docs/wiki/wiki.md -> {new_version}")

    # 6. uv.lock
    uv_lock_path = root / "uv.lock"
    if uv_lock_path.exists():
        content = uv_lock_path.read_text(encoding="utf-8")
        new_content, count = re.subn(
            r'(?m)^(name = "wazootech-wiki"\n)version = "[^"]+"',
            rf'\g<1>version = "{new_version}"',
            content,
        )
        if count > 0:
            uv_lock_path.write_text(new_content, encoding="utf-8")
            print(f"Updated uv.lock -> {new_version}")

def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python scripts/set_version.py <version> | --check", file=sys.stderr)
        sys.exit(1)

    arg = sys.argv[1]

    if arg == "--check":
        versions = check_versions()
        # Verify all versions match
        if not versions:
            print("No version strings found in codebase.", file=sys.stderr)
            sys.exit(1)
            
        unique_versions = set(versions.values())
        if len(unique_versions) > 1:
            print("Error: Version mismatch detected in codebase!", file=sys.stderr)
            for file_path, ver in versions.items():
                print(f"  {file_path}: {ver}", file=sys.stderr)
            sys.exit(1)
            
        target_version = list(unique_versions)[0]
        print(f"All version strings are in sync: {target_version}")
        sys.exit(0)
    else:
        update_versions(arg)

if __name__ == "__main__":
    main()
