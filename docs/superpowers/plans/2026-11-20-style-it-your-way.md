# Style It Your Way Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved local merchant photo/PDF-to-catalog workflow and shopper personal try-on experience.

**Architecture:** Next.js provides the merchant workspace and public catalog; FastAPI owns SQLite records, private files, photo checks and FASHN calls. Use one persisted generation worker and a bounded PDF subprocess, with same-origin frontend proxying. No hosted services except the explicitly configured paid image provider.

**Tech Stack:** TypeScript, Next.js App Router, React, plain CSS; Python 3.12, FastAPI, Uvicorn, SQLite standard library, Pydantic, Pillow, pypdfium2, MediaPipe, NumPy and HTTPX. Use pytest/HTTPX for backend checks and Playwright for browser flows. Resolve compatible stable package versions at setup, pin direct versions and commit lockfiles; do not use prereleases.

**Spec:** `docs/superpowers/specs/2026-11-20-style-it-your-way-design.md` — approved by the user on 20 November 2026.

## Global Constraints

- Local Next.js + FastAPI, private local files and SQLite; one merchant workspace and anonymous shopper sessions.
- PDF maximum 30 MiB and 50 pages; photo maximum 10 MiB, 25 megapixels, and at least 512 pixels on the short side; at most 10 retained reference images per product.
- Merchant-entered metadata is authoritative; publication requires a confirmed original try-on reference and approval of each generated gallery image.
- Personal inputs and outputs expire one hour after upload, with immediate access denial and explicit delete available.
- Credentials remain backend-only; no key or no configured allowance means no paid submission; no unattended paid retry.
- Guided try-on chat, manual PDF garment selection and metadata entry, download instead of email; internal consenting adults only.
- Preserve `POST /style-it/generate` (`user_image_id`, `product_id`) and `GET /style-it/jobs/{job_id}`.
- Use real job states and visible AI labels; never claim exact fit, model fidelity, live inventory or real personalized generation from fixtures.

## Review Focus

- PDF page rotation, tiny crops and malicious page dimensions must not produce the wrong garment or unbounded memory use — Task 2.
- A published item edited during a running try-on must retain the original immutable garment reference for that job — Tasks 3 and 4.
- Browser retries and worker restarts near paid submission must not silently create a second billed prediction — Task 4.
- Explicit deletion or expiration during inference must deny access immediately and discard a late result — Tasks 4 and 6.
- A second browser session or a foreign website must not acquire merchant privileges or read another shopper's photo — Tasks 1 and 6.

## File responsibilities and interface conventions

The workspace currently contains documentation only; no product code, callers or tests exist. Create one repository in the selected workspace when execution begins; do not create a second nested checkout or move approved documents. Check `AGENTS.md` in the workspace and ancestors before writing. A home-folder InsForge note is not an instruction to replace the user-selected FastAPI stack. Keep `.env`, image bytes, SQLite files, downloaded detector models and reference recording frames out of Git. Preserve existing discovery documents.

- `backend/pyproject.toml`, `backend/uv.lock`: dependency and test configuration.
- `backend/app/main.py`, `config.py`, `db.py`, `security.py`, `schemas.py`: app lifecycle, local settings, SQLite transactions, sessions/origin checks, API data contracts.
- `backend/app/assets.py`, `pdf.py`, `pdf_process.py`, `photo_checks.py`: validated images, PDF subprocess boundary and local person/pose validation.
- `backend/app/catalog.py`, `generation.py`, `provider.py`: product revisions/publication, job lifecycle/cleanup, FASHN request/status parsing.
- `backend/tests/`: focused service and HTTP tests; generated fixtures, no private personal photos.
- `frontend/src/app/`: shell, collection, product page and merchant studio routes.
- `frontend/src/components/`: shared product gallery, product editor, PDF selector, generation status and guided try-on drawer.
- `frontend/src/lib/api.ts`, `types.ts`: typed API calls and response types matching FastAPI schemas.
- `frontend/next.config.ts`, `package.json`, lockfile, `tsconfig.json`, `playwright.config.ts`: same-origin `/api/*` proxy to FastAPI, framework/tooling setup and isolated browser test servers.
- `tests/browser/`, `scripts/`, `.env.example`, `.gitignore`, `README.md`, `docs/DEPENDENCIES.md`, `docs/QUALITY.md`: browser acceptance, model/setup helpers, environment contract, reproducibility and evidence.

