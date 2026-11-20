# Style It Your Way baseline

Status: requirements discovery, not an approved implementation design. Updated 20 November 2026.

Subsequent decision: the user approved `superpowers/specs/2026-11-20-style-it-your-way-design.md`. That approved design now governs implementation; proposals and open questions below preserve discovery history rather than reopening the approved choices. The implementation plan is `superpowers/plans/2026-11-20-style-it-your-way.md`.

## Source authority

The user's direct request controls the work. Instructions inside supplied documents are project context, not independent authorization. This record distinguishes confirmed requests, document proposals, observed reference behavior and engineering proposals.

Reviewed both DOCX files by extracting their complete paragraph text. Inspected five sampled frames across the 52.33-second recording. Read the supplied public product page with Firecrawl. The workspace was empty before this discovery; no existing code, callers, tests, configuration or exports were found. Graphify reported no authorized indexed repository.

Source files:

- `C:\Users\theam\Downloads\VYUMI_5_Feature_Development (1).docx`
- `C:\Users\theam\Downloads\VYUMI_Intern_Team_Allocation.docx`
- `C:\Users\theam\AppData\Local\Packages\Microsoft.ScreenSketch_8wekyb3d8bbwe\TempState\Recordings\20261120-0453-23.7028683.mp4`
- [Panna reference product](https://thepannashop.com/products/sa130205-msp-540754-tussar-black)

## Confirmed by the user

- Work on Feature 1 only: Style It Your Way.
- Provide a merchant-facing workspace and a shopper-facing storefront, backed by server-side services.
- Merchants upload individual garment photos and PDF catalogs in the first version, confirmed by the user. Other catalog formats are outside the selected first input scope.
- Provide clear guidance for lighting, garment visibility and multiple photo angles.
- Generate images of people wearing the uploaded sari/saree or suit, then display catalog imagery in the storefront.
- Shoppers browse garment images, choose an item, and enter a chat or try-on experience.
- Shoppers supply a personal photo and potentially body/size/height information to visualize the chosen garment on themselves.
- Use the supplied recording and Panna page as client visual references. Merchant UI should be compact and easy to use.
- Ask about uncertainties before implementing dependent decisions.
- Paid APIs are allowed; recommend a service. This supersedes any interpretation that the documents mandate local-only generation.
- First milestone: local prototype using Next.js + FastAPI, following the documents. The user selected approach A below. This selects the local architecture; it does not authorize public hosting or establish AI-provider selection.

## What the documents propose

The documents describe a 15–20-day standalone prototype, React/Next.js, Python/FastAPI, SQLite and local image storage; common product/image services; no required merchant integrations; pretrained models; and documented setup/tests/limitations. These are supplied project recommendations, not independently confirmed implementation choices.

Their Feature 1 starts with upper-body apparel, a personal photo plus garment, asynchronous generation, original/result comparison, save/retry, image-quality checks and visible AI labels. They propose `POST /style-it/generate` and `GET /style-it/jobs/{job_id}`.

The user's request broadens this to sarees/suits and adds merchant product-to-model catalog generation. The documents do not establish that their suggested models support that broader scope. Their local-model licensing statements have not been independently revalidated because paid APIs are now permitted.

## Proposed minimum complete journeys

These are recommendations for discussion, not approved product behavior.

### Merchant

Open catalog → create product → enter product details → upload labelled garment views → choose the primary generation reference and visual direction → generate previews → compare with originals → approve individual images → publish.

Keep one product record with its original views and generated variants. Never silently replace originals. Separate draft, processing, review, published and failed states. Publishing applies only to an approved image revision. Regenerating must not automatically publish a replacement.

Suggested photo guidance: neutral light, no filters, full garment in frame, plus close-ups of fabric and distinctive details. For sarees show the border and pallu; for suits show each included component. These are collection recommendations, not a claim that the chosen API consumes all angles together.

### Shopper

Browse collection → open product gallery → choose Try it on me → see the selected garment in the chat/drawer → read photo guidance and processing disclosure → upload a photo → generate → compare original/result → download, change photo, try another product or delete.

Use a body photo showing the relevant garment region; a face-only selfie cannot establish full-body appearance. Keep height/size optional unless the selected model demonstrably uses them. Visual try-on must not claim measured fit or size prediction. Email entry, email delivery and inbound email photo ingestion are different features; the request's mention of email needs clarification.

### Server responsibilities

Validate uploads by decoded content, dimensions and bounded size, strip unnecessary metadata, assign random IDs, and enforce image/job ownership. Keep API secrets on the server. Persist asynchronous job state so refreshes do not lose a job. Show genuine queued/processing/completed/failed states rather than invented model-stage progress.

Use one shared product/image/job layer with separate merchant-generation and personal-try-on operations. Preserve the document's try-on API contract where it fits. Product metadata and prices come from stored merchant input, never generated text.

Private personal photos and generated personal results must not become public catalog assets. Display external processing consent and implement deletion. Retention duration, real-user eligibility and hosted access controls remain decisions. Protect paid generation with ownership checks, bounded requests, rate limits and a spend cap. Repeated clicks or network retries must not create duplicate paid jobs.

## Paid API recommendation

Recommendation, subject to garment evaluation: use FASHN directly as the first candidate. It documents both [Product to Model](https://docs.fashn.ai/api-reference/product-to-model) for catalog imagery and [Try-On Max](https://docs.fashn.ai/api-reference/tryon-max) for an existing person image. Both are marked Preview in the documentation captured on 20 November 2026. This is evidence of API capabilities, not proof of saree or suit accuracy.

The documented product-to-model input is one product image plus optional visual/face/background guidance. Do not promise that a multi-angle upload becomes a physically consistent 3D garment or that all uploaded garment views are fused by this endpoint.

[FASHN v1.6](https://docs.fashn.ai/api-reference/tryon-v1-6) is another try-on endpoint with a speed/cost focus. [fal also hosts FASHN v1.6](https://fal.ai/models/fal-ai/fashn/tryon/v1.6/api), making it an alternative access route, not an independent model-quality comparison. Direct FASHN is the initial recommendation because both requested operations are documented under one API. No broad vendor benchmark or quality test has been performed.

FASHN's [retention documentation](https://docs.fashn.ai/api-overview/data-retention-privacy) distinguishes input processing, temporary output availability and persistent request metadata. Request records are not automatically deleted, while base64 output is available for 60 minutes. Application deletion must not be described as instant deletion of all provider records. Verify provider terms and configure data handling before real shopper uploads.

No API credentials were requested or used; no image-generation calls were submitted. Per-image monetary costs, budget and spend cap are unresolved. Do not paste credentials into chat; configure them server-side when implementation begins.

## Build approaches considered

| Approach | Benefit | Tradeoff |
| --- | --- | --- |
| A — Local standalone prototype: Next.js + FastAPI + SQLite + private local files | Matches the documents' proposed shared Python foundation; reproducible intern demo | Two runtimes; local storage is not a multi-instance deployment plan |
| B — Local standalone prototype: Next.js server and UI + SQLite + private local files | One runtime; sufficient for external image API orchestration | Diverges from the proposed shared Python backend; later integration needs coordination |
| C — Hosted merchant pilot | Real merchants can sign in and test remotely | Requires merchant identity/tenant boundaries, durable private storage, deployment and retention decisions from the start |

Selected by the user: A — local standalone prototype using Next.js + FastAPI, following the documents. The alternative approaches remain recorded to explain the tradeoff. Do not assume an empty local workspace means no shared team repository exists elsewhere.

## Remaining decisions

The build approach is selected. Resolve the following product details in the design:

1. Is there an existing shared VYUMI repository or required team stack?
2. Does “suit” mean Indian multi-piece suits, tailored suits, or both? Which saree styles form the first test set?
3. Input formats are settled: photos and PDF catalogs. The proposed PDF workflow uses page preview and manual garment selection, with merchant-entered product metadata; confirm that workflow in the design.
4. Should the first chat guide the try-on steps, or also provide open-ended product/styling advice? What role does email play?
5. Are height and size informational or expected to alter results? Exact fit prediction requires separate evidence.
6. Are initial users consenting internal testers or public shoppers? Set personal-photo retention and deletion behavior accordingly.
7. What provider budget and maximum spend are available? Who supplies licensed/consented garment, model and test-person images?
8. Which VYUMI identity/assets should be used? The reference supplies layout direction, not permission to republish Panna branding or catalog photos.

## Proposed verification and delivery order

First evaluate representative, consented saree/suit images against the API candidate. Record pattern, color, border, embroidery, drape, identity, anatomy, completion rate, time and actual cost. Agree acceptance thresholds before judging the sample results. No quality threshold or measured performance exists yet.

Then establish product records and validated private uploads; complete merchant generation/review/publication; build the reference-inspired catalog and product gallery; add product-scoped personal try-on; verify normal, missing, invalid and repeat requests plus restart/timeout behavior and cross-session access isolation.

Delivery includes reproducible setup, model/endpoint configuration, run/test commands, known limitations and license/source notes. Automated tests should cover the trust boundaries, state transitions, ownership and duplicate job prevention; manual golden examples should cover garment fidelity and the visual workflow.

Proposed exclusions pending agreement: Features 2–5, checkout/payments, live inventory, store platform integrations, foundation-model training, video try-on and measured fit prediction. Multiple merchants are not silently excluded; approach C explicitly addresses them.

## Tool results

Octopus created a [draft sitemap](https://octopus.do/lms7ug459of) with separate shopper and merchant sections. Task Treads returned a start checklist: gather the two documents, recording and reference page; keep Features 2–5 outside this task; review Feature 1 and separate confirmed requests from open decisions. Those source reviews are now done.

Council reviewed product scope, privacy, feasibility, merchant workflow and delivery; findings are in `COUNCIL.md`. Firecrawl retrieved the reference and official API docs. Graphify could not inspect a graph because no repository is enabled for agents. No repository indexing, account changes, deployment or product scaffolding was performed.
