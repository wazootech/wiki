#!/usr/bin/env bash
# Wiki CLI vault audit — strict CI pipeline (fmt → lint → check → render).
# Optionally runs wiki link --check when wired in .github/workflows/.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: audit.sh -c <wiki.yaml> [FILE...]

Run strict vault validators in CI order:
  fmt --check → lint --strict → check --strict → render --check
  (+ wiki link --check when present in .github/workflows/)

Options:
  -c PATH   Path to wiki.yaml (required)
  -h        Show this help

Remaining arguments are optional vault file paths passed to fmt, lint, and check.
EOF
}

CONFIG=""
FILES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -c)
      CONFIG="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      FILES+=("$@")
      break
      ;;
    -*)
      echo "audit.sh: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      FILES+=("$1")
      shift
      ;;
  esac
done

if [[ -z "$CONFIG" ]]; then
  echo "audit.sh: -c wiki.yaml is required" >&2
  usage >&2
  exit 2
fi

wiki_supports_fmt() {
  command -v wiki >/dev/null 2>&1 && wiki --help 2>&1 | grep -q 'fmt'
}

if [[ -f pyproject.toml ]] && command -v uv >/dev/null 2>&1; then
  WIKI=(uv run wiki -c "$CONFIG")
elif [[ -f pyproject.toml ]] && command -v python >/dev/null 2>&1; then
  WIKI=(python -m wiki -c "$CONFIG")
elif wiki_supports_fmt; then
  WIKI=(wiki -c "$CONFIG")
elif command -v uv >/dev/null 2>&1; then
  WIKI=(uv run wiki -c "$CONFIG")
elif command -v python >/dev/null 2>&1; then
  WIKI=(python -m wiki -c "$CONFIG")
else
  echo "audit.sh: need uv, python -m wiki, or a current wiki on PATH" >&2
  exit 127
fi

if ((${#FILES[@]} > 0)); then
  FILE_ARGS=("${FILES[@]}")
else
  FILE_ARGS=()
fi

run_stage() {
  local label="$1"
  shift
  echo "==> $label"
  if "$@"; then
    echo "    OK"
  else
    echo "audit.sh: FAILED at stage: $label" >&2
    exit 1
  fi
}

run_stage "fmt --check" "${WIKI[@]}" fmt --check "${FILE_ARGS[@]+"${FILE_ARGS[@]}"}"
run_stage "lint --strict" "${WIKI[@]}" lint --strict -v "${FILE_ARGS[@]+"${FILE_ARGS[@]}"}"
run_stage "check --strict" "${WIKI[@]}" check --strict -v "${FILE_ARGS[@]+"${FILE_ARGS[@]}"}"
run_stage "render --check" "${WIKI[@]}" render --check

if [[ -d .github/workflows ]] && grep -rqE 'wiki[[:space:]].*link.*--check|wiki[[:space:]]+link[[:space:]]+--check' .github/workflows 2>/dev/null; then
  run_stage "link --check" "${WIKI[@]}" link --check "${FILE_ARGS[@]+"${FILE_ARGS[@]}"}"
else
  echo "==> link --check (skipped — not wired in .github/workflows/)"
fi

echo "audit.sh: all stages passed"
