#!/usr/bin/env python3
"""Prepare and optionally publish a Wiki CLI release.

Examples:
    uv run python scripts/release.py patch --message "Fix graph URI resolution" --push --watch
    uv run python scripts/release.py 0.1.22 --message "Release maintenance"
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

import set_version

ROOT = Path(__file__).resolve().parent.parent
DOCS_TO_FORMAT = ["docs/wiki/Wiki_CLI.md", "docs/wiki/Wiki_Subcommand_render.md"]
RELEASE_FILES = [
    "CHANGELOG.md",
    "docs/wiki/Wiki_CLI.md",
    "docs/wiki/Wiki_Subcommand_render.md",
    "package-lock.json",
    "package.json",
    "pyproject.toml",
    "src/wiki/__init__.py",
    "uv.lock",
]


def run(args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    print("$ " + " ".join(args))
    return subprocess.run(args, cwd=ROOT, check=check, text=True)


def capture(args: list[str]) -> str:
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def current_version() -> str:
    versions = set_version.check_versions()
    unique_versions = set(versions.values())
    if len(unique_versions) != 1:
        details = "\n".join(f"  {name}: {version}" for name, version in versions.items())
        raise SystemExit(f"Version mismatch detected:\n{details}")
    return next(iter(unique_versions))


def next_version(current: str, bump: str) -> str:
    major, minor, patch = [int(part) for part in current.split(".")]
    if bump == "major":
        return f"{major + 1}.0.0"
    if bump == "minor":
        return f"{major}.{minor + 1}.0"
    if bump == "patch":
        return f"{major}.{minor}.{patch + 1}"
    if re.fullmatch(r"\d+\.\d+\.\d+", bump):
        return bump
    raise SystemExit("version must be patch, minor, major, or X.Y.Z")


def ensure_clean_worktree() -> None:
    status = capture(["git", "status", "--short"])
    if status:
        raise SystemExit("Working tree must be clean before release. Commit or stash changes first.")


def update_changelog(version: str, message: str, issue: str | None) -> None:
    path = ROOT / "CHANGELOG.md"
    content = path.read_text(encoding="utf-8")
    issue_suffix = f" ([#{issue}](https://github.com/wazootech/wiki/issues/{issue}))" if issue else ""
    entry = (
        f"## {version} — {datetime.now(UTC).date().isoformat()}\n\n"
        "### Fixed\n\n"
        f"- {message.rstrip('.')}.{issue_suffix}\n\n"
    )
    if f"## {version} " in content:
        raise SystemExit(f"CHANGELOG.md already contains {version}")
    path.write_text(content.replace("## Unreleased\n\n", f"## Unreleased\n\n{entry}", 1), encoding="utf-8")


def prepare_release(version: str, message: str, issue: str | None) -> None:
    set_version.update_versions(version)
    update_changelog(version, message, issue)
    run(["wiki", "-c", "docs/wiki.yml", "render"])
    run(["wiki", "-c", "docs/wiki.yml", "fmt", *DOCS_TO_FORMAT])


def run_checks(full: bool) -> None:
    run(["uv", "run", "ruff", "check", "."])
    if full:
        run(["uv", "run", "pytest"])
        run(["npm", "run", "test:npm"])
    else:
        run(["uv", "run", "pytest", "tests/test_version.py", "tests/test_graph.py"])
    run(["wiki", "-c", "docs/wiki.yml", "fmt", "--check"])
    run(["wiki", "-c", "docs/wiki.yml", "lint", "--strict"])
    run(["wiki", "-c", "docs/wiki.yml", "check", "--strict"])
    run(["wiki", "-c", "docs/wiki.yml", "render", "--check"])


def commit_tag_push(version: str, push: bool, watch: bool) -> None:
    run(["git", "add", *RELEASE_FILES])
    run(["git", "commit", "-m", f"chore: release v{version}"])
    run(["git", "tag", f"v{version}"])
    if not push:
        return
    run(["git", "push", "origin", "main"])
    run(["git", "push", "origin", f"v{version}"])
    if watch:
        run_id = capture([
            "gh",
            "run",
            "list",
            "--repo",
            "wazootech/wiki",
            "--workflow",
            "Release",
            "--branch",
            f"v{version}",
            "--limit",
            "1",
            "--json",
            "databaseId",
            "--jq",
            ".[0].databaseId",
        ])
        if run_id:
            run(["gh", "run", "watch", run_id, "--repo", "wazootech/wiki", "--exit-status"], check=False)


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare and optionally publish a Wiki CLI release.")
    parser.add_argument("bump", help="patch, minor, major, or exact X.Y.Z")
    parser.add_argument("--message", required=True, help="Changelog bullet text")
    parser.add_argument("--issue", help="GitHub issue number to link in CHANGELOG.md")
    parser.add_argument("--push", action="store_true", help="Push main and the release tag")
    parser.add_argument("--watch", action="store_true", help="Watch GitHub Actions after pushing")
    parser.add_argument("--full", action="store_true", help="Run full pytest and npm checks instead of focused checks")
    parser.add_argument("--no-commit", action="store_true", help="Prepare files and run checks without committing/tagging")
    args = parser.parse_args()

    ensure_clean_worktree()
    version = next_version(current_version(), args.bump)
    prepare_release(version, args.message, args.issue)
    run_checks(full=args.full)
    if not args.no_commit:
        commit_tag_push(version, push=args.push, watch=args.watch)
    print(f"Prepared release v{version}")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as exc:
        sys.exit(exc.returncode)
