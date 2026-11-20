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
