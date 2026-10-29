#!/usr/bin/env python3
"""Turns hand-fetched sample documents into pages the readers can take.

  python scripts/eval/real-pages.py [--in synth/real-drop] [--out synth/realpool2] [--dpi 170] [--min-words 40] [--dry-run]

Every PDF, PNG or JPEG in --in becomes <out>/jpg/<file>-p<N>.jpg, one per page, with the page's own text next to it as
<out>/text/<file>-p<N>.txt (what the PDF carries, for labelling; scanned PDFs carry none). Pages with fewer than
--min-words words of PDF text are kept only when the PDF has no text at all (a scan). Nothing is uploaded; the pool is
read by scripts/eval/readers.ts and labelled by scripts/eval/agree-label.ts, and the dev set is labelled by hand.
Needs pymupdf and pillow (the training venv has both).
"""
from __future__ import annotations

import argparse
import os
import sys


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--in", dest="src", default="synth/real-drop")
    p.add_argument("--out", default="synth/realpool2")
    p.add_argument("--dpi", type=int, default=170)
    p.add_argument("--min-words", type=int, default=40)
    p.add_argument("--max-pages", type=int, default=8, help="pages taken from one PDF")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    import pymupdf
    from PIL import Image

    if not args.dry_run:
        os.makedirs(os.path.join(args.out, "jpg"), exist_ok=True)
        os.makedirs(os.path.join(args.out, "text"), exist_ok=True)
    kept, skipped = [], []
    for name in sorted(os.listdir(args.src)):
        if name.startswith("."):
            continue
        path = os.path.join(args.src, name)
        stem, ext = os.path.splitext(name)
        stem = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in stem.lower()).strip("-")
        ext = ext.lower()
        if ext in (".png", ".jpg", ".jpeg"):
            if not args.dry_run:
                Image.open(path).convert("RGB").save(os.path.join(args.out, "jpg", f"{stem}-p1.jpg"), quality=85)
            kept.append((f"{stem}-p1", "image"))
            continue
        if ext != ".pdf":
            skipped.append((name, "not a PDF or image"))
            continue
        try:
            doc = pymupdf.open(path)
        except Exception as exc:  # noqa: BLE001
            skipped.append((name, f"unreadable: {str(exc)[:80]}"))
            continue
        has_text = any(len(pg.get_text().split()) >= args.min_words for pg in doc)
        for i, page in enumerate(doc):
            if i >= args.max_pages:
                break
            words = len(page.get_text().split())
            if has_text and words < args.min_words:
                skipped.append((f"{stem}-p{i + 1}", f"{words} words"))
                continue
            pid = f"{stem}-p{i + 1}"
            if not args.dry_run:
                page.get_pixmap(dpi=args.dpi).save(os.path.join(args.out, "jpg", f"{pid}.jpg"), jpg_quality=85)
                with open(os.path.join(args.out, "text", f"{pid}.txt"), "w") as f:
                    f.write(page.get_text())
            kept.append((pid, f"{words} words" if words else "scan, no text"))
    for pid, why in kept:
        print(f"page  {pid:48s} {why}")
    for pid, why in skipped:
        print(f"skip  {pid:48s} {why}")
    print(f"{len(kept)} pages{'' if args.dry_run else ' in ' + args.out + '/jpg'}, {len(skipped)} skipped{' (dry run)' if args.dry_run else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
