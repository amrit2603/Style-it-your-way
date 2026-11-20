# Local application API contract

Frontend calls `/api` on its own origin; Next rewrites to FastAPI. JSON errors: `{detail:{code,message}}`. All successful JSON has the shapes below. Private file URLs are same-origin `/api/assets/{id}`; public ones `/api/public/assets/{id}`. No caller supplies a filesystem path or remote URL.

## Sessions and readiness

- `POST /sessions` empty JSON -> `{role,csrf_token}` and HttpOnly cookie. Reuses a valid session.
- `GET /sessions/current` -> same; 401 if absent/expired.
- `POST /merchant/session` `{token}` -> merchant session and `{role,csrf_token}`. Token is a local backend setting; show a token entry form, never embed it in client code.
- `POST /sessions/logout` -> `{ok:true}`.
- Every other mutation sends `X-CSRF-Token` matching the current session. Reject foreign Origin headers. Session creation/login also reject foreign Origin.
- `GET /health` -> `{status:'ok',provider_ready:boolean,provider:'Cloudflare'|'Gemini'|'FASHN'|'FASHN demo',catalog_provider:string,catalog_ready:boolean,validator_ready:boolean,generation_mode:'live'|'fixture',remaining_allowance:number}`. Readiness is operation-specific: provider_ready describes personal try-on; catalog_ready describes catalog generation. A missing required key or allowance disables the corresponding operation. Readiness means configured locally, not verified provider quota. VYUMI_TRYON_PROVIDER=fashn_demo needs no key; fashn needs the paid FASHN key; primary follows catalog configuration. Cloudflare credentials take precedence, followed by Gemini, then FASHN; partial Cloudflare credentials disable generation. There is no automatic paid provider fallback. Fixture mode is explicitly watermarked, never a personalized result.

## Product shape

`Product = {id,version,sku,name,category,audience:'women'|'men'|'unisex',description,price_minor:number|null,currency,sizes:string,published:boolean,reference_id:string|null,images:Image[]}`.
`Image = {id,url,kind:'original'|'generated',role:'main'|'reverse'|'detail'|'left'|'right',approved:boolean,public:boolean}`. No private reference ID is present in public Product responses. Public images contain only published gallery entries.

- `GET /merchant/products` -> `Product[]`.
- `POST /merchant/products` `{sku,name,category,description,price_minor?,currency:'INR',sizes?}` -> Product.
- `GET /merchant/products/{id}` -> Product.
- `PUT /merchant/products/{id}` same details plus `{version}` -> updated Product (409 on stale version). Source changes create a draft revision; existing public snapshot stays unchanged.
- `POST /merchant/products/{id}/images` multipart `{file,role}` -> updated Product (10 references maximum). Originals start private; the merchant separately selects any originals to display publicly. All published products still need an approved generated image.
- `POST /merchant/products/{id}/reference` `{asset_id,version}` -> updated Product; requires an original.
- `POST /merchant/products/{id}/images/{asset_id}/review` `{approved:boolean,public:boolean,version}` -> Product; originals can have visibility selected, generated approval applies to exact asset/revision.
- `POST /merchant/products/{id}/publish` `{version}` -> Product; requires confirmed original reference and approved generated gallery image.
- `POST /merchant/products/{id}/unpublish` empty JSON -> Product.
- `GET /products` -> published Product[]. Optional `category` and `audience` filters. Men/women include unisex garments. Categories: saree, suit, shirt, top, trousers, skirt, dress, kurta, jacket and lehenga.
- `GET /products/{id}` -> published Product, 404 for draft/unpublished.

Merchant GET product/list responses additionally include `status: Draft|Generating|Needs review|Published` and the current revision's `latest_job: Job|null`, so the studio can resume work after navigation or refresh. Personal jobs are never included in merchant catalog responses.

## PDF catalog

- `POST /merchant/pdfs` multipart `{file}` -> `{id,name,page_count}`.
- `GET /merchant/pdfs/{id}/pages/{page}?thumbnail=true` -> image/jpeg, page is zero-based. Thumbnail optional; full page max side 4096.
- `POST /merchant/pdfs/{id}/crops` `{product_id,page,x,y,width,height,role:'main'|'reverse'|'detail'|'left'|'right'}` -> updated Product. Coordinates normalized to rendered upright page. Whole page is 0,0,1,1. Selected crop must meet image limits. Merchant creates product first then imports selected catalog regions.

## Jobs and personal photos

- `POST /merchant/products/{id}/generate` `{version,prompt?,presentation?:'women'|'men'|'unisex',scene?:'studio'|'daylight'|'outdoor',view?:'front'|'back'|'left'|'right',idempotency_key}` -> Job.
- `POST /style-it/photos` multipart `{file,consent:'true',height_cm?,weight_kg?,body_width_cm?,usual_size?,view?:'front'|'back'|'left'|'right',purpose?:'person'|'room'}` -> `{id,url,expires_at,checks:{accepted,code,message}}`. Requires permission/processing consent and actual validator acceptance in live mode. Fixtures explicitly labelled. Min personal short side 128, max 25MP, max 10MiB. Accepts JPEG/PNG/WebP/HEIC/HEIF/AVIF. One detected face/body is sufficient; framing/lighting can return code photo_advice with accepted:true. Group/non-person images remain rejected. Merchant references still need min short side 512.
- `POST /style-it/generate` `{user_image_id,product_id,additional_product_ids?:string[],view?:'front'|'back'|'left'|'right',idempotency_key}` -> Job. Uses immutable original reference from current published revision, not an AI-generated catalog image.
- `GET /style-it/jobs/{id}` -> Job. Personal jobs are owner-only; merchant-role sessions may inspect catalog work in the one local merchant workspace.
- `Job = {job_id,view:'front'|'back'|'left'|'right',operation:'catalog'|'tryon',status:'queued'|'submitting'|'processing'|'completed'|'failed'|'expired'|'cancelled'|'needs_review',result_image_url?:string,error_code?:string,message?:string,fixture:boolean,expires_at?:number}`.
- `GET /assets/{id}` -> private image/file, role/session authorization; `?download=true` sets download disposition.
- `DELETE /assets/{id}` -> `{ok:true}`; personal deletion clears dependent outputs/jobs and late results are discarded; protected product sources return 409 until no published references remain.
- Input and personal result expiration is one hour from input upload. Status must display expiry and use real server states. Height/size are informational only.

## Development fixtures

Fixture backend mode is opt-in and visibly flagged by health, jobs and output watermarks. It can seed a licensed/generated sample catalog for UI review, but no fixture output is presented as a real personalized result. Browser tests use an isolated database and explicit fake detector outputs. The default live backend never bypasses missing person checks or missing provider configuration.

Outfits allow up to three distinct, compatible published garments. Jobs snapshot original asset references, provider, scene and presentation in the migrated context column. Paid FASHN currently supports single garments only. The public FASHN demo applies complementary garments sequentially, feeding each output into the next pass. Shared quota can interrupt a sequence; no partial result is published. See IDENTITY_EVALUATION.md.

Shoes, watch and furniture extend the category enum. Personal view must match upload metadata; furniture requires purpose=room, while wearables require purpose=person. Measurements are optional user-supplied context (height 80–250 cm, weight 20–400 kg, shoulder/body_width 10–150 cm, size at most 80 characters), never inferred anthropometrics. Room uploads skip person detection but cannot generate wearable previews. Accessory/room jobs use the primary reference-image editor, not the clothing model. Published snapshots retain hidden original references for angle matching; public product/file responses continue filtering them.
