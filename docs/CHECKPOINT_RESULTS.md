# Platform expansion test checkpoints

## 1. Shared backend — passed locally

21 November 2026: 135 tests passed, including all 112 pre-existing regressions, 20 commerce/service cases and three independent GPU-contract cases. Ruff and the existing storefront TypeScript check passed. No new frontend or GPU runtime was needed for these local tests.

The existing Next.js production build passed. The browser suite passed eight cases initially; two failed during a run with intermittent local proxy resets/slow updates, then both passed in an isolated rerun. No application or test timeout was changed to obtain those rerun results. This does not establish that intermittent local proxy failures are eliminated.

Verified: migration of old sessions without losing data; customer/admin roles and hashed passwords; login throttling/origin/CSRF checks; API-prefix/admin compatibility routes; filters/pagination; server-priced transactional orders, replay and ownership; immutable order details after product archive; allowed order-state transitions; reusable photo permissions/private access; selected stock photo forwarded as the actual GPU person input; multipart upload/job replay; local room-composite output with no paid allowance; fixed-origin GPU authentication/timeout/retry contract. Existing PDF, revision/publication, private asset, expiry and deletion tests remain passing.

## 2. Kaggle/Colab notebook — local checks passed; CUDA test pending

Both notebook schemas and every code cell parse correctly. Three independent GPU-server contract tests pass with an explicitly labelled CPU test predictor: authentication, image decoding, unsupported-category rejection, person/garment ordering, replay without a second predictor call, and prevention of re-inference after an output leaves the two-image memory cache. The runtime is separate from the backend and uses pinned upstream model/source/checkpoint revisions. Colab is the user's available GPU target; a dedicated Colab notebook is supplied.

The Colab notebook connected to a T4 GPU and completed the isolated Python/PyTorch/CUDA installation, Detectron2/DensePose builds and model downloads. The first build exposed a missing `pkg_resources` dependency; pinning setuptools 69.5.1 fixed it. DensePose installation now disables dependency resolution so it cannot replace the pinned Detectron2 source. Model startup also required scikit-image and a noninteractive plotting backend. A memory-mapped conversion reduced the 11.14 GiB UNet pickle to a 5.57 GiB fp16 safetensor, after which the model loaded. The first inference reached pose processing but ran out of T4 GPU memory; text/image encoder offloading is now under test. Real image output, the authenticated live API and tunnel connection remain unverified. Do not mark this checkpoint GPU-verified until real inference succeeds and the result is inspected. IDM-VTON licensing is noncommercial, and saree/body/identity fidelity remains unbenchmarked. Latency/availability are not guaranteed.

## 3. Independent admin app — not started

Await the notebook GPU checkpoint, following the user's requested build/test order.

## 4. Independent customer app — not started

Await the admin checkpoint. The current storefront/merchant prototype remains in `frontend/`.
