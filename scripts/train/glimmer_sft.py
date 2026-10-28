#!/usr/bin/env python3
"""Kindred's reader: a LoRA on Meta's Muse Glimmer 30B, trained on Fireworks' Serverless Training API.

Trains on the synthetic letters (two rows a letter: transcribe the picture, extract from the transcription), scores base
and tuned weights on the held-out letters by in-session sampling with the same two-stage read Biscuit runs in
production, writes each reader's raw outputs for scripts/eval/score.ts, and promotes the tuned adapter to a model on the
account. Dataset uploads are closed on this account, so nothing is uploaded: rows are rendered locally with the Fireworks
cookbook's Muse Glimmer renderer and streamed to the pooled trainer.

  COOKBOOK=/path/to/fw-ai/cookbook python scripts/train/glimmer_sft.py --train synth/train.jsonl --holdout synth/holdout.jsonl --run oct28a
  ... --dry-run            renders the rows and prints token counts; no network, no cost
  ... --skip-base          skips the base evaluation
  ... --no-promote         leaves the adapter in the session

Needs FIREWORKS_API_KEY (read from .env.local when unset) and the cookbook's renderer on COOKBOOK, with its public
dependencies installed (torch, transformers 5.10.4, pillow, numpy, pydantic, protobuf, jinja2, tiktoken).
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

BASE_MODEL = "accounts/fireworks/models/muse-glimmer-30b"
TOKENIZER_MODEL = "meta-models/Muse-Glimmer-30B"
REASONING = "low"  # Glimmer accepts low / medium / high / xhigh; a letter is transcription and copying


def load_env() -> None:
    p = Path(".env.local")
    if p.is_file():
        for line in p.read_text().splitlines():
            k, sep, v = line.strip().partition("=")
            if sep and k and not k.startswith("#"):
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def convert(messages: list[dict]) -> list[dict]:
    """OpenAI image_url parts become the renderer's image parts; the picture stays a URL (file or data) until rendering."""
    out = []
    for m in messages:
        c = m["content"]
        if isinstance(c, list):
            c = [({"type": "image", "image": p["image_url"]["url"]} if p.get("type") == "image_url" else p) for p in c]
        out.append({**m, "content": c})
    return out


def load_rows(path: str) -> list[dict]:
    return [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]


def by_letter(rows: list[dict]) -> dict[str, dict]:
    letters: dict[str, dict] = {}
    for r in rows:
        letters.setdefault(r["id"], {})[r["task"]] = r["messages"]
    return letters


def make_renderer():
    from training.renderer.muse_glimmer import MuseGlimmerImageTokenCounter, MuseGlimmerOptions, MuseGlimmerRenderer
    from training.renderer.tokenizer import get_tokenizer

    tokenizer = get_tokenizer(TOKENIZER_MODEL)
    counter = MuseGlimmerImageTokenCounter.from_pretrained(TOKENIZER_MODEL)
    renderer = MuseGlimmerRenderer(tokenizer, image_processor=counter, options=MuseGlimmerOptions(reasoning_strength=REASONING))
    return tokenizer, renderer


def render_datums(rows: list[dict], renderer, max_seq_len: int) -> tuple[list, dict]:
    from training.renderer import TrainOnWhat
    from training.renderer.supervised import datum_from_model_input_weights

    datums, stats = [], {"rows": len(rows), "kept": 0, "oversized": 0, "empty": 0, "tokens_min": None, "tokens_max": 0, "image_tokens": None, "by_task": {}}
    for r in rows:
        mi, w = renderer.build_supervised_example(convert(r["messages"]), train_on_what=TrainOnWhat.LAST_ASSISTANT_TURN)
        total = sum(c.length for c in mi.chunks)
        if total > max_seq_len:
            stats["oversized"] += 1
            continue
        if total < 2 or not any(x > 0 for x in w.tolist()[1:]):
            stats["empty"] += 1
            continue
        datums.append(datum_from_model_input_weights(mi, w, max_length=max_seq_len))
        stats["kept"] += 1
        stats["tokens_min"] = total if stats["tokens_min"] is None else min(stats["tokens_min"], total)
        stats["tokens_max"] = max(stats["tokens_max"], total)
        stats["by_task"][r["task"]] = stats["by_task"].get(r["task"], 0) + 1
        for c in mi.chunks:
            if type(c).__name__ == "ImageChunk":
                stats["image_tokens"] = c.length
    return datums, stats


