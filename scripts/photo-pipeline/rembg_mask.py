#!/usr/bin/env python3
"""Catalog-safe local subject mask via rembg / u2net.

Deterministic, non-generative, zero monetary cost. This helper NEVER repaints
or regenerates product pixels — it only computes a grayscale alpha mask
(``only_mask``). The JS worker (``pipeline.mjs``) joins this mask to the
*untouched* original RGB, so label text, logos, dosage and warnings are
preserved byte-for-byte (catalog-safe by construction).

The mask model + alpha-matting parameters are supplied by the worker from the
locked ``config/catalog_safe_preset.v1.json`` preset.

Usage:
  python3 rembg_mask.py --input IN.png --output MASK.png \
      --model u2net --alpha-matting \
      --fg-threshold 240 --bg-threshold 10 --erode 5

Exit codes:
  0  success (mask written to --output)
  2  bad arguments
  3  rembg / Pillow not installed (worker falls back silently)
  4  rembg ran but failed (e.g. offline model download) — worker falls back
"""
import argparse
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="Catalog-safe rembg/u2net mask")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="u2net")
    parser.add_argument("--alpha-matting", action="store_true")
    parser.add_argument("--fg-threshold", type=int, default=240)
    parser.add_argument("--bg-threshold", type=int, default=10)
    parser.add_argument("--erode", type=int, default=5)
    args = parser.parse_args()

    try:
        from rembg import new_session, remove
    except Exception as exc:  # noqa: BLE001 - report any import failure to the worker
        print(f"rembg-unavailable: {exc}", file=sys.stderr)
        return 3

    try:
        from PIL import Image
    except Exception as exc:  # noqa: BLE001
        print(f"pillow-unavailable: {exc}", file=sys.stderr)
        return 3

    try:
        session = new_session(args.model)
        with Image.open(args.input) as source:
            rgb = source.convert("RGB")
            mask = remove(
                rgb,
                session=session,
                only_mask=True,
                alpha_matting=args.alpha_matting,
                alpha_matting_foreground_threshold=args.fg_threshold,
                alpha_matting_background_threshold=args.bg_threshold,
                alpha_matting_erode_size=args.erode,
            )
        # ``only_mask`` yields a single-channel image; normalize to 8-bit grayscale.
        mask.convert("L").save(args.output, format="PNG")
    except Exception as exc:  # noqa: BLE001 - offline model / runtime failure
        print(f"rembg-failed: {exc}", file=sys.stderr)
        return 4

    return 0


if __name__ == "__main__":
    sys.exit(main())
