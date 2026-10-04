# Install Wiki CLI

Install and verify the [Wiki CLI](https://github.com/wazootech/wiki) (`wiki` command). The Deno-backed npm package is **`wazootech-wiki`**, and the native package is configured as **`@wazoo/wiki`** on JSR; these cutover distributions become available with the first tagged release. Until then, do not claim that the new npm, JSR, or standalone artifacts are live.

This workflow only installs and verifies the CLI. When done, say the CLI is ready and stop. Do not suggest `wiki init` or another workflow unless the user asks.

Run `bash skills/wiki/scripts/verify.sh` first (`.agents/skills/wiki/scripts/verify.sh` when vendored).

## Detect

Use the verifier rather than help output alone: the legacy Python CLI also supports `wiki --help` and `wiki fmt --help`.

- Exit `0`: a Deno-backed CLI or verified Deno source checkout is ready.
- Exit `2`: PATH contains a stale CLI and no usable Deno source checkout was found. Before the first tagged release, do not recommend `npm install -g wazootech-wiki@latest`; it still resolves to the legacy Python CLI. If working in the Wiki repository, use `deno run -A src/wiki/cli.ts`; otherwise explain that the Deno cutover package is not published yet.
- Exit `1`: no supported Deno-backed CLI or source checkout was found. Follow the release-aware guidance below.

## Install when CLI is missing

Before the first tagged Deno release, the npm, JSR, and standalone cutover distributions are unavailable. In the Wiki repository, contributors can run `deno run -A src/wiki/cli.ts`. Elsewhere, tell the user the Deno package is not released yet; do not install the legacy Python package as if it were the cutover. After release, offer the install path matching the user's environment. Installing software requires the user's approval.

### npm (Node.js 18 or newer)

After the first tagged Deno release:

```bash
npm install -g wazootech-wiki
wiki --help
wiki fmt --help
```

The package will provide the `wiki` command, a bundled Deno runtime, and the Deno engine source. It exports no library API: TypeScript callers embed the engine instead (see [Programmatic API](#programmatic-api)). System Python and a separate Deno installation will not be required. For a one-time invocation, `npx wazootech-wiki --help` runs the same package; installing through `npx` still downloads software.

### Standalone executable

After the first tagged Deno release, download the standalone binary matching the user's OS and architecture from [GitHub Releases](https://github.com/wazootech/wiki/releases) and verify it against `SHA256SUMS`. Release assets are individual binaries, not archives. On macOS/Linux, run `chmod +x wazootech-wiki-<os>-<arch>` and then `./wazootech-wiki-<os>-<arch> --help`; on Windows, run `wazootech-wiki-windows-<arch>.exe --help`. These binaries include their runtime and do not require Node.js, Python, or Deno.

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

After an approved install, run `bash skills/wiki/scripts/verify.sh` again.

- Exit `0`: confirm that the verified Deno-backed CLI is ready; stop.
- Failure: report the command output and do not claim success.

## Stale CLI

Before the first tagged Deno release, a stale npm package cannot be upgraded to the cutover engine; use the verified repository source if available, or report that the package has not been released. After release, upgrade only the stale installation: npm with `npm install -g wazootech-wiki@latest`, Deno with `wiki upgrade --check` then `wiki upgrade --yes` only with approval, and standalone executables with `wiki upgrade --check` followed by the release's replacement instructions. On Windows use `where wiki`; on macOS/Linux use `which -a wiki` to locate an older executable earlier on PATH.

Always rerun the capability probe before saying the CLI is ready.

## Troubleshooting

| Issue | Response |
| --- | --- |
| `wiki --help` works but `fmt` is missing | Find the shadowed executable, update the installation, and rerun the capability probe. |
| npm package is missing before the cutover release | Do not install npm `@latest` as the Deno CLI; use repository source if available or report that release is pending. |
| Standalone binary is blocked | Verify the release checksum, then follow the operating system's unsigned-binary policy. |
| Deno cannot resolve JSR | Check network access and confirm that the first tagged release has published `@wazoo/wiki`. |

## Programmatic API

- After release, TypeScript projects embed the in-process API from `@wazoo/wiki` on JSR. The npm package ships the `wiki` command only, with no `Wiki` class.
- After release, Deno projects import the same in-process API from `@wazoo/wiki` on JSR.

See [Wiki Programmatic API](https://github.com/wazootech/wiki/blob/main/docs/wiki/Wiki_Programmatic_API.md) for the current examples and stable exports.

## Do not

- Install software without the user's approval.
- Suggest `wiki init` as a required next step.
- Say the CLI is ready when the capability probe fails.
- Recommend PyPI, pip, uv, Python module execution, or the retired Python API.
- Duplicate the full configuration or CLI documentation.
