"""Dump jsonschema's own view of the shared corpus (oracle side of the probe).

Run from the pinned oracle checkout:

    PYTHONPATH=src ./.venv/Scripts/python.exe \
        ../../worktrees/wiki/deno-rewrite/probes/json-schema/oracle/generate.py

It records, per case: whether ``Draft202012Validator(schema)`` constructed at
all, the raw ``iter_errors`` order, and the path-sorted order the audit code
actually prints (``sorted(validator.iter_errors(instance), key=lambda e:
list(e.path))``). Both orders are kept because the port has to reproduce the
sorted one, and the raw one is the evidence for *why* the port's ordering had
to be reconstructed rather than inherited.
"""

from __future__ import annotations

import json
import pathlib
import sys

from jsonschema import Draft202012Validator

HERE = pathlib.Path(__file__).resolve().parent
CORPUS = HERE.parent / "corpus.json"
OUT = HERE / "golden.json"


def describe(error: object) -> dict:
    return {
        "path": list(error.path),  # type: ignore[attr-defined]
        "keyword": error.validator,  # type: ignore[attr-defined]
        "message": error.message,
        "schema_path": list(error.schema_path),  # type: ignore[attr-defined]
        "validator_value": jsonable(error.validator_value),  # type: ignore[attr-defined]
    }


def jsonable(value: object) -> object:
    try:
        json.dumps(value)
    except (TypeError, ValueError):
        return repr(value)
    return value


def main() -> int:
    corpus = json.loads(CORPUS.read_text(encoding="utf-8"))
    results = []
    for case in corpus["cases"]:
        record: dict = {"name": case["name"]}
        try:
            validator = Draft202012Validator(case["schema"])
        except Exception as exc:  # noqa: BLE001 - the probe wants the raw failure
            record["constructed"] = False
            record["constructor_error"] = f"{type(exc).__name__}: {exc}"
            results.append(record)
            continue
        record["constructed"] = True
        try:
            errors = list(validator.iter_errors(case["instance"]))
        except Exception as exc:  # noqa: BLE001 - validation-time ref resolution failure
            record["validation_error"] = f"{type(exc).__name__}: {exc}"
            results.append(record)
            continue
        record["raw"] = [describe(error) for error in errors]
        allowed = sorted(errors, key=lambda error: list(error.path))
        record["sorted_paths"] = [list(error.path) for error in allowed]
        record["sorted_messages"] = [error.message for error in allowed]
        record["is_valid"] = not errors
        results.append(record)

    OUT.write_text(json.dumps({"cases": results}, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(results)} cases)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
