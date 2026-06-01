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
from typing import Any, Optional

from .config import WikiConfig
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
    config: WikiConfig = None  # type: ignore[assignment]
    base_url: str = "/wiki"
    url_style: str = "dir"
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
            self._send_html(build_index_html(self.site, base_url=base, url_style=self.url_style))
        elif parsed == base:
            self._send_html(build_index_html(self.site, base_url=base, url_style=self.url_style))
        elif parsed.startswith(base + "/"):
            slug = parsed[len(base) + 1:]
            target = self._find_page(slug)
            if target:
                self._send_html(build_page_html(target, self.site, base_url=base, url_style=self.url_style))
            elif self._serve_asset(parsed[len(base) + 1:]):
                return
            else:
                self._send_error(404, f"Page not found: {slug}")
        elif self._serve_asset(parsed.lstrip("/")):
            return
        else:
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
    config: WikiConfig,
    host: str = "127.0.0.1",
    port: int = 8080,
    base_url: str = "/wiki",
    url_style: str = "dir",
    watch: bool = False,
) -> HTTPServer:
    """Build the site and return a configured HTTPServer (not yet started)."""
    site = build_site(config, base_url=base_url, url_style=url_style)
    WikiHandler.site = site
    WikiHandler.config = config
    WikiHandler.base_url = base_url
    WikiHandler.url_style = url_style
    WikiHandler.watch_enabled = watch
    WikiHandler.build_id = 0

    server = HTTPServer((host, port), WikiHandler)
    print(f"Wiki server ready at http://{host}:{port}/")
    dirs_str = ", ".join(str(d) for d in config.input_dirs)
    print(f"Serving {len(site.pages)} pages from {dirs_str}")
    if not site.pages:
        print("Warning: no pages found. Ensure your wiki directory has .md, .yaml, .yml, or .json files.")
    return server


def run_server(
    config: WikiConfig,
    host: str = "127.0.0.1",
    port: int = 8080,
    base_url: str = "/wiki",
    url_style: str = "dir",
    watch: bool = False,
) -> None:
    """Create and start the wiki HTTP server, blocking until shutdown."""
    server = create_server(config, host=host, port=port, base_url=base_url, url_style=url_style, watch=watch)

    if watch:
        watch_dirs = list(config.input_dirs) + [d for d in config.asset_dirs if d.exists()]

        def snapshot() -> dict[str, float]:
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

        mtimes = snapshot()

        def watch_loop() -> None:
            nonlocal mtimes
            while True:
                time.sleep(0.5)
                try:
                    new = snapshot()
                    if new != mtimes:
                        mtimes = new
                        WikiHandler.site = build_site(config, base_url=base_url, url_style=url_style)
                        WikiHandler.build_id += 1
                except Exception:
                    continue

        threading.Thread(target=watch_loop, daemon=True).start()

    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        server.shutdown()
