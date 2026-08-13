#!/usr/bin/env python3
"""Verify visible mini-program PNG assets at their final-source boundary."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


CONTROL_ICONS = (
    "arrows-left-right.png",
    "caret-right.png",
    "status-up.png",
    "status-check.png",
)


def inspect_png(path: Path) -> dict[str, object]:
    with Image.open(path) as source:
        image = source.convert("RGBA")
        alpha = image.getchannel("A")
        bounds = alpha.getbbox()
        width, height = image.size
        edge_clearance = None
        if bounds:
            left, top, right, bottom = bounds
            edge_clearance = {
                "left": left,
                "top": top,
                "right": width - right,
                "bottom": height - bottom,
            }
        return {
            "path": path.as_posix(),
            "size": [width, height],
            "alpha_bounds": list(bounds) if bounds else None,
            "edge_clearance": edge_clearance,
        }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--asset-root",
        default="miniapp/src/assets",
        help="Mini-program asset root.",
    )
    parser.add_argument("--write-report", help="Optional JSON report path.")
    args = parser.parse_args()

    asset_root = Path(args.asset_root)
    results = []
    failures = []
    for name in CONTROL_ICONS:
        path = asset_root / "icons" / name
        if not path.is_file():
            failures.append(f"missing control icon: {path}")
            continue
        result = inspect_png(path)
        results.append(result)
        if result["size"] != [96, 96]:
            failures.append(f"{name}: expected 96x96, got {result['size']}")
        clearance = result["edge_clearance"]
        if not clearance or min(clearance.values()) < 8:
            failures.append(f"{name}: visible pixels need at least 8px edge clearance")

    stat_results = [
        inspect_png(path)
        for path in sorted((asset_root / "stats").glob("*.png"))
    ]
    if len(stat_results) != 6:
        failures.append(f"expected 6 stat PNGs, found {len(stat_results)}")

    report = {
        "control_icons": results,
        "stat_icons": stat_results,
        "failures": failures,
        "passed": not failures,
    }
    text = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.write_report:
        Path(args.write_report).write_text(text, encoding="utf-8")
    print(text, end="")
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
