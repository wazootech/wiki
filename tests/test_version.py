import sys
import unittest
from pathlib import Path

# Make the scripts directory importable
repo_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(repo_root / "scripts"))

import set_version  # noqa: E402


class TestVersionSync(unittest.TestCase):
    def test_version_strings_are_in_sync(self) -> None:
        """Verify that all version strings across pyproject.toml, package.json, package-lock.json,
        src/wiki/__init__.py, and docs/wiki/Wiki_CLI.md are identical.
        """
        versions = set_version.check_versions()
        self.assertTrue(len(versions) > 0, "No version strings were parsed from the codebase.")
        
        unique_versions = set(versions.values())
        self.assertEqual(
            len(unique_versions), 
            1, 
            "Version mismatch detected in codebase!\n" + "\n".join(f"  {k}: {v}" for k, v in versions.items())
        )

if __name__ == "__main__":
    unittest.main()
