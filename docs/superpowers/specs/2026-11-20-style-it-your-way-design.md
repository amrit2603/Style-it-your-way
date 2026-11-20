# Style It Your Way prototype design

20 November 2026. Status: approved by the user in chat ("yeah approved"). This is a specification, not a runnable application or a measured claim about AI quality.

## Intent and authority

Build Feature 1 as a local Next.js frontend and FastAPI backend. Merchants turn garment photos or PDF catalog pages into reviewed catalog imagery; shoppers browse those garments and generate private visual try-ons. The user selected this stack and these input formats, and allowed paid APIs. Their request takes priority over the supplied documents' narrower upper-body/local-model recommendations.

Everything marked proposal below records an engineering choice included in the user's design approval, rather than a requirement from their original request. The baseline in `../../BASELINE.md` records source evidence; the design-reference notes in `../../reference/DESIGN.md` distinguish observed desktop behavior from selected layouts.

## Approaches considered

| Approach | Tradeoff | Decision |
| --- | --- | --- |
| Local Next.js + FastAPI | Two runtimes, consistent with the documents' proposed Python foundation | Selected by the user |
| Local Next.js alone | Simpler deployment, diverges from proposed shared Python services | Not selected |
| Hosted multi-merchant pilot | Supports external merchants but requires tenant management and hosted storage | Deferred by choosing a local prototype |

Proposal: one local merchant workspace and anonymous shopper sessions. Bind services to loopback and reject unexpected hosts/origins. The merchant workspace must not become remotely accessible without a separate hosted access design. A local merchant session may manage this catalog; anonymous shopper sessions may only read published products and their own uploads/jobs. Treat the selected local scope as a deployment boundary, not as proof that random asset IDs alone secure access.

## Goals and exclusions

Complete both merchant and shopper journeys with understandable validation, failure, retry and refresh behavior. Preserve original garment evidence; label generated imagery; isolate personal photos; keep product metadata authoritative. Support sarees and suits as product categories without claiming universal garment accuracy.

Proposal: exclude Features 2–5, checkout, payments, live stock, store integrations, model training, video, saved accounts and measured fit prediction. Chat initially guides the product-selection and try-on flow; open-ended stylist advice is a separate choice. Email delivery or inbound email ingestion is not included unless requested after this review. Downloading a result supplies the initial save action.

## Merchant experience

### Catalog and product editor

Use a compact catalog with draft, generating, review-needed and published filters. Each row shows the product thumbnail, name, category, status and next action. A clear New product action opens one product workspace with four steps: Details, Images, Generate and Review.

Proposal: required details are product name, SKU, category and description of the included garment pieces; price/currency and size information are optional display fields. Reject duplicate SKUs. Use INR as the initially selected currency, editable before publication. Merchant-entered metadata stays editable and never comes from image generation. Offer saree and suit category labels; the merchant describes the particular suit style rather than the application inferring it.

### Photos

Upload individual JPEG, PNG or WebP images. Show thumbnails with explicit roles: main, reverse and detail. Offer garment-specific guidance: full garment and pallu/border for sarees; front/back and included pieces for suits. Require a usable primary garment image, allow supplementary images, and explain that supplying more views does not guarantee all views are used together by the AI.

### PDF catalog

Proposal: upload PDF → show page thumbnails → select a page → select a garment region or use the whole page → preview the extracted image → assign it to an existing draft product or create a draft → enter/confirm product details.

Rendering a page supports both scanned and image-based catalogs. Manual selection avoids silently pairing one product's name with another product's image. Do not automatically create products or treat catalog text as instructions. OCR, automatic bulk product recognition, spreadsheet import and ZIP import are excluded from this first proposal. Merchants can repeat page/region selection for additional products. Keep the source PDF ID, page number and crop coordinates linked to derived assets.

Proposal limits: PDF maximum 30 MiB and 50 pages; at most 10 retained reference images per product; photo maximum 10 MiB, 25 megapixels, and at least 512 pixels on the short side. Reject encrypted, unreadable or oversized PDFs with specific messages. Render selected pages on demand at a bounded resolution and enforce processing deadlines. Preview thumbnails may be smaller, but a selected crop must meet garment image quality limits. Reject tiny selections with a clear request for a larger crop or a separate photo.

### Generate and review

Choose the main garment reference, add a short appearance/background direction, and request one catalog preview. Proposal: start with an adult generated model and a neutral studio scene; any real-person face reference requires permission and explicit selection. Generation is a paid, explicit action; uploading and cropping do not trigger it.

