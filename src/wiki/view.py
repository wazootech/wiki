"""Terminal rendering helpers for wiki documents."""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from rich import box
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from .paths import route_for_document_file
from .site import build_infobox_rows, build_site


def render_document_view(file_path: Path, config: object, base_url: str | None = None, url_style: str | None = None) -> str:
    """Render a single wiki document as terminal-friendly rich text."""
    resolved_base_url = "/wiki" if base_url is None else base_url
    resolved_url_style = "dir" if url_style is None else url_style
    site = build_site(config, base_url=resolved_base_url, url_style=resolved_url_style)
    route = route_for_document_file(config, file_path)
    page = site.pages_by_route.get(route)
    if page is None:
        raise ValueError(f"Document is not part of the configured wiki inputs: {file_path.name}")

    buffer = StringIO()
    console = Console(file=buffer, force_terminal=False, color_system=None, width=100)

    template_name = page.template_name
    panel_text = Text(page.title)
    if template_name:
        panel_text.append(f"\nTemplate: {template_name}", style="dim")
    console.print(Panel(panel_text, expand=False, box=box.ASCII))

    rows = build_infobox_rows(page, site, resolved_base_url, resolved_url_style)
    if rows:
        table = Table(show_header=True, header_style="bold", box=box.ASCII, pad_edge=False)
        table.add_column("Field", style="cyan", no_wrap=True)
        table.add_column("Value")
        for row in rows:
            table.add_row(row.label, row.text)
        console.print(table)

    if page.markdown.strip():
        console.print()
        console.print(Markdown(page.markdown))

    return buffer.getvalue()
