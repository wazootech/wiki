"""Unit tests for the FormatChoice custom Click type."""

import unittest
from click.testing import CliRunner
import click

from llm_wiki.format_choice import FormatChoice


QUERY_FORMATS = ["table", "json", "csv", "tsv", "turtle", "n3", "markdown"]
EXPORT_FORMATS = ["dict", "json-ld", "turtle", "xml", "n3", "nt", "trig", "nquads"]


class TestFormatChoice(unittest.TestCase):

    def setUp(self):
        self.runner = CliRunner()

    def _make_cmd(self, formats, **kwargs):
        """Create a trivial CLI command with a single --fmt option using FormatChoice."""
        choice = FormatChoice(formats, **kwargs)

        @click.command()
        @click.option("--fmt", type=choice)
        def cmd(fmt):
            click.echo(fmt)

        return cmd

    # -- MIME alias resolution ------------------------------------------------

    def test_mime_alias_resolves_to_canonical(self):
        cmd = self._make_cmd(QUERY_FORMATS)
        result = self.runner.invoke(cmd, ["--fmt", "text/turtle"])
        self.assertEqual(result.exit_code, 0)
        self.assertEqual(result.output.strip(), "turtle")

    def test_mime_alias_json_ld(self):
        cmd = self._make_cmd(EXPORT_FORMATS)
        result = self.runner.invoke(cmd, ["--fmt", "application/ld+json"])
        self.assertEqual(result.exit_code, 0)
        self.assertEqual(result.output.strip(), "json-ld")

    def test_sparql_result_mime_alias(self):
        cmd = self._make_cmd(QUERY_FORMATS)
        result = self.runner.invoke(cmd, ["--fmt", "application/sparql-results+json"])
        self.assertEqual(result.exit_code, 0)
        self.assertEqual(result.output.strip(), "json")

    def test_file_extension_alias_ttl(self):
        cmd = self._make_cmd(QUERY_FORMATS, case_sensitive=False)
        result = self.runner.invoke(cmd, ["--fmt", "ttl"])
        self.assertEqual(result.exit_code, 0)
        self.assertEqual(result.output.strip(), "turtle")

    def test_file_extension_alias_ntriples(self):
        cmd = self._make_cmd(EXPORT_FORMATS, case_sensitive=False)
        result = self.runner.invoke(cmd, ["--fmt", "ntriples"])
        self.assertEqual(result.exit_code, 0)
        self.assertEqual(result.output.strip(), "nt")

    def test_file_extension_alias_nq(self):
        cmd = self._make_cmd(EXPORT_FORMATS, case_sensitive=False)
        result = self.runner.invoke(cmd, ["--fmt", "nq"])
        self.assertEqual(result.exit_code, 0)
        self.assertEqual(result.output.strip(), "nquads")

    def test_alternative_mime_x_turtle(self):
        cmd = self._make_cmd(QUERY_FORMATS, case_sensitive=False)
        result = self.runner.invoke(cmd, ["--fmt", "application/x-turtle"])
        self.assertEqual(result.exit_code, 0)
        self.assertEqual(result.output.strip(), "turtle")

    def test_jsonld_no_hyphen_alias(self):
        cmd = self._make_cmd(EXPORT_FORMATS, case_sensitive=False)
        result = self.runner.invoke(cmd, ["--fmt", "jsonld"])
        self.assertEqual(result.exit_code, 0)
        self.assertEqual(result.output.strip(), "json-ld")

    def test_markdown_alias_md(self):
        cmd = self._make_cmd(QUERY_FORMATS, case_sensitive=False)
        result = self.runner.invoke(cmd, ["--fmt", "md"])
        self.assertEqual(result.exit_code, 0)
        self.assertEqual(result.output.strip(), "markdown")

    def test_application_json_alias(self):
        cmd = self._make_cmd(QUERY_FORMATS, case_sensitive=False)
        result = self.runner.invoke(cmd, ["--fmt", "application/json"])
        self.assertEqual(result.exit_code, 0)
        self.assertEqual(result.output.strip(), "json")

    # -- MIME type that maps to a format NOT in the choices -------------------

    def test_mime_alias_not_in_choices(self):
        cmd = self._make_cmd(QUERY_FORMATS)
        # "application/rdf+xml" → "xml", which is NOT a query format
        result = self.runner.invoke(cmd, ["--fmt", "application/rdf+xml"])
        self.assertNotEqual(result.exit_code, 0)
        self.assertIn("not one of", result.output)

    # -- Case sensitivity -----------------------------------------------------

    def test_case_sensitive_default(self):
        cmd = self._make_cmd(QUERY_FORMATS)  # case_sensitive=True (default)
        result = self.runner.invoke(cmd, ["--fmt", "TURTLE"])
        self.assertNotEqual(result.exit_code, 0)
        self.assertIn("not one of", result.output)

    def test_case_insensitive(self):
        cmd = self._make_cmd(QUERY_FORMATS, case_sensitive=False)
        result = self.runner.invoke(cmd, ["--fmt", "TURTLE"])
        self.assertEqual(result.exit_code, 0)
        self.assertEqual(result.output.strip(), "turtle")

    def test_case_insensitive_mime(self):
        cmd = self._make_cmd(QUERY_FORMATS, case_sensitive=False)
        result = self.runner.invoke(cmd, ["--fmt", "TEXT/TURTLE"])
        self.assertEqual(result.exit_code, 0)
        self.assertEqual(result.output.strip(), "turtle")

    # -- "Did you mean …?" suggestions ---------------------------------------

    def test_did_you_mean_suggestion(self):
        cmd = self._make_cmd(QUERY_FORMATS)
        result = self.runner.invoke(cmd, ["--fmt", "turtl"])
        self.assertNotEqual(result.exit_code, 0)
        self.assertIn("Did you mean", result.output)
        self.assertIn("'turtle'", result.output)

    def test_did_you_mean_suggest_mime(self):
        cmd = self._make_cmd(EXPORT_FORMATS)
        result = self.runner.invoke(cmd, ["--fmt", "text/turtl"])
        self.assertNotEqual(result.exit_code, 0)
        self.assertIn("Did you mean", result.output)
        self.assertIn("'text/turtle'", result.output)

    def test_did_you_mean_not_shown_for_completely_wrong_input(self):
        cmd = self._make_cmd(QUERY_FORMATS)
        result = self.runner.invoke(cmd, ["--fmt", "xyzzy"])
        self.assertNotEqual(result.exit_code, 0)
        self.assertNotIn("Did you mean", result.output)

    # -- Edge cases ----------------------------------------------------------

    def test_unknown_mime_type_rejected(self):
        cmd = self._make_cmd(QUERY_FORMATS)
        result = self.runner.invoke(cmd, ["--fmt", "application/x-foo"])
        self.assertNotEqual(result.exit_code, 0)

    def test_short_name_works_as_before(self):
        cmd = self._make_cmd(QUERY_FORMATS)
        result = self.runner.invoke(cmd, ["--fmt", "json"])
        self.assertEqual(result.exit_code, 0)
        self.assertEqual(result.output.strip(), "json")

    def test_all_query_choices_accessible(self):
        cmd = self._make_cmd(QUERY_FORMATS)
        for fmt in QUERY_FORMATS:
            result = self.runner.invoke(cmd, ["--fmt", fmt])
            self.assertEqual(result.exit_code, 0, f"format={fmt!r} failed")

    def test_all_export_choices_accessible(self):
        cmd = self._make_cmd(EXPORT_FORMATS)
        for fmt in EXPORT_FORMATS:
            result = self.runner.invoke(cmd, ["--fmt", fmt])
            self.assertEqual(result.exit_code, 0, f"format={fmt!r} failed")


if __name__ == "__main__":
    unittest.main()
