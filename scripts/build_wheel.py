"""Build a `wazootech-wiki` wheel around a `deno compile` standalone binary.

    python scripts/build_wheel.py --binary dist/wazootech-wiki-linux-x64 \
        --target x86_64-unknown-linux-gnu --out dist/wheels
    python scripts/build_wheel.py --pure --out dist/wheels

A platform wheel is `py3-none-<platform>` and carries the binary in
`.data/scripts/`, so pip installs it as `wiki` (`wiki.exe`) directly on PATH,
the way ruff and uv ship. The `--pure` wheel is `py3-none-any` with no binary:
pip picks it only where no platform wheel fits (musl Linux, say), and its
`wiki` console script runs a standalone `wazootech-wiki` from PATH.

Before tagging, the binary is checked against the target: its format and
architecture must match, and its platform floor (the newest glibc symbol
version for Linux, the minimum macOS version for macOS) must not exceed the
tag's. A wheel whose tag promises more than its binary delivers fails here,
not on a user's machine. Stdlib only; needs Python 3.11 for `tomllib`.
"""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import io
import mmap
import re
import struct
import sys
import tomllib
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "python" / "wiki"

#: PyPI's default per-file upload limit.
PYPI_FILE_LIMIT = 100 * 1000 * 1000

#: Each `deno compile --target` to its wheel platform tag and the binary that
#: tag requires. `floor` is the glibc (Linux) or macOS version the tag
#: promises, and `inspect_binary` refuses a binary that needs more. Measured
#: from Deno 2.9.6 output: both Linux binaries need glibc 2.27 (as the `deno`
#: PyPI package's wheels do), and both macOS binaries declare a 12.0 minimum
#: (LC_BUILD_VERSION), above the 10.12/11.0 the `deno` package tags with.
TARGETS: dict[str, dict[str, object]] = {
    "x86_64-unknown-linux-gnu": {
        "tag": "manylinux_2_27_x86_64", "format": "elf", "machine": 0x3E, "floor": (2, 27),
    },
    "aarch64-unknown-linux-gnu": {
        "tag": "manylinux_2_27_aarch64", "format": "elf", "machine": 0xB7, "floor": (2, 27),
    },
    "x86_64-apple-darwin": {
        "tag": "macosx_12_0_x86_64", "format": "macho", "machine": 0x01000007, "floor": (12, 0),
    },
    "aarch64-apple-darwin": {
        "tag": "macosx_12_0_arm64", "format": "macho", "machine": 0x0100000C, "floor": (12, 0),
    },
    "x86_64-pc-windows-msvc": {"tag": "win_amd64", "format": "pe", "machine": 0x8664},
    "aarch64-pc-windows-msvc": {"tag": "win_arm64", "format": "pe", "machine": 0xAA64},
}

# Deterministic archive timestamps: 1980-01-01, the zip epoch.
_EPOCH = (1980, 1, 1, 0, 0, 0)


class BuildError(RuntimeError):
    pass


# --- binary inspection -------------------------------------------------------


def _elf_glibc_floor(data: mmap.mmap) -> tuple[tuple[int, int] | None, int]:
    """(newest `GLIBC_x.y` version need, e_machine) of a 64-bit LE ELF."""
    if data[:4] != b"\x7fELF" or data[4] != 2 or data[5] != 1:
        raise BuildError("not a 64-bit little-endian ELF binary")
    (machine,) = struct.unpack_from("<H", data, 18)
    (shoff,) = struct.unpack_from("<Q", data, 0x28)
    shentsize, shnum = struct.unpack_from("<HH", data, 0x3A)
    sections = [
        struct.unpack_from("<IIQQQQIIQQ", data, shoff + index * shentsize)
        for index in range(shnum)
    ]
    newest: tuple[int, int] | None = None
    for _name, kind, _flags, _addr, offset, _size, link, info, _align, _entsize in sections:
        if kind != 0x6FFFFFFE:  # SHT_GNU_verneed
            continue
        strtab = sections[link][4]
        entry = offset
        for _ in range(info):
            _version, count, _file, aux, nxt = struct.unpack_from("<HHIII", data, entry)
            vernaux = entry + aux
            for _ in range(count):
                _hash, _flags2, _other, name, nxt_aux = struct.unpack_from("<IHHII", data, vernaux)
                end = data.find(b"\0", strtab + name)
                label = data[strtab + name:end].decode("ascii", "replace")
                match = re.fullmatch(r"GLIBC_(\d+)\.(\d+)(?:\.\d+)?", label)
                if match:
                    version = (int(match.group(1)), int(match.group(2)))
                    newest = version if newest is None else max(newest, version)
                vernaux += nxt_aux
            entry += nxt
    return newest, machine


