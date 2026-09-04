#!/usr/bin/env python3
"""Build a second Emscripten data package from a Sherpa transducer model."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


FILES = ("README.md", "decoder.onnx", "encoder.onnx", "joiner.onnx", "tokens.txt")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--template-js", type=Path, required=True)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--suffix", default="20m")
    args = parser.parse_args()

    sources = {
        "README.md": args.model_dir / "README.md",
        "decoder.onnx": args.model_dir / "decoder-epoch-99-avg-1.onnx",
        "encoder.onnx": args.model_dir / "encoder-epoch-99-avg-1.int8.onnx",
        "joiner.onnx": args.model_dir / "joiner-epoch-99-avg-1.onnx",
        "tokens.txt": args.model_dir / "tokens.txt",
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    data_name = f"sherpa-onnx-wasm-main-asr-{args.suffix}.data"
    js_name = f"sherpa-onnx-wasm-main-asr-{args.suffix}.js"
    data_path = args.output_dir / data_name

    metadata = [{"filename": "/.gitignore", "start": 0, "end": 0}]
    offset = 0
    with data_path.open("wb") as output:
        for name in FILES:
            payload = sources[name].read_bytes()
            output.write(payload)
            metadata.append({"filename": f"/{name}", "start": offset, "end": offset + len(payload)})
            offset += len(payload)

    entries = ",".join(
        f'{{filename:"{item["filename"]}",start:{item["start"]},end:{item["end"]}}}'
        for item in metadata
    )
    replacement = f"loadPackage({{files:[{entries}],remote_package_size:{offset}}})"
    source = args.template_js.read_text(encoding="utf-8")
    source = source.replace("sherpa-onnx-wasm-main-asr.data", data_name)
    source, count = re.subn(r"loadPackage\(\{files:\[.*?\],remote_package_size:\d+\}\)", replacement, source, count=1)
    if count != 1:
        raise RuntimeError("could not replace Emscripten package metadata")
    (args.output_dir / js_name).write_text(source, encoding="utf-8")
    print(f"{data_name}: {offset} bytes")
    print(js_name)


if __name__ == "__main__":
    main()
