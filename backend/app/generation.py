import base64
import hashlib
import io
import json
import threading
import uuid

from PIL import Image, ImageDraw

from .assets import (
    asset_path,
    decode_image,
    get_asset,
    mark_deleted,
    purge_deleted,
    save_image,
)
from .catalog import check_version, load_product, save_draft
from .config import now
from .provider import (
    CloudflareClient,
    FashnClient,
    FashnDemoClient,
    GeminiClient,
    ProviderError,
)
from .security import fail

TERMINAL = {"completed", "failed", "cancelled", "expired", "needs_review"}


def job_response(job):
    result = {
        "job_id": job["id"],
        "operation": job["operation"],
        "status": job["status"],
        "fixture": bool(job["fixture"]),
    }
    for field in ("expires", "error_code", "message"):
        if job[field] is not None:
            result["expires_at" if field == "expires" else field] = job[field]
    if job["result_id"] and job["status"] == "completed":
        result["result_image_url"] = f"/api/assets/{job['result_id']}"
    return result


class GenerationService:
    def __init__(self, database, settings):
        self.db, self.settings = database, settings
        self.provider = (
            CloudflareClient(
                settings.cloudflare_account_id,
                settings.cloudflare_api_token,
                settings.cloudflare_model,
            )
            if settings.provider_name == "Cloudflare"
            else (
                GeminiClient(settings.gemini_api_key, settings.gemini_model)
                if settings.gemini_api_key
                else FashnClient(settings.fashn_api_key)
            )
        )
        self.stop = threading.Event()
        self.thread = None
        self.tick_lock = threading.Lock()
        self.dedicated = (
            FashnDemoClient()
            if settings.tryon_provider == "fashn_demo"
            else FashnClient(settings.fashn_api_key)
            if settings.tryon_provider == "fashn"
            else None
        )

    def provider_for(self, operation):
        return (
            self.dedicated
            if operation == "tryon" and self.dedicated is not None
            else self.provider
        )

    def remaining(self):
        with self.db.connect() as db:
            used = db.execute(
                "SELECT value FROM counters WHERE key='live_submissions'"
            ).fetchone()[0]
        return max(0, self.settings.generation_allowance - used)

    def submit(self, session, operation, payload, product_id=None):
        fingerprint = hashlib.sha256(
            json.dumps(
                {
                    "operation": operation,
                    "product_id": product_id,
                    **payload.model_dump(exclude={"idempotency_key"}),
                },
                sort_keys=True,
            ).encode()
        ).hexdigest()
        with self.db.connect(write=True) as db:
            old = db.execute(
                "SELECT * FROM jobs WHERE owner=? AND request_key=?",
                (session["id"], payload.idempotency_key),
            ).fetchone()
            if old:
                if old["fingerprint"] != fingerprint:
                    fail(
                        "request_changed",
                        "Use a new generation request after changing its inputs.",
                        409,
                    )
                return job_response(old)
            count = db.execute(
                "SELECT COUNT(*) FROM jobs WHERE owner=? AND created>?",
                (session["id"], now() - 60),
            ).fetchone()[0]
            if count >= 5:
                fail(
                    "rate_limited",
                    "Please wait a minute before requesting another image.",
                    429,
                )
            if not self.settings.fixture and (
                not (
                    self.settings.tryon_configured
                    if operation == "tryon"
                    else self.settings.provider_configured
                )
                or self.settings.generation_allowance < 1
            ):
                fail(
                    "provider_not_configured",
                    "Image generation is not configured. Set backend provider credentials and a positive generation allowance.",
                    503,
                )
            product_id = payload.product_id if operation == "tryon" else product_id
            product = load_product(db, product_id, public=operation == "tryon")
            if operation == "catalog":
                check_version(product, payload.version)
            if not product["reference_id"]:
                fail(
                    "reference_required",
                    "Confirm the original garment reference before generating.",
                )
            get_asset(db, product["reference_id"])
            context = {
                "provider": self.settings.tryon_name
                if operation == "tryon"
                else self.settings.provider_name,
                "garments": [
                    {
                        "product_id": product_id,
                        "reference_id": product["reference_id"],
                        "category": product["category"],
                        "version": product["version"],
                    }
                ],
            }
            if operation == "catalog":
                context.update(presentation=payload.presentation, scene=payload.scene)
            else:
                ids = [product_id, *payload.additional_product_ids]
                if len(ids) != len(set(ids)):
                    fail("duplicate_garment", "Choose each garment only once.")
                if payload.additional_product_ids and not (
                    self.settings.fixture
                    or isinstance(
                        self.provider_for(operation),
                        (CloudflareClient, GeminiClient, FashnDemoClient),
                    )
                ):
                    fail(
                        "outfit_unavailable",
                        "This provider supports one garment per preview.",
                    )
                for extra_id in payload.additional_product_ids:
                    extra = load_product(db, extra_id, public=True)
                    if not extra["reference_id"]:
                        fail(
                            "reference_required",
                            "Every outfit piece needs a confirmed original reference.",
                        )
                    get_asset(db, extra["reference_id"])
                    context["garments"].append(
                        {
                            "product_id": extra_id,
                            "reference_id": extra["reference_id"],
                            "category": extra["category"],
                            "version": extra["version"],
                        }
                    )
                slots = [
                    "bottom"
                    if g["category"] in {"trousers", "skirt"}
                    else "outer"
                    if g["category"] == "jacket"
                    else "full"
                    if g["category"] in {"saree", "suit", "dress", "lehenga"}
                    else "top"
                    for g in context["garments"]
                ]
                if len(slots) != len(set(slots)) or (
                    "full" in slots and any(slot in slots for slot in {"top", "bottom"})
                ):
                    fail(
                        "outfit_conflict",
                        "Choose one top and one bottom, with an optional jacket; or one full outfit with an optional jacket.",
                    )
            expires, photo_id = None, None
            if operation == "tryon":
                photo_id = payload.user_image_id
                photo = get_asset(db, photo_id)
                if photo["owner"] != session["id"] or photo["kind"] != "personal":
                    fail(
                        "asset_not_found",
                        "Upload your own photo in this session first.",
                        404,
                    )
                metadata = json.loads(photo["source"] or "{}")
                if not metadata.get("accepted") or not metadata.get("consent"):
                    fail(
                        "photo_unsuitable",
                        "Please upload a clear photo and confirm processing consent.",
                    )
                if not self.settings.fixture and metadata.get("fixture"):
                    fail(
                        "photo_recheck_required",
                        "Upload this photo again in live mode so the real photo checks can run.",
                    )
                expires = photo["expires"]
            if not self.settings.fixture:
                used = db.execute(
                    "SELECT value FROM counters WHERE key='live_submissions'"
                ).fetchone()[0]
                if used >= self.settings.generation_allowance:
                    fail(
                        "allowance_reached",
                        "The local generation allowance has been reached. Increase it in backend settings before requesting more.",
                        429,
                    )
                db.execute(
                    "UPDATE counters SET value=value+1 WHERE key='live_submissions'"
                )
            job = {
                "id": str(uuid.uuid4()),
                "owner": session["id"],
                "operation": operation,
                "product_id": product_id,
                "version": product["version"],
                "reference_id": product["reference_id"],
                "photo_id": photo_id,
                "prompt": getattr(payload, "prompt", ""),
                "request_key": payload.idempotency_key,
                "fingerprint": fingerprint,
                "status": "queued",
                "fixture": int(self.settings.fixture),
                "expires": expires,
                "created": now(),
                "updated": now(),
            }
            db.execute(
                "INSERT INTO jobs(id,owner,operation,product_id,version,reference_id,photo_id,prompt,request_key,fingerprint,status,fixture,expires,created,updated) VALUES (:id,:owner,:operation,:product_id,:version,:reference_id,:photo_id,:prompt,:request_key,:fingerprint,:status,:fixture,:expires,:created,:updated)",
                job,
            )
            db.execute(
                "UPDATE jobs SET context=? WHERE id=?", (json.dumps(context), job["id"])
            )
            result = db.execute(
                "SELECT * FROM jobs WHERE id=?", (job["id"],)
            ).fetchone()
        return job_response(result)

    def recover(self):
        with self.db.connect(write=True) as db:
            db.execute(
                "UPDATE jobs SET status='needs_review',error_code='submission_uncertain',message='A previous submission was interrupted. Check the provider dashboard before starting a new request.' WHERE status='submitting' AND prediction_id IS NULL"
            )

    def start(self):
        self.recover()
        self.thread = threading.Thread(
            target=self._loop, daemon=True, name="vyumi-generation"
        )
        self.thread.start()

    def close(self):
        self.stop.set()
        if self.thread:
            self.thread.join(timeout=3)

    def _loop(self):
        import logging

        while not self.stop.is_set():
            try:
                self.tick()
            except Exception:
                logging.getLogger("vyumi").error(
                    "Background job maintenance failed; inspect local database state."
                )
            self.stop.wait(self.settings.worker_interval)

    def cleanup(self):
        with self.db.connect(write=True) as db:
            ids = [
                row[0]
                for row in db.execute(
                    "SELECT id FROM assets WHERE deleted=0 AND expires IS NOT NULL AND (expires<=? OR NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id=assets.owner AND s.expires>?))",
                    (now(), now()),
                )
            ]
            db.execute(
                "UPDATE jobs SET status='expired',result_id=NULL,error_code='photo_expired',message='Your photo expired. Upload it again to create another look.' WHERE expires IS NOT NULL AND expires<=? AND status NOT IN ('expired','cancelled')",
                (now(),),
            )
            db.execute(
                "UPDATE jobs SET status='cancelled',result_id=NULL,error_code='session_ended',message='This private session ended. Upload a photo in a new session.' WHERE photo_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id=jobs.owner AND s.expires>?) AND status NOT IN ('expired','cancelled')",
                (now(),),
            )
            for asset_id in ids:
                db.execute("UPDATE assets SET deleted=1 WHERE id=?", (asset_id,))
        purge_deleted(self.db)

    def invalidate_session(self, session_id):
        with self.db.connect(write=True) as db:
            db.execute("DELETE FROM sessions WHERE id=?", (session_id,))
            db.execute(
                "UPDATE assets SET deleted=1 WHERE owner=? AND expires IS NOT NULL",
                (session_id,),
            )
            db.execute(
                "UPDATE jobs SET status='cancelled',result_id=NULL,error_code='session_ended',message='This private session ended.' WHERE owner=? AND photo_id IS NOT NULL",
                (session_id,),
            )
        purge_deleted(self.db)

    def delete_photo(self, asset_id):
        with self.db.connect(write=True) as db:
            # Deleting a personal result also deletes its source photo and sibling results.
            parent = db.execute(
                "SELECT photo_id FROM jobs WHERE result_id=?", (asset_id,)
            ).fetchone()
            photo_id = parent[0] if parent else asset_id
            jobs = db.execute(
                "SELECT result_id FROM jobs WHERE photo_id=?", (photo_id,)
            ).fetchall()
            db.execute(
                "UPDATE jobs SET status='cancelled',result_id=NULL,error_code='photo_deleted',message='Your photo and its generated results were deleted.' WHERE photo_id=?",
                (photo_id,),
            )
            for target in [photo_id] + [row[0] for row in jobs if row[0]]:
                db.execute("UPDATE assets SET deleted=1 WHERE id=?", (target,))
        purge_deleted(self.db)

    def tick(self):
        if not self.tick_lock.acquire(blocking=False):
            return
        try:
            self.cleanup()
            with self.db.connect(write=True) as db:
                row = db.execute(
                    "SELECT * FROM jobs WHERE status='processing' ORDER BY created LIMIT 1"
                ).fetchone()
                if row is None:
                    row = db.execute(
                        "SELECT * FROM jobs WHERE status='queued' ORDER BY created LIMIT 1"
                    ).fetchone()
                    if row:
                        db.execute(
                            "UPDATE jobs SET status='submitting',updated=? WHERE id=?",
                            (now(), row["id"]),
                        )
                job = dict(row) if row else None
                if job and job["photo_id"]:
                    owner = db.execute(
                        "SELECT 1 FROM sessions WHERE id=? AND expires>?",
                        (job["owner"], now()),
                    ).fetchone()
                    photo = db.execute(
                        "SELECT 1 FROM assets WHERE id=? AND deleted=0 AND expires>?",
                        (job["photo_id"], now()),
                    ).fetchone()
                    if not owner or not photo:
                        db.execute(
                            "UPDATE jobs SET status='cancelled',error_code='session_ended',message='The photo or its session is no longer active.' WHERE id=?",
                            (job["id"],),
                        )
                        job = None
            if not job:
                return
            if now() - job["created"] > 600:
                self._error(
                    job,
                    "job_timeout",
                    "This request timed out. Check provider status before creating another request.",
                    uncertain=bool(job["prediction_id"]),
                )
                return
            try:
                provider = self.provider_for(job["operation"])
                if job["fixture"]:
                    if job["status"] == "queued":
                        with self.db.connect(write=True) as db:
                            db.execute(
                                "UPDATE jobs SET status='processing',prediction_id='fixture',updated=? WHERE id=? AND status='submitting'",
                                (now(), job["id"]),
                            )
                        return
                    self._finish(job, self._fixture_image())
                    return
                if job["status"] == "queued":
                    context = json.loads(job["context"])
                    if context.get("provider", self.settings.provider_name) != (
                        self.settings.tryon_name
                        if job["operation"] == "tryon"
                        else self.settings.provider_name
                    ):
                        raise ProviderError(
                            "provider_changed",
                            "This queued request belongs to another provider. Restore its settings before creating a new request.",
                        )
                    with self.db.connect() as db:
                        garment = get_asset(db, job["reference_id"])
                        garment_data = asset_path(self.db, garment).read_bytes()
                        person_data = (
                            asset_path(
                                self.db, get_asset(db, job["photo_id"])
                            ).read_bytes()
                            if job["photo_id"]
                            else None
                        )
                        extra_data = [
                            asset_path(
                                self.db, get_asset(db, g["reference_id"])
                            ).read_bytes()
                            for g in context.get("garments", [])[1:]
                        ]
                    inputs = {
                        "product_image": self._data_uri(garment_data),
                        "resolution": "1k",
                        "generation_mode": "balanced",
                        "num_images": 1,
                        "return_base64": True,
                        "output_format": "jpeg",
                    }
                    if job["operation"] == "tryon":
                        inputs["model_image"] = self._data_uri(person_data)
                        inputs["garment_categories"] = [
                            g["category"] for g in context.get("garments", [])
                        ]
                        if extra_data:
                            inputs["additional_images"] = [
                                self._data_uri(data) for data in extra_data
                            ]
                    else:
                        inputs.update(
                            {
                                "prompt": f"An adult {context.get('presentation', 'women')} fashion model with a natural, individual face, realistic skin texture and body proportions. Scene: {context.get('scene', 'studio')}. Preserve the exact garment and avoid beauty filters or plastic skin. "
                                + job["prompt"],
                                "aspect_ratio": "2:3",
                            }
                        )
                    if isinstance(
                        provider, (GeminiClient, CloudflareClient, FashnDemoClient)
                    ):
                        image = provider.generate(inputs)
                        with self.db.connect(write=True) as db:
                            db.execute(
                                "UPDATE jobs SET status='processing',updated=? WHERE id=? AND status='submitting'",
                                (now(), job["id"]),
                            )
                        self._finish(job, image)
                        return
                    prediction_id = provider.submit(
                        "tryon-max" if person_data else "product-to-model", inputs
                    )
                    with self.db.connect(write=True) as db:
                        db.execute(
                            "UPDATE jobs SET prediction_id=?,status=CASE WHEN status='submitting' THEN 'processing' ELSE status END,updated=? WHERE id=?",
                            (prediction_id, now(), job["id"]),
                        )
                else:
                    result = provider.status(job["prediction_id"])
                    if result["status"] == "completed":
                        self._finish(job, result["image"])
            except ProviderError as error:
                if job["prediction_id"] and error.retryable:
                    with self.db.connect(write=True) as db:
                        db.execute(
                            "UPDATE jobs SET message='Waiting for the image provider to respond; the existing prediction will be checked again.' WHERE id=? AND status='processing'",
                            (job["id"],),
                        )
                else:
                    self._error(
                        job, error.code, error.message, uncertain=error.ambiguous
                    )
            except Exception:
                self._error(
                    job,
                    "processing_failed",
                    "We could not process this image. Try another photo or garment.",
                )
        finally:
            self.tick_lock.release()

    def _error(self, job, code, message, uncertain=False):
        with self.db.connect(write=True) as db:
            db.execute(
                "UPDATE jobs SET status=?,error_code=?,message=?,updated=? WHERE id=? AND status IN ('submitting','processing')",
                (
                    "needs_review" if uncertain else "failed",
                    code,
                    message,
                    now(),
                    job["id"],
                ),
            )

    def _finish(self, job, content):
        image = decode_image(content)
        with self.db.connect() as db:
            current = db.execute(
                "SELECT status,expires FROM jobs WHERE id=?", (job["id"],)
            ).fetchone()
            active_owner = (
                not job["photo_id"]
                or db.execute(
                    "SELECT 1 FROM sessions s JOIN assets a ON a.owner=s.id WHERE s.id=? AND s.expires>? AND a.id=? AND a.deleted=0 AND a.expires>?",
                    (job["owner"], now(), job["photo_id"], now()),
                ).fetchone()
            )
            if (
                not active_owner
                or current["status"] != "processing"
                or (current["expires"] and current["expires"] <= now())
            ):
                return
        kind = "personal_result" if job["operation"] == "tryon" else "generated"
        asset_id = save_image(
            self.db,
            image,
            job["owner"],
            kind,
            job["product_id"] if kind == "generated" else None,
            job["expires"],
            {
                "job_id": job["id"],
                "version": job["version"],
                "fixture": bool(job["fixture"]),
            },
        )
        discard = False
        with self.db.connect(write=True) as db:
            current = db.execute(
                "SELECT status,expires FROM jobs WHERE id=?", (job["id"],)
            ).fetchone()
            active_owner = (
                not job["photo_id"]
                or db.execute(
                    "SELECT 1 FROM sessions s JOIN assets a ON a.owner=s.id WHERE s.id=? AND s.expires>? AND a.id=? AND a.deleted=0 AND a.expires>?",
                    (job["owner"], now(), job["photo_id"], now()),
                ).fetchone()
            )
            if (
                not active_owner
                or current["status"] != "processing"
                or (current["expires"] and current["expires"] <= now())
            ):
                discard = True
                if not active_owner:
                    db.execute(
                        "UPDATE jobs SET status='cancelled',result_id=NULL,error_code='session_ended',message='The photo or its session is no longer active.' WHERE id=?",
                        (job["id"],),
                    )
            elif kind == "generated":
                product = load_product(db, job["product_id"])
                if product["version"] != job["version"]:
                    db.execute(
                        "UPDATE jobs SET status='failed',error_code='revision_changed',message='The garment draft changed during generation. Generate from the current reference.' WHERE id=?",
                        (job["id"],),
                    )
                    discard = True
                else:
                    product["images"].append(
                        {
                            "id": asset_id,
                            "kind": "generated",
                            "role": "main",
                            "approved": False,
                            "public": True,
                        }
                    )
                    save_draft(db, product)
            if not discard:
                db.execute(
                    "UPDATE jobs SET status='completed',result_id=?,message=NULL,error_code=NULL,updated=? WHERE id=?",
                    (asset_id, now(), job["id"]),
                )
        if discard:
            mark_deleted(self.db, [asset_id])

    @staticmethod
    def _data_uri(content):
        return "data:image/jpeg;base64," + base64.b64encode(content).decode()

    def _fixture_image(self):
        from .config import ROOT

        sample = ROOT / "demo" / "emerald-saree.png"
        if sample.is_file():
            image = Image.open(sample).convert("RGB")
        else:
            image = Image.new("RGB", (800, 1200), "#eee9dd")
        draw = ImageDraw.Draw(image)
        draw.rectangle(
            (0, image.height - 120, image.width, image.height), fill="#173c30"
        )
        draw.text(
            (25, image.height - 90), "DEMONSTRATION SAMPLE", fill="white", font_size=30
        )
        draw.text(
            (25, image.height - 46),
            "Not a personalized try-on result",
            fill="white",
            font_size=22,
        )
        out = io.BytesIO()
        image.save(out, "JPEG", quality=90)
        return out.getvalue()
