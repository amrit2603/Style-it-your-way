# VYUMI Style It Your Way

Local Next.js/TypeScript storefront and merchant studio with FastAPI, SQLite and private local files. The user's design reference is the supplied Panna storefront. Preserve that visual system in DESIGN.md.

## Working rules

- Read PRODUCT.md and docs/IDENTITY_EVALUATION.md before changing generation behavior. Successful API status is not proof of face or garment fidelity.
- Never print, commit or copy credentials into browser code. Private settings live in backend/.env.
- Keep personal photos/results session-private with consent, expiry and deletion. Originals start private; publication requires explicit review.
- Personal generation sends this shopper's photo first, followed by confirmed original garment references. Never substitute a catalog model photo for the shopper.
- Product categories/audiences and generation fields must stay consistent across backend schemas, frontend types, forms, providers, fixtures and tests.
- Preserve existing SQLite data; additive SQL migrations live in backend/migrations and must be repeatable through the migration runner.
- Fixture results are visibly labelled fixed samples. Never describe them as personalized results.
- The user delegated implementation and asked to avoid repeated approval gates. Complete authorized local work without adding new approval flows.

## Verification

`uv run --project backend pytest backend/tests -q`

`uvx ruff check backend/app backend/tests scripts --config backend/pyproject.toml`

`npm --prefix frontend run build`

`npm --prefix frontend run test:e2e`

Browser tests use isolated fixture servers on 3001/8001. Stop the owned 3000 dev server before running them because Next's dev lock is shared. Start the live local app with scripts/start.ps1 -SkipInstall after checks. No public deployment or multi-tenant access is implemented.
