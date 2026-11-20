import json
import math
import os
import subprocess
import sys
from pathlib import Path


class PdfError(Exception):
    def __init__(self, code, message):
        self.code, self.message = code, message
        super().__init__(message)


def _call(path: Path, operation: str, page=0, max_side=4096):
    path = Path(path)
    if not path.is_file():
        raise PdfError("pdf_invalid", "The PDF is unavailable. Upload it again.")
    if path.stat().st_size > 30 * 1024 * 1024:
        raise PdfError("pdf_too_large", "Choose a PDF smaller than 30 MiB.")
    if type(page) is not int or page < 0:
        raise PdfError("pdf_page_invalid", "Choose an existing PDF page.")
    if (
        type(max_side) not in {int, float}
        or not math.isfinite(max_side)
        or max_side < 1
    ):
        raise PdfError("pdf_render_invalid", "The PDF preview size is invalid.")
    payload = json.dumps(
        {
            "path": str(path.resolve()),
            "operation": operation,
            "page": page,
            "max_side": min(4096, int(max_side)),
        }
    )
    options = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}
    process = subprocess.Popen(
        [sys.executable, str(Path(__file__).with_name("pdf_process.py"))],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        **options,
    )
    try:
        output, error = process.communicate(payload.encode(), timeout=20)
    except subprocess.TimeoutExpired:
        process.kill()
        process.communicate()
        raise PdfError(
            "pdf_timeout",
            "This PDF took too long to process. Try a smaller catalog or upload photos.",
        )
    if process.returncode != 0:
        try:
            failure = json.loads(error.decode())
            raise PdfError(failure["code"], failure["message"])
        except (ValueError, KeyError, UnicodeError):
            raise PdfError(
                "pdf_invalid",
                "We could not read this PDF. Try exporting it again or upload photos.",
            )
    return output


def inspect_pdf(path: Path) -> dict:
    return json.loads(_call(path, "inspect"))


def render_pdf_page(path: Path, page: int, max_side: int = 4096) -> bytes:
    return _call(path, "render", page, max_side)
