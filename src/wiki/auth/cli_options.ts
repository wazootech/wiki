/** Option parsing and help text for `wiki auth`. */

export const AUTH_EXIT_OK = 0;
export const AUTH_EXIT_USAGE = 2;

export const AUTH_HELP_LINES: readonly string[] = [
  "Usage: wiki auth <COMMAND> [OPTIONS]",
  "",
  "Commands:",
  "  hash PASSWORD  Hash a password for a local users file.",
  "  serve          Serve the built site behind the configured auth gateway.",
];

export const HASH_HELP_LINES: readonly string[] = [
  "Usage: wiki auth hash PASSWORD",
  "",
  "Print a bcrypt hash suitable for site.auth.users_file.",
];

export const SERVE_HELP_LINES: readonly string[] = [
  "Usage: wiki auth serve [OPTIONS]",
  "",
  "Start an auth-gated server for an already-built wiki site.",
  "",
  "Options:",
  "  --host TEXT             Host to bind the server to. (default: 127.0.0.1)",
  "  --port INTEGER          Port to serve on. (default: 8080)",
  "  --site-dir PATH         Built site directory. (default: _site in config root)",
  "  --site-base-url TEXT    Override site.base_url.",
  "  --site-url-style STYLE  Override site.url_style: file or dir.",
];

export function authUsageError(message: string): number {
  console.error(message);
  return AUTH_EXIT_USAGE;
}

export interface ServeOptions {
  readonly host: string;
  readonly port: number;
  readonly siteDir: string | null;
  readonly baseUrl: string | null;
  readonly urlStyle: "dir" | "file" | null;
}

interface MutableServeOptions {
  host: string;
  port: number;
  siteDir: string | null;
  baseUrl: string | null;
  urlStyle: "dir" | "file" | null;
}

export function parseServeOptions(
  args: readonly string[],
): ServeOptions | number {
  const options: MutableServeOptions = {
    host: "127.0.0.1",
    port: 8080,
    siteDir: null,
    baseUrl: null,
    urlStyle: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    if (token === "--help" || token === "-h") {
      console.log(SERVE_HELP_LINES.join("\n"));
      return AUTH_EXIT_OK;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("-")) {
      return authUsageError(`Error: Option '${token}' requires an argument.`);
    }
    index += 1;
    if (token === "--host") options.host = value;
    else if (token === "--port") {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        return authUsageError(`Error: Invalid port: ${value}`);
      }
      options.port = port;
    } else if (token === "--site-dir") options.siteDir = value;
    else if (token === "--site-base-url") options.baseUrl = value;
    else if (token === "--site-url-style") {
      if (value !== "dir" && value !== "file") {
        return authUsageError(`Error: Invalid url style: ${value}`);
      }
      options.urlStyle = value;
    } else return authUsageError(`Error: No such option: ${token}`);
  }
  return options;
}