Keep originals beside the output for checking color, print, embroidery, borders, drape and included suit pieces. Allow reject/regenerate, approve, publish and unpublish. Approval belongs to a particular output asset. Publishing makes only approved catalog assets and selected original product images public; PDFs and unpublished assets remain private. Editing the source garment or generating another variant cannot silently approve or publish the new image.

Proposal following builder review: designate one original photo or PDF crop as the try-on garment reference for each product revision. Require merchant confirmation of that reference before publishing. Shopper generation resolves `product_id` to the current published revision and snapshots its original reference asset into the job. Never use a generated catalog/model image as the default garment reference, and never silently switch inputs when a product changes during processing. Keep the source reference private unless the merchant separately chooses to show it in the gallery.

Multiple gallery images can be generated through additional deliberate requests. Do not promise consistent identity or matching front/back geometry across independent generations. Preserve a previously published gallery while a new draft is reviewed.

## Shopper experience

### Storefront

Use the supplied desktop reference as direction: white background, compact persistent header, category navigation, four-column portrait image grid, restrained gold actions, compact names/prices and a lower-right chat entry. Use VYUMI identity and licensed sample imagery; do not copy Panna trademarks, promotions, ratings or stock claims.

Proposal responsive behavior: two columns on narrow screens, four at desktop widths; product detail stacks on mobile. A product page provides a large gallery, thumbnails, actual merchant details, visible AI labels and a prominent Try it on me button. Hide missing optional metadata cleanly. No fictitious purchases, scarcity or testimonials.

### Guided chat and upload

The chat drawer carries the selected product into the try-on flow. It guides product selection, photo preparation, generation and retry with concise messages and buttons. It is not presented as an open-ended AI stylist in this proposal. The selected garment and its source thumbnail stay visible.

Before personal-photo upload, explain external processing and temporary application storage and require consent. Ask for one consenting adult, front-facing or slight angle, suitable lighting and the relevant body region visible. For full garments recommend a full-body image; explain why a face-only selfie is insufficient. Height and usual size may be supplied as optional context, but are labelled informational and are not claimed to control physical fit.

Decode and validate every uploaded file. Include content-based checks for one person, usable pose/region, blur and lighting; thresholds are builder choices evaluated against golden examples. Where a check is uncertain, ask for a clearer photo rather than silently claiming that it passed. Do not offer generation when person validation is unavailable or the photo fails. Implement the checks with a suitable local detector/preprocessing dependency selected and license-checked during planning; an API's input validation alone does not prove one-person suitability.

### Job and result

Show real queued/processing status, not invented per-stage progress or a fake percentage. Persist the active job ID in the session so a refresh can resume polling. A completed result displays the original and generated image with an AI visualization label and the original product details. Provide download, try another garment, change photo and delete actions. A failed or expired result shows the reason and a clear path forward.

Try another garment can reuse the current photo only with an explicit action in the same session. Never reuse photos across sessions or silently apply another shopper's image. Download remains available only during the application's retention window; a downloaded copy belongs to the user and cannot be deleted remotely by the application.

## Backend and data boundaries

Proposal layout: `frontend/`, `backend/`, `data/` and `tests/`. Use SQLite for products, assets, sessions and durable generation jobs; private local directories for file bytes. Keep product, image and job logic shared across the two workflows. No new microservices, vector database or general-purpose AI framework.

Minimum records:

- Product: ID, SKU, merchant-entered fields, category, draft/published revision, original try-on reference asset per revision and timestamps.
- Asset: ID, kind, private file location, ownership/session, product/revision link, dimensions, source PDF/page/crop, approval and expiration.
- Job: ID, operation, owner, immutable input asset/revision IDs, idempotency key, provider prediction ID, status, output/error and timestamps.
- Session: random opaque token stored in an HttpOnly cookie, role and expiration. Personal assets are never authorized by ID alone.

Persist upload/source relationships so cleanup does not delete an asset still required by a running job. Serve private files through authorized endpoints; expose only approved public catalog assets. Prevent arbitrary filesystem paths or external URLs from becoming upload references. Strip unneeded metadata and avoid logging images, prompts containing personal details, session tokens or secrets. Validate provider results and bounded image downloads before saving them; a provider output URL must not turn the backend into an arbitrary URL-fetch proxy.

Use a single local worker loop and persisted jobs rather than a separate message broker. Recover submitted jobs by their provider prediction IDs. A crash between submission and saving that ID is ambiguous: flag for operator review and do not automatically submit a second paid request. Repeated client submissions with the same idempotency key return the same job. Retry after a known failed generation is an explicit new paid request.

