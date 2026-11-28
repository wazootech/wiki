#!/usr/bin/env bash
# Exercises an installed `wiki` command from end to end on a fresh vault.
#
#   bash scripts/smoke_cli.sh <command> [args...]
#
# For example `bash scripts/smoke_cli.sh node_modules/.bin/wiki`.
set -euo pipefail

cli=("$@")
vault="$(mktemp -d)"
trap 'rm -rf -- "${vault:?}"' EXIT
cd "$vault"

fail() {
  echo "smoke: $*" >&2
  exit 1
}

version="$("${cli[@]}" --version)"
[[ "$version" == "wiki, version "* ]] || fail "unexpected --version: $version"
# The command runs once: a doubled line means the entry point ran it twice.
[ "$(printf '%s\n' "$version" | wc -l)" -eq 1 ] || fail "--version printed twice"

"${cli[@]}" --help >/dev/null
"${cli[@]}" init >/dev/null
[ -f wiki.yml ] || fail "init wrote no wiki.yml"

mkdir -p wiki
cat >wiki/Person_Shape.md <<'PAGE'
---
type: sh:NodeShape
sh:targetClass: schema:Person
sh:property:
  - sh:path: schema:name
    sh:minCount: 1
---

# Person Shape
PAGE
cat >wiki/Ada.md <<'PAGE'
---
type: schema:Person
schema:name: Ada
---

#   Ada

*  one

```yml
key:    value
```
PAGE

"${cli[@]}" fmt >/dev/null
grep -q '^- one$' wiki/Ada.md || fail "fmt left the list alone"
grep -q '^key: value$' wiki/Ada.md || fail "fmt left the YAML fence alone"
"${cli[@]}" fmt --check >/dev/null
"${cli[@]}" lint --strict
[ -z "$("${cli[@]}" check)" ] || fail "check printed output on a sound vault"

query="$(printf 'PREFIX schema: <https://schema.org/>\nSELECT ?n WHERE { ?p a schema:Person ; schema:name ?n }\n' | "${cli[@]}" query)"
grep -q 'Ada' <<<"$query" || fail "query did not find Ada: $query"
"${cli[@]}" export >export.jsonld
grep -q 'Ada' export.jsonld || fail "export is missing Ada"

"${cli[@]}" build >/dev/null
[ -f _site/wiki/Ada/index.html ] || fail "build wrote no page"

# Piped output larger than a pipe buffer arrives whole.
for i in $(seq 1 400); do
  printf -- '---\ntype: schema:Person\nschema:name: Person %s\n---\n\n# Person %s\n' "$i" "$i" >"wiki/Person_$i.md"
done
bytes="$("${cli[@]}" export | wc -c)"
"${cli[@]}" export >export.jsonld
[ "$bytes" -eq "$(wc -c <export.jsonld)" ] || fail "piped export was cut short"

# The preview server answers, and the MCP server replies then exits when its
# input closes.
port=$((20000 + RANDOM % 20000))
"${cli[@]}" serve --port "$port" >serve.log 2>&1 &
server=$!
page=""
for _ in $(seq 1 90); do
  page="$(curl -fsS "http://127.0.0.1:$port/wiki/Ada/" 2>/dev/null || true)"
  [ -n "$page" ] && break
  sleep 1
done
kill "$server" 2>/dev/null || true
wait "$server" 2>/dev/null || true
grep -q 'Ada' <<<"$page" || fail "serve did not answer: $(cat serve.log)"

reply="$(printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | "${cli[@]}" mcp)"
grep -q '"tools"' <<<"$reply" || fail "mcp listed no tools: $reply"

# A failing check exits 1.
sed -i.bak '/^schema:name: Ada$/d' wiki/Ada.md
if "${cli[@]}" check >/dev/null 2>&1; then fail "check passed a broken vault"; fi

echo "smoke: ok ($version)"
