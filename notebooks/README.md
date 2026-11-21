# Kaggle/Colab GPU checkpoint

For Colab, use `vyumi_idmvton_colab.ipynb` and select Runtime → Change runtime type → GPU. Secure prompts replace Kaggle Secrets. The GPU self-test runs before an ngrok token is needed; the tunnel cell requests that second token only after inference succeeds.

Open `vyumi_idmvton_kaggle.ipynb` in Kaggle, enable Internet and a CUDA GPU, and run cells in order. Colab uses the same isolated runtime with secure token prompts. First setup installs a pinned Python/PyTorch environment, builds pinned Detectron2, downloads pinned IDM-VTON and preprocessing checkpoints, then starts an authenticated loopback API.

Required private secrets: `NGROK_AUTHTOKEN` and `VYUMI_GPU_TOKEN` (at least 24 random characters). Never print, commit or paste these tokens into chat. The GPU token is distinct from the ngrok token. The notebook opens the tunnel only after its real-inference smoke test passes. Keep the notebook/runtime private and stop it when finished.

Set backend-only `VYUMI_TRYON_PROVIDER=kaggle`, `VYUMI_KAGGLE_API_URL=https://...`, and `VYUMI_KAGGLE_API_TOKEN` to the matching GPU secret. The backend retries a transient failure once with the same request ID; the service serializes inference and caches two completed outputs for up to one hour. A kernel restart clears that cache, so uncertain requests must be reviewed rather than blindly resubmitted.

The official IDM-VTON source and checkpoints use CC BY-NC-SA 4.0. This is an educational/noncommercial demo, not a commercial license clearance. The backend room compositor is an explicitly labelled approximate overlay, not a second diffusion model. IDM-VTON does not handle watches/shoes; those require the existing image-editing provider. Sarees, dresses and suits use full-outfit masks, which is an adapter setting rather than a verified quality claim.

Local independent checks cover notebook/Python syntax, GPU API authentication, category validation, decoding, person/garment order and replay without a second inference call. They use a labelled contract-test predictor, not a fake CUDA result. A real Kaggle install, CUDA inference, ngrok account availability and output fidelity must be tested in the notebook before customer use. No fixed latency or perpetual free GPU availability is claimed.
