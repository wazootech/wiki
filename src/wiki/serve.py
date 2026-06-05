"""Local HTTP server for browsing the wiki as HTML -- no external web frameworks."""

from __future__ import annotations

import html as html_module
import json
import mimetypes
import re
import sys
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from typing import Any, Optional

from .config import WikiConfig
from .format import detect_query_form, is_sparql_update, run_query
from .graph import load_graph
from .site import (
    WikiSite,
    VirtualPage,
    build_site,
    build_index_html,
    build_page_html
)




class WikiHandler(BaseHTTPRequestHandler):
    site: WikiSite = None  # type: ignore[assignment]
    config: WikiConfig = None  # type: ignore[assignment]
    base_url: str = "/wiki"
    url_style: str = "dir"
    watch_enabled: bool = False
    build_id: int = 0
    html_template: str | None = None
    serve_api_enabled: bool = True
    serve_api_path: str = "/api/sparql"

    def do_GET(self) -> None:
        base = self.base_url
        parsed_url = urlsplit(self.path)
        parsed = parsed_url.path
        if parsed.rstrip("/") == self.serve_api_path.rstrip("/"):
            self._handle_sparql_request("GET", parsed_url.query)
            return
        if parsed.rstrip("/") == f"{base}/__watch":
            self._send_json({"build": self.build_id})
            return
        if parsed.endswith(".html"):
            parsed = parsed[:-5]
        parsed = parsed.rstrip("/")

        if parsed == "" or parsed == "/index":
            self._send_html(build_index_html(self.site, base_url=base, url_style=self.url_style, html_template=self.html_template))
        elif parsed == base:
            self._send_html(build_index_html(self.site, base_url=base, url_style=self.url_style, html_template=self.html_template))
        elif parsed.startswith(base + "/"):
            slug = parsed[len(base) + 1:]
            target = self._find_page(slug)
            if target:
                self._send_html(build_page_html(target, self.site, base_url=base, url_style=self.url_style, html_template=self.html_template))
            elif self._serve_asset(parsed[len(base) + 1:]):
                return
            else:
                self._send_error(404, f"Page not found: {slug}")
        elif self._serve_asset(parsed.lstrip("/")):
            return
        else:
            self._send_error(404, f"Not found: {self.path}")

    def do_POST(self) -> None:
        parsed_url = urlsplit(self.path)
        if parsed_url.path.rstrip("/") == self.serve_api_path.rstrip("/"):
            self._handle_sparql_request("POST", parsed_url.query)
            return
        self._send_error(404, f"Not found: {self.path}")

    def _serve_asset(self, rel_path: str) -> bool:
        """Try to serve a static asset from configured assetDirs. Returns True if served."""
        for asset_dir in self.config.asset_dirs:
            candidate = (asset_dir / rel_path).resolve()
            try:
                candidate.relative_to(asset_dir.resolve())
            except ValueError:
                continue
            if candidate.is_file():
                body = candidate.read_bytes()
                mime_type, _ = mimetypes.guess_type(candidate.name)
                if mime_type is None:
                    mime_type = "application/octet-stream"
                self.send_response(200)
                self.send_header("Content-Type", mime_type)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return True
        return False

    def _find_page(self, slug: str) -> VirtualPage | None:
        for page in self.site.pages:
            if page.full_slug == slug:
                return page
        for page in self.site.pages:
            if page.file_slug == slug and not page.section_slug:
                return page
        for page in self.site.pages:
            if page.file_slug == slug:
                return page
        return None

    def _send_html(self, html: str) -> None:
        if self.watch_enabled:
            html = html.replace(
                "</body>",
                (
                    "<script>\n"
                    "(function(){\n"
                    "  var last=null;\n"
                    "  async function poll(){\n"
                    "    try{\n"
                    f"      var res=await fetch('{self.base_url}/__watch',{{cache:'no-store'}});\n"
                    "      if(!res.ok) throw new Error('watch');\n"
                    "      var data=await res.json();\n"
                    "      if(last===null){last=data.build;}\n"
                    "      else if(data.build!==last){location.reload();return;}\n"
                    "    }catch(e){}\n"
                    "    setTimeout(poll, 500);\n"
                    "  }\n"
                    "  poll();\n"
                    "})();\n"
                    "</script></body>"
                ),
            )
        body = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, payload: Any) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_bytes(self, code: int, body: bytes, content_type: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, code: int, message: str) -> None:
        body = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>{code}</title>