def _macho_floor(data: mmap.mmap) -> tuple[tuple[int, int] | None, int]:
    """(minimum macOS version, cputype) of a thin 64-bit Mach-O binary."""
    (magic,) = struct.unpack_from("<I", data, 0)
    if magic != 0xFEEDFACF:
        raise BuildError("not a thin 64-bit Mach-O binary")
    cputype, _sub, _filetype, ncmds = struct.unpack_from("<iiII", data, 4)
    offset = 32
    floor: tuple[int, int] | None = None
    for _ in range(ncmds):
        cmd, size = struct.unpack_from("<II", data, offset)
        if cmd == 0x32:  # LC_BUILD_VERSION: platform, minos
            _platform, minos = struct.unpack_from("<II", data, offset + 8)
            floor = (minos >> 16, (minos >> 8) & 0xFF)
        elif cmd == 0x24:  # LC_VERSION_MIN_MACOSX: version
            (version,) = struct.unpack_from("<I", data, offset + 8)
            floor = (version >> 16, (version >> 8) & 0xFF)
        offset += size
    return floor, cputype & 0xFFFFFFFF


def _pe_machine(data: mmap.mmap) -> int:
    if data[:2] != b"MZ":
        raise BuildError("not a PE executable")
    (pe,) = struct.unpack_from("<I", data, 0x3C)
    if data[pe:pe + 4] != b"PE\0\0":
        raise BuildError("not a PE executable")
    (machine,) = struct.unpack_from("<H", data, pe + 4)
    return machine


def inspect_binary(path: Path, target: str) -> tuple[int, int] | None:
    """Check `path` is a `target` binary; return its platform floor."""
    spec = TARGETS[target]
    with path.open("rb") as handle, mmap.mmap(handle.fileno(), 0, access=mmap.ACCESS_READ) as data:
        if spec["format"] == "elf":
            floor, machine = _elf_glibc_floor(data)
        elif spec["format"] == "macho":
            floor, machine = _macho_floor(data)
        else:
            floor, machine = None, _pe_machine(data)
    if machine != spec["machine"]:
        raise BuildError(
            f"{path.name} is built for machine {machine:#x}, not {target} ({spec['machine']:#x})"
        )
    promised = spec.get("floor")
    if promised is not None:
        if floor is None:
            raise BuildError(f"{path.name}: no platform floor found to check against {spec['tag']}")
        if floor > promised:
            raise BuildError(
                f"{path.name} needs {floor[0]}.{floor[1]} but {spec['tag']} promises "
                f"{promised[0]}.{promised[1]}: raise the tag"  # type: ignore[index]
            )
    return floor


# --- wheel assembly ----------------------------------------------------------


def _record_hash(data: bytes) -> str:
    digest = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b"=")
    return "sha256=" + digest.decode("ascii")


def _metadata(project: dict[str, object], readme: str) -> str:
    lines = [
        "Metadata-Version: 2.4",
        f"Name: {project['name']}",
        f"Version: {project['version']}",
        f"Summary: {project['description']}",
        f"License-Expression: {project['license']}",
        "License-File: LICENSE",
        f"Requires-Python: {project['requires-python']}",
    ]
    lines += [f"Classifier: {item}" for item in project.get("classifiers", [])]  # type: ignore[union-attr]
    lines += [f"Project-URL: {k}, {v}" for k, v in project.get("urls", {}).items()]  # type: ignore[union-attr]
    lines.append("Description-Content-Type: text/markdown")
    return "\n".join(lines) + "\n\n" + readme


