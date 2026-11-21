import hashlib
import secrets
import uuid

from fastapi import HTTPException, Request

from .config import now

COOKIE = "vyumi_session"


def fail(code, message, status=422):
    raise HTTPException(status_code=status, detail={"code": code, "message": message})


def current_session(request: Request, optional=False):
    token = request.cookies.get(COOKIE, "")
    with request.app.state.db.connect() as db:
        row = db.execute(
            "SELECT * FROM sessions WHERE token_hash=? AND expires>?",
            (hashlib.sha256(token.encode()).hexdigest(), now()),
        ).fetchone()
    if row is None and not optional:
        fail(
            "session_expired",
            "Your session expired. Refresh the page to start again.",
            401,
        )
    return dict(row) if row else None


def merchant(request: Request):
    session = current_session(request)
    if session["role"] != "merchant":
        fail(
            "merchant_required",
            "Open the merchant studio and enter your local access token.",
            403,
        )
    return session


def new_session(request, response, role, user_id=None):
    token = secrets.token_urlsafe(32)
    record = {
        "id": str(uuid.uuid4()),
        "token_hash": hashlib.sha256(token.encode()).hexdigest(),
        "csrf": secrets.token_urlsafe(24),
        "role": role,
        "expires": now() + 24 * 3600,
        "user_id": user_id,
    }
    with request.app.state.db.connect(write=True) as db:
        db.execute(
            "INSERT INTO sessions(id,token_hash,csrf,role,expires,user_id) VALUES (:id,:token_hash,:csrf,:role,:expires,:user_id)",
            record,
        )
    response.set_cookie(
        COOKIE, token, httponly=True, samesite="strict", max_age=24 * 3600
    )
    return {"role": role, "csrf_token": record["csrf"]}
