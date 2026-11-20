"""One bounded native PDF operation per process; never run PDFium in API threads."""

import io
import json
import math
import sys

import pypdfium2 as pdfium
from pypdfium2 import raw


def abort(code, message):
    sys.stderr.write(json.dumps({"code": code, "message": message}))
    raise SystemExit(1)


def main():
    request = json.loads(sys.stdin.buffer.read(8192))
    try:
        document = pdfium.PdfDocument(request["path"])
    except pdfium.PdfiumError as error:
        if getattr(error, "err_code", None) == raw.FPDF_ERR_PASSWORD:
            abort("pdf_encrypted", "Export an unencrypted PDF before uploading it.")
        abort(
            "pdf_invalid",
            "We could not read this PDF. Export it again or upload photos.",
        )
    with document:
        if raw.FPDF_GetSecurityHandlerRevision(document.raw) >= 0:
            abort("pdf_encrypted", "Export an unencrypted PDF before uploading it.")
        count = len(document)
        if count < 1:
            abort("pdf_invalid", "This PDF contains no pages.")
        if count > 50:
            abort("pdf_too_many_pages", "Choose a PDF with at most 50 pages.")
        if request["operation"] == "inspect":
            sys.stdout.buffer.write(json.dumps({"page_count": count}).encode())
            return
        index = request["page"]
        if not 0 <= index < count:
            abort("pdf_page_invalid", "Choose an existing PDF page.")
        page = document[index]
        try:
            width, height = page.get_size()
            if not all(math.isfinite(value) and value > 0 for value in (width, height)):
                abort("pdf_invalid", "This PDF has invalid page dimensions.")
            scale = request["max_side"] / max(width, height)
            bitmap = page.render(scale=scale)
            try:
                image = bitmap.to_pil().convert("RGB")
                if image.width * image.height > 25_000_000:
                    abort("pdf_invalid", "This PDF page is too large to render safely.")
                out = io.BytesIO()
                image.save(out, "JPEG", quality=90)
                sys.stdout.buffer.write(out.getvalue())
            finally:
                bitmap.close()
        finally:
            page.close()


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        abort(
            "pdf_invalid",
            "We could not process this PDF. Try another export or upload photos.",
        )