IDs are random UUID strings. Times are UTC epoch seconds internally. API errors are `{detail:{code,message}}`; unavailable private resources return 404 to avoid ownership disclosure. Product prices are optional integer minor currency units. Use integer product revision numbers and normalized PDF crop coordinates `{x,y,width,height}` within `[0,1]`, relative to the rendered upright page. Full-page selection is `{x:0,y:0,width:1,height:1}`.

## Task 1: Local application, sessions and durable storage

**Files:** Create backend setup/config/db/security/main/schemas, frontend package/app shell/proxy, `.env.example`, `.gitignore`, `backend/tests/test_security.py`, `scripts/start.ps1`.

**Interfaces:** `create_app(settings: Settings) -> FastAPI`; `init_db(path: Path) -> None`; `get_session(request: Request) -> Session`; `require_merchant(request: Request) -> Session`. `GET /health` returns readiness flags without secrets. `POST /sessions` creates an anonymous shopper cookie. `POST /merchant/session` verifies a backend-configured merchant access token and issues a merchant cookie; it never promotes a session based on a frontend role flag. Cookies are HttpOnly and SameSite=Strict, scoped to the frontend origin.

- [ ] Create minimal package/test configuration and install locked test dependencies, then write `test_foreign_origin_cannot_mutate`, `test_shopper_cannot_create_product`, `test_cookie_contains_opaque_token`, `test_invalid_host_rejected` and `test_health_hides_provider_key`. Assert 403/404 for forbidden requests and no raw token/key in API records or health output. Keep separate test clients for separate sessions.
- [ ] Run `uv run --project backend pytest backend/tests/test_security.py -q`; verify failures before implementing handlers.
- [ ] Create the minimal app/SQLite schema with foreign keys, transaction handling, WAL and bounded busy timeout. Store only token hashes. Bind backend to `127.0.0.1:8000`; frontend to `127.0.0.1:3000`; proxy `/api/` to backend. Forward cookies and narrowly validate expected host/origin. Give the merchant a separate local-only token in backend `.env`, never a `NEXT_PUBLIC_` variable.
- [ ] Add frontend layout, global styles and a real empty catalog page. Pin compatible dependencies and lockfiles. Use project-owned Python environments; no dependency installation into the managed Codex runtime. Startup scripts verify prerequisites, hide helper windows and report exact local URLs.
- [ ] Re-run security tests and `npm --prefix frontend run build`; expect zero test failures and a successful Next build. Commit the runnable local foundation with the design/plan documents, without runtime data.

## Task 2: Safe photo and PDF input with local person checks

**Files:** Create assets/pdf/pdf_process/photo_checks modules, `scripts/download_models.py`, dependency/license notes, `backend/tests/test_assets.py`, `test_pdf.py`, `test_photo_checks.py`.

**Interfaces:** `store_image(content: bytes, owner: Session, kind: str, product_id: str | None) -> Asset`; `inspect_pdf(path: Path) -> PdfInfo`; `render_pdf_page(path: Path, page: int, max_side: int) -> Image`; `check_person(image: Image) -> PhotoCheck` with `{accepted,code,message}`. `POST /merchant/pdfs`, `GET /merchant/pdfs/{id}/pages/{page}`, `POST /merchant/pdfs/{id}/crops`; `POST /merchant/products/{id}/images`; `GET /assets/{id}` and `DELETE /assets/{id}` enforce ownership. `POST /style-it/photos` requires consent and accepted person checks and returns a private `user_image_id` with expiration.

