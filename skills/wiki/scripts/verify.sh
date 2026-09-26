#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

wiki_supports_fmt() {
  command -v wiki >/dev/null 2>&1 && wiki --help 2>&1 | grep -q 'fmt'
}

wiki_help_ok() {
  wiki --help >/dev/null 2>&1
}

source_checkout_ready() {
  command -v deno >/dev/null 2>&1 && [[ -f "${REPO_ROOT}/deno.json" && -f "${REPO_ROOT}/src/wiki/cli.ts" ]] && \
    (cd "${REPO_ROOT}" && deno run -A src/wiki/cli.ts --help >/dev/null 2>&1 && deno run -A src/wiki/cli.ts fmt --help >/dev/null 2>&1)
}

if wiki_supports_fmt && wiki_help_ok; then
  echo "verify.sh: wiki ready on PATH"
  exit 0
fi

if wiki_help_ok; then
  echo "verify.sh: stale wiki on PATH — upgrade wazootech-wiki (see references/install.md)" >&2
  exit 2
fi

if source_checkout_ready; then
  echo "verify.sh: wiki ready via Deno source checkout"
  exit 0
fi

echo "verify.sh: supported wiki CLI not found — install wazootech-wiki (see references/install.md)" >&2
exit 1
