"""Conservative auto-repair for broken internal wiki links."""

from __future__ import annotations

import difflib
import re
from pathlib import Path

from .audit import collect_broken_links
from .schemas import BrokenLink, BrokenLinkFix
from .config import WikiConfig
from .headings import GitHubHeadingSlugger
from .links import fragment_id, resolve_page_route, split_target
from .paths import iter_document_files, route_for_document_file

WIKILINK_FULL_REGEX = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]*))?\]\]")
MARKDOWN_LINK_FULL_REGEX = re.compile(r"(!?\[[^\]]*\]\()([^)]+)(\))")
FUZZY_ROUTE_CUTOFF = 0.86


def find_broken_link_fixes(config: WikiConfig, file_filter: set[str] | None = None) -> list[BrokenLinkFix]:
    """Return only unambiguous broken-link repairs."""
    existing_routes = {
        route_for_document_file(config, file_path) for file_path in iter_document_files(config)
    }
    heading_ids_by_route = _heading_ids_by_route(config)
    fixes: list[BrokenLinkFix] = []

    for issue in collect_broken_links(config, file_filter=file_filter):
        if issue.issue_kind not in {"missing_document", "missing_heading"}:
            continue
        if issue.match_start is None or issue.match_end is None or issue.full_match is None:
            continue
        if issue.link_kind not in {"WikiLink", "Markdown link"}:
            continue

        replacement = _suggest_replacement(
            config,
            issue,
            existing_routes,
            heading_ids_by_route,
        )
        if replacement is not None:
            fixes.append(replacement)

    return fixes


def apply_broken_link_fixes(
    config: WikiConfig,
    fixes: list[BrokenLinkFix],
    *,
    dry_run: bool = False,
) -> list[Path]:
    """Apply broken-link fixes bottom-up within each file."""
    if not fixes:
        return []

    by_path: dict[Path, list[BrokenLinkFix]] = {}
    for fix in fixes:
        by_path.setdefault(fix.issue.source_path, []).append(fix)

    changed: list[Path] = []
    for file_path, file_fixes in by_path.items():
        content = file_path.read_text(encoding="utf-8")
        ordered = sorted(file_fixes, key=lambda item: item.issue.match_start or 0, reverse=True)
        for fix in ordered:
            start = fix.issue.match_start
            end = fix.issue.match_end
            if start is None or end is None or fix.issue.full_match is None:
                continue
            if content[start:end] != fix.issue.full_match:
                continue
            new_match = _replace_target_in_match(fix.issue, fix.replacement_target)
            content = content[:start] + new_match + content[end:]

        if dry_run:
            changed.append(file_path)
            continue
        file_path.write_text(content, encoding="utf-8")
        changed.append(file_path)

    return changed


def remaining_broken_links(
    config: WikiConfig,
    file_filter: set[str] | None = None,
    *,
    fixes: list[BrokenLinkFix] | None = None,
) -> list[BrokenLink]:
    """Return broken links that would still fail after applying fixes."""
    issues = collect_broken_links(config, file_filter=file_filter)
    if not fixes:
        return issues

    fixed_keys = {
        (fix.issue.source_path, fix.issue.match_start, fix.issue.match_end, fix.issue.raw_target)
        for fix in fixes
    }
    return [
        issue
        for issue in issues
        if (issue.source_path, issue.match_start, issue.match_end, issue.raw_target) not in fixed_keys
    ]


def _heading_ids_by_route(config: WikiConfig) -> dict[str, set[str]]:
    heading_ids: dict[str, set[str]] = {}
    slugger = GitHubHeadingSlugger()
    for file_path in iter_document_files(config):
        if file_path.suffix.lower() != ".md":
            continue
        route = route_for_document_file(config, file_path)
        body = file_path.read_text(encoding="utf-8")
        if body.startswith("---"):
            parts = body.split("---", 2)
            if len(parts) > 2:
                body = parts[2]
        ids: set[str] = set()
        for match in re.finditer(r"^(#{1,6})\s+(.+)$", body, flags=re.MULTILINE):
            ids.add(slugger.slug(match.group(2).strip()))
        heading_ids[route] = ids
    return heading_ids


def _suggest_replacement(
    config: WikiConfig,
    issue: BrokenLink,
    existing_routes: set[str],
    heading_ids_by_route: dict[str, set[str]],
) -> BrokenLinkFix | None:
    target = issue.raw_target
    page_part, fragment = split_target(target)

    if issue.issue_kind == "missing_document":
        replacement_page = _replacement_route(config, issue.source_route, page_part, existing_routes)
        if replacement_page is None:
            return None
        replacement_target = replacement_page
        if fragment:
            replacement_target = f"{replacement_page}#{fragment}"
        return BrokenLinkFix(
            issue=issue,
            replacement_target=replacement_target,
            description=f"{target} -> {replacement_target}",
        )

    route = resolve_page_route(issue.source_route, target)
    if route is None or route not in existing_routes or not fragment:
        return None
    replacement_fragment = _replacement_heading(fragment, heading_ids_by_route.get(route, set()))
    if replacement_fragment is None:
        return None
    replacement_target = f"{page_part}#{replacement_fragment}" if page_part else f"#{replacement_fragment}"
    return BrokenLinkFix(
        issue=issue,
        replacement_target=replacement_target,
        description=f"{target} -> {replacement_target}",
    )


def _replacement_route(
    config: WikiConfig,
    source_route: str,
    page_part: str,
    existing_routes: set[str],
) -> str | None:
    if not page_part:
        return None

    renamed = (config.link.renames or {}).get(page_part)
    if renamed and renamed in existing_routes:
        return renamed

    resolved = resolve_page_route(source_route, page_part)
    if resolved and resolved in existing_routes:
        return resolved

    normalized = page_part.replace(" ", "_")
    if normalized in existing_routes:
        return normalized

    matches = difflib.get_close_matches(page_part, sorted(existing_routes), n=2, cutoff=FUZZY_ROUTE_CUTOFF)
    if len(matches) == 1:
        return matches[0]
    return None


def _replacement_heading(fragment: str, heading_ids: set[str]) -> str | None:
    target_fragment = fragment_id(fragment)
    if target_fragment in heading_ids:
        return fragment
    matches = difflib.get_close_matches(target_fragment, sorted(heading_ids), n=2, cutoff=FUZZY_ROUTE_CUTOFF)
    if len(matches) == 1:
        return matches[0]
    return None


def _replace_target_in_match(issue: BrokenLink, replacement_target: str) -> str:
    full_match = issue.full_match or ""
    if issue.link_kind == "WikiLink":
        match = WIKILINK_FULL_REGEX.fullmatch(full_match)
        if not match:
            return full_match
        display = match.group(2)
        if display is not None:
            return f"[[{replacement_target}|{display}]]"
        return f"[[{replacement_target}]]"

    match = MARKDOWN_LINK_FULL_REGEX.fullmatch(full_match)
    if not match:
        return full_match
    return f"{match.group(1)}{replacement_target}{match.group(3)}"
