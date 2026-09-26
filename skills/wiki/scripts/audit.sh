#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

usage() {
  cat <<'EOF'
Usage: skills/wiki/scripts/audit.sh -c <wiki.yml> [FILE...]

Run strict wiki validators in CI order:
  fmt --check → lint --strict → check --strict → render --check
  (+ wiki link --check when present in .github/workflows/)

Options:
  -c PATH   Path to wiki config (wiki.yml; legacy wiki.yaml also works)
  -h        Show this help

Remaining arguments are optional wiki file paths passed to fmt, lint, and check.
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
  echo "audit.sh: -c wiki config path is required" >&2
  usage >&2
  exit 2
fi

wiki_supports_fmt() {
  command -v wiki >/dev/null 2>&1 && wiki --help 2>&1 | grep -q 'fmt'
}

source_checkout_available() {
  command -v deno >/dev/null 2>&1 && [[ -f "${REPO_ROOT}/deno.json" && -f "${REPO_ROOT}/src/wiki/cli.ts" ]]
}

if wiki_supports_fmt; then
  run_wiki() { wiki -c "$CONFIG" "$@"; }
elif source_checkout_available; then
  run_wiki() { (cd "${REPO_ROOT}" && deno run -A src/wiki/cli.ts -c "$CONFIG" "$@"); }
else
  echo "audit.sh: supported wiki CLI not found; install wazootech-wiki or run from its Deno source checkout" >&2
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
  if run_wiki "$@"; then
    echo "    OK"
  else
    echo "audit.sh: FAILED at stage: $label" >&2
    exit 1
  fi
}

run_stage "fmt --check" fmt --check "${FILE_ARGS[@]}"
run_stage "lint --strict" lint --strict -v "${FILE_ARGS[@]}"
run_stage "check --strict" check --strict -v "${FILE_ARGS[@]}"
run_stage "render --check" render --check

if [[ -d "${REPO_ROOT}/.github/workflows" ]] && grep -rqE 'wiki[[:space:]].*link.*--check|wiki[[:space:]]+link[[:space:]]+--check' "${REPO_ROOT}/.github/workflows" 2>/dev/null; then
  run_stage "link --check" link --check "${FILE_ARGS[@]}"
else
  echo "==> link --check (skipped — not wired in .github/workflows/)"
fi

echo "audit.sh: all stages passed"
