"""Adapter around the pinned official IDM-VTON demo, without its Gradio launch."""

import ast
import os
import subprocess
import sys
from pathlib import Path

from PIL import ImageOps

IDM_REVISION = "06ad89ba2f78d77a5ba21d7f7fd392254971fda2"
MODEL_REVISION = "585a32e74aee241cbc0d0cc3ab21392ca58c916a"
PREPROCESS_REVISION = "906d38c8a74e7c1cd0bf714a363fe2e939fa28b8"


class IDMRunner:
    def __init__(self, source_dir, model_dir):
        import torch

        if not torch.cuda.is_available():
            raise RuntimeError("Enable a CUDA GPU in Kaggle notebook settings")
        source = Path(source_dir).resolve()
        actual = subprocess.check_output(
            ["git", "-C", str(source), "rev-parse", "HEAD"], text=True
        ).strip()
        if actual != IDM_REVISION:
            raise RuntimeError(
                "IDM-VTON source revision does not match the tested adapter"
            )
        os.chdir(source)
        sys.path[:0] = [str(source), str(source / "gradio_demo")]
        tree = ast.parse((source / "gradio_demo/app.py").read_text())
        nodes = []
        for node in tree.body:
            names = (
                [n.id for n in node.targets if isinstance(n, ast.Name)]
                if isinstance(node, ast.Assign)
                else []
            )
            if "garm_list" in names:
                break
            if "base_path" in names:
                node.value = ast.Constant(str(Path(model_dir).resolve()))
            nodes.append(node)
        self.scope = {
            "__name__": "vyumi_idm_runtime",
            "__file__": str(source / "gradio_demo/app.py"),
        }
        exec(
            compile(
                ast.fix_missing_locations(ast.Module(body=nodes, type_ignores=[])),
                str(source / "gradio_demo/app.py"),
                "exec",
            ),
            self.scope,
        )
        self.original_mask = self.scope["get_mask_location"]

    def __call__(self, person, garment, category):
        group = (
            "lower_body"
            if category in {"trousers", "skirt"}
            else "dresses"
            if category in {"saree", "suit", "dress", "lehenga"}
            else "upper_body"
        )
        self.scope["get_mask_location"] = lambda _model, _category, *args, **kwargs: (
            self.original_mask(
                "hd" if group == "upper_body" else "dc", group, *args, **kwargs
            )
        )
        # Preserve the input silhouette when adapting the model's fixed 3:4 canvas.
        person = ImageOps.pad(person, (768, 1024), color="white")
        try:
            image, _mask = self.scope["start_tryon"](
                {"background": person, "layers": None, "composite": None},
                garment,
                category + " garment",
                True,
                False,
                30,
                42,
            )
            return image
        finally:
            self.scope["get_mask_location"] = self.original_mask
