#!/usr/bin/env bash
# Wiki CLI wiki audit — strict CI pipeline (fmt → lint → check → render).
# Optionally runs wiki link --check when wired in .github/workflows/.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

find_uv() {
  if command -v uv >/dev/null 2>&1; then
    command -v uv
    return 0
  fi
  local candidate=""
  for candidate in \
    "${HOME}/.local/bin/uv" \
    "${HOME}/.local/bin/uv.exe" \
    "${USERPROFILE:-}${USERPROFILE:+/}.local/bin/uv.exe" \
    "${HOME}/AppData/Local/Programs/uv/uv.exe" \
    "${LOCALAPPDATA:-}/Programs/uv/uv.exe" \
    /mnt/c/Users/*/.local/bin/uv.exe \
    /c/Users/*/.local/bin/uv.exe; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

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

UV_BIN=""
if UV_BIN="$(find_uv)"; then
  :
fi

if [[ -f "${REPO_ROOT}/pyproject.toml" && -n "$UV_BIN" ]]; then
  run_wiki() { (cd "${REPO_ROOT}" && "${UV_BIN}" run wiki -c "$CONFIG" "$@"); }
elif [[ -f "${REPO_ROOT}/pyproject.toml" ]] && command -v python3 >/dev/null 2>&1; then
  run_wiki() { (cd "${REPO_ROOT}" && python3 -m wiki -c "$CONFIG" "$@"); }
elif [[ -f "${REPO_ROOT}/pyproject.toml" ]] && command -v python >/dev/null 2>&1; then
  run_wiki() { (cd "${REPO_ROOT}" && python -m wiki -c "$CONFIG" "$@"); }
elif wiki_supports_fmt; then
  run_wiki() { wiki -c "$CONFIG" "$@"; }
elif [[ -n "$UV_BIN" ]]; then
  run_wiki() { "${UV_BIN}" run wiki -c "$CONFIG" "$@"; }
elif command -v python3 >/dev/null 2>&1; then
  run_wiki() { python3 -m wiki -c "$CONFIG" "$@"; }
elif command -v python >/dev/null 2>&1; then
  run_wiki() { python -m wiki -c "$CONFIG" "$@"; }
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
  if run_wiki "$@"; then
    echo "    OK"
  else
    echo "audit.sh: FAILED at stage: $label" >&2
    exit 1
  fi
}

run_stage "fmt --check" fmt --check "${FILE_ARGS[@]+"${FILE_ARGS[@]}"}"
run_stage "lint --strict" lint --strict -v "${FILE_ARGS[@]+"${FILE_ARGS[@]}"}"
run_stage "check --strict" check --strict -v "${FILE_ARGS[@]+"${FILE_ARGS[@]}"}"
run_stage "render --check" render --check

if [[ -d "${REPO_ROOT}/.github/workflows" ]] && grep -rqE 'wiki[[:space:]].*link.*--check|wiki[[:space:]]+link[[:space:]]+--check' "${REPO_ROOT}/.github/workflows" 2>/dev/null; then
  run_stage "link --check" link --check "${FILE_ARGS[@]+"${FILE_ARGS[@]}"}"
else
  echo "==> link --check (skipped — not wired in .github/workflows/)"
fi

echo "audit.sh: all stages passed"
