# Platform expansion test checkpoints

## 1. Shared backend — passed locally

21 November 2026: 135 tests passed, including all 112 pre-existing regressions, 20 commerce/service cases and three independent GPU-contract cases. Ruff and the existing storefront TypeScript check passed. No new frontend or GPU runtime was needed for these local tests.

The existing Next.js production build passed. The browser suite passed eight cases initially; two failed during a run with intermittent local proxy resets/slow updates, then both passed in an isolated rerun. No application or test timeout was changed to obtain those rerun results. This does not establish that intermittent local proxy failures are eliminated.

Verified: migration of old sessions without losing data; customer/admin roles and hashed passwords; login throttling/origin/CSRF checks; API-prefix/admin compatibility routes; filters/pagination; server-priced transactional orders, replay and ownership; immutable order details after product archive; allowed order-state transitions; reusable photo permissions/private access; selected stock photo forwarded as the actual GPU person input; multipart upload/job replay; local room-composite output with no paid allowance; fixed-origin GPU authentication/timeout/retry contract. Existing PDF, revision/publication, private asset, expiry and deletion tests remain passing.

## 2. Colab notebook — independent CUDA/API test passed

21 November 2026: a real T4 run completed a front-view saree transfer in 54.7 seconds. A second run used the actual IDM-VTON predictor through the GPU service's in-process HTTP test client: authentication rejection, image generation and replay all passed. It reported 55.1 seconds and exactly one predictor call after replay. These are real CUDA results, not fixture predictors. Model loading time is additional. Both notebook schemas/code cells and three isolated CPU contract tests also pass.

Calibration fixed setuptools compatibility, a missing scikit-image dependency, the inherited Colab plotting backend, system-memory exhaustion from the 11.14 GiB UNet pickle and GPU-memory pressure. A memory-mapped fp16 conversion creates a 5.57 GiB local derivative; large components load individually onto CUDA, and text/image encoders use CPU offload while preserving native attention. The notebook now runs this independent test before requesting private API tokens.

The generated upper-body preview visibly replaced the ivory outfit with a green saree and retained the sample's background and recognizable appearance. This single fictional subject is not a face/garment/body-shape benchmark, and intricate border fidelity is not established. IDM-VTON licensing is noncommercial. No public tunnel was opened, the live backend has not been switched to Colab, and Colab subsequently disconnected the idle runtime. Reconnection and private tunnel configuration are still required for website-to-Colab use.

## 3. Independent admin app — passed locally

Started after the independent Colab CUDA/API test passed. The separate `admin/` Next.js production build and all four independent browser workflows passed: account roles/logout, product/model-library generation and explicit review/publication, order progression/archive history, room library and PDF import. A delayed-response test verifies that fast library-tab changes do not show stale photos. The existing storefront build and all ten regression browser checks also passed after extracting its tested product editor for reuse. Mechanical UI checks reported no findings. Desktop/mobile captures are in `.impeccable/review/admin/` (local evidence, not committed).

## 4. Independent customer app — passed locally

The separate customer production build and three independent browser workflows passed: shop/product/private styling/comparison/deletion/mobile layout; cart/account/server-priced checkout with lost-response replay and order ownership; complementary outfit selection with explicit additional original product IDs. A tampered browser cart price did not change the server-confirmed order total. All 136 backend tests and Ruff passed. All ten original storefront browser regressions passed after shared try-on changes. Desktop/mobile renders were inspected. Source UI scanning found no reported pattern issues; parsed-page contrast checks were not run.

The Kaggle outfit adapter now applies each original sequentially with stable per-stage request IDs, preserving the original shopper as its first input. Contract tests cover second-stage retry without restarting the first stage. Actual CUDA outfit fidelity is untested.

No website-to-Colab tunnel test is claimed. No real-person, full saree-border or multi-angle fidelity benchmark is complete. Docker Compose configuration parses; images were not run because Docker Desktop was unavailable. Four fictional clothing samples are bundled; merchants supply permission-confirmed stock-model/room inputs through the private library.
