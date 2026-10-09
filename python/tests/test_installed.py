"""Tests for an installed ``wazootech-wiki`` wheel.

Run these from a clean virtual environment with one built wheel installed,
never against the source tree: what they check is the packaged artifact.

    deno compile ... --output dist/wazootech-wiki-<slug> src/wiki/cli.ts
    python scripts/build_wheel.py --binary dist/wazootech-wiki-<slug> --target <triple>
    uv venv .pyenv && uv pip install --python .pyenv dist/wheels/wazootech_wiki-*-<plat>.whl
    .pyenv/bin/python -m unittest discover -s python/tests -v

The same file covers both wheel kinds. Against a platform wheel it drives the
embedded binary end to end. Against the ``py3-none-any`` fallback it needs a
real binary to put on ``PATH``: set ``WIKI_TEST_BINARY`` to one (CI does, and
sets ``WIKI_REQUIRE_E2E=1`` so a missing binary fails instead of skipping).
"""

from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sysconfig
import tempfile
import unittest
from importlib.metadata import distribution, requires
from pathlib import Path
from unittest import mock

import wiki
from wiki import __main__ as cli
from wiki import _runtime

BUNDLED = _runtime.BUNDLED
EXE = sysconfig.get_config_var("EXE") or (".exe" if os.name == "nt" else "")
TEST_BINARY = os.environ.get("WIKI_TEST_BINARY")
REQUIRE_E2E = os.environ.get("WIKI_REQUIRE_E2E") == "1"

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


def wiki_script() -> Path:
    """The installed ``wiki``: the binary itself, or the fallback launcher."""
    path = Path(sysconfig.get_path("scripts")) / f"wiki{EXE}"
    # Fail rather than skip: a wheel without its `wiki` is exactly the
    # installed-artifact defect these tests exist to catch.
    if not path.is_file():
        raise AssertionError(f"`wiki` not installed at {path}")
    return path


def bare_env(root: Path, path_dirs: list[Path] | None = None) -> dict[str, str]:
    """``os.environ`` minus every Wiki override, with ``PATH`` set to ``path_dirs``.

    By default ``PATH`` is one empty directory, so no system Deno, Node, or
    standalone binary can stand in for what the wheel installed.
    """
    if path_dirs is None:
        empty = root / "empty-path"
        empty.mkdir(exist_ok=True)
        path_dirs = [empty]
    env = {
        key: value for key, value in os.environ.items()
        if key.upper() != "PATH" and key not in {"WIKI_BINARY", _runtime.LAUNCHER_ENV}
    }
    env["PATH"] = os.pathsep.join(str(d) for d in path_dirs)
    return env


def run_wiki(*args: str, cwd: Path, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(wiki_script()), *args], cwd=cwd, env=env, capture_output=True,
        encoding="utf-8", errors="replace", timeout=600, check=False,
    )


class TempDirTest(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="wiki-pypi-"))
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)


class InstalledArtifactTest(unittest.TestCase):
    def test_is_installed_not_source_tree(self) -> None:
        self.assertIn("site-packages", Path(wiki.__file__).parts)

    def test_no_engine_source_and_no_runtime_dependencies(self) -> None:
        package = Path(wiki.__file__).parent
        self.assertFalse((package / "_engine").exists())
        stray = [p.name for p in package.rglob("*") if p.is_file() and p.suffix not in {".py", ".pyc", ".typed"}]
        self.assertEqual(stray, [])
        self.assertEqual(requires("wazootech-wiki") or [], [])

    def test_py_typed_marker(self) -> None:
        self.assertTrue((Path(wiki.__file__).parent / "py.typed").is_file())

    def test_public_surface(self) -> None:
        self.assertEqual(set(wiki.__all__), PUBLIC)

    def test_wiki_command_is_the_binary_or_the_launcher(self) -> None:
        dist = distribution("wazootech-wiki")
        entry_points = [ep.name for ep in dist.entry_points]
        if BUNDLED:
            # The platform wheel's `wiki` is the binary itself; a console
            # script of the same name would overwrite it.
            self.assertEqual(entry_points, [])
            self.assertGreater(wiki_script().stat().st_size, 50_000_000)
            if os.name == "posix":
                self.assertTrue(os.access(wiki_script(), os.X_OK))
        else:
            self.assertEqual(entry_points, ["wiki"])
            self.assertLess(wiki_script().stat().st_size, 1_000_000)


