"""CLI presentation helpers for audit and check output."""

from __future__ import annotations

import sys

import click

from .schemas.reports import AuditReport


def exit_audit_report(report: AuditReport, *, verbose: bool, strict: bool) -> None:
    if strict:
        report = report.apply_strict()
    errors, warnings = report.messages()
    exit_check_results(report.ok, errors, warnings, verbose)


def exit_check_results(conforms: bool, errors: list[str], warnings: list[str], verbose: bool) -> None:
    if conforms and not errors:
        if verbose and warnings:
            click.echo("Warnings:", err=True)
            for warning in warnings:
                click.echo(f"  - {warning}", err=True)
        sys.exit(0)

    if errors:
        click.echo("Errors:", err=True)
        for error in errors:
            click.echo(f"  - {error}", err=True)

    if verbose and warnings:
        click.echo("Warnings:", err=True)
        for warning in warnings:
            click.echo(f"  - {warning}", err=True)

    sys.exit(1 if not conforms else 0)


def print_check_messages(errors: list[str], warnings: list[str], verbose: bool) -> None:
    if errors:
        click.echo("Errors:", err=True)
        for error in errors:
            click.echo(f"  - {error}", err=True)
    if verbose and warnings:
        click.echo("Warnings:", err=True)
        for warning in warnings:
            click.echo(f"  - {warning}", err=True)