</head>
<body>
<h1>{code}</h1>
<p>{html_module.escape(message)}</p>
</body>
</html>""".encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write(f"[{self.log_date_time_string()}] {fmt % args}\n")

    def _handle_sparql_request(self, method: str, raw_query_string: str) -> None:
        if not self.serve_api_enabled:
            self._send_error(404, "SPARQL endpoint is disabled.")
            return

        try:
            sparql_query, output_format, infer, reload_graph = _parse_sparql_http_request(
                method=method,
                raw_query_string=raw_query_string,
                headers=self.headers,
                rfile=self.rfile,
            )
            query_form = detect_query_form(sparql_query)
            if query_form not in {"SELECT", "ASK", "CONSTRUCT", "DESCRIBE"}:
                self._send_error(405, f"Unsupported SPARQL query form: {query_form}")
                return
            graph = load_graph(self.config, infer=infer, reload=reload_graph)
            result = run_query(graph, sparql_query, output_format=output_format, wiki_base=self.config.wiki_base)
            body = result.encode("utf-8") if isinstance(result, str) else result
            self._send_bytes(200, body, _response_content_type(query_form, output_format))
        except _BadSparqlRequest as exc:
            self._send_error(exc.status_code, exc.message)
        except ValueError as exc:
            self._send_error(400, str(exc))
        except Exception as exc:
            self._send_error(422, f"Query Execution Error: {exc}")


def refresh_vault(
    config: WikiConfig,
    *,
    changed_paths: set[Path] | None = None,
    base_url: str | None = None,
    url_style: str | None = None,
) -> WikiSite:
    """Rebuild in-memory graph, refresh SPARQL blocks, and rebuild the site."""
    from .graph import load_graph
    from .render import has_sparql_blocks, render_markdown_files

    resolved_base_url = config.base_url if base_url is None else base_url
    resolved_url_style = config.url_style if url_style is None else url_style

    graph = load_graph(config, infer=True, reload=True)

    if changed_paths is None:
        render_markdown_files(config, graph)
    else:
        non_md_changed = any(path.suffix.lower() != ".md" for path in changed_paths)
        if non_md_changed:
            render_markdown_files(config, graph)
        else:
            for path in sorted(changed_paths):
                if path.suffix.lower() == ".md" and path.is_file() and has_sparql_blocks(path):
                    render_markdown_files(config, graph, file_filter=path)

    return build_site(config, base_url=resolved_base_url, url_style=resolved_url_style)


def create_server(
    config: WikiConfig,
    host: str = "127.0.0.1",
    port: int = 8080,
    base_url: str | None = None,
    url_style: str | None = None,
    watch: bool = False,
) -> HTTPServer:
    """Build the site and return a configured HTTPServer (not yet started)."""
    resolved_base_url = config.base_url if base_url is None else base_url
    resolved_url_style = config.url_style if url_style is None else url_style
    _validate_serve_api_path(config, resolved_base_url)
    site = build_site(config, base_url=resolved_base_url, url_style=resolved_url_style)
    WikiHandler.site = site
    WikiHandler.config = config
    WikiHandler.base_url = resolved_base_url
    WikiHandler.url_style = resolved_url_style
    WikiHandler.watch_enabled = watch
    WikiHandler.build_id = 0
    WikiHandler.serve_api_enabled = config.serve_api_enabled
    WikiHandler.serve_api_path = config.serve_api_path

    # Load custom HTML template if configured; silently fall back to default if file missing
    if config.html_template is not None and config.html_template.is_file():
        WikiHandler.html_template = config.html_template.read_text(encoding="utf-8")
    else:
        WikiHandler.html_template = None

    server = HTTPServer((host, port), WikiHandler)
    print(f"Wiki server ready at http://{host}:{port}/")
    dirs_str = ", ".join(str(d) for d in config.input_dirs)
    print(f"Serving {len(site.pages)} pages from {dirs_str}")
    if not site.pages:
        print("Warning: no pages found. Ensure your wiki directory has .md, .yaml, .yml, or .json files.")
    return server


class _BadSparqlRequest(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def _validate_serve_api_path(config: WikiConfig, base_url: str) -> None:
    """Validate that the configured SPARQL route does not shadow page routes."""
    if not config.serve_api_enabled:
        return

    api_path = config.serve_api_path.rstrip("/") or "/"
    resolved_base = base_url.rstrip("/") if base_url else ""
    watch_path = f"{resolved_base}/__watch" if resolved_base else "/__watch"

    if api_path == "/":
        raise ValueError("Invalid serveApi.path: '/' would shadow the entire server.")
    if api_path == watch_path:
        raise ValueError(f"Invalid serveApi.path: '{config.serve_api_path}' collides with the watch endpoint.")
    if resolved_base and (api_path == resolved_base or api_path.startswith(f"{resolved_base}/")):
        raise ValueError(
            f"Invalid serveApi.path: '{config.serve_api_path}' collides with page routes under baseUrl '{resolved_base}'."
        )


def _parse_bool_flag(values: dict[str, list[str]], key: str, default: bool) -> bool:
    raw = values.get(key, [str(default).lower()])[-1].strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _best_accept_media(accept_header: str, supported: list[str]) -> str | None:
    if not accept_header.strip():
        return supported[0]
    entries: list[tuple[float, str]] = []
    for part in accept_header.split(","):
        item = part.strip()
        if not item:
            continue
        media = item
        q = 1.0
        if ";" in item:
            media, *params = [p.strip() for p in item.split(";")]
            for param in params:
                if param.startswith("q="):
                    try:
                        q = float(param[2:])
                    except ValueError:
                        q = 0.0
        entries.append((q, media.lower()))
    entries.sort(key=lambda item: item[0], reverse=True)
    supported_lower = {media.lower(): media for media in supported}
    for _, media in entries:
        if media in supported_lower:
            return supported_lower[media]
        if media == "*/*":
            return supported[0]
    return None


def _response_content_type(query_form: str, output_format: str) -> str:
    if query_form in {"CONSTRUCT", "DESCRIBE"}:
        return {
            "turtle": "text/turtle; charset=utf-8",
            "n3": "text/n3; charset=utf-8",
            "nt": "application/n-triples; charset=utf-8",
        }.get(output_format, "text/turtle; charset=utf-8")
    return {
        "json": "application/sparql-results+json; charset=utf-8",
        "csv": "text/csv; charset=utf-8",
        "tsv": "text/tab-separated-values; charset=utf-8",
    }.get(output_format, "application/sparql-results+json; charset=utf-8")


def _parse_sparql_http_request(method: str, raw_query_string: str, headers: Any, rfile: Any) -> tuple[str, str, bool, bool]:
    params = parse_qs(raw_query_string, keep_blank_values=True)
    infer = _parse_bool_flag(params, "inference", True)
    reload_graph = _parse_bool_flag(params, "reload", False)
    query_text: str | None = None

    if method == "GET":
        query_text = params.get("query", [""])[-1]
    elif method == "POST":
        content_length = int(headers.get("Content-Length", "0") or "0")
        raw_body = rfile.read(content_length).decode("utf-8") if content_length else ""
        content_type = headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if content_type == "application/sparql-query":
            query_text = raw_body
        elif content_type == "application/x-www-form-urlencoded":
            body_params = parse_qs(raw_body, keep_blank_values=True)
            query_text = body_params.get("query", [""])[-1]
            if "inference" in body_params:
                infer = _parse_bool_flag(body_params, "inference", infer)
            if "reload" in body_params:
                reload_graph = _parse_bool_flag(body_params, "reload", reload_graph)
        else:
            raise _BadSparqlRequest(400, f"Unsupported Content-Type: {content_type or 'missing'}")
    else:
        raise _BadSparqlRequest(405, f"Unsupported method: {method}")

    if not query_text or not query_text.strip():
        raise _BadSparqlRequest(400, "Missing SPARQL query.")

    if is_sparql_update(query_text):
        raise _BadSparqlRequest(405, "SPARQL Update is not supported by this endpoint.")

    query_form = detect_query_form(query_text)
    if query_form in {"CONSTRUCT", "DESCRIBE"}:
        supported = ["text/turtle", "application/n-triples", "text/n3"]
        default_format = "turtle"
        format_map = {
            "text/turtle": "turtle",
            "application/n-triples": "nt",
            "text/n3": "n3",
        }
    else:
        supported = ["application/sparql-results+json", "text/csv", "text/tab-separated-values"]
        default_format = "json"
        format_map = {
            "application/sparql-results+json": "json",
            "text/csv": "csv",
            "text/tab-separated-values": "tsv",
        }

    accept = headers.get("Accept", "")
    media = _best_accept_media(accept, supported)
    if media is None:
        raise _BadSparqlRequest(406, f"Unsupported Accept header: {accept}")
    output_format = format_map.get(media, default_format)

    return query_text, output_format, infer, reload_graph


def _snapshot_watch_dirs(watch_dirs: list[Path]) -> dict[str, float]:
    """Capture mtimes for watchable files under the provided roots."""
    mtimes: dict[str, float] = {}
    for root in watch_dirs:
        if not root.exists():
            continue
        for p in root.rglob("*"):
            if not p.is_file():
                continue
            if p.suffix.lower() not in {".md", ".yaml", ".yml", ".json", ".ttl", ".trig", ".nt", ".nq", ".rdf", ".xml", ".jsonld", ".html", ".htm", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".css", ".js", ".woff2", ".woff", ".ttf"}:
                continue
            try:
                mtimes[str(p)] = p.stat().st_mtime
            except OSError:
                continue
    return mtimes


def _watch_for_changes(
    config: WikiConfig,
    *,
    watch_dirs: list[Path],
    base_url: str,
    url_style: str,
    mtimes: dict[str, float],
    stop_event: threading.Event,
    poll_interval: float = 0.5,
    snapshot_func: Any | None = None,
) -> None:
    """Poll watched directories and refresh the in-memory site on changes."""
    snapshot = _snapshot_watch_dirs if snapshot_func is None else snapshot_func
    current_mtimes = mtimes

    while not stop_event.is_set():
        time.sleep(poll_interval)
        try:
            new = snapshot(watch_dirs)
            if new != current_mtimes:
                changed = {
                    Path(k)
                    for k in set(current_mtimes) | set(new)
                    if current_mtimes.get(k) != new.get(k)
                }
                current_mtimes = new
                WikiHandler.site = refresh_vault(
                    config,
                    changed_paths=changed,
                    base_url=base_url,
                    url_style=url_style,
                )
                WikiHandler.build_id += 1
        except Exception:
            if stop_event.is_set():
                return
            continue


def run_server(
    config: WikiConfig,
    host: str = "127.0.0.1",
    port: int = 8080,
    base_url: str | None = None,
    url_style: str | None = None,
    watch: bool = False,
) -> None:
    """Create and start the wiki HTTP server, blocking until shutdown."""
    resolved_base_url = config.base_url if base_url is None else base_url
    resolved_url_style = config.url_style if url_style is None else url_style
    server = create_server(
        config,
        host=host,
        port=port,
        base_url=resolved_base_url,
        url_style=resolved_url_style,
        watch=watch,
    )

    if watch:
        watch_dirs = list(config.input_dirs) + [d for d in config.asset_dirs if d.exists()]
        stop_event = threading.Event()
        mtimes = _snapshot_watch_dirs(watch_dirs)
        threading.Thread(
            target=_watch_for_changes,
            kwargs={
                "config": config,
                "watch_dirs": watch_dirs,
                "base_url": resolved_base_url,
                "url_style": resolved_url_style,
                "mtimes": mtimes,
                "stop_event": stop_event,
            },
            daemon=True,
        ).start()
    else:
        stop_event = None

    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        server.shutdown()
    finally:
        if stop_event is not None:
            stop_event.set()
        server.server_close()