Proposed API groups: product management and publication; photo/PDF upload and page/crop preview; catalog generation; personal upload; and private assets/deletion. Preserve `POST /style-it/generate` with `user_image_id` and `product_id`, and `GET /style-it/jobs/{job_id}` for shopper jobs. All routes enforce role, ownership, input bounds and appropriate origin checks. Document actual schemas in FastAPI OpenAPI.

## Provider integration and cost

Proposal: FASHN direct, using Product to Model for merchant catalog images and Try-On Max for personal images, subject to representative garment tests. Both endpoints were documented as Preview when researched. Supporting a category in the UI is not a promise that the provider reproduces it correctly. Source links and retention findings are in the baseline; re-check the exact schemas and current pricing before implementing calls.

Send private inputs as data URIs or suitably short-lived access URLs; for local-only hosting data URIs avoid exposing a public file server. Request base64 outputs when supported to reduce provider output availability. Keep all credentials in backend environment configuration. A missing API key produces an honest provider-not-configured state. A clearly labelled fixture mode can test UI/backend states but must never pretend to be a live personalized result.

Proposal initial settings: one output per request, bounded local concurrency and no unattended paid retry. Define an explicit generation allowance before live testing; with no configured allowance, paid submissions remain disabled. Record model/settings and consumed job allowance for reproducibility. A request-count ceiling limits calls but is not an exact currency spend guarantee; show the distinction. Actual monetary budget must be set with current provider pricing.

## Photo lifetime and deletion

Proposal: internal tests with consenting adults only; personal inputs and outputs expire one hour after upload, with an explicit delete action at any time. Retain enough job metadata to explain expired results without keeping personal image bytes. Cleanup runs periodically and at startup. Expiration prevents new submissions immediately, cancels local queued jobs, and denies access even if file removal is delayed. A result from an already-running request must be discarded if its input/session has been deleted or expired.

Keep merchant catalog files until the merchant deletes them, subject to references from published revisions. Prevent deleting images from an active published gallery without unpublishing or replacing them. Deleting personal content also clears session-visible previews. State clearly that application deletion does not promise immediate deletion of provider processing copies or persistent request metadata; disclose the provider policy before consent.

## Verification and success

Before calling image quality acceptable, test a small fixed set of consented subjects and licensed products across sarees and suits, including intricate borders, prints, embroidery, component visibility and difficult draping. Record success/failure, identity/anatomy, garment fidelity, latency, settings and cost. Reject outputs with changed product-defining details for publication. Do not announce a measured quality rate until evaluated.

Functional acceptance:

- A merchant can create a product from a photo and separately from a PDF selection; invalid inputs have actionable errors.
- A generated output stays private until explicitly approved and published, and a new revision never inherits approval.
- A shopper can browse, select, consent, upload, generate, compare, download, retry and delete without developer assistance, once the provider is configured.
- Missing configuration, unsuitable photos, corrupt PDFs, provider failures, timeouts, refreshes and expired sessions have honest recoverable states.
- Cross-session photo/job access is denied; private PDFs cannot appear as public catalog assets; duplicate submission does not create a duplicate paid job.
- Cleanup prevents access after expiration and discards late results after deletion.
- Keyboard operation, focus return, labelled controls, announced statuses, readable contrast and narrow-screen layouts are verified.

Automate input validation, crop bounds, asset authorization, publication transitions, duplicate job handling, provider response validation and deletion/late-result behavior. Use mocked provider responses for deterministic tests and separately record a live quality evaluation. Manually inspect the merchant and shopper flows at desktop and mobile sizes. Include a README with setup/run/test commands, required keys, model settings, golden examples, limitations and license notes.

## Choices included in approval

The user has confirmed local Next.js + FastAPI and photo/PDF inputs. Their design approval additionally selects manual PDF page/crop selection and manual metadata entry; a guided try-on chat; download rather than email delivery; one local merchant workspace; internal consenting-adult tests; the one-hour personal-photo lifetime; original garment references for personal try-on; and FASHN as the initial provider candidate.

No paid API calls will run until credentials and an explicit allowance are configured. No sample imagery is claimed to be supplied, licensed or tested yet. An existing team repository can be supplied before implementation; this design does not authorize modifying another project.

## Left to the builder

Choose pinned compatible library versions, the PDF renderer/crop implementation, the local person detector, component structure, responsive breakpoints, worker polling intervals, error-code names, file organization inside the selected layers and focused test fixtures. Verify their current documentation and licenses. Prefer existing project conventions if a shared repository is supplied. Keep these implementation choices out of product-facing screens.