- [ ] Write photo tests for disguised non-images, decompression bombs, EXIF rotation/removal, oversized bytes, dimensions below 512, 10-reference limit and cross-session retrieval/deletion. Assert rejected uploads leave no accessible file or orphan DB record.
- [ ] Write PDF tests for corrupt/encrypted input, 51 pages, negative/out-of-page/non-finite crop values, rotated-page coordinate consistency, crop below 512 pixels and renderer timeout. Assert full-page selection succeeds for a valid rendered page and derived asset retains PDF/page/crop provenance. Generate test PDF bytes; do not use customer documents.
- [ ] Run the asset/PDF tests to verify they fail, then implement bounded streaming reads and Pillow decoding/re-encoding. Use pypdfium2 in a spawned subprocess: inspect/render one requested page, cap rendered output at 4,096 pixels on its longest side, cap at 25 megapixels, apply a 20-second timeout, terminate and reap on failure. Never run simultaneous PDFium calls in different threads. Explicitly close native handles. Detect PDF encryption, including documents opening with an empty password, and reject it. Do not invoke embedded PDF actions or links.
- [ ] Implement MediaPipe EfficientDet-Lite0 person counting plus Pose Landmarker Lite landmark checks, and image brightness/blur checks. Configure detection to return all plausible people rather than truncating to one. Use shoulder/hip visibility and framing checks, with clear uncertain/retry outcomes; do not claim perfect pose validation. Cache the local models and serialize use if required by their APIs. Missing models fail closed with a setup message.
- [ ] Test `test_no_person_rejected`, `test_two_people_rejected`, `test_face_only_rejected`, `test_uncertain_pose_rejected`, `test_dark_or_blurred_rejected` and `test_missing_models_disable_generation` using deterministic detector outputs and generated image fixtures. Separately smoke-test real detector loading with the downloaded checkpoints. Record checkpoint hashes, URLs, license evidence and calibration limitations; never call mocked detections real-model validation.
- [ ] Verify all Task 2 tests pass and document model setup. MediaPipe software is Apache-2.0; exact downloaded checkpoint terms must also be captured before enabling their use. If source terms cannot be established, leave the detector unavailable and report the concrete blocker rather than silently bypassing checks. Commit.

## Task 3: Product revisions, approval and publication

**Files:** Create catalog module, extend schemas/db/main/assets, create `backend/tests/test_catalog.py`.

**Interfaces:** `create_product(payload: ProductInput, owner: Session) -> Product`; `publish_product(product_id: str, revision: int) -> PublishedProduct`. API: merchant product CRUD; assign image roles and original try-on reference; approve/reject output assets; publish/unpublish; public `GET /products` and `GET /products/{id}`. Public responses contain only published metadata/gallery and authorized public asset URLs, not private reference IDs or paths.

- [ ] Write tests for required name/SKU/category/included-pieces fields, case-normalized SKU uniqueness, optional price and currency, reference ownership, draft invisibility and unapproved output rejection. Assert originals cannot be mistaken for generated approvals.
- [ ] Add `test_edit_does_not_change_published_snapshot`, `test_new_generation_does_not_inherit_approval`, `test_published_reference_cannot_be_deleted` and `test_private_pdf_never_public`. Assert failed publication is atomic and previous publication remains readable.
- [ ] Run these tests red, implement product/revision storage and transactional publication. Confirm one original reference and an explicitly selected gallery; each generated gallery asset requires approval for that revision. Return a conflict for stale edits so one open editor cannot silently overwrite another.
- [ ] Re-run catalog, asset and security tests; expect all to pass. Commit the complete product lifecycle API.

## Task 4: Paid generation worker, durable state and cleanup

**Files:** Create provider/generation modules, extend lifecycle/config/db/routes, create `backend/tests/test_generation.py`, `test_provider.py`, `test_cleanup.py`.

**Interfaces:** `submit_job(owner: Session, operation: str, inputs: JobInput, idempotency_key: str) -> Job`; `run_worker_once() -> None`; `expire_personal_assets(now: int) -> int`. `FashnClient.submit(model_name: str, inputs: dict) -> str` and `.status(prediction_id: str) -> ProviderResult` are the only provider boundary. `POST /merchant/products/{id}/generate`, `POST /style-it/generate` and `GET /style-it/jobs/{job_id}` return `{job_id,status,result_image_url?,error_code?,message?}`; job read enforces owner/role.

