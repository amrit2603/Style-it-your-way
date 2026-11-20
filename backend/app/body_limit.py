from starlette.responses import JSONResponse


class BodyTooLarge(Exception):
    pass


class BodyLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        size = 0

        async def bounded_receive():
            nonlocal size
            message = await receive()
            size += len(message.get("body", b""))
            if size > 32 * 1024 * 1024:
                raise BodyTooLarge
            return message

        try:
            await self.app(scope, bounded_receive, send)
        except BodyTooLarge:
            response = JSONResponse(
                {
                    "detail": {
                        "code": "upload_too_large",
                        "message": "Choose a file smaller than 30 MiB.",
                    }
                },
                status_code=413,
            )
            await response(scope, receive, send)
