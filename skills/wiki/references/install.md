# Install Wiki CLI

Install and verify the [Wiki CLI](https://github.com/wazootech/wiki) (`wiki` command). The Deno-backed npm package is **`wazootech-wiki`**, and the native package is configured as **`@wazoo/wiki`** on JSR; these cutover distributions become available with the first tagged release. Until then, do not claim that the new npm, JSR, or standalone artifacts are live.

This workflow only installs and verifies the CLI. When done, say the CLI is ready and stop. Do not suggest `wiki init` or another workflow unless the user asks.

Run `bash skills/wiki/scripts/verify.sh` first (`.agents/skills/wiki/scripts/verify.sh` when vendored).

## Detect

```bash
wiki --help
wiki fmt --help
```

- Both pass: confirm that `wiki` is on PATH and ready; stop.
- `--help` passes but `fmt` fails: the command is stale or shadowed; follow **Stale CLI**.
- Either command is missing: follow **Install when CLI is missing**.

## Install when CLI is missing

Tell the user the CLI was not found. Offer the install path that matches their environment. Installing software requires the user's approval.

### npm (Node.js 18 or newer)

```bash
npm install -g wazootech-wiki
wiki --help
wiki fmt --help
```

The npm package provides the `wiki` command, the TypeScript SDK, a bundled Deno runtime, and the Deno engine source. System Python and a separate Deno installation are not required. For a one-time invocation, `npx wazootech-wiki --help` runs the same package; installing through `npx` still downloads software.

### Standalone executable

Download the standalone binary matching the user's OS and architecture from [GitHub Releases](https://github.com/wazootech/wiki/releases) and verify it against `SHA256SUMS`. Release assets are individual binaries, not archives. On macOS/Linux, run `chmod +x wazootech-wiki-<os>-<arch>` and then `./wazootech-wiki-<os>-<arch> --help`; on Windows, run `wazootech-wiki-windows-<arch>.exe --help`. These binaries include their runtime and do not require Node.js, Python, or Deno.

### Deno-native use

The `@wazoo/wiki` JSR package is not published yet. After the first tagged release, Deno users can run it without a global install:

```bash
deno run -A jsr:@wazoo/wiki/cli --help
deno run -A jsr:@wazoo/wiki/cli fmt --help
```

For a persistent `wiki` command, install the published JSR CLI with Deno's global installer only after the user approves:

```bash
deno install -g -A --name wiki jsr:@wazoo/wiki/cli
```

Before that release, contributors can run `deno run -A src/wiki/cli.ts` from the repository checkout. Do not install Python or use the retired PyPI distribution.

## Verify

After an approved install, run `wiki --help` and `wiki fmt --help` again, or re-run `verify.sh`.

- Both pass: confirm that `wiki` is on PATH and ready; stop.
- Failure: report the command output and do not claim success.

## Stale CLI

Treat `--help` working while `fmt` is missing as an outdated or shadowed install.

- Global npm install: with approval, run `npm install -g wazootech-wiki@latest`.
- Deno global install: run `wiki upgrade --check`, then `wiki upgrade --yes` only with approval.
- Standalone executable: use `wiki upgrade --check`; follow its GitHub Releases instructions to replace the binary.
- On Windows, use `where wiki`; on macOS/Linux use `which -a wiki` to identify an older command earlier on PATH.

Always rerun the capability probe before saying the CLI is ready.

## Troubleshooting

| Issue | Response |
| --- | --- |
| `wiki --help` works but `fmt` is missing | Find the shadowed executable, update the installation, and rerun the capability probe. |
| npm package is missing | Confirm Node.js 18 or newer; install or upgrade `wazootech-wiki` with the user's approval. |
| Standalone binary is blocked | Verify the release checksum, then follow the operating system's unsigned-binary policy. |
| Deno cannot resolve JSR | Check network access and use the published `@wazoo/wiki` package URL. |

## Programmatic API

- Node.js and TypeScript projects use the SDK exported by the `wazootech-wiki` npm package.
- Deno projects import the in-process API from `@wazoo/wiki` on JSR.

See [Wiki Programmatic API](https://github.com/wazootech/wiki/blob/main/docs/wiki/Wiki_Programmatic_API.md) for the current examples and stable exports.

## Do not

- Install software without the user's approval.
- Suggest `wiki init` as a required next step.
- Say the CLI is ready when the capability probe fails.
- Recommend PyPI, pip, uv, Python module execution, or the retired Python API.
- Duplicate the full configuration or CLI documentation.
