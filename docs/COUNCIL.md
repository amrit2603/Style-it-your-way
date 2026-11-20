# What baseline should Style It Your Way use

## Single-store prototype first, subject to the user's deployment choice

This internal Council review used five independent perspectives and a separate chairman. Advisors reasoned from the supplied task summary; they did not benchmark services or review reference imagery. Visual findings are recorded separately in `reference/DESIGN.md`.

| Advisor | Perspective | Recommendation | Confidence |
| --- | --- | --- | --- |
| 1 | Product scope | Merchant upload/generate/review/publish and shopper select/photo/try/retry/save | High on scope; medium on fidelity |
| 2 | Privacy | Server-only provider calls, ownership checks, private photos and deletion | High |
| 3 | Feasibility | Separate asynchronous catalog and personal try-on flows; garment evaluation first | High on architecture; uncertain output quality |
| 4 | Merchant workflow | Group views under one product and approve each generated image | High |
| 5 | Delivery | Follow the shared Python stack if needed; avoid a second runtime otherwise | High for single-instance pilot; medium on model feasibility |

## Chairman's verdict

Build a single-store pilot with two asynchronous flows: merchant catalog generation and shopper virtual try-on. First test the paid API on representative saris and suits; garment fidelity determines whether the product is viable.

Merchants upload grouped views, generate, review and explicitly publish approved results. Shoppers select a garment, consent to photo processing, upload, generate, retry and save. Share asset/job handling; keep credentials server-side and personal images private.

The key tension is stack alignment versus operational simplicity: Next-only avoids a second runtime, while Next plus FastAPI follows the documents' proposed foundation. Vendor fidelity and real-photo handling remain unverified. Results are appearance previews, not fit predictions.

## Consensus and dissent

All advisors support review before publication, private personal results and early fidelity evaluation. No advisor claims sarees or suits are solved. The delivery advisor challenges an automatic FastAPI choice when all inference is external; this is a real tradeoff, not a reason to ignore a shared team backend.

## My Take

Prove the two image operations before investing in a broad chat assistant. Keep the upload and publication workflow independent of the provider so an unsuitable endpoint can be replaced without redesigning the user journey. The single-store proposal still needs the user's confirmation because the request mentions any shopkeeper.

Next step: choose standalone prototype versus hosted merchant pilot and establish whether a shared VYUMI repository exists.

Skipped commercial model benchmarking and real-image tests. The central risk is an attractive output that alters the actual garment.
