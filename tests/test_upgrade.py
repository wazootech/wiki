"""Tests for wiki upgrade command."""

from __future__ import annotations

import json
import subprocess
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from click.testing import CliRunner

from wiki.cli import main
from wiki.upgrade import _parse_version, check_version, get_current_version, get_latest_version, get_windows_path_mismatch_warning


PYPI_RESPONSE_LATEST = {
    "info": {"version": "1.0.0"},
}

PYPI_RESPONSE_SAME = {
    "info": {"version": "0.1.4"},
}


class TestUpgradeLogic(unittest.TestCase):

    def test_parse_version(self) -> None:
        self.assertEqual(_parse_version("0.1.4"), (0, 1, 4))
        self.assertEqual(_parse_version("1.0.0"), (1, 0, 0))
        self.assertEqual(_parse_version("0.0.1"), (0, 0, 1))
        self.assertEqual(_parse_version("0.1"), (0, 1, 0))
        self.assertEqual(_parse_version("1"), (1, 0, 0))

    @patch("wiki.upgrade.version", return_value="0.1.4")
    def test_get_current_version_found(self, mock_version: MagicMock) -> None:
        self.assertEqual(get_current_version(), "0.1.4")

    @patch("wiki.upgrade.version", side_effect=Exception("not found"))
    def test_get_current_version_not_found(self, mock_version: MagicMock) -> None:
        # Exception rather than PackageNotFoundError is caught by broad except
        self.assertIsNone(get_current_version())

    @patch("wiki.upgrade.urlopen")
    def test_get_latest_version_success(self, mock_urlopen: MagicMock) -> None:
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps(PYPI_RESPONSE_LATEST).encode()
        mock_urlopen.return_value.__enter__.return_value = mock_resp
        self.assertEqual(get_latest_version(), "1.0.0")

    @patch("wiki.upgrade.urlopen", side_effect=OSError("network error"))
    def test_get_latest_version_network_error(self, mock_urlopen: MagicMock) -> None:
        self.assertIsNone(get_latest_version())

    @patch("wiki.upgrade.urlopen")
    def test_get_latest_version_bad_json(self, mock_urlopen: MagicMock) -> None:
        mock_resp = MagicMock()
        mock_resp.read.return_value = b"not json"
        mock_urlopen.return_value.__enter__.return_value = mock_resp
        self.assertIsNone(get_latest_version())

    @patch("wiki.upgrade.get_current_version", return_value="0.1.4")
    @patch("wiki.upgrade.get_latest_version", return_value="1.0.0")
    def test_check_version_outdated(self, mock_latest: MagicMock, mock_current: MagicMock) -> None:
        current, latest, outdated = check_version()
        self.assertEqual(current, "0.1.4")
        self.assertEqual(latest, "1.0.0")
        self.assertTrue(outdated)

    @patch("wiki.upgrade.get_current_version", return_value="0.1.4")
    @patch("wiki.upgrade.get_latest_version", return_value="0.1.4")
    def test_check_version_current(self, mock_latest: MagicMock, mock_current: MagicMock) -> None:
        current, latest, outdated = check_version()
        self.assertEqual(current, "0.1.4")
        self.assertEqual(latest, "0.1.4")
        self.assertFalse(outdated)

    @patch("wiki.upgrade.os.name", "nt")
    @patch("wiki.upgrade.sysconfig.get_path", return_value=r"C:\\Python\\Scripts")
    @patch("wiki.upgrade.shutil.which", return_value=r"C:\\Python\\Scripts\\wiki.exe")
    def test_windows_path_mismatch_warning_not_emitted_for_current_scripts_dir(
        self,
        mock_which: MagicMock,
        mock_scripts: MagicMock,
    ) -> None:
        self.assertIsNone(get_windows_path_mismatch_warning())

    @patch("wiki.upgrade.os.name", "nt")
    @patch("wiki.upgrade.sysconfig.get_path", return_value=r"C:\\Users\\ethan\\AppData\\Local\\Programs\\Python\\Python312\\Scripts")
    @patch("wiki.upgrade.shutil.which", return_value=r"C:\\Users\\ethan\\.local\\bin\\wiki.exe")
    def test_windows_path_mismatch_warning_emitted_for_stale_shim(
        self,
        mock_which: MagicMock,
        mock_scripts: MagicMock,
    ) -> None:
        warning = get_windows_path_mismatch_warning()
        assert warning is not None
        self.assertIn("PATH resolves `wiki`", warning)
        self.assertIn(r"C:\Users\ethan\.local\bin\wiki.exe", warning)
        self.assertIn("Get-Command wiki", warning)
        self.assertIn("python -m wiki upgrade -y", warning)


