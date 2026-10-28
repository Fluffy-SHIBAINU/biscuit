#!/usr/bin/env python3
"""On-demand deployments on Fireworks for Kindred's reader: create one for a model, wait for it, print the model string
Biscuit's readers take, and delete it when the day is over. Billed by the GPU-second while awake; scales to zero.

  python scripts/train/deploy.py create --model accounts/<acct>/models/biscuit-glimmer-oct28a [--shape <id>] [--idle 600s] [--id biscuit-reader]
  python scripts/train/deploy.py status --id biscuit-reader
  python scripts/train/deploy.py delete --id biscuit-reader

create picks the cheapest BF16 shape the account may use for the model unless --shape names one. Needs FIREWORKS_API_KEY
(read from .env.local when unset).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

ACCOUNT = os.environ.get("FIREWORKS_ACCOUNT_ID", "i-shawn-yoon-zldmgt3")
HOURLY = {"NVIDIA_H100_80GB": 8.0, "NVIDIA_H200_141GB": 8.0, "NVIDIA_B200_180GB": 13.0, "NVIDIA_B300_288GB": 15.0, "NVIDIA_GB300": 20.0}


def load_env() -> None:
    p = Path(".env.local")
    if p.is_file():
        for line in p.read_text().splitlines():
            k, sep, v = line.strip().partition("=")
            if sep and k and not k.startswith("#"):
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def client():
    from fireworks import Fireworks

    if not os.environ.get("FIREWORKS_API_KEY"):
        sys.exit("FIREWORKS_API_KEY is not set")
    return Fireworks(account_id=ACCOUNT)


def shapes_for(c, model: str) -> list[dict]:
    r = c.deployment_shape_versions.match_for_model(model)
    d = r.model_dump()
    out = []
    for v in d.get("deployment_shape_versions") or d.get("deploymentShapeVersions") or []:
        name = v.get("name", "")
        shape_id = name.split("/deploymentShapes/")[-1].split("/")[0]
        try:
            s = c.deployment_shapes.get(shape_id, account_id="fireworks").model_dump()
        except Exception:  # noqa: BLE001
            s = {}
        acc = s.get("accelerator_type") or s.get("acceleratorType") or "?"
        out.append({"shape": shape_id, "display": s.get("display_name") or s.get("displayName") or shape_id, "precision": s.get("precision"), "accelerator": acc, "count": s.get("accelerator_count") or s.get("acceleratorCount") or 1, "hourly": HOURLY.get(acc)})
    return out


def cmd_create(args) -> int:
    c = client()
    shapes = shapes_for(c, args.model)
    print(json.dumps({"shapes": shapes}, indent=1), flush=True)
    chosen = args.shape
    if not chosen:
        bf16 = [s for s in shapes if s["precision"] == "BF16" and s["hourly"]]
        if not bf16:
            sys.exit("no BF16 shape with a known price; pass --shape")
        chosen = min(bf16, key=lambda s: s["hourly"] * s["count"])["shape"]
    dep = c.deployments.create(
        base_model=args.model, deployment_id=args.id, display_name=args.id, deployment_shape=chosen,
        min_replica_count=0, max_replica_count=1,
        autoscaling_policy={"scale_to_zero_window": args.idle, "scale_down_window": args.idle, "scale_up_window": "30s"},
        description="Kindred's reader for Biscuit: the shadow seat on Ana's page. Scales to zero when idle.",
    )
    d = dep.model_dump()
    print(json.dumps({"created": d.get("name"), "shape": chosen, "state": d.get("state")}), flush=True)
    return cmd_status(args)


def cmd_status(args) -> int:
    c = client()
    for _ in range(120):
        d = c.deployments.get(args.id).model_dump()
        state = d.get("state")
        print(json.dumps({"deployment": d.get("name"), "state": state, "replicas": d.get("replica_count") or d.get("replicaCount"), "model": d.get("base_model") or d.get("baseModel"), "shape": d.get("deployment_shape") or d.get("deploymentShape"), "status": (d.get("status") or {}).get("message")}), flush=True)
        if state in ("READY", "FAILED", "DELETING") or not args.wait:
            break
        time.sleep(15)
    model = d.get("base_model") or d.get("baseModel")
    print(f"model string for Biscuit: {model}#{d.get('name')}")
    return 0 if state == "READY" or not args.wait else 1


def cmd_delete(args) -> int:
    c = client()
    c.deployments.delete(args.id)
    print(json.dumps({"deleted": f"accounts/{ACCOUNT}/deployments/{args.id}"}))
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="command", required=True)
    for name in ("create", "status", "delete"):
        s = sub.add_parser(name)
        s.add_argument("--id", default="biscuit-reader")
        s.add_argument("--model", default=None)
        s.add_argument("--shape", default=None)
        s.add_argument("--idle", default="600s", help="scale-to-zero window")
        s.add_argument("--wait", action="store_true", default=(name == "create"))
    args = p.parse_args()
    load_env()
    if args.command == "create":
        if not args.model:
            sys.exit("--model is required")
        return cmd_create(args)
    if args.command == "status":
        return cmd_status(args)
    return cmd_delete(args)


if __name__ == "__main__":
    sys.exit(main())
