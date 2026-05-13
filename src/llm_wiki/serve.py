"""Local HTTP server for browsing the wiki as HTML -- no external web frameworks."""

from __future__ import annotations

import html as html_module
import json
import re
import signal
import sys
from dataclasses import dataclass, field
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from typing import Any, Optional

from .site import (
    WikiSite,
    VirtualPage,
    INLINE_CSS,
    build_site,
    build_index_html,
    build_page_html
)




class WikiHandler(BaseHTTPRequestHandler):
    site: WikiSite = None  # type: ignore[assignment]
    base_url: str = "/wiki"

    def do_GET(self) -> None:
        base = self.base_url
        parsed = re.sub(r"\?.*$", "", self.path)
        if parsed.endswith(".html"):
            parsed = parsed[:-5]
        parsed = parsed.rstrip("/")

        if parsed == "" or parsed == "/index":
            self._send_html(build_index_html(self.site, base_url=base))
        elif parsed == base:
            self._send_html(build_index_html(self.site, base_url=base))
        elif parsed.startswith(base + "/"):
            slug = parsed[len(base) + 1:]
            target = self._find_page(slug)
            if target:
                self._send_html(build_page_html(target, self.site, base_url=base))
            else:
                self._send_error(404, f"Page not found: {slug}")
        else:
            self._send_error(404, f"Not found: {self.path}")

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
        body = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, code: int, message: str) -> None:
        body = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>{code}</title>
<style>{INLINE_CSS}</style>
</head>
<body>
<header><a href="{self.base_url}/" class="site-title">Wiki</a></header>
<main>
<h1>{code}</h1>
<p>{html_module.escape(message)}</p>
</main>
</body>
</html>""".encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write(f"[{self.log_date_time_string()}] {fmt % args}\n")


def create_server(
    input_dirs: list[Path] | Path,
    host: str = "127.0.0.1",
    port: int = 8080,
    base_url: str = "/wiki",
) -> HTTPServer:
    """Build the site and return a configured HTTPServer (not yet started)."""
    dirs = [input_dirs] if isinstance(input_dirs, Path) else input_dirs
    site = build_site(dirs, base_url=base_url)
    WikiHandler.site = site
    WikiHandler.base_url = base_url

    server = HTTPServer((host, port), WikiHandler)
    print(f"Wiki server ready at http://{host}:{port}/")
    dirs_str = ", ".join(str(d) for d in dirs)
    print(f"Serving {len(site.pages)} pages from {dirs_str}")
    return server


def run_server(
    input_dirs: list[Path] | Path,
    host: str = "127.0.0.1",
    port: int = 8080,
    base_url: str = "/wiki",
) -> None:
    """Create and start the wiki HTTP server, blocking until shutdown."""
    server = create_server(input_dirs, host=host, port=port, base_url=base_url)

    def shutdown(*_: Any) -> None:
        print("\nShutting down server...")
        server.shutdown()

    try:
        signal.signal(signal.SIGINT, shutdown)
        signal.signal(signal.SIGTERM, shutdown)
    except ValueError:
        pass  # not in main thread – no interactive signal handling

    print("Press Ctrl+C to stop.")
    server.serve_forever()
