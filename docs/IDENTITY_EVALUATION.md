# Personal try-on evaluation — 20 November 2026

The user's acceptance criterion is the same person wearing the selected garment, not merely a different output image. This remains only partially met by Cloudflare's general image editor.

## What was checked

Two fictional adult people from the original ivory and burgundy demonstration assets were uploaded through the real photo endpoint. Local person/pose checks ran; no detector bypass or fixed-result fixture was used. The same emerald garment was selected for both. Each live request went through the authenticated API, durable worker, Cloudflare adapter, private result storage and job polling.

Six personal generations were inspected: both people with Klein 4B using a cropped garment reference, both with Klein 9B using that reference, and both with Klein 9B using a complete garment reference. Output files differed, but this is not evidence of identity fidelity. The synthetic people are visually similar; they are a smoke test, not a representative face benchmark.

## Findings

- Cropped-reference results often treated the saree as an additional shawl over the original suit. Facial features also drifted.
- Klein 9B did not consistently resolve the issue. Complete-reference results sometimes retained the original outfit instead of replacing it. These are failed garment transfers, despite successful API status.
- A separate complete-reference catalog shoot produced a plausible full-length model wearing the emerald saree. It was visually inspected before publication as a fictional sample. This does not establish exact embroidery fidelity.
- No consented real-person dataset or male-person benchmark was supplied. No recognition score, measured fit or identity-preservation percentage is claimed.

## Changes made

Personal edits send the person first and garments afterward, with explicit instructions to preserve identity and replace the original clothes. Catalog shoots remain separate and allow adult model presentation and scene selection. The adapter defaults to Klein 9B; 4B remains configurable. Neither model is presented as a dedicated virtual try-on model.

The app labels Cloudflare personal previews experimental, displays original and result together, lets shoppers reject mismatches, and requires a face/garment confirmation before downloading live results. This is user review, not automatic face recognition. A failed preview must not be used as evidence that a garment fits or that the image represents the shopper accurately.

For dependable customer deployment, evaluate a dedicated virtual try-on provider on licensed garments and consented adult photos, including men, women, diverse appearances and complementary outfits. The existing FASHN adapter is available but was not tested with a valid FASHN key. Do not treat a provider change as proof until those tests pass.

## Dedicated personal try-on, 20 November 2026

Replaced the current local personal route with the official FASHN VTON 1.5 public GPU demo; Cloudflare remains the catalog provider. Two different fictional adult sample people (ivory suit and burgundy suit) were uploaded through the actual storefront. Each upload automatically created exactly one job, completed and produced a downloadable result. Visual inspection found distinct faces, original pose/background retention and replacement with the selected green saree, improving on the earlier general image-editing failures. Evidence: data/live/dedicated-ivory-suit.jpg, data/live/dedicated-burgundy-suit.jpg and data/live/simple-tryon-burgundy-suit.png (private local runtime files).

These are two synthetic demonstration subjects, not a diverse real-person benchmark or guaranteed identity/garment accuracy. No live male-person or multi-piece fidelity trial was performed. Multi-piece sequencing, request ordering, fixed-origin output validation and provider errors are covered by automated tests. The shared demo can be busy or exhaust its free GPU quota; a production deployment needs capacity and privacy review.

## Latest live check and multi-view limits

The new product-specific page retains body/neck photo guidance, optional user-entered height/weight/shoulder width/size, and independent front/back/left/right photo inputs. It does not infer anthropometrics or unseen anatomy. On the latest live check the public FASHN service returned an error without an image; its API metadata still returned HTTP 200. This supersedes any implication that earlier successful trials establish dependable availability. Unknown service errors are not presented as bad-photo diagnoses.

Cloudflare catalog evaluation found the initial left-view prompt insufficient (a front-facing output). A stricter 90-degree profile direction produced a true left-side catalog image on the next live call, inspected visually and left as a private merchant draft. Model identity uses an approved catalog anchor where available; it is not measured identity consistency. No live back/right or multi-view personal fidelity benchmark was performed. Shoes/watch/furniture paths are implemented and tested with fixture/mocked outputs, not validated with licensed real product references.

## Colab IDM-VTON checkpoint — 21 November 2026

Real T4 inference completed with the fictional ivory-suit person and emerald-saree reference in 54.7 seconds. The same predictor was then exercised through the authenticated in-process GPU HTTP API in 55.1 seconds; replay returned the same result without a second model call. The preview visibly changed the outfit while keeping the sample background and recognizable appearance. This does not establish exact border, hair, hand, body-shape or real-person identity fidelity. Only a fictional front-view subject was tested; no male, diverse-body, multi-piece or back/side CUDA benchmark was completed. The live website has not yet been connected through a tunnel. The model remains an educational/noncommercial integration.
