import base64

import httpx

from .config import service_origin


class KaggleClient:
    def __init__(self, url, token):
        self.origin = service_origin(url) if url else ""
        self.token = token

    def generate(self, inputs):
        from ..provider import ProviderError

        if not self.origin or not self.token:
            raise ProviderError(
                "kaggle_not_configured",
                "Start the GPU notebook and configure its tunnel URL and API token.",
            )
        garments = [inputs["product_image"], *inputs.get("additional_images", [])]
        categories = inputs.get("garment_categories") or ["top"]
        if not 1 <= len(garments) <= 3 or len(categories) != len(garments):
            raise ProviderError(
                "outfit_invalid", "Select up to three compatible clothing pieces."
            )
        person = inputs["model_image"]
        for index, garment in enumerate(garments):
            request_id = inputs["request_id"] + (f"-piece-{index + 1}" if index else "")
            result = self._generate_one(person, garment, categories[index], request_id)
            person = "data:image/jpeg;base64," + base64.b64encode(result).decode()
        return result

    def _generate_one(self, person, garment, category, request_id):
        from ..provider import ProviderError

        files = {
            "person_image": (
                "person.jpg",
                base64.b64decode(person.split(",", 1)[1], validate=True),
                "image/jpeg",
            ),
            "garment_image": (
                "garment.jpg",
                base64.b64decode(garment.split(",", 1)[1], validate=True),
                "image/jpeg",
            ),
        }
        headers = {
            "Authorization": "Bearer " + self.token,
            "X-Request-ID": request_id,
            "ngrok-skip-browser-warning": "true",
        }
        for attempt in range(2):
            try:
                with httpx.Client(
                    timeout=httpx.Timeout(60, connect=10), follow_redirects=False
                ) as client:
                    with client.stream(
                        "POST",
                        self.origin + "/try-on",
                        headers=headers,
                        files=files,
                        data={"category": category},
                    ) as response:
                        response.raise_for_status()
                        content = bytearray()
                        for chunk in response.iter_bytes():
                            content.extend(chunk)
                            if len(content) > 15 * 1024 * 1024:
                                raise ValueError("Oversized GPU response")
                        result = httpx.Response(200, content=bytes(content)).json()
                        image = base64.b64decode(result["image_base64"], validate=True)
                        if len(image) > 10 * 1024 * 1024:
                            raise ValueError("Oversized GPU image")
                        return image
            except (httpx.TimeoutException, httpx.NetworkError):
                if attempt == 0:
                    continue
                raise ProviderError(
                    "kaggle_unavailable",
                    "The GPU service is unavailable. Your request can be resumed when the notebook is running.",
                    ambiguous=True,
                ) from None
            except httpx.HTTPStatusError as error:
                if attempt == 0 and error.response.status_code >= 500:
                    continue
                raise ProviderError(
                    "kaggle_unavailable",
                    "The GPU service could not complete this request. Check the notebook and try again.",
                ) from None
            except (ValueError, KeyError, TypeError):
                raise ProviderError(
                    "kaggle_response_invalid",
                    "The GPU service returned no usable image.",
                ) from None