class _Wheel:
    def __init__(self, path: Path) -> None:
        self.zip = zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED, compresslevel=9)
        self.records: list[tuple[str, str, int]] = []

    def add(self, name: str, data: bytes, *, executable: bool = False) -> None:
        info = zipfile.ZipInfo(name, date_time=_EPOCH)
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = ((0o755 if executable else 0o644) | 0o100000) << 16
        self.zip.writestr(info, data, compresslevel=9)
        self.records.append((name, _record_hash(data), len(data)))

    def close(self, record_name: str) -> None:
        buffer = io.StringIO()
        writer = csv.writer(buffer, lineterminator="\n")
        writer.writerows(self.records)
        writer.writerow((record_name, "", ""))
        info = zipfile.ZipInfo(record_name, date_time=_EPOCH)
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = (0o644 | 0o100000) << 16
        self.zip.writestr(info, buffer.getvalue())
        self.zip.close()


def build(out: Path, *, binary: Path | None, target: str | None) -> Path:
    project = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))["project"]
    version = project["version"]
    dist = f"wazootech_wiki-{version}"
    pure = binary is None
    tag = "py3-none-any" if pure else f"py3-none-{TARGETS[target]['tag']}"  # type: ignore[index]
    out.mkdir(parents=True, exist_ok=True)
    wheel_path = out / f"{dist}-{tag}.whl"

    info = f"{dist}.dist-info"
    wheel = _Wheel(wheel_path)
    try:
        for source in sorted(PACKAGE.iterdir()):
            if source.suffix in {".py", ".typed"} and source.name != "_build.py":
                wheel.add(f"wiki/{source.name}", source.read_bytes())
        wheel.add(
            "wiki/_build.py",
            (
                '"""Written by scripts/build_wheel.py: what this wheel carries."""\n\n'
                f"BUNDLED = {not pure}\nTARGET = {target!r}\n"
            ).encode(),
        )
        if not pure:
            name = "wiki.exe" if "windows" in target else "wiki"  # type: ignore[operator]
            # One read for both the RECORD hash and the archive member.
            wheel.add(f"{dist}.data/scripts/{name}", binary.read_bytes(), executable=True)
        readme = (ROOT / project["readme"]).read_text(encoding="utf-8")
        wheel.add(f"{info}/METADATA", _metadata(project, readme).encode())
        wheel.add(
            f"{info}/WHEEL",
            (
                "Wheel-Version: 1.0\n"
                "Generator: wazootech-wiki scripts/build_wheel.py\n"
                f"Root-Is-Purelib: {'true' if pure else 'false'}\n"
                f"Tag: {tag}\n"
            ).encode(),
        )
        if pure:
            # A platform wheel's `wiki` is the binary; only the fallback wheel
            # gets the Python launcher as its `wiki` command.
            scripts = project.get("scripts", {})
            wheel.add(
                f"{info}/entry_points.txt",
                ("[console_scripts]\n" + "".join(f"{k} = {v}\n" for k, v in scripts.items())).encode(),
            )
        wheel.add(f"{info}/licenses/LICENSE", (ROOT / "LICENSE").read_bytes())
    finally:
        wheel.close(f"{info}/RECORD")
    return wheel_path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--binary", type=Path, help="a `deno compile` standalone")
    group.add_argument("--pure", action="store_true", help="the binary-less fallback wheel")
    parser.add_argument("--target", choices=sorted(TARGETS), help="the binary's --target")
    parser.add_argument("--out", type=Path, default=ROOT / "dist" / "wheels")
    args = parser.parse_args(argv)
    if args.binary is not None and args.target is None:
        parser.error("--binary needs --target")
    try:
        floor = None if args.pure else inspect_binary(args.binary, args.target)
        path = build(args.out, binary=args.binary, target=args.target)
    except BuildError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    size = path.stat().st_size
    detail = f", platform floor {floor[0]}.{floor[1]}" if floor else ""
    print(f"{path.name}: {size:,} bytes ({size / 1e6:.1f} MB){detail}")
    if size > PYPI_FILE_LIMIT:
        print(f"error: {path.name} exceeds PyPI's {PYPI_FILE_LIMIT:,}-byte file limit", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
