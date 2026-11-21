# VYUMI Style It Your Way

The expanded e-commerce platform is being built in checkpoints: **backend → GPU notebook → separate admin app → separate customer app**. The shared backend now includes accounts, orders, stock-model/room libraries and the notebook API adapter. See [backend setup](docs/BACKEND.md) and [checkpoint evidence](docs/CHECKPOINT_RESULTS.md). The existing storefront below remains available during this work; the separate apps are not yet implemented.

GPU notebooks: [Colab](notebooks/vyumi_idmvton_colab.ipynb), [Kaggle](notebooks/vyumi_idmvton_kaggle.ipynb), [setup instructions](notebooks/README.md). Local schema/API-contract tests pass; real GPU inference must pass in the notebook before the admin phase starts. [Open the Colab notebook](https://colab.research.google.com/github/amrit2603/Style-it-your-way/blob/main/notebooks/vyumi_idmvton_colab.ipynb).

A local Next.js + FastAPI prototype with two connected workflows:

Collections now separate **Women, Men and Unisex**, with sarees, suits/sets, shirts, tops/T-shirts, trousers/jeans, skirts, dresses, kurtas, jackets/blazers and lehengas. Merchants set the collection/category and choose adult model presentation and studio/daylight/outdoor settings. Shoes, watches and furniture are also available as categories. A selected product opens its own styling page, with no garment switcher. The API retains up to three complementary clothing pieces for existing callers; the shopper page previews one product.

**Personal try-on uses the dedicated FASHN VTON 1.5 model through its official public GPU demo.** Choose a product, consent and upload a photo: generation starts automatically. Original and result appear together with direct download. Two earlier live uploads completed; the latest live attempt returned a service error without an image. See [evaluation evidence](docs/IDENTITY_EVALUATION.md). The shared demo has quota/capacity limits; production reliability and representative real-person accuracy remain unverified. A paid FASHN adapter is available but requires its own key.

- **Merchant studio:** upload garment photos or a PDF catalog, select garment regions, enter product details, generate model-wearing catalog previews, review and publish.
- **Shopper storefront:** browse published garments, choose one, upload a personal photo with consent, generate a private try-on, compare, download, retry and delete.

The storefront follows the supplied Panna reference: portrait catalog grid, compact white header, gold actions and a portrait product gallery. Styling opens at `/style/{product_id}`. Merchant preparation follows Details → Images → Generate → Review & publish.

**Catalog generation supports Cloudflare Workers AI, Gemini and paid FASHN.** Personal generation is independently configured with `VYUMI_TRYON_PROVIDER=fashn_demo` (official public GPU demo, no API key), `fashn` (paid key required), or `primary` (use the catalog provider). Catalog credentials take precedence Cloudflare, then Gemini, then paid FASHN. Demo mode returns a labelled fixed sample, not a personalized result.

## Run the local demonstration

Requirements: Windows PowerShell, Node.js 22+, and [uv](https://docs.astral.sh/uv/getting-started/installation/). The backend uses Python 3.12.

```powershell
.\scripts\start.ps1 -Demo
```

Use `-SkipInstall` after the first dependency setup.

- [Storefront](http://127.0.0.1:3000)
- [Merchant studio](http://127.0.0.1:3000/merchant)
- Local demo merchant token: `vyumi-local-demo`

Keep the terminal open; Ctrl+C stops the servers owned by that script. Ports 3000/8000 must be free. Demo mode uses `data/demo`, separately from live data. Four original AI-created sample garments and a PDF catalog are provided in `demo/`; none were copied from Panna. They are test content, not evidence of FASHN output quality. See [provenance](demo/ASSETS.md).

## Enable real generation

For Cloudflare Workers AI, open [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers AI → Use REST API. Copy Account ID and create a Workers AI API token using the provided template. Put these values in the private `backend/.env` file:

```env
VYUMI_TRYON_PROVIDER=fashn_demo
VYUMI_CLOUDFLARE_ACCOUNT_ID=your_account_id
VYUMI_CLOUDFLARE_API_TOKEN=your_workers_ai_token
```

Never paste the token into chat or frontend code. A positive local generation allowance is also required. Restart the backend after saving. The adapter defaults to `@cf/black-forest-labs/flux-2-klein-9b`; set `VYUMI_CLOUDFLARE_MODEL` to that model or `@cf/black-forest-labs/flux-2-klein-4b`. Personal edits send the person as image 0, followed by one to three garment references; catalog shoots send the garment as image 0. References are resized to at most 511 pixels per side to meet the provider's input limit; this can lose fine garment details. Outputs are requested at 768 × 1024. This is a general image-editing model, with no measured garment or identity accuracy yet. See [reference-image API instructions](https://developers.cloudflare.com/changelog/post/2026-01-15-flux-2-klein-4b-workers-ai/) and [current Workers AI free allocation/pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/). Free allocation is shared and limited, not unlimited generation.

For Gemini or FASHN (leave both Cloudflare credential fields empty):

1. Copy `.env.example` to `backend/.env` if it does not exist. Git ignores this private file.
2. Set a long `VYUMI_MERCHANT_TOKEN`, your `VYUMI_GEMINI_API_KEY` (or `VYUMI_FASHN_API_KEY`) and a positive `VYUMI_GENERATION_ALLOWANCE`. Keep keys out of chat and browser code. Gemini defaults to `VYUMI_GEMINI_MODEL=gemini-3.1-flash-image`; Google billing/quota must permit image output. The local request allowance is configurable and is not a monetary cap.
3. Prepare the local photo validators:

   ```powershell
   uv sync --project backend --locked
   uv run --project backend python scripts/download_models.py
   ```

4. Stop the demo, then run live mode:

   ```powershell
   .\scripts\start.ps1
   ```

Live mode uses `data/live`. Enter your configured merchant token, upload a real garment or PDF selection, confirm its original reference, generate a catalog preview, approve it and publish it. A shopper can then choose it and upload a body photo for personal try-on.

The allowance counts reserved live requests for this database; it is **not an exact monetary spend cap**. Missing keys or zero/exhausted allowance disable live generation. Interrupted submissions without a saved provider prediction ID are marked for operator review, never silently resubmitted. Inspect the provider dashboard before requesting another paid attempt.

Gemini receives the confirmed garment reference and, for personal try-on, the consenting person's photo through Google's fixed HTTPS API origin. One 1K output is requested; no automatic paid retry or provider fallback occurs. See [Google image documentation](https://ai.google.dev/gemini-api/docs/image-generation) and [API terms](https://ai.google.dev/gemini-api/terms). Interrupted synchronous submissions require operator review before retrying.

FASHN models remain [`product-to-model`](https://docs.fashn.ai/api-reference/product-to-model) for catalog shoots and [`tryon-max`](https://docs.fashn.ai/api-reference/tryon-max) for a real person image. Configuration: one output, 1k resolution, balanced mode, catalog aspect ratio 2:3. Verify [current credit pricing](https://docs.fashn.ai/api-overview/api-fundamentals#credits--pricing) before spending. Both providers use the confirmed original garment photo/PDF crop for shopper try-on, not a previously generated catalog photo.

## Inputs and outputs

Photos: JPEG/PNG/WebP/HEIC/HEIF/AVIF, at most 10 MiB and 25 megapixels. Personal photos need at least 128 px on the shorter side; merchant references need 512 px. Orientation is normalized and unnecessary metadata removed. Products retain up to ten original main/reverse/detail references.

PDFs: at most 30 MiB and 50 pages. Encrypted/unreadable PDFs are rejected. Preview pages, crop one garment or use the whole page, then manually confirm product metadata. Numeric crop controls support keyboard use. Source PDF/page/crop provenance stays attached. There is no automatic bulk matching, OCR or spreadsheet import.

Personal photos need permission/processing consent and one detectable person or face. MediaPipe runs locally; lighting and framing issues become advice when one person is detected. Group/non-person images and missing validators are rejected. Checks are heuristics, not age verification. Optional height, weight, shoulder width and usual size are saved as user-supplied reference data. The photo supplies the silhouette; these values do not calibrate fit or guarantee body-shape preservation.

Catalog images need explicit review before publication. Original references start private and appear publicly only if separately selected. Source changes create a new draft while preserving the previous public snapshot; replacement outputs need fresh approval. Personal results are session-private and downloadable before expiry. Job status reflects actual server state.

## Privacy and scope

Personal inputs/results expire one hour after input upload. Access is revoked immediately at expiry/deletion/logout; queued personal work is cancelled, late results discarded, and cleanup retries locked file removal. The dedicated demo receives uploaded person and garment files; other adapters use inline data. The local photo server is not exposed publicly. When using the shared demo, consult [Hugging Face privacy](https://huggingface.co/privacy) and the [official FASHN demo](https://huggingface.co/spaces/fashn-ai/fashn-vton-1.5); local expiry does not control the external host's retention. Local deletion does not promise removal of provider-held data; consult [Cloudflare data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/), [Google's API terms](https://ai.google.dev/gemini-api/terms) or [FASHN retention](https://docs.fashn.ai/api-overview/data-retention-privacy). The shopper consent panel names the configured provider.

Servers bind to loopback. Merchant access uses a local token and HttpOnly session; mutations require origin/CSRF checks. Private assets and personal jobs enforce session ownership. This is one local merchant workspace, not a publicly hosted multi-tenant system. No checkout, payments, inventory integration, email delivery or fit guarantees.

## Verification commands

```powershell
uv run --project backend pytest backend/tests -q
uvx ruff check backend/app backend/tests scripts --config backend/pyproject.toml
npm --prefix frontend run build
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend run test:e2e
```

Browser tests use isolated fixture servers on 3001/8001 and a fresh database. They make no paid calls. [Quality evidence](docs/QUALITY.md) separates automated behavior checks, real local detector loading and pending live fidelity trials.

## Files and troubleshooting

- `backend/app/`: API, sessions, private files, product revisions, PDF processing and generation worker.
- `frontend/`: storefront, merchant studio and guided try-on.
- `scripts/`: startup, model download, demo seeding and test backend.
- `demo/`: fictional sample garments and `catalog-example.pdf` for PDF import tests.
- `data/`, `models/`: private runtime state/downloaded checkpoints, ignored by Git.
- [Approved design](docs/superpowers/specs/2026-11-20-style-it-your-way-design.md), [plan](docs/superpowers/plans/2026-11-20-style-it-your-way.md), [API contract](docs/API.md), [dependency notes](docs/DEPENDENCIES.md).

If generation is disabled, check the backend key/allowance and restart live mode. If photo validation is unavailable, run the downloader. For a rejected photo, try one person in a sharp, well-lit body photo. For a tiny PDF selection, choose a larger region or a separate high-resolution garment photo. For startup errors, read `backend-error.log` and confirm both ports are free.

AI may change color, embroidery, borders, drape, identity or anatomy. Merchant review is mandatory; a representative saree/suit benchmark is still needed before real customer use. Use consented adult photos and licensed garment sources. No measured fidelity or physical fit accuracy is claimed.

Collections support Women, Men and Unisex, with ten garment categories. Personal outfits allow up to three complementary pieces (top, bottom and optional jacket; or full outfit and optional jacket). Merchant catalog shoots offer model presentation and scene controls. Personal upload starts generation automatically. Front/back/left/right views have separate photo uploads, jobs and reload recovery; direct download follows completion. Compare the face and garment before using a result.

## Product views and accessories

The styling page asks for a sharp, unfiltered full-body photo with the neck, shoulders, waist and feet visible. It includes an illustrated height/width guide and optional measurements. A matching side/back photo is needed for each requested angle; the app does not infer a real back view, height or weight from a front image. The model may still alter proportions. Side/back quality is experimental and needs evaluation with representative consented photos.

Merchant generation supports front, back, left and right camera directions with separate reviewable jobs. Add reverse/left/right original references for accurate product details. Hidden originals remain private inside the immutable publication snapshot and are never returned as public files. Later catalog views can use an approved catalog image as a model-identity reference on Cloudflare/Gemini; identity consistency remains model-dependent.

Shoes and watches use the primary reference-image editor, preserving existing clothing and changing the accessory only. Furniture asks for a room photo and uses room placement prompts; a room upload cannot bypass person validation for clothing. Cloudflare/Gemini must be configured for these categories. These flows are approximate visualizations, not measured sizing or room-scale guarantees.

The official public FASHN demo has shared capacity. A working health endpoint is not proof of GPU quota; capacity and inference errors have distinct messages, and there is no automatic provider fallback. For a dedicated hosted service, set `VYUMI_TRYON_PROVIDER=fashn` and a paid `VYUMI_FASHN_API_KEY`, then restart. Claude cannot generate photographic images, and its chat subscription does not include API usage: https://support.claude.com/en/articles/9002504-can-claude-produce-images and https://support.claude.com/en/articles/9876003-why-is-claude-api-usage-billed-separately-from-my-paid-claude-plan.
