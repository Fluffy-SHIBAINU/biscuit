#!/usr/bin/env python3
"""Puts scorer tables into a Markdown file between comment markers, so a rerun replaces them.
  python scripts/eval/fill-results.py README.md synth=synth/runs/scores2/scores.md real=synth/runs/real/scores/scores.md
  python scripts/eval/fill-results.py docs/x.md r2=synth/runs/scores2/scores.md:full
Each name=path puts that scores.md's summary table at RESULTS_<NAME> (first time) or between <!-- results:name --> markers
(later); ":full" appends the per-field table too.
"""
import re
import sys
from pathlib import Path


def tables(path: str, full: bool) -> str:
    parts = Path(path).read_text().split("\n\n")
    out = parts[0].strip()
    if full and len(parts) > 2:
        out += "\n\n" + parts[2].strip()
    return out


def fill(target: str, specs: list[str]) -> None:
    s = Path(target).read_text()
    for spec in specs:
        name, _, rest = spec.partition("=")
        path, _, flag = rest.partition(":")
        body = f"<!-- results:{name} -->\n{tables(path, flag == 'full')}\n<!-- /results:{name} -->"
        marker = f"RESULTS_{name.upper()}"
        pattern = re.compile(rf"<!-- results:{name} -->.*?<!-- /results:{name} -->", re.S)
        if marker in s:
            s = s.replace(marker, body)
        elif pattern.search(s):
            s = pattern.sub(lambda _: body, s)
        else:
            raise SystemExit(f"{target}: no marker for {name}")
    Path(target).write_text(s)
    print(f"filled {target}: {', '.join(x.split('=')[0] for x in specs)}")


if __name__ == "__main__":
    fill(sys.argv[1], sys.argv[2:])
