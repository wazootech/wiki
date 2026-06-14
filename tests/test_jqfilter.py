import unittest

from wiki.jqfilter import resolve_path


class TestJQFilter(unittest.TestCase):

    def test_simple_key(self):
        self.assertEqual(resolve_path({"a": 1}, "a"), [1])

    def test_nested_key(self):
        self.assertEqual(resolve_path({"a": {"b": 2}}, "a.b"), [2])

    def test_array_wildcard(self):
        data = {"items": [{"x": 1}, {"x": 2}]}
        self.assertEqual(resolve_path(data, "items[].x"), [1, 2])

    def test_numeric_index(self):
        data = {"items": [10, 20, 30]}
        self.assertEqual(resolve_path(data, "items[0]"), [10])
        self.assertEqual(resolve_path(data, "items[2]"), [30])

    def test_sparql_results_shape(self):
        data = {
            "results": {
                "bindings": [
                    {"givenName": {"value": "Alice"}, "email": {"value": "a@x.com"}},
                    {"givenName": {"value": "Bob"}, "email": {"value": "b@x.com"}},
                ]
            }
        }
        self.assertEqual(
            resolve_path(data, "results.bindings[].givenName.value"),
            ["Alice", "Bob"],
        )
        self.assertEqual(
            resolve_path(data, "results.bindings[].email.value"),
            ["a@x.com", "b@x.com"],
        )

    def test_path_not_found_returns_empty(self):
        self.assertEqual(resolve_path({"a": 1}, "b"), [])
        self.assertEqual(resolve_path({"a": 1}, "a.b"), [])

    def test_mixed_types_skips_non_matching(self):
        data = {"items": [{"x": 1}, "string", None, {"x": 3}]}
        self.assertEqual(resolve_path(data, "items[].x"), [1, 3])

    def test_empty_input(self):
        self.assertEqual(resolve_path({}, "a.b"), [])
        self.assertEqual(resolve_path([], "[]"), [])

    def test_top_level_array(self):
        data = [{"givenName": "Alice"}, {"givenName": "Bob"}]
        self.assertEqual(resolve_path(data, "[].givenName"), ["Alice", "Bob"])


if __name__ == "__main__":
    unittest.main()