class TestUpgradeCLI(unittest.TestCase):

    def _mock_pypi(self, version_str: str = "1.0.0") -> MagicMock:
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps({"info": {"version": version_str}}).encode()
        mock_urlopen = MagicMock()
        mock_urlopen.return_value.__enter__.return_value = mock_resp
        return mock_urlopen

    @patch("wiki.upgrade.version", return_value="0.1.4")
    def test_upgrade_check_outdated(self, mock_version: MagicMock) -> None:
        runner = CliRunner()
        mock_urlopen = self._mock_pypi("1.0.0")
        with patch("wiki.upgrade.urlopen", mock_urlopen):
            result = runner.invoke(main, ["upgrade", "--check"])
        self.assertEqual(result.exit_code, 1)
        self.assertIn("Update available: 0.1.4 -> 1.0.0", result.output)

    @patch("wiki.upgrade.version", return_value="0.1.4")
    def test_upgrade_check_current(self, mock_version: MagicMock) -> None:
        runner = CliRunner()
        mock_urlopen = self._mock_pypi("0.1.4")
        with patch("wiki.upgrade.urlopen", mock_urlopen):
            result = runner.invoke(main, ["upgrade", "--check"])
        self.assertEqual(result.exit_code, 0)
        self.assertIn("You're up to date (0.1.4).", result.output)

    @patch("wiki.upgrade.version", return_value="0.1.4")
    def test_upgrade_check_network_error(self, mock_version: MagicMock) -> None:
        runner = CliRunner()
        with patch("wiki.upgrade.urlopen", side_effect=OSError("no network")):
            result = runner.invoke(main, ["upgrade", "--check"])
        self.assertEqual(result.exit_code, 1)
        self.assertIn("cannot reach PyPI", result.output)

    @patch("wiki.upgrade.version", side_effect=Exception("not found"))
    def test_upgrade_check_package_not_found(self, mock_version: MagicMock) -> None:
        runner = CliRunner()
        result = runner.invoke(main, ["upgrade", "--check"])
        self.assertEqual(result.exit_code, 1)
        self.assertIn("cannot determine current version", result.output)

    @patch("wiki.upgrade.version", return_value="0.1.4")
    def test_upgrade_with_yes(self, mock_version: MagicMock) -> None:
        runner = CliRunner()
        mock_urlopen = self._mock_pypi("1.0.0")
        with (
            patch("wiki.upgrade.urlopen", mock_urlopen),
            patch("wiki.upgrade.subprocess.check_call") as mock_pip,
        ):
            result = runner.invoke(main, ["upgrade", "--yes"])
        self.assertEqual(result.exit_code, 0)
        self.assertIn("Upgraded to 1.0.0.", result.output)
        mock_pip.assert_called_once()

    @patch("wiki.upgrade.version", return_value="0.1.4")
    def test_upgrade_already_latest_noop(self, mock_version: MagicMock) -> None:
        runner = CliRunner()
        mock_urlopen = self._mock_pypi("0.1.4")
        with patch("wiki.upgrade.urlopen", mock_urlopen):
            result = runner.invoke(main, ["upgrade", "--yes"])
        self.assertEqual(result.exit_code, 0)
        self.assertIn("You're up to date (0.1.4).", result.output)

    @patch("wiki.upgrade.version", return_value="0.1.4")
    def test_upgrade_pip_failure(self, mock_version: MagicMock) -> None:
        runner = CliRunner()
        mock_urlopen = self._mock_pypi("1.0.0")
        with (
            patch("wiki.upgrade.urlopen", mock_urlopen),
            patch("wiki.upgrade.subprocess.check_call", side_effect=subprocess.CalledProcessError(1, ["pip"])),
        ):
            result = runner.invoke(main, ["upgrade", "--yes"])
        self.assertEqual(result.exit_code, 1)
        self.assertIn("Upgrade failed", result.output)

    @patch("wiki.upgrade.version", return_value="0.1.4")
    def test_upgrade_verbose(self, mock_version: MagicMock) -> None:
        runner = CliRunner()
        mock_urlopen = self._mock_pypi("1.0.0")
        with (
            patch("wiki.upgrade.urlopen", mock_urlopen),
            patch("wiki.upgrade.subprocess.check_call") as mock_pip,
        ):
            result = runner.invoke(main, ["upgrade", "--yes", "--verbose"])
        self.assertEqual(result.exit_code, 0)
        self.assertIn("Running:", result.output)
        self.assertIn("pip install --upgrade", result.output)
        self.assertIn("Upgraded to 1.0.0.", result.output)
        mock_pip.assert_called_once()

    @patch("wiki.upgrade.version", return_value="0.1.4")
    @patch("wiki.upgrade.get_windows_path_mismatch_warning", return_value="Warning: stale wiki.exe")
    def test_upgrade_check_prints_path_mismatch_warning(self, mock_warning: MagicMock, mock_version: MagicMock) -> None:
        runner = CliRunner()
        mock_urlopen = self._mock_pypi("0.1.4")
        with patch("wiki.upgrade.urlopen", mock_urlopen):
            result = runner.invoke(main, ["upgrade", "--check"])
        self.assertEqual(result.exit_code, 0)
        self.assertIn("You're up to date (0.1.4).", result.output)
        self.assertIn("Warning: stale wiki.exe", result.output)


if __name__ == "__main__":
    unittest.main()
