# Platform expansion checkpoints

Build in the requested order: backend, Kaggle notebook, separate admin app, then customer app. Each checkpoint must pass its independent checks before the next starts. Existing local products, photos, reviews and order privacy must survive migrations.

1. Backend: account/password authentication and roles; public product filters; server-priced orders; admin product aliases; reusable model/room libraries; catalog generation from selected library images; authenticated Kaggle adapter; explicitly labelled local room compositing. Verify with isolated API tests, migration/replay tests and the existing regression suite.
2. Kaggle: notebook plus shared GPU server using official IDM-VTON preprocessing/inference, bearer authentication, bounded uploads, request idempotency and health. Verify notebook/code syntax and the HTTP contract locally; real CUDA inference must be reported separately and requires a running Kaggle session.
3. Admin: independent Next.js app using the shared API, email/password auth, dashboard, products, libraries, generation/review/publication and orders. Verify build and browser workflow against fixture API.
4. Customer: independent app with shop filters, product pages, private try-on/room previews, comparison, cart, account/checkout and order history. Verify build and browser workflow; preserve existing product-specific styling unless explicitly superseded by the new client flow.

The local prototype uses HttpOnly sessions and CSRF checks rather than adding a second JWT authentication system. Credentials remain in private environment files. IDM-VTON is an educational/noncommercial demo integration under its upstream CC BY-NC-SA license, not a commercially cleared production model. No fixed inference time, saree/body fidelity or perpetual free GPU availability is promised.
