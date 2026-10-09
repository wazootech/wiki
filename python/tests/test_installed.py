"""Tests for the installed ``wazootech-wiki`` wheel.

Run these from a clean virtual environment that has the built wheel installed,
never against the source tree: what they check is the packaged artifact. A
resource that exists in ``src/wiki`` but not in the wheel is the #316 failure,
and the source tree cannot catch it.

    uv build --wheel
    uv venv .pyenv && uv pip install --python .pyenv dist/wazootech_wiki-*.whl
    .pyenv/bin/python -m unittest discover -s python/tests -v
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import sysconfig
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import wiki
from wiki import _runtime

ENGINE = _runtime.ENGINE_ROOT

# Files the wheel must carry, mirroring `package.json`'s `files`.
PACKAGED = [
    "deno.json",
    "deno.lock",
    "package.json",
    "src/wiki/cli.ts",
    "src/wiki/mod.ts",
    "src/wiki/index.html",
]

# The full public surface. A rename here is a breaking change, so it fails.
PUBLIC = {
    "Runtime",
    "WikiResult",
    "WikiSetupError",
    "__version__",
    "create_wiki_command",
    "find_runtime",
    "run",
}


def wiki_script() -> str:
    name = "wiki" + (sysconfig.get_config_var("EXE") or "")
    path = Path(sysconfig.get_path("scripts")) / name
    if not path.is_file():
        raise unittest.SkipTest(f"console script not installed at {path}")
    return str(path)


def isolated_env(root: Path) -> dict[str, str]:
    """``os.environ`` with ``PATH`` reduced to one empty directory.

    No system Deno, Node, or Python is reachable, so a passing run proves the
    wheel's own runtime dependency is what ran the engine.
    """
    empty = root / "empty-path"
    empty.mkdir()
    env = dict(os.environ)
    for key in [k for k in env if k.upper() == "PATH"]:
        del env[key]
    env["PATH"] = str(empty)
    return env


class InstalledArtifactTest(unittest.TestCase):
    def test_is_installed_not_source_tree(self) -> None:
        self.assertIn("site-packages", Path(wiki.__file__).parts)

    def test_engine_files_are_packaged(self) -> None:
        for rel in PACKAGED:
            with self.subTest(rel=rel):
                self.assertTrue((ENGINE / rel).is_file(), f"wheel omits {rel}")
        templates = list((ENGINE / "src/wiki/templates").rglob("*.yml"))
        self.assertTrue(templates, "wheel omits src/wiki/templates/**/*.yml")

    def test_no_bytecode_or_stray_files_in_engine(self) -> None:
        allowed = {".ts", ".html", ".yml", ".json", ".lock"}
        stray = [
            p.relative_to(ENGINE)
            for p in ENGINE.rglob("*")
            if p.is_file() and p.suffix not in allowed
        ]
        self.assertEqual(stray, [])

    def test_py_typed_marker(self) -> None:
        self.assertTrue((Path(wiki.__file__).parent / "py.typed").is_file())

    def test_public_surface(self) -> None:
        self.assertEqual(set(wiki.__all__), PUBLIC)

    def test_version_matches_engine(self) -> None:
        version_ts = (ENGINE / "src/wiki/version.ts").read_text(encoding="utf-8")
        self.assertIn(f'export const VERSION = "{wiki.__version__}";', version_ts)


class RuntimeResolutionTest(unittest.TestCase):
    def test_bundled_deno_is_the_default(self) -> None:
        runtime = wiki.find_runtime()
        self.assertEqual(runtime.kind, "bundled")
        self.assertTrue(Path(runtime.executable).is_file())

    def test_command_mirrors_the_npm_runtime(self) -> None:
        command = wiki.create_wiki_command(["--help"])
        self.assertEqual(
            command[1:9],
            [
                "run",
                "--node-modules-dir=none",
                "--allow-all",
                "--config",
                str(_runtime.DENO_CONFIG),
                "--lock",
                str(_runtime.DENO_LOCK),
                "--frozen",
            ],
        )
        self.assertEqual(command[9], str(_runtime.ENGINE_ENTRY))
        self.assertEqual(command[10:], ["--help"])

    def test_falls_back_to_deno_on_path(self) -> None:
        with mock.patch.object(_runtime, "_bundled_deno", return_value=None), \
                mock.patch.object(_runtime.shutil, "which", side_effect=lambda n: "/x/deno" if n == "deno" else None):
            self.assertEqual(wiki.find_runtime(), wiki.Runtime("path", "/x/deno"))

    def test_falls_back_to_standalone_which_takes_args_directly(self) -> None:
        def which(name: str) -> str | None:
            return "/x/wazootech-wiki" if name == "wazootech-wiki" else None

        with mock.patch.object(_runtime, "_bundled_deno", return_value=None), \
                mock.patch.object(_runtime.shutil, "which", side_effect=which):
            self.assertEqual(
                wiki.create_wiki_command(["check"]), ["/x/wazootech-wiki", "check"]
            )

    def test_no_runtime_is_an_actionable_error(self) -> None:
        with mock.patch.object(_runtime, "_bundled_deno", return_value=None), \
                mock.patch.object(_runtime.shutil, "which", return_value=None):
            with self.assertRaises(wiki.WikiSetupError) as raised:
                wiki.find_runtime()
        self.assertIn("reinstall wazootech-wiki", str(raised.exception))

    def test_missing_engine_is_an_actionable_error(self) -> None:
        with mock.patch.object(_runtime, "ENGINE_ENTRY", ENGINE / "nope.ts"):
            with self.assertRaises(wiki.WikiSetupError) as raised:
                wiki.create_wiki_command([])
        self.assertIn("Wiki engine is missing", str(raised.exception))

    def test_string_args_are_rejected(self) -> None:
        with self.assertRaises(TypeError):
            wiki.create_wiki_command("check")  # type: ignore[arg-type]


class EndToEndTest(unittest.TestCase):
    """Drive the installed console script with no system runtime on PATH."""

    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="wiki-pypi-"))
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        self.env = isolated_env(self.root)
        self.project = self.root / "project"
        self.project.mkdir()

    def wiki(self, *args: str) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(
            [wiki_script(), *args],
            cwd=self.project,
            env=self.env,
            capture_output=True,
            encoding="utf-8",
            timeout=600,
            check=False,
        )
        self.assertEqual(
            result.returncode, 0, f"wiki {' '.join(args)}\n{result.stdout}\n{result.stderr}"
        )
        return result

    def test_version(self) -> None:
        self.assertIn(wiki.__version__, self.wiki("--version").stdout)

    def test_minimal_layout_init_then_build(self) -> None:
        # #316: `init --site-layout minimal` succeeded and `build` then crashed
        # because the packaged layout was missing from the installed artifact.
        self.wiki("init", "--site-layout", "minimal")
        self.assertIn("minimal", (self.project / "wiki.yml").read_text(encoding="utf-8"))
        self.wiki("build", "--output-dir", "_site")
        pages = list((self.project / "_site").rglob("*.html"))
        self.assertTrue(pages, "wiki build wrote no HTML")

    def test_run_api_decodes_utf8(self) -> None:
        # #326: output must come back as UTF-8, not the console codepage.
        self.wiki("init")
        page = self.project / "wiki" / "Mikaël_Héroux.md"
        page.parent.mkdir(exist_ok=True)
        page.write_text("---\ntype: schema:Thing\nname: Mikaël Héroux\n---\n\n# Mikaël Héroux\n", encoding="utf-8")
        result = wiki.run(["query", "SELECT ?n WHERE { ?s <https://schema.org/name> ?n }"], cwd=self.project, env=self.env)
        self.assertTrue(result.ok, result.stderr)
        self.assertIn("Mikaël Héroux", result.stdout)
        self.assertNotIn("�", result.stdout)


if __name__ == "__main__":
    unittest.main()
