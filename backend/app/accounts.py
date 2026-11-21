import hashlib
import re
import secrets
import sqlite3
import uuid

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .config import now
from .security import current_session, fail, new_session


def password_hash(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1)
    return salt.hex() + ":" + digest.hex()


def verify_password(password, stored):
    salt, expected = stored.split(":")
    digest = hashlib.scrypt(
        password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1
    )
    return secrets.compare_digest(digest.hex(), expected)


class Login(BaseModel):
    model_config = ConfigDict(hide_input_in_errors=True)
    email: str = Field(max_length=254)
    password: str = Field(min_length=12, max_length=128)

    @field_validator("email")
    @classmethod
    def email_address(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Enter a valid email address")
        return value


class Signup(Login):
    name: str = Field(min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value):
        if not value.strip():
            raise ValueError("Enter your name")
        return value.strip()


def user_response(user):
    return {key: user[key] for key in ("id", "name", "email", "role")}


def require_user(request):
    session = current_session(request)
    if not session.get("user_id"):
        fail("login_required", "Sign in to view your account and orders.", 401)
    with request.app.state.db.connect() as db:
        user = db.execute(
            "SELECT * FROM users WHERE id=?", (session["user_id"],)
        ).fetchone()
    if not user:
        fail("login_required", "Please sign in again.", 401)
    return dict(user)


def install(app):
    router = APIRouter()
    database, settings = app.state.db, app.state.settings
    if settings.admin_email and settings.admin_password:
        credentials = Login(
            email=settings.admin_email, password=settings.admin_password
        )
        with database.connect(write=True) as db:
            existing = db.execute(
                "SELECT role FROM users WHERE email=?", (credentials.email,)
            ).fetchone()
            if existing and existing[0] != "admin":
                raise ValueError(
                    "The bootstrap admin email already belongs to a customer"
                )
            if not existing:
                db.execute(
                    "INSERT INTO users VALUES (?,?,?,?,?,?)",
                    (
                        str(uuid.uuid4()),
                        "Store administrator",
                        credentials.email,
                        password_hash(credentials.password),
                        "admin",
                        now(),
                    ),
                )
    dummy_hash = password_hash(secrets.token_urlsafe(24))

    def signed_in(request, response, user):
        old = current_session(request, optional=True)
        if old:
            app.state.generation.invalidate_session(old["id"])
        session = new_session(
            request,
            response,
            "merchant" if user["role"] == "admin" else "shopper",
            user["id"],
        )
        return {**session, "user": user_response(user)}

    @router.post("/auth/signup", status_code=201)
    def signup(payload: Signup, request: Request, response: Response):
        record = {
            "id": str(uuid.uuid4()),
            "name": payload.name,
            "email": payload.email,
            "password_hash": password_hash(payload.password),
            "role": "customer",
            "created": now(),
        }
        try:
            with database.connect(write=True) as db:
                db.execute(
                    "INSERT INTO users VALUES (:id,:name,:email,:password_hash,:role,:created)",
                    record,
                )
        except sqlite3.IntegrityError:
            fail(
                "account_exists",
                "An account already uses that email. Sign in instead.",
                409,
            )
        return signed_in(request, response, record)

    @router.post("/auth/login")
    def login(payload: Login, request: Request, response: Response):
        with database.connect(write=True) as db:
            db.execute("DELETE FROM login_attempts WHERE created<?", (now() - 900,))
            attempts = db.execute(
                "SELECT COUNT(*) FROM login_attempts WHERE email=?", (payload.email,)
            ).fetchone()[0]
            if attempts >= 5:
                fail(
                    "login_limited",
                    "Too many sign-in attempts. Try again in 15 minutes.",
                    429,
                )
            row = db.execute(
                "SELECT * FROM users WHERE email=?", (payload.email,)
            ).fetchone()
            valid = verify_password(
                payload.password, row["password_hash"] if row else dummy_hash
            )
            if not row or not valid:
                db.execute(
                    "INSERT INTO login_attempts VALUES (?,?)", (payload.email, now())
                )
            else:
                db.execute("DELETE FROM login_attempts WHERE email=?", (payload.email,))
        if not row or not valid:
            fail("login_invalid", "Email or password is incorrect.", 401)
        return signed_in(request, response, dict(row))

    @router.get("/auth/me")
    def me(request: Request):
        return user_response(require_user(request))

    app.include_router(router)
