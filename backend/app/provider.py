import base64
import re

import httpx


class ProviderError(Exception):
    def __init__(self, code, message, ambiguous=False, retryable=False):
        self.code, self.message, self.ambiguous, self.retryable = (
            code,
            message,
            ambiguous,
            retryable,
        )
        super().__init__(message)


class FashnClient:
    def __init__(self, api_key):
        self.api_key = api_key

    def _request(self, method, route, payload=None):
        try:
            with httpx.Client(
                timeout=httpx.Timeout(60, connect=15), follow_redirects=False
            ) as client:
                # The fixed provider origin is the only network destination in this adapter.
                with client.stream(
                    method,
                    "https://api.fashn.ai/v1/" + route,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json=payload,
                ) as response:
                    content = bytearray()
                    for chunk in response.iter_bytes():
                        content.extend(chunk)
                        if len(content) > 20 * 1024 * 1024:
                            raise ProviderError(
                                "provider_response_large",
                                "The provider returned an oversized result.",
                                method == "POST",
                                method == "GET",
                            )
                    if response.status_code >= 400:
                        raise ProviderError(
                            "provider_rejected",
                            "The image provider could not accept this request. Check credits, configuration and image requirements.",
                            method == "POST" and response.status_code >= 500,
                            method == "GET"
                            and (
                                response.status_code >= 500
                                or response.status_code == 429
                            ),
                        )
                    import json

                    result = json.loads(content)
                    if not isinstance(result, dict):
                        raise ValueError
                    return result
        except (httpx.HTTPError, ValueError):
            raise ProviderError(
                "provider_unavailable",
                "The image provider did not return a valid response. No automatic paid retry was made.",
                method == "POST",
                method == "GET",
            )

    def submit(self, model_name, inputs):
        result = self._request(
            "POST", "run", {"model_name": model_name, "inputs": inputs}
        )
        prediction_id = result.get("id")
        if (
            result.get("error")
            or not isinstance(prediction_id, str)
            or not re.fullmatch(r"[a-zA-Z0-9_-]{1,200}", prediction_id)
        ):
            raise ProviderError(
                "submission_uncertain",
                "The provider response could not confirm submission. Check the provider dashboard before trying again.",
                True,
            )
        return prediction_id

    def status(self, prediction_id):
        if not re.fullmatch(r"[a-zA-Z0-9_-]{1,200}", prediction_id):
            raise ProviderError(
                "prediction_invalid", "This saved prediction ID is invalid."
            )
        result = self._request("GET", "status/" + prediction_id)
        state = result.get("status")
        if not isinstance(state, str):
            raise ProviderError(
                "provider_result_invalid",
                "The provider returned an unexpected status.",
                retryable=True,
            )
        if state in {"starting", "in_queue", "processing"}:
            return {"status": "processing"}
        if state == "failed":
            raise ProviderError(
                "generation_failed",
                "The provider could not generate this look. Try a clearer photo or another garment.",
            )
        if (
            state != "completed"
            or not isinstance(result.get("output"), list)
            or len(result["output"]) != 1
        ):
            raise ProviderError(
                "provider_result_invalid",
                "The provider returned an unexpected result.",
                retryable=True,
            )
        data = result["output"][0]
        if not isinstance(data, str) or not data.startswith(
            ("data:image/png;base64,", "data:image/jpeg;base64,")
        ):
            raise ProviderError(
                "provider_result_invalid",
                "The provider did not return the requested private image data.",
            )
        try:
            image = base64.b64decode(data.split(",", 1)[1], validate=True)
        except (ValueError, base64.binascii.Error):
            raise ProviderError(
                "provider_result_invalid",
                "The provider returned unreadable image data.",
            )
        return {"status": "completed", "image": image}
