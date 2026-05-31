"""Local HTTP server for browsing the wiki as HTML -- no external web frameworks."""

from __future__ import annotations

import html as html_module
import json
import re
import signal
import sys
import threading
import time
from dataclasses import dataclass, field
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from typing import Any, Optional

from .filename_style import DEFAULT_FILENAME_STYLE
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
    watch_enabled: bool = False
    build_id: int = 0

    def do_GET(self) -> None:
        base = self.base_url
        parsed = re.sub(r"\?.*$", "", self.path)
        if parsed.rstrip("/") == f"{base}/__watch":
            self._send_json({"build": self.build_id})
            return
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
    watch: bool = False,
    filename_style: str = DEFAULT_FILENAME_STYLE,
) -> HTTPServer:
    """Build the site and return a configured HTTPServer (not yet started)."""
    dirs = [input_dirs] if isinstance(input_dirs, Path) else input_dirs
    site = build_site(dirs, base_url=base_url, filename_style=filename_style)
    WikiHandler.site = site
    WikiHandler.base_url = base_url
    WikiHandler.watch_enabled = watch
    WikiHandler.build_id = 0

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
    watch: bool = False,
    filename_style: str = DEFAULT_FILENAME_STYLE,
) -> None:
    """Create and start the wiki HTTP server, blocking until shutdown."""
    server = create_server(input_dirs, host=host, port=port, base_url=base_url, watch=watch, filename_style=filename_style)

    if watch:
        dirs = [input_dirs] if isinstance(input_dirs, Path) else input_dirs

        def snapshot() -> dict[str, float]:
            mtimes: dict[str, float] = {}
            for root in dirs:
                if not root.exists():
                    continue
                for p in root.rglob("*"):
                    if not p.is_file():
                        continue
                    if p.suffix.lower() not in {".md", ".ttl", ".trig", ".nt", ".nq", ".rdf", ".xml", ".jsonld", ".html", ".htm"}:
                        continue
                    try:
                        mtimes[str(p)] = p.stat().st_mtime
                    except OSError:
                        continue
            return mtimes

        mtimes = snapshot()

        def watch_loop() -> None:
            nonlocal mtimes
            while True:
                time.sleep(0.5)
                try:
                    new = snapshot()
                    if new != mtimes:
                        mtimes = new
                        WikiHandler.site = build_site(dirs, base_url=base_url, filename_style=filename_style)
                        WikiHandler.build_id += 1
                except Exception:
                    continue

        threading.Thread(target=watch_loop, daemon=True).start()

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
