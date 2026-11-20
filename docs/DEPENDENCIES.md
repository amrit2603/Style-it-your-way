# Dependencies and sources

Versions are pinned in the backend/frontend manifests and lockfiles. This build uses Python 3.12, Next 16.4.6 and React 19.3.1.

| Component | Purpose | License / source |
| --- | --- | --- |
| FastAPI | Typed APIs | MIT; [project](https://github.com/fastapi/fastapi) |
| Uvicorn | Loopback server | BSD-3-Clause; [project](https://github.com/Kludex/uvicorn) |
| Pydantic / settings | Input/environment validation | MIT; [project](https://github.com/pydantic/pydantic) |
| HTTPX | Fixed-origin image provider calls | BSD-3-Clause; [project](https://github.com/encode/httpx) |
| Pillow | Bounded image decoding/normalization | HPND; [project](https://github.com/python-pillow/Pillow) |
| pypdfium2 / PDFium | Native PDF rendering | Wrapper Apache-2.0/BSD-3-Clause; bundled dependencies have separate notices; [licensing](https://github.com/pypdfium2-team/pypdfium2#licensing) |
| MediaPipe | Local person/pose checks | Apache-2.0 software; [license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE) |
| NumPy | Image quality calculations | BSD-3-Clause; [project](https://github.com/numpy/numpy) |
| Next.js / React | Web UI | MIT; [Next](https://github.com/vercel/next.js), [React](https://github.com/facebook/react) |
| Playwright | Browser acceptance tests | Apache-2.0; [project](https://github.com/microsoft/playwright) |
| Urbanist | Self-hosted UI font | SIL OFL, included at `frontend/public/fonts/OFL.txt`; [source](https://github.com/google/fonts/tree/main/ofl/urbanist) |

The model helper downloads versioned official Google EfficientDet-Lite0 int8 and Pose Landmarker Lite float16 files and records their SHA-256/size/source in `models/manifest.json`. Models are not downloaded during an upload. See official [object detector](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector) and [pose](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker) docs and the [BlazePose model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf).

Checkpoint provenance is separate from software licensing. Exact checkpoint/dataset rights have not been cleared for commercial distribution; this remains a local internal prototype. Include upstream notices when distributing PDFium or other binaries. No Panna catalog/trademark assets were bundled.

FASHN is a paid hosted service under its current terms, not a distributed checkpoint. No CatVTON/IDM-VTON model was installed. ReportLab from the bundled authoring runtime generated the static demonstration PDF; it is not a required application dependency.
