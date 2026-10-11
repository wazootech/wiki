#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

wiki_supports_deno() {
  local version help fmt_help major minor patch
  version="$("$@" --version 2>&1)" || return 1
  if [[ ! "$version" =~ ^wiki,\ version\ ([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    return 1
  fi
  major="${BASH_REMATCH[1]}"
  minor="${BASH_REMATCH[2]}"
  patch="${BASH_REMATCH[3]}"
  if (( 10#$major == 0 && (10#$minor < 1 || (10#$minor == 1 && 10#$patch < 24)) )); then
    return 1
  fi
  help="$("$@" --help 2>&1)" || return 1
  grep -q 'fmt' <<< "$help" || return 1
  fmt_help="$("$@" fmt --help 2>&1)" || return 1
  grep -qi 'Deno formatter' <<< "$fmt_help"
}

wiki_help_ok() {
  wiki --help >/dev/null 2>&1
}

source_checkout_ready() {
  command -v deno >/dev/null 2>&1 && [[ -f "${REPO_ROOT}/deno.json" && -f "${REPO_ROOT}/src/wiki/cli.ts" ]] && \
    (cd "${REPO_ROOT}" && wiki_supports_deno deno run -A src/wiki/cli.ts)
}

# The write verbs (wiki edit, new, set, patch, mv, rm) arrived after the CLI
# above qualifies as Deno-backed, so a ready CLI may still lack them. Report
# which, without changing the exit code: an older CLI is still a working CLI,
# and the skill routes structural edits to the hand-edit fallback.
report_write_verbs() {
  if "$@" edit --help >/dev/null 2>&1; then
    echo "verify.sh: write verbs available (wiki edit)"
  else
    echo "verify.sh: write verbs unavailable; hand-edit fallback (see references/edit.md)"
  fi
}

if command -v wiki >/dev/null 2>&1 && wiki_supports_deno wiki; then
  echo "verify.sh: wiki ready on PATH"
  report_write_verbs wiki
  exit 0
fi

if source_checkout_ready; then
  echo "verify.sh: wiki ready via Deno source checkout"
  (cd "${REPO_ROOT}" && report_write_verbs deno run -A src/wiki/cli.ts)
  exit 0
fi

if wiki_help_ok; then
  echo "verify.sh: stale wiki on PATH — use the Deno source checkout or wait for the cutover release (see references/install.md)" >&2
  exit 2
fi

echo "verify.sh: supported Deno Wiki CLI not found; the cutover package is not yet released (see references/install.md)" >&2
exit 1