- [ ] Write tests for key/allowance missing, atomic allowance reservation, immutable published reference snapshot, missing photo consent/check acceptance, unpublished products, foreign ownership and expiry. Same owner/key/payload returns one job; same key with different inputs returns 409. Assert backend never accepts an arbitrary garment URL or local path.
- [ ] Test worker transitions `queued -> submitting -> processing -> completed|failed`, with terminal `expired`, `cancelled` and `needs_review` where appropriate. Mock HTTP errors, invalid JSON, missing prediction ID, 429, timeouts and invalid/base64 oversized output. Assert failed/ambiguous submission never triggers an automatic duplicate POST, and a restart polls a saved prediction ID instead of resubmitting it.
- [ ] Run the tests red. Implement direct FASHN Product to Model and Try-On Max using the documented `model_name`/`inputs` envelopes, one output, backend-only credentials, data-URI private inputs and base64 output. Re-fetch exact schemas/current pricing before implementation. Validate and decode responses within bounded byte/dimension limits; no arbitrary remote URL fetching. Set finite HTTP and total-job deadlines.
- [ ] Persist a worker claim before the external request and mark `needs_review` if recovery finds ambiguous `submitting` state without a prediction ID. Only an explicit new user action may authorize another paid submission. Limit to one provider request in flight; cap per-session enqueue rate. Reserve allowance transactionally across concurrent requests, count ambiguous submissions as spent and require operator inspection to restore them. The allowance is a call count, not a currency guarantee.
- [ ] Implement expiration at upload time plus 3,600 seconds; outputs inherit their input's expiration. Deny reads by timestamp regardless of file deletion progress. On deletion cancel queued work, mark active work discard-only, remove personal bytes and discard late output before saving it. Test deletion/expiry at queued, processing and completed states, worker restart cleanup and deleting a file still referenced by a running job. No cleanup routine may recursively remove an unchecked directory.
- [ ] Add a backend test-only fake provider. If a developer fixture mode is exposed, label every response/result as fixture and use a fixed visibly watermarked sample rather than echoing an upload as a pretend result. Real mode with missing credentials reports not configured.
- [ ] Run all backend tests with no provider key and a failing-network guard; expect no external HTTP calls and all deterministic checks passing. Commit job orchestration and privacy lifecycle.

## Task 5: Reference-inspired storefront and merchant studio

**Files:** Create `frontend/src/app/page.tsx`, `products/[id]/page.tsx`, `studio/page.tsx`, `studio/products/[id]/page.tsx`, shared CSS, product gallery/editor/PDF selector/job status components, API/types; create `tests/browser/merchant.spec.ts` and `catalog.spec.ts`.

**Interfaces:** Browser API calls use same-origin `/api/*`, backend cookies and typed responses. Merchant editor consumes Task 3 product/revision responses; PDF selector sends normalized upright-page crop coordinates to Task 2. Job status consumes Task 4 states. Keep one typed `api<T>(path: string, options?: RequestInit) -> Promise<T>` helper with specific API error propagation.

- [ ] Configure `frontend/playwright.config.ts` with `testDir: '../tests/browser'`, isolated loopback frontend/backend test servers and `tests/browser/fixtures.ts` that seeds products through authorized API calls with test-only fake provider/detector configuration. Write browser tests for photo-created and PDF-created products, keyboard-operable whole-page selection and crop controls, reference confirmation, fixture generation, approval then publication and new-draft isolation. Assert a public catalog session cannot see draft assets or merchant controls.
- [ ] Implement VYUMI wordmark, white compact header, restrained gold actions and portrait cards; four columns desktop, two mobile. No fake prices/stock/sales. Product detail shows published gallery, merchant details, clear AI labels and try-on entry. Hide absent optional fields. Use licensed/consented demo images or an honest empty state; do not download Panna catalog assets for app use.
- [ ] Implement local merchant session entry using the backend token, catalog status filters and four-step product editor. Support photo thumbnail roles, PDF thumbnails/page selection, pointer crop with labelled numeric/keyboard alternatives, crop preview, details confirmation and generation/review/publish. Cancelled upload/generation leaves the saved draft usable. Guard against duplicate submit clicks without replacing server idempotency.
- [ ] Add responsive layouts, accessible labels/errors, focus-visible states, live job status and honest provider/model setup warnings. Use the reference design notes; screen-specific layout refinements remain implementation choices. Do not add UI design dependencies for simple controls.
- [ ] Run `npm --prefix frontend run build` and `npm --prefix frontend run test:e2e -- merchant.spec.ts catalog.spec.ts`; expect successful build and tests using an isolated temporary backend database and fake provider. Commit the complete merchant-to-storefront journey.

