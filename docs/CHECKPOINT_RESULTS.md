# Platform expansion test checkpoints

## 1. Shared backend — passed locally

21 November 2026: 128 backend tests passed, including all 112 pre-existing regressions and 16 new commerce/service cases. Ruff passed. No new frontend or GPU runtime was needed for these tests.

Verified: migration of old sessions without losing data; customer/admin roles and hashed passwords; login throttling/origin/CSRF checks; API-prefix/admin compatibility routes; filters/pagination; server-priced transactional orders, replay and ownership; immutable order details after product archive; allowed order-state transitions; reusable photo permissions/private access; selected stock photo forwarded as the actual GPU person input; multipart upload/job replay; local room-composite output with no paid allowance; fixed-origin GPU authentication/timeout/retry contract. Existing PDF, revision/publication, private asset, expiry and deletion tests remain passing.

## 2. Kaggle/Colab notebook — local checks passed; CUDA test pending

Both notebook schemas and every code cell parse correctly. Three independent GPU-server contract tests pass with an explicitly labelled CPU test predictor: authentication, image decoding, unsupported-category rejection, person/garment ordering, replay without a second predictor call, and prevention of re-inference after an output leaves the two-image memory cache. The runtime is separate from the backend and uses pinned upstream model/source/checkpoint revisions. Colab is the user's available GPU target; a dedicated Colab notebook is supplied.

No real Colab/Kaggle install or CUDA inference has been executed in this local Windows session. The notebook contains a real-inference self-test before tunnel setup; do not mark this checkpoint GPU-verified until that cell succeeds and the result is inspected. IDM-VTON licensing is noncommercial, and saree/body/identity fidelity remains unbenchmarked. First setup includes multi-GB downloads and a Detectron2 build; latency/availability are not guaranteed.

## 3. Independent admin app — not started

Await the notebook GPU checkpoint, following the user's requested build/test order.

## 4. Independent customer app — not started

Await the admin checkpoint. The current storefront/merchant prototype remains in `frontend/`.
