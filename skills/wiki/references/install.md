# Install Wiki CLI

Install and verify the [Wiki CLI](https://github.com/wazootech/wiki) (`wiki` command). The Deno-backed npm package is **`wazootech-wiki`**, and the native package is **`@wazoo/wiki`** on JSR; both, the PyPI wheels, and the standalone binaries are published.

This workflow only installs and verifies the CLI. When done, say the CLI is ready and stop. Do not suggest `wiki init` or another workflow unless the user asks.

Run `bash skills/wiki/scripts/verify.sh` first (`.agents/skills/wiki/scripts/verify.sh` when vendored).

## Detect

Use the verifier rather than help output alone: the legacy Python CLI also supports `wiki --help` and `wiki fmt --help`.

- Exit `0`: a Deno-backed CLI or verified Deno source checkout is ready. A second line says whether it has the write verbs (`wiki edit`, `new`, `set`, `patch`, `mv`, `rm`). `write verbs unavailable` is not a failure: the CLI works, it predates the verbs, and structural edits use the hand-edit fallback in [edit.md](edit.md). Upgrade only if the user wants the verbs.
- Exit `2`: PATH contains a stale CLI and no usable Deno source checkout was found. Offer to upgrade the stale installation (see [Stale CLI](#stale-cli)); if working in the Wiki repository, `deno run -A src/wiki/cli.ts` also works.
- Exit `1`: no supported Deno-backed CLI or source checkout was found. Follow the release-aware guidance below.

## Install when CLI is missing

Offer the install path matching the user's environment. In the Wiki repository, contributors can also run `deno run -A src/wiki/cli.ts`. Installing software requires the user's approval.

### npm (Node.js 18 or newer)

```bash
npm install -g wazootech-wiki
wiki --help
wiki fmt --help
```

The package provides the `wiki` command, a bundled Deno runtime, and the Deno engine source. It exports no library API: TypeScript callers embed the engine instead (see [Programmatic API](#programmatic-api)). System Python and a separate Deno installation are not required. For a one-time invocation, `npx wazootech-wiki --help` runs the same package; installing through `npx` still downloads software.

### Standalone executable

Download the standalone binary matching the user's OS and architecture from [GitHub Releases](https://github.com/wazootech/wiki/releases) and verify it against `SHA256SUMS`. Release assets are individual binaries, not archives. On macOS/Linux, run `chmod +x wazootech-wiki-<os>-<arch>` and then `./wazootech-wiki-<os>-<arch> --help`; on Windows, run `wazootech-wiki-windows-<arch>.exe --help`. These binaries include their runtime and do not require Node.js, Python, or Deno.

### Deno-native use

Deno users can run the JSR package without a global install:

```bash
deno run -A jsr:@wazoo/wiki/cli --help
deno run -A jsr:@wazoo/wiki/cli fmt --help
```

For a persistent `wiki` command, install the published JSR CLI with Deno's global installer only after the user approves:

```bash
deno install -g -A --name wiki --min-dep-age 0 jsr:@wazoo/wiki/cli
```

`--min-dep-age 0` bypasses Deno's 24-hour dependency age policy, which otherwise resolves a just-published version to the previous one. Contributors can also run `deno run -A src/wiki/cli.ts` from the repository checkout. Do not install the retired Python engine (`wazootech-wiki` 0.1.x).

## Verify

After an approved install, run `bash skills/wiki/scripts/verify.sh` again.

- Exit `0`: confirm that the verified Deno-backed CLI is ready; stop.
- Failure: report the command output and do not claim success.

## Stale CLI

Upgrade only the stale installation: npm with `npm install -g wazootech-wiki@latest`, Deno with `wiki upgrade --check` then `wiki upgrade --yes` only with approval, and standalone executables with `wiki upgrade --check` followed by the release's replacement instructions. On Windows use `where wiki`; on macOS/Linux use `which -a wiki` to locate an older executable earlier on PATH.

Always rerun the capability probe before saying the CLI is ready.

## Troubleshooting

| Issue | Response |
| --- | --- |
| `wiki --help` works but `fmt` is missing | Find the shadowed executable, update the installation, and rerun the capability probe. |
| `verify.sh` reports write verbs unavailable | The CLI predates `wiki edit`. Edit by hand per [edit.md](edit.md#fallback-older-cli), or upgrade the installation with approval and rerun the probe. |
| Standalone binary is blocked | Verify the release checksum, then follow the operating system's unsigned-binary policy. |
| Deno cannot resolve JSR | Check network access and confirm the version resolves (Deno's 24-hour dependency age policy can pick the previous release; retry with `--min-dep-age 0`). |

## Programmatic API

- TypeScript projects embed the in-process API from `@wazoo/wiki` on JSR. The npm package ships the `wiki` command only, with no `Wiki` class.
- Deno projects import the same in-process API from `@wazoo/wiki` on JSR.

See [Wiki Programmatic API](https://github.com/wazootech/wiki/blob/main/docs/wiki/Wiki_Programmatic_API.md) for the current examples and stable exports.

## Do not

- Install software without the user's approval.
- Suggest `wiki init` as a required next step.
- Say the CLI is ready when the capability probe fails.
- Recommend PyPI, pip, uv, Python module execution, or the retired Python API.
- Duplicate the full configuration or CLI documentation.