def connect(api_key: str):
    from fireworks.training.sdk import FiretitanServiceClient

    base = os.environ.get("FIREWORKS_BASE_URL", "https://api.fireworks.ai").rstrip("/")
    service = FiretitanServiceClient(api_key=api_key, base_url=f"{base}/training/v1/serverless")
    enable = getattr(service, "_enable_serverless_supervised_409_retry", None)
    if enable is not None:
        enable()
    return service, base


def project(prompt, renderer, affixes: str):
    """The sampler takes text tokens plus one placeholder per image and the images as data URLs; serving expands the
    placeholder into the visual tokens. "strip" also drops the renderer's <|image_start|>/<|image_end|> around each image
    (serving adds them back); "keep" leaves them. The probe picks the one the model reads."""
    import base64

    from fireworks.training import sdk

    start = renderer.tokenizer.encode("<|image_start|>", add_special_tokens=False)
    end = renderer.tokenizer.encode("<|image_end|>", add_special_tokens=False)
    ids: list[int] = []
    images: list[str] = []
    chunks = list(prompt.chunks)
    for i, c in enumerate(chunks):
        if type(c).__name__ == "ImageChunk":
            if affixes == "strip" and ids[-len(start):] == start:
                del ids[-len(start):]
            ids.append(renderer.image_placeholder_token_id)
            images.append("data:image/jpeg;base64," + base64.b64encode(c.data).decode("ascii"))
            continue
        toks = list(c.tokens)
        if affixes == "strip" and images and i > 0 and type(chunks[i - 1]).__name__ == "ImageChunk" and toks[: len(end)] == end:
            toks = toks[len(end):]
        ids.extend(toks)
    return sdk.ModelInput.from_ints(ids), images, sum(c.length for c in chunks)


def sample_texts(sampler, renderer, prompts: list, params, batch: int, label: str, affixes: str) -> list[dict]:
    """Samples every prompt, a batch of futures at a time; returns text, token counts, milliseconds and whether it ended cleanly."""
    from training.renderer import get_text_content

    out: list[dict] = []
    for start in range(0, len(prompts), batch):
        chunk = prompts[start : start + batch]
        t0 = time.time()
        projected = [project(p, renderer, affixes) for p in chunk]
        futures = [sampler.sample(prompt=ids, num_samples=1, sampling_params=params, images=images or None) for ids, images, _ in projected]
        for (ids, images, n_prompt), fut in zip(projected, futures):
            t1 = time.time()
            try:
                res = fut.result()
                tokens = list(res.sequences[0].tokens)
                msg, termination = renderer.parse_response(tokens)
                out.append({"text": get_text_content(msg), "prompt_tokens": n_prompt, "sampled_tokens": len(tokens), "ms": int((time.time() - t0) * 1000), "clean": bool(termination.is_clean), "error": None})
            except Exception as exc:  # noqa: BLE001 - keep scoring the rest
                out.append({"text": "", "prompt_tokens": n_prompt, "sampled_tokens": 0, "ms": int((time.time() - t1) * 1000), "clean": False, "error": str(exc)[:200]})
        print(f"{label}: {min(start + batch, len(prompts))}/{len(prompts)} sampled", flush=True)
    return out


