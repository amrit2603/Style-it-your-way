# Local platform setup

Use Node.js 22+, uv and Windows PowerShell. Copy `.env.example` to `backend/.env` only if that private file does not already exist. Preserve existing credentials/data. Set a unique `VYUMI_ADMIN_EMAIL` and strong `VYUMI_ADMIN_PASSWORD` (12–128 characters); the backend bootstraps an owner only when the email is new. It never promotes an existing customer or resets a password.

```powershell
.\scripts\start.ps1 -Platform
```

Later use `-SkipInstall`. API: 8000; original prototype: 3000; admin: 3002; customer: 3003. All bind to loopback. Ctrl+C stops processes owned by this launcher. Do not run a second launcher over occupied ports. Live data stays under `data/live`; `-Demo` uses separate `data/demo` and explicitly fixed AI samples. The same private bootstrap settings apply to the separate demo database.

Admin flow: sign in → Products → Add product → enter price/options/category → upload photos or PDF → confirm original → Photo library → Create preview → Review & publish. Library photos require reuse permission. Generated inputs stay private until explicitly approved for publication. The library generation screen uses a front photo; use the product editor for separate catalog poses.

Customer flow: Shop → product → select size/color and add to cart, or Try it on me → consent → upload. Upload starts a private generation automatically. Each side/back view needs its own matching photo and garment reference. Use Style an outfit separately to combine compatible clothing. Sign in/create an account for checkout; orders are unpaid and do not reserve inventory.

## Real GPU connection

Open the repository's Colab notebook. Connect a GPU, run setup and the credential-free CUDA/API self-test. Enter `VYUMI_GPU_TOKEN` and `NGROK_AUTHTOKEN` privately when prompted. Keep the runtime alive. Put its HTTPS origin in `VYUMI_KAGGLE_API_URL`, the matching GPU token in `VYUMI_KAGGLE_API_TOKEN`, and select `VYUMI_TRYON_PROVIDER=kaggle` in `backend/.env`; restart the backend. Never paste keys into chat or frontend settings. Both Colab and Kaggle use this adapter name.

The independent T4 test passed; website tunnel connection remains pending. Health does not establish garment, identity or body fidelity. IDM-VTON is noncommercial; obtain a commercially cleared provider before store deployment. Shoes/watches use the configured catalog image editor; room compositing is an explicitly labelled CPU demo.

## Container alternative

With Docker Desktop running and `backend/.env` configured, run `docker compose up --build`. Use ports 8000/3002/3003; the original prototype is excluded. The named volume persists data; do not remove it to upgrade. Secrets are injected at runtime and excluded from build contexts. Compose configuration was validated; images/runtime were not tested on this machine.

## Checks

Run backend pytest/Ruff, then each app's production build and browser suite independently. Browser suites own ports 3001/8001 and isolated fixture databases, and must not overlap. Stop live dev servers first. Run `scripts/start.ps1 -Platform -SkipInstall` afterward.

See [checkpoints](CHECKPOINT_RESULTS.md), [GPU setup](../notebooks/README.md), [sample inputs](../sample-data/README.md) and [backend routes](BACKEND.md). This is one local store workspace, with no payment gateway, inventory reservation or public multi-tenant deployment.
