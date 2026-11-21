import io

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def composite_room(room_bytes, product_bytes):
    """Explicit demo placement; no inferred room dimensions or generative inpainting."""
    with Image.open(io.BytesIO(room_bytes)) as source:
        room = source.convert("RGB")
    room.thumbnail((1600, 1600))
    if min(room.size) < 512:
        ratio = 512 / min(room.size)
        room = room.resize((round(room.width * ratio), round(room.height * ratio)))
    with Image.open(io.BytesIO(product_bytes)) as source:
        product = source.convert("RGBA")
    if product.getchannel("A").getextrema() == (255, 255):
        # shortcut: plain-background cutouts only; use transparent PNG for textured backgrounds.
        pixels = np.asarray(product).copy()
        background = np.median(
            [
                pixels[0, 0, :3],
                pixels[0, -1, :3],
                pixels[-1, 0, :3],
                pixels[-1, -1, :3],
            ],
            axis=0,
        )
        distance = np.max(np.abs(pixels[:, :, :3].astype(float) - background), axis=2)
        pixels[:, :, 3] = np.clip((distance - 18) * 8, 0, 255).astype(np.uint8)
        product = Image.fromarray(pixels)
    bounds = product.getchannel("A").getbbox()
    if not bounds:
        from ..provider import ProviderError

        raise ProviderError(
            "cutout_required",
            "Upload a transparent product PNG or a clear product on a plain background.",
        )
    product = product.crop(bounds)
    product.thumbnail((round(room.width * 0.48), round(room.height * 0.6)))
    x, y = (room.width - product.width) // 2, round(room.height * 0.86) - product.height
    room = room.convert("RGBA")
    shadow = Image.new("RGBA", room.size)
    ImageDraw.Draw(shadow).ellipse(
        (x, y + product.height - 8, x + product.width, y + product.height + 18),
        fill=(0, 0, 0, 65),
    )
    room = Image.alpha_composite(room, shadow.filter(ImageFilter.GaussianBlur(12)))
    room.alpha_composite(product, (x, max(0, y)))
    draw = ImageDraw.Draw(room)
    draw.rectangle((0, room.height - 40, room.width, room.height), fill="#244737")
    draw.text(
        (14, room.height - 30),
        "ROOM PLACEMENT DEMO - not to scale",
        fill="white",
        font_size=18,
    )
    output = io.BytesIO()
    room.convert("RGB").save(output, "JPEG", quality=92)
    return output.getvalue()
