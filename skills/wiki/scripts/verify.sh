#!/usr/bin/env bash
# Wiki CLI capability probe — deterministic install/stale gate for agents.
# Exit 0: wiki ready (help + fmt). Exit 1: missing. Exit 2: stale (--help ok, fmt missing).
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

wiki_supports_fmt() {
  command -v wiki >/dev/null 2>&1 && wiki --help 2>&1 | grep -q 'fmt'
}

wiki_help_ok() {
  wiki --help >/dev/null 2>&1
}

run_checkout_wiki() {
  local root="${REPO_ROOT}"
  if [[ ! -f "${root}/pyproject.toml" ]]; then
    return 1
  fi
  local uv_bin=""
  if uv_bin="$(find_uv)"; then
    (cd "${root}" && "${uv_bin}" run wiki --help >/dev/null 2>&1 && "${uv_bin}" run wiki fmt --help >/dev/null 2>&1)
    return $?
  fi
  local py=""
  if command -v python >/dev/null 2>&1; then
    py=python
  elif command -v python3 >/dev/null 2>&1; then
    py=python3
  fi
  if [[ -n "$py" ]]; then
    (cd "${root}" && "$py" -m wiki --help >/dev/null 2>&1 && "$py" -m wiki fmt --help >/dev/null 2>&1)
    return $?
  fi
  return 1
}

if wiki_supports_fmt && wiki_help_ok; then
  echo "verify-cli.sh: wiki ready on PATH"
  exit 0
fi

if wiki_help_ok; then
  echo "verify-cli.sh: stale wiki on PATH — upgrade wazootech-wiki (see references/install.md)" >&2
  exit 2
fi

if run_checkout_wiki; then
  echo "verify-cli.sh: wiki ready via uv run wiki / python -m wiki in checkout"
  exit 0
fi

echo "verify-cli.sh: wiki not found — install wazootech-wiki (see references/install.md)" >&2
exit 1
