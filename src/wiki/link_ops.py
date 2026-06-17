"""Link suggest/fix library operations."""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

from pydantic import BaseModel, Field

from .link_fix import (
    apply_broken_link_fixes,
    find_broken_link_fixes,
    remaining_broken_links,
)
from .link_suggest import apply_link_opportunities, find_link_opportunities
from .links import format_internal_link
from .paths import routes_from_markdown_files
from .schemas import LinkReport
from .workspace import Wiki


class LinkOptions(BaseModel):
    apply: bool = False
    fix_broken: bool = False
    dry_run: bool = False
    check: bool = False
    verbose: bool = False
    lines: list[str] = Field(default_factory=list)


def _run_link(
    workspace: Wiki,
    files: Sequence[Path] | None = None,
    options: LinkOptions | None = None,
) -> LinkReport:
    if options is None:
        options = LinkOptions()
    config = workspace.config
    file_filter = routes_from_markdown_files(config, tuple(files)) if files else None
    report = LinkReport()
    lines = report.lines

    if options.fix_broken:
        fixes = find_broken_link_fixes(config, file_filter=file_filter)
        report.fixes = len(fixes)
        for fix in fixes:
            lines.append(
                f"{fix.issue.source_path.name}: "
                f"{fix.issue.link_kind} [{fix.issue.raw_target}] -> {fix.description}"
            )
        changed: list[Path] = []
        if fixes:
            changed = apply_broken_link_fixes(config, fixes, dry_run=options.dry_run)
            report.changed_paths.extend(changed)
        if options.check:
            remaining = remaining_broken_links(
                config,
                file_filter=file_filter,
                fixes=fixes if options.dry_run else None,
            )
            report.remaining_broken = len(remaining)
            report.ok = report.remaining_broken == 0
        if not options.apply:
            return report

    opportunities = find_link_opportunities(config, file_filter=file_filter)
    report.opportunities = len(opportunities)

    if options.apply:
        if opportunities:
            changed = apply_link_opportunities(config, opportunities, dry_run=options.dry_run)
            report.changed_paths.extend(changed)
        if options.check:
            remaining_opportunities = find_link_opportunities(config, file_filter=file_filter)
            report.ok = len(remaining_opportunities) == 0
        return report

    if not opportunities:
        report.ok = True
        return report

    for item in opportunities:
        suggestion = format_internal_link(item.target_route, item.matched_text, config.link.style)
        target = f"{item.target_route} ({item.target_title})" if options.verbose else suggestion
        lines.append(
            f"{item.source_file}:{item.line}:{item.column}: "
            f'"{item.matched_text}" -> {target}'
        )
    report.ok = not options.check
    return report