def evaluate(label: str, service, snapshot: str, tokenizer, renderer, letters: dict[str, dict], out_dir: Path, args) -> dict:
    from fireworks.training import sdk

    sampler = service.create_sampling_client(model_path=snapshot, tokenizer=tokenizer)
    stop = renderer.get_stop_sequences()
    ids = sorted(letters)
    try:
        # Stage one: the picture, the transcription prompt.
        prompts = [renderer.build_generation_prompt(convert(letters[i]["transcribe"][:-1])) for i in ids]
        t_params = sdk.SamplingParams(max_tokens=args.max_transcribe_tokens, temperature=0.0, stop=stop)
        stage1 = sample_texts(sampler, renderer, prompts, t_params, args.eval_batch, f"{label} transcribe", args.image_affixes)
        # Stage two: the extraction prompt over the model's own transcription, as production does.
        extract_sys = dict(letters[ids[0]]["extract"][0])
        if getattr(args, "schema_in_prompt", None):
            # The base model never saw the schema: production enforces it with response_format, which the pooled sampler lacks.
            extract_sys["content"] = extract_sys["content"] + "\nThe schema, as JSON Schema:\n" + Path(args.schema_in_prompt).read_text().strip() + "\nAnswer with the JSON object only."
        prompts2 = [renderer.build_generation_prompt([extract_sys, {"role": "user", "content": s["text"] or "(no transcription)"}]) for s in stage1]
        x_params = sdk.SamplingParams(max_tokens=args.max_extract_tokens, temperature=0.0, stop=stop)
        stage2 = sample_texts(sampler, renderer, prompts2, x_params, args.eval_batch, f"{label} extract", args.image_affixes)
    finally:
        close = getattr(sampler, "close", None)
        if close:
            close()
    preds = []
    for i, s1, s2 in zip(ids, stage1, stage2):
        extraction = None
        text = s2["text"]
        try:
            a, b = text.find("{"), text.rfind("}")
            extraction = json.loads(text[a : b + 1]) if a >= 0 and b > a else None
        except ValueError:
            extraction = None
        preds.append({"id": i, "transcription": s1["text"] or None, "extraction": extraction, "extractionText": text, "msTranscribe": s1["ms"], "msExtract": s2["ms"], "truncated": (not s1["clean"]) or (not s2["clean"]), **({"error": s1["error"] or s2["error"]} if (s1["error"] or s2["error"]) else {})})
    (out_dir / f"predictions_{label}.jsonl").write_text("".join(json.dumps(p) + "\n" for p in preds))
    summary = {
        "label": label, "letters": len(preds), "errors": sum(1 for p in preds if p.get("error")), "truncated": sum(1 for p in preds if p["truncated"]),
        "prompt_tokens": sum(s["prompt_tokens"] for s in stage1 + stage2), "sampled_tokens": sum(s["sampled_tokens"] for s in stage1 + stage2),
        "ms_median": sorted(p["msTranscribe"] + p["msExtract"] for p in preds)[len(preds) // 2] if preds else None,
    }
    (out_dir / f"reader_{label}.json").write_text(json.dumps({"name": label, "label": {"glimmer_base": "Glimmer 30B, base", "glimmer_tuned": "Kindred's reader (Glimmer 30B, trained)"}.get(label, label), "model": BASE_MODEL, **summary}, indent=1))
    print(json.dumps(summary), flush=True)
    return summary


def promote(service, base_url: str, api_key: str, run: str) -> str | None:
    from fireworks.training.sdk import FireworksClient

    fw = FireworksClient(api_key=api_key, base_url=base_url)
    rows = [r for r in fw.list_training_session_checkpoints(service.training_session_name) if r.get("promotable") and "biscuit-tuned" in (r.get("checkpointName") or r.get("name") or "")]
    if not rows:
        print("no promotable tuned checkpoint; the adapter stays in the session", flush=True)
        return None
    target = max(rows, key=lambda r: r.get("createTime", ""))
    model_id = f"biscuit-glimmer-{run}"[:63]
    result = fw.promote_session_checkpoint(name=target["name"], output_model_id=model_id, base_model=BASE_MODEL)
    name = result.get("name") if isinstance(result, dict) and result.get("name") else f"accounts/{fw.account_id}/models/{model_id}"
    print(json.dumps({"promoted_model": name, "from_checkpoint": target["name"]}), flush=True)
    return name


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--train", required=True)
    p.add_argument("--holdout", required=True)
    p.add_argument("--run", required=True, help="names the run directory and the promoted model (biscuit-glimmer-<run>)")
    p.add_argument("--out", default="synth/runs")
    p.add_argument("--epochs", type=int, default=2)
    p.add_argument("--batch-size", type=int, default=8)
    p.add_argument("--lr", type=float, default=1e-4)
    p.add_argument("--rank", type=int, default=16)
    p.add_argument("--alpha", type=int, default=32)
    p.add_argument("--max-seq-len", type=int, default=8192)
    p.add_argument("--eval-n", type=int, default=100)
    p.add_argument("--eval-batch", type=int, default=8)
    p.add_argument("--max-transcribe-tokens", type=int, default=1200)
    p.add_argument("--max-extract-tokens", type=int, default=900)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--image-affixes", choices=("keep", "strip"), default="strip", help="whether the sampler prompt keeps the renderer's image boundary tokens")
    p.add_argument("--probe", action="store_true", help="sample one held-out letter with base weights both ways and exit")
    p.add_argument("--eval-only", action="store_true", help="no training: score the base weights (or --adapter) on the holdout under --label, then exit")
    p.add_argument("--adapter", default=None, help="a promoted adapter to load before --eval-only sampling")
    p.add_argument("--label", default="glimmer_base", help="the reader name for --eval-only predictions")
    p.add_argument("--schema-in-prompt", default=None, help="path to the extraction JSON schema to append to the extraction prompt")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--skip-base", action="store_true")
    p.add_argument("--no-promote", action="store_true")
    args = p.parse_args()

    load_env()
    cookbook = os.environ.get("COOKBOOK")
    if not cookbook or not Path(cookbook, "training").is_dir():
        sys.exit("COOKBOOK must point at a clone of https://github.com/fw-ai/cookbook (its training/ folder is the renderer).")
    sys.path.insert(0, cookbook)
    out_dir = Path(args.out) / args.run
    out_dir.mkdir(parents=True, exist_ok=True)

    tokenizer, renderer = make_renderer()
    train_rows = load_rows(args.train)
    holdout = by_letter(load_rows(args.holdout))
    holdout = {k: holdout[k] for k in sorted(holdout)[: args.eval_n]}
    t0 = time.time()
    if args.eval_only or args.probe:
        train_rows = train_rows[:4]
    datums, stats = render_datums(train_rows, renderer, args.max_seq_len)
    stats["render_seconds"] = round(time.time() - t0, 1)
    print(json.dumps({"train": stats, "holdout_letters": len(holdout)}), flush=True)
    (out_dir / "data.json").write_text(json.dumps({"train": stats, "holdout_letters": len(holdout), "args": vars(args)}, indent=1))
    if args.dry_run:
        return 0

    api_key = os.environ.get("FIREWORKS_API_KEY")
    if not api_key:
        sys.exit("FIREWORKS_API_KEY is not set")
    from fireworks.training import sdk

    service, base_url = connect(api_key)
    log = (out_dir / ("metrics.jsonl" if not (args.eval_only or args.probe) else f"metrics_{args.label}.jsonl")).open("a")
    summary: dict = {"run": args.run, "base_model": BASE_MODEL, "reasoning": REASONING, "train_rows": stats["kept"], "holdout_letters": len(holdout), "args": vars(args)}
    try:
        client = service.create_lora_training_client(base_model=BASE_MODEL, rank=args.rank, alpha=args.alpha, train_mlp=True, train_attn=True, train_unembed=True)
        summary["session"] = getattr(service, "training_session_id", None)
        summary["train_run"] = getattr(client, "run_id", None)
        print(json.dumps({"session": summary["session"], "run": summary["train_run"]}), flush=True)
        if args.probe:
            first = sorted(holdout)[0]
            snapshot = client.save_weights_for_sampler("biscuit-probe").result().path
            sampler = service.create_sampling_client(model_path=snapshot, tokenizer=tokenizer)
            prompt = renderer.build_generation_prompt(convert(holdout[first]["transcribe"][:-1]))
            truth = holdout[first]["transcribe"][-1]["content"]
            for affixes in ("strip", "keep"):
                got = sample_texts(sampler, renderer, [prompt], sdk.SamplingParams(max_tokens=args.max_transcribe_tokens, temperature=0.0, stop=renderer.get_stop_sequences()), 1, f"probe {affixes}", affixes)[0]
                words = set(truth.split()); mine = set((got["text"] or "").split())
                print(json.dumps({"affixes": affixes, "error": got["error"], "ms": got["ms"], "sampled_tokens": got["sampled_tokens"], "clean": got["clean"], "word_overlap": round(len(words & mine) / max(1, len(words)), 3), "head": (got["text"] or "")[:300]}), flush=True)
            return 0
        if args.eval_only:
            if args.adapter:
                client.load_adapter(args.adapter).result()
                print(json.dumps({"loaded_adapter": args.adapter}), flush=True)
            snapshot = client.save_weights_for_sampler(f"biscuit-{args.label}".replace("_", "-")[:40]).result().path
            summary[args.label] = evaluate(args.label, service, snapshot, tokenizer, renderer, holdout, out_dir, args)
            return 0
        if not args.skip_base:
            snapshot = client.save_weights_for_sampler("biscuit-base").result().path
            summary["base"] = evaluate("glimmer_base", service, snapshot, tokenizer, renderer, holdout, out_dir, args)
        adam = sdk.AdamParams(learning_rate=args.lr, beta1=0.9, beta2=0.999, eps=1e-8, weight_decay=0.0, grad_clip_norm=1.0)
        rng = random.Random(args.seed)
        step = 0
        started = time.time()
        for epoch in range(args.epochs):
            order = list(range(len(datums)))
            rng.shuffle(order)
            for start in range(0, len(order), args.batch_size):
                batch = [datums[i] for i in order[start : start + args.batch_size]]
                fb = client.forward_backward(batch, "cross_entropy").result()
                opt = client.optim_step(adam).result()
                step += 1
                metrics = dict(getattr(fb, "metrics", None) or {})
                tokens = metrics.get("response_tokens") or metrics.get("num_loss_tokens") or 1.0
                loss = metrics.get("loss:sum", 0.0) / max(float(tokens), 1.0)
                grad = {k: v for k, v in (getattr(opt, "metrics", None) or {}).items() if "grad" in k}
                row = {"step": step, "epoch": epoch + 1, "loss": round(loss, 4), "seconds": round(time.time() - started), **grad}
                log.write(json.dumps(row) + "\n"); log.flush()
                print(json.dumps(row), flush=True)
        summary["steps"] = step
        summary["train_seconds"] = round(time.time() - started)
        snapshot = client.save_weights_for_sampler("biscuit-tuned").result().path
        summary["tuned_snapshot"] = snapshot
        summary["tuned"] = evaluate("glimmer_tuned", service, snapshot, tokenizer, renderer, holdout, out_dir, args)
        summary["promoted_model"] = None if args.no_promote else promote(service, base_url, api_key, args.run)
    finally:
        log.close()
        (out_dir / ("summary.json" if not (args.eval_only or args.probe) else f"summary_{args.label}.json")).write_text(json.dumps(summary, indent=1, default=str))
        # Release the pooled training slot now; the promoted model (if any) is already on the account.
        close_session = getattr(service, "delete_training_session", None)
        if close_session is not None:
            try:
                close_session()
            except Exception as exc:  # noqa: BLE001
                print(f"session close failed: {str(exc)[:200]}", flush=True)
        service.close()
        print(json.dumps({k: v for k, v in summary.items() if k != "args"}, default=str), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
