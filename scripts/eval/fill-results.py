#!/usr/bin/env python3
"""Puts the scorer's tables into README.md and the Kindred's reader document between comment markers, so a rerun replaces them.
  python scripts/eval/fill-results.py
"""
import re
from pathlib import Path

R = Path(__file__).resolve().parents[2]
synth = (R / "synth/runs/scores/scores.md").read_text().split("\n\n")
real = (R / "synth/runs/real/scores/scores.md").read_text().split("\n\n")
summary = lambda md: md[0].strip()
per_field = lambda md: md[2].strip() if len(md) > 2 else ""

def block(name, body):
    return f"<!-- results:{name} -->\n{body}\n<!-- /results:{name} -->"

def fill(path, parts):
    s = Path(path).read_text()
    for name, body in parts.items():
        marker = f"RESULTS_{name.upper()}"
        pattern = re.compile(rf"<!-- results:{name} -->.*?<!-- /results:{name} -->", re.S)
        if marker in s:
            s = s.replace(marker, block(name, body))
        elif pattern.search(s):
            s = pattern.sub(lambda _: block(name, body), s)
        else:
            raise SystemExit(f"{path}: no marker for {name}")
    Path(path).write_text(s)

fill(R / "README.md", {"synth": summary(synth), "real": summary(real)})
fill(R / "docs/2026-10-28-kindred-reader.md", {"synth": summary(synth) + "\n\n" + per_field(synth), "real": summary(real) + "\n\n" + per_field(real)})
print("filled README.md and docs/2026-10-28-kindred-reader.md")
