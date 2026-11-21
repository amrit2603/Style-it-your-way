# Backend checkpoint

The existing FastAPI app is the shared service for the current prototype and the upcoming independent admin/client apps. No existing database is replaced. Migration `002_commerce.sql` adds users, account links on sessions, orders/items, reusable library images, login throttling and multipart request replay records. Product revisions and approved/public image snapshots retain their existing storage model.

Run independently:

```powershell
uv sync --project backend --locked
uv run --project backend pytest backend/tests -q
uvx ruff check backend/app backend/tests scripts --config backend/pyproject.toml
uv run --project backend uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

API docs: `http://127.0.0.1:8000/docs`. Every root API route also accepts an `/api` prefix, including private assets. Next.js proxies may strip that prefix. Requests use HttpOnly, SameSite cookies and an `X-CSRF-Token` for mutations. Start an anonymous session with `POST /api/sessions`, or sign in. Foreign origins and cross-site mutations are rejected. No JWT secret is necessary.

## Accounts

- `POST /api/auth/signup`: name, email, password (12–128 characters). Always creates a customer, regardless of any supplied role.
- `POST /api/auth/login`: email/password. Rotates the session and returns `{role,csrf_token,user:{id,name,email,role}}`. The cookie role is `merchant` for an admin; the account role is `admin`.
- `GET /api/auth/me`: current account, without password hashes.
- `POST /api/sessions/logout`: revokes the session and dependent personal previews.

Passwords use salted scrypt. Five failed sign-ins for an email within 15 minutes trigger throttling. Configure `VYUMI_ADMIN_EMAIL` and a unique `VYUMI_ADMIN_PASSWORD` in private `backend/.env` to bootstrap an administrator. Bootstrap never elevates an existing customer and does not silently reset passwords. The legacy local merchant token remains supported for existing workflows.

## Products

`GET /api/products` remains a list for existing callers; `GET /api/shop` returns `{items,total,page,limit}`. Both support search `q`, category, audience, color, size, min/max price in minor currency units, sort (`newest`, `price_asc`, `price_desc`, `popular`) and pagination. Popularity uses ordered quantity rather than invented ratings. Product prices are integer `price_minor`; colors are a list of strings and existing sizes remain comma-separated text.

Admin product create/list/read/update/image upload/reference/review/publish routes are available under `/api/admin/products`, mirroring the existing `/merchant/products` workflow. Updates include the current `version`. `DELETE /api/admin/products/{id}` archives/unpublishes; original files and historical order snapshots are preserved. New categories add `decor` and `curtains` to existing wearables, watches and furniture.

## Orders

- `POST /api/orders`: `{items:[{product_id,quantity,size?,color?}],name,address,phone,idempotency_key}`.
- `GET /api/orders` and `GET /api/orders/{id}`: signed-in account's orders only.
- `GET /api/admin/orders`: all orders; `PUT /api/admin/orders/{id}` changes status one step at a time: pending → confirmed → shipped → delivered.
- `GET /api/admin/dashboard`: actual product/order counts and recent orders.

Checkout calculates prices and totals from published products inside one transaction, validates requested options/currency, and snapshots names/SKUs/prices. Replaying the same key returns the same order; changed payloads return 409. Client-supplied prices/totals are ignored. Demonstration seed products cannot be ordered. This records unpaid orders; it does not charge a payment method or promise inventory reservation.

## Reusable catalog photos

`GET/POST /api/admin/stock-models` and `/api/admin/room-templates`. Upload multipart `file`, `label`, `permission=true` and optional `gender`/`body_type` or `room_type`. Gender and body-type labels are supplied by the merchant, never inferred. Live stock-model uploads run person checks. Library files are admin-only, not public catalog assets.

- `POST /api/admin/ai-generate/model-tryon`: `{product_id,stock_model_id,view?,idempotency_key}`.
- `POST /api/admin/ai-generate/room-placement`: `{product_id,room_template_id,view?,idempotency_key}`.

The selected model is the actual person input to the configured try-on provider; the original product is the garment input. Room templates are the actual placement background. Results enter the product draft unapproved; review and publication are still explicit.

## Customer visualization and GPU contract

- `POST /api/tryon`: multipart `person_image`, `product_id`, `consent=true`, `idempotency_key`.
- `POST /api/room-visualize`: multipart `room_image`, same metadata.
- Both return the existing durable `Job`; poll `/api/style-it/jobs/{id}`. Personal input/result lifetime remains one hour and authorization remains session-specific. Multipart retries reuse the uploaded photo and job. The existing two-step `/style-it/photos` + `/style-it/generate` routes remain available.

`VYUMI_TRYON_PROVIDER=kaggle`, `VYUMI_KAGGLE_API_URL` (public HTTPS origin), and `VYUMI_KAGGLE_API_TOKEN` select the notebook adapter. It sends person before garment to `/try-on`, authenticates with Bearer, uses a 60-second timeout and at most one transient-failure retry with the same `X-Request-ID`. The GPU server must implement that idempotency contract before live use. It returns `{image_base64}`; no arbitrary result URLs are fetched. Credentials and tunnel configuration are never sent to the browser. This checkpoint tests the adapter against an isolated mock, not a running CUDA model.

`VYUMI_ROOM_PROVIDER=composite` enables a local CPU placement demo with no AI allowance charge. Use transparent product PNGs for best cutouts; plain backgrounds have a limited automatic mask. Outputs are watermarked **ROOM PLACEMENT DEMO – not to scale**, and job metadata says `visualization_kind=room_composite`. This is not generative inpainting or calibrated perspective/size inference. Live AI outputs have an **AI Generated** watermark. Fixture samples retain their explicit demonstration labels.
