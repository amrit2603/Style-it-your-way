import hashlib
import io
import struct
import subprocess

import pytest
from app.pdf import PdfError, inspect_pdf, render_pdf_page
from PIL import Image


def rc4(key, data):
    state = list(range(256))
    j = 0
    for i in range(256):
        j = (j + state[i] + key[i % len(key)]) % 256
        state[i], state[j] = state[j], state[i]
    i = j = 0
    result = bytearray()
    for value in data:
        i = (i + 1) % 256
        j = (j + state[i]) % 256
        state[i], state[j] = state[j], state[i]
        result.append(value ^ state[(state[i] + state[j]) % 256])
    return bytes(result)


def pdf_bytes(
    pages=1, rotation=0, width=600, height=800, encrypted=False, password=b""
):
    content = b"1 0 0 rg 0 400 600 400 re f 0 0 1 rg 0 0 600 400 re f"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Count {pages} /Kids [ ".encode()
        + b" ".join(f"{i + 4} 0 R".encode() for i in range(pages))
        + b" ] >>",
        f"<< /Length {len(content)} >>\nstream\n".encode() + content + b"\nendstream",
    ]
    objects += [
        f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {width} {height}] /Rotate {rotation} /Resources << >> /Contents 3 0 R >>".encode()
        for _ in range(pages)
    ]
    trailer = b""
    if encrypted:
        padding = bytes.fromhex(
            "28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a"
        )
        owner = rc4(
            hashlib.md5(b"owner" + padding[:27]).digest()[:5], (password + padding)[:32]
        )
        file_id = b"0123456789abcdef"
        key = hashlib.md5(
            (password + padding)[:32] + owner + struct.pack("<i", -4) + file_id
        ).digest()[:5]
        user = rc4(key, padding)
        objects.append(
            f"<< /Filter /Standard /V 1 /R 2 /O <{owner.hex()}> /U <{user.hex()}> /P -4 >>".encode()
        )
        trailer = f"/Encrypt {len(objects)} 0 R /ID [<{file_id.hex()}> <{file_id.hex()}>]".encode()
    result = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(result))
        result.extend(f"{index} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = len(result)
    result.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        result.extend(f"{offset:010d} 00000 n \n".encode())
    result.extend(
        f"trailer\n<< /Size {len(offsets)} /Root 1 0 R ".encode()
        + trailer
        + f" >>\nstartxref\n{xref}\n%%EOF".encode()
    )
    return bytes(result)


@pytest.fixture
def source(tmp_path):
    path = tmp_path / "catalog space.pdf"
    path.write_bytes(pdf_bytes())
    return path


def test_inspect_and_render(source):
    assert inspect_pdf(source) == {"page_count": 1}
    with Image.open(io.BytesIO(render_pdf_page(source, 0, 800))) as image:
        assert image.format == "JPEG"
        assert image.size == (600, 800)
        assert image.getpixel((300, 100))[0] > 240


@pytest.mark.parametrize(
    "rotation,expected", [(90, (800, 600)), (180, (600, 800)), (270, (800, 600))]
)
def test_upright_rotation(source, rotation, expected):
    source.write_bytes(pdf_bytes(rotation=rotation))
    with Image.open(io.BytesIO(render_pdf_page(source, 0, 800))) as image:
        assert image.size == expected
        point = {90: (700, 300), 180: (300, 700), 270: (100, 300)}[rotation]
        assert image.getpixel(point)[0] > 240


@pytest.mark.parametrize(
    "content,code",
    [
        (b"not a PDF", "pdf_invalid"),
        (pdf_bytes(pages=51), "pdf_too_many_pages"),
        (pdf_bytes(encrypted=True), "pdf_encrypted"),
        (pdf_bytes(encrypted=True, password=b"secret"), "pdf_encrypted"),
    ],
)
def test_rejected_documents(source, content, code):
    source.write_bytes(content)
    with pytest.raises(PdfError) as error:
        inspect_pdf(source)
    assert error.value.code == code
    assert error.value.message


def test_size_limit_before_render(source):
    with source.open("wb") as stream:
        stream.truncate(30 * 1024 * 1024 + 1)
    with pytest.raises(PdfError, match="30 MiB"):
        inspect_pdf(source)


@pytest.mark.parametrize("page", [-1, 1, 0.5, True])
def test_invalid_page(source, page):
    with pytest.raises(PdfError) as error:
        render_pdf_page(source, page)
    assert error.value.code == "pdf_page_invalid"


@pytest.mark.parametrize("size", [0, -1, float("nan"), float("inf"), True])
def test_invalid_render_size(source, size):
    with pytest.raises(PdfError):
        render_pdf_page(source, 0, size)


def test_malicious_page_dimensions_are_bounded(source):
    source.write_bytes(pdf_bytes(width=100000000, height=200000000))
    with Image.open(io.BytesIO(render_pdf_page(source, 0, 999999))) as image:
        assert max(image.size) <= 4096
        assert image.width * image.height <= 25_000_000


def test_timeout_terminates_and_reaps(source, monkeypatch):
    import app.pdf as pdf

    class Process:
        returncode = None
        killed = False
        reaped = False

        def communicate(self, *args, **kwargs):
            if not self.killed:
                raise subprocess.TimeoutExpired("pdf", 20)
            self.reaped = True
            return b"", b""

        def kill(self):
            self.killed = True

    process = Process()
    monkeypatch.setattr(pdf.subprocess, "Popen", lambda *args, **kwargs: process)
    with pytest.raises(PdfError) as error:
        render_pdf_page(source, 0)
    assert error.value.code == "pdf_timeout"
    assert process.killed and process.reaped