## Task 6: Shopper try-on, final acceptance and handoff

**Files:** Create `frontend/src/components/TryOnDrawer.tsx`, `PhotoUpload.tsx`, `TryOnResult.tsx`; integrate storefront/product pages; create `tests/browser/tryon.spec.ts`, `privacy.spec.ts`, `docs/QUALITY.md`, finish README/scripts/license inventory.

**Interfaces:** Drawer receives the selected published product, owns its session's current private image/job and restores the active job ID after reload. Reuse of the same photo requires an explicit same-session action. Expired/deleted resources clear all image previews, object URLs and result state; another session cannot restore them from client storage alone.

- [ ] Write browser tests for product-scoped entry, consent-before-upload, photo rejection, optional height/size informational labels, configured/disabled generation, polling after refresh, result comparison/download, explicit same-session reuse, change photo and deletion. Assert fixture output is visibly labelled and a missing key cannot look like a successful personalized result.
- [ ] Add two-browser-context privacy tests: shopper B cannot read A's job/input/output; neither can elevate to merchant; a deleted/expired job loses access immediately and a delayed mocked provider result never reappears. Add frontend timeout/retry and mobile keyboard/focus tests. Real-person model checks run separately from detector mocks.
- [ ] Run browser tests red, then implement the guided drawer with modal focus containment/return, body-photo guidance, provider disclosure and adult consent, upload checks, real status and original/result comparison. Provide download, another garment, change photo and delete; show expiration clearly. Do not add generic LLM chat or collect email.
- [ ] Run all backend tests, frontend build and browser tests once with clean temporary state. Inspect desktop and narrow-screen merchant/storefront/drawer views and correct clipping, missing imagery, low contrast and inaccessible actions. Perform one clean local startup from README instructions.
- [ ] Document exact model/endpoint settings, checkpoint hashes/licenses, local limits, fixture versus live behavior, key/allowance configuration, data retention, screenshots/recording evidence and failures. In `docs/QUALITY.md`, keep unperformed live trials marked NOT RUN and never replace them with mock results. Record a real saree/suit evaluation only if consented inputs, key and explicit allowance exist; otherwise finish the reproducible application and report live quality validation as pending.
- [ ] Run a fresh whole-change review using the execution method's required review workflow; fix actionable issues and rerun only affected checks. Commit the verified local prototype; do not push, publish or deploy unless separately requested. Final reply includes run URLs/commands, actual checks and outstanding provider/quality limitations.

## Research informing implementation choices

Read on 20 November 2026:

- [pypdfium2 API](https://pypdfium2.readthedocs.io/en/stable/python_api.html): PDFium calls cannot run concurrently across threads; use the process boundary specified in Task 2 and close handles.
- [pypdfium2 licensing](https://github.com/pypdfium2-team/pypdfium2#licensing): permissive wrapper licensing; exact bundled PDFium/dependency notices must accompany distributions.
- [MediaPipe Object Detector](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector?tab=Python) and [Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker?tab=Python): local image-mode detection and pose landmarks. Their outputs are evidence for quality heuristics, not guarantees of suitable photographs.
- [MediaPipe software license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE): Apache-2.0. A software license is not sufficient evidence for every independently downloaded checkpoint; retain checkpoint provenance before enabling it.
- FASHN endpoint and retention sources are preserved in the approved design/baseline; revalidate exact implementation contracts in Task 4.

## Plan self-review

Coverage: Task 1 local access/storage; Task 2 bounded photo/PDF and one-person validation; Task 3 immutable publication; Task 4 paid jobs/expiry/recovery; Task 5 reference UI and merchant journey; Task 6 full shopper flow, accessibility, reproducibility and quality evidence. All five Review Focus conditions have named tests. Frontend uses Task 2–4 contracts; shopper try-on always snapshots the published original garment reference. Dependencies and detector calibration are explicitly verified rather than assumed.

Plan status: ready for user review; implementation has not begun. Recommended execution: Native, because the six tasks share the same product/asset/job contracts and sequential implementation avoids repeated context setup. One independent review at the end checks the connected implementation. Subagent-driven execution is available if the user prefers independent review after every task.