@unittest.skipUnless(BUNDLED, "platform wheel only")
class BundledLocatorTest(unittest.TestCase):
    def test_finds_the_installed_binary(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("WIKI_BINARY", None)
            runtime = wiki.find_runtime()
        self.assertEqual(runtime.kind, "bundled")
        self.assertTrue(Path(runtime.executable).samefile(wiki_script()))

    def test_wiki_binary_overrides(self) -> None:
        with mock.patch.dict(os.environ, {"WIKI_BINARY": str(wiki_script())}):
            self.assertEqual(wiki.find_runtime().kind, "env")

    def test_missing_binary_says_reinstall(self) -> None:
        with mock.patch.object(_runtime, "_bundled_binary", return_value=None), \
                mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("WIKI_BINARY", None)
            with self.assertRaisesRegex(wiki.WikiSetupError, "Reinstall"):
                wiki.find_runtime()


class FallbackLocatorTest(unittest.TestCase):
    """The ``py3-none-any`` resolution logic, whichever wheel is installed."""

    def setUp(self) -> None:
        patches = [
            mock.patch.object(_runtime, "BUNDLED", False),
            mock.patch.dict(os.environ, {}, clear=False),
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)
        os.environ.pop("WIKI_BINARY", None)

    def test_uses_the_standalone_on_path(self) -> None:
        with mock.patch.object(_runtime.shutil, "which", side_effect=lambda n: f"/x/{n}") as which:
            self.assertEqual(wiki.create_wiki_command(["check"]), ["/x/wazootech-wiki", "check"])
        # `wiki` on PATH is this launcher in the fallback wheel; never look it up.
        self.assertEqual([c.args[0] for c in which.call_args_list], ["wazootech-wiki"])

    def test_nothing_on_path_names_the_way_out(self) -> None:
        with mock.patch.object(_runtime.shutil, "which", return_value=None):
            with self.assertRaises(wiki.WikiSetupError) as raised:
                wiki.find_runtime()
        message = str(raised.exception)
        for expected in ("musl", "wazootech-wiki", "WIKI_BINARY"):
            self.assertIn(expected, message)

    def test_wiki_binary_must_be_a_file(self) -> None:
        os.environ["WIKI_BINARY"] = "/definitely/not/here"
        with self.assertRaisesRegex(wiki.WikiSetupError, "not a file"):
            wiki.find_runtime()

    def test_string_args_are_rejected(self) -> None:
        with self.assertRaises(TypeError):
            wiki.create_wiki_command("check")  # type: ignore[arg-type]


class ConsoleScriptTest(unittest.TestCase):
    """``wiki.__main__`` against a fake child, for ``bin/wiki.js`` parity."""

    def setUp(self) -> None:
        patch = mock.patch.dict(os.environ, {}, clear=False)
        patch.start()
        self.addCleanup(patch.stop)
        os.environ.pop(_runtime.LAUNCHER_ENV, None)

    def fake_child(self, wait: object) -> mock.MagicMock:
        child = mock.MagicMock()
        child.wait.side_effect = wait
        return child

    def run_main(self, child: mock.MagicMock) -> int:
        with mock.patch.object(cli, "create_wiki_command", return_value=["wazootech-wiki"]), \
                mock.patch.object(cli.subprocess, "Popen", return_value=child) as popen:
            code = cli.main(["check"])
        # The child is marked, so a launcher it resolves to refuses to recurse.
        self.assertEqual(popen.call_args.kwargs["env"][_runtime.LAUNCHER_ENV], "1")
        return code

    def test_exit_code_passes_through(self) -> None:
        self.assertEqual(self.run_main(self.fake_child(lambda: 3)), 3)

    def test_death_by_signal_is_128_plus_n(self) -> None:
        self.assertEqual(self.run_main(self.fake_child(lambda: -15)), 143)
        self.assertEqual(self.run_main(self.fake_child(lambda: -2)), 130)

    def test_setup_error_exits_1(self) -> None:
        with mock.patch.object(
            cli, "create_wiki_command", side_effect=wiki.WikiSetupError("no binary")
        ), mock.patch("sys.stderr"):
            self.assertEqual(cli.main(["check"]), 1)

    def test_a_launcher_started_by_a_launcher_refuses(self) -> None:
        os.environ[_runtime.LAUNCHER_ENV] = "1"
        with mock.patch.object(cli.subprocess, "Popen") as popen, mock.patch("sys.stderr"):
            self.assertEqual(cli.main(["check"]), 1)
        popen.assert_not_called()

    @unittest.skipUnless(os.name == "posix", "signal forwarding is POSIX-only")
    def test_sigterm_is_forwarded_to_the_child(self) -> None:
        # `bin/wiki.js` forwards SIGINT and SIGTERM; a kill aimed at the wrapper
        # alone must reach the engine rather than orphan it.
        before = signal.getsignal(signal.SIGTERM)

        def wait() -> int:
            os.kill(os.getpid(), signal.SIGTERM)
            return -signal.SIGTERM

        child = self.fake_child(wait)
        self.assertEqual(self.run_main(child), 128 + signal.SIGTERM)
        child.send_signal.assert_called_once_with(signal.SIGTERM)
        self.assertEqual(signal.getsignal(signal.SIGTERM), before)


@unittest.skipUnless(BUNDLED, "platform wheel only")
class BundledEndToEndTest(TempDirTest):
    """Drive the installed binary with nothing else on PATH."""

    def setUp(self) -> None:
        super().setUp()
        self.env = bare_env(self.root)
        self.project = self.root / "project"
        self.project.mkdir()

    def wiki(self, *args: str) -> subprocess.CompletedProcess[str]:
        result = run_wiki(*args, cwd=self.project, env=self.env)
        self.assertEqual(result.returncode, 0, f"wiki {' '.join(args)}\n{result.stdout}\n{result.stderr}")
        return result

    def test_version(self) -> None:
        self.assertIn(wiki.__version__, self.wiki("--version").stdout)

    def test_minimal_layout_init_then_build(self) -> None:
        # #316: `init --site-layout minimal` succeeded and `build` then crashed
        # because the packaged layout was missing from the installed artifact.
        self.wiki("init", "--site-layout", "minimal")
        self.assertIn("minimal", (self.project / "wiki.yml").read_text(encoding="utf-8"))
        self.wiki("build", "--output-dir", "_site")
        self.assertTrue(list((self.project / "_site").rglob("*.html")), "wiki build wrote no HTML")

    def test_run_api_decodes_utf8(self) -> None:
        # #326: output must come back as UTF-8, not the console codepage.
        self.wiki("init")
        page = self.project / "wiki" / "Mikaël_Héroux.md"
        page.parent.mkdir(exist_ok=True)
        page.write_text(
            "---\ntype: schema:Thing\nname: Mikaël Héroux\n---\n\n# Mikaël Héroux\n",
            encoding="utf-8",
        )
        result = wiki.run(
            ["query", "SELECT ?n WHERE { ?s <https://schema.org/name> ?n }"],
            cwd=self.project, env=self.env,
        )
        self.assertTrue(result.ok, result.stderr)
        self.assertIn("Mikaël Héroux", result.stdout)
        self.assertNotIn("�", result.stdout)

    def test_record_layout_matches_upgrade_detection(self) -> None:
        # `isPypiInstall` in src/wiki/upgrade.ts looks for site-packages beside
        # the binary's prefix and resolves RECORD entries against it. Check the
        # layout this installer really produced is one it searches.
        dist = distribution("wazootech-wiki")
        site = Path(str(dist.locate_file(""))).resolve()
        prefix = wiki_script().resolve().parent.parent
        relative = site.relative_to(prefix).parts
        self.assertTrue(
            relative in {("Lib", "site-packages"), ("site-packages",)}
            or (
                len(relative) == 3 and relative[0] in {"lib", "lib64"}
                and relative[1].startswith("python")
                and relative[2] in {"site-packages", "dist-packages"}
            ),
            f"site-packages at {relative} is not searched by isPypiInstall",
        )
        entries = [
            line.split(",")[0]
            for line in (site / f"{dist.metadata['Name'].replace('-', '_')}-{dist.version}.dist-info" / "RECORD")
            .read_text(encoding="utf-8").splitlines()
        ]
        self.assertTrue(
            any((site / entry).resolve() == wiki_script().resolve() for entry in entries if entry),
            "RECORD does not list the installed binary",
        )

    def test_upgrade_points_at_pip(self) -> None:
        # The binary finds its own dist-info RECORD entry, so `wiki upgrade`
        # gives pip advice rather than "replace the standalone binary".
        result = run_wiki("upgrade", "--yes", cwd=self.project, env=self.env)
        output = result.stdout + result.stderr
        if "Cannot reach JSR" in output or "up to date" in output:
            self.skipTest("no update to apply, so no install target is consulted")
        if "not published on JSR yet" in output:
            # The deferral lists every channel; PyPI must be among them.
            self.assertIn("pip install -U wazootech-wiki", output)
        else:
            self.assertIn("installed from PyPI", output)
            self.assertNotIn("standalone wiki binary", output)


@unittest.skipIf(BUNDLED, "fallback wheel only")
class FallbackEndToEndTest(TempDirTest):
    """The ``wiki`` launcher against real binaries on ``PATH``."""

    def setUp(self) -> None:
        super().setUp()
        if not TEST_BINARY:
            if REQUIRE_E2E:
                self.fail("WIKI_REQUIRE_E2E=1 but WIKI_TEST_BINARY is not set")
            self.skipTest("set WIKI_TEST_BINARY to a standalone binary")

    def path_with(self, source: Path, name: str) -> Path:
        directory = Path(tempfile.mkdtemp(dir=self.root))
        target = directory / f"{name}{EXE}"
        shutil.copy2(source, target)
        return directory

    def test_no_binary_on_path_is_a_clear_error(self) -> None:
        result = run_wiki("--version", cwd=self.root, env=bare_env(self.root))
        self.assertEqual(result.returncode, 1)
        self.assertIn("wazootech-wiki", result.stderr)
        self.assertIn("musl", result.stderr)

    def test_runs_the_standalone_on_path(self) -> None:
        directory = self.path_with(Path(TEST_BINARY), "wazootech-wiki")  # type: ignore[arg-type]
        result = run_wiki("--version", cwd=self.root, env=bare_env(self.root, [directory]))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(wiki.__version__, result.stdout)

    def test_a_launcher_named_wazootech_wiki_does_not_recurse(self) -> None:
        directory = self.path_with(wiki_script(), "wazootech-wiki")
        result = run_wiki("--version", cwd=self.root, env=bare_env(self.root, [directory]))
        self.assertEqual(result.returncode, 1)
        self.assertIn("started itself", result.stderr)


if __name__ == "__main__":
    unittest.main()
