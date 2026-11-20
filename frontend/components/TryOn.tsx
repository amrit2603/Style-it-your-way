"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import {
  api,
  ensureSession,
  errorText,
  Health,
  Job,
  Photo,
  Product,
  terminal,
  generationRequest,
  clearGeneration,
  savedGeneration,
} from "@/lib/api";

const storageKey = "vyumi-active-look";
export default function TryOn({
  product,
  products,
  onSelect,
  onClose,
}: {
  product: Product | null;
  products: Product[];
  onSelect: (p: Product) => void;
  onClose: () => void;
}) {
  const [health, setHealth] = useState<Health>(),
    [photo, setPhoto] = useState<Photo>(),
    [job, setJob] = useState<Job>(),
    [consent, setConsent] = useState(false),
    [height, setHeight] = useState(""),
    [size, setSize] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [remaining, setRemaining] = useState(""),
    [scope, setScope] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const activeDialog = dialog.current;
    activeDialog?.showModal();
    ensureSession()
      .then(async (current) => {
        setScope(current.csrf_token);
        try {
          const saved = JSON.parse(
            sessionStorage.getItem(storageKey) || "null",
          );
          if (saved?.scope === current.csrf_token) {
            const selected = products.find((p) => p.id === saved.productId);
            if (selected && (!product || product.id === selected.id)) {
              onSelect(selected);
              setPhoto(saved.photo);
              const request = savedGeneration("/style-it/generate");
              const matches =
                request?.payload.product_id === selected.id &&
                request?.payload.user_image_id === saved.photo?.id;
              setJob(saved.job || (matches ? request?.job : undefined));
              setConsent(true);
            }
          } else {
            sessionStorage.removeItem(storageKey);
          }
        } catch {
          sessionStorage.removeItem(storageKey);
        }
        setHealth(await api<Health>("/health"));
      })
      .catch((e) => setError(errorText(e)));
    return () => {
      activeDialog?.close();
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
    // Restore only when the drawer opens, not when a garment is selected inside it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (photo && product && scope)
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ photo, job, productId: product.id, scope }),
      );
  }, [photo, job, product, scope]);
  useEffect(() => {
    if (!job || terminal(job)) return;
    let active = true;
    const poll = () =>
      api<Job>(`/style-it/jobs/${job.job_id}`)
        .then((value) => {
          if (active) setJob(value);
        })
        .catch((e) => {
          if (active) setError(errorText(e));
        });
    poll();
    const timer = setInterval(poll, 1500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [job?.job_id, job?.status]);
  useEffect(() => {
    if (!photo) return;
    const tick = () => {
      const seconds = Math.max(
        0,
        photo.expires_at - Math.floor(Date.now() / 1000),
      );
      setRemaining(`${Math.ceil(seconds / 60)} min`);
      if (seconds === 0) {
        setPhoto(undefined);
        setJob(undefined);
        sessionStorage.removeItem(storageKey);
        setError("Your photo expired. Upload it again to create another look.");
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [photo]);
  const containFocus = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab") return;
    const nodes = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],summary,[tabindex="0"]',
      ),
    ).filter(
      (node) =>
        node.getClientRects().length > 0 &&
        !node.classList.contains("visually-hidden"),
    );
    if (!nodes.length) return;
    const active = document.activeElement;
    if (
      event.shiftKey &&
      (active === nodes[0] || active === event.currentTarget)
    ) {
      event.preventDefault();
      nodes[nodes.length - 1].focus();
    } else if (!event.shiftKey && active === nodes[nodes.length - 1]) {
      event.preventDefault();
      nodes[0].focus();
    }
  };
  const upload = async (file: File) => {
    setBusy(true);
    setError("");
    try {
      if (photo) await api(`/assets/${photo.id}`, "DELETE");
      setPhoto(undefined);
      setJob(undefined);
      sessionStorage.removeItem(storageKey);
      const body = new FormData();
      body.set("file", file);
      body.set("consent", String(consent));
      if (height) body.set("height_cm", height);
      if (size) body.set("usual_size", size);
      setPhoto(await api<Photo>("/style-it/photos", "POST", body));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  const generate = async () => {
    if (!photo || !product) return;
    setBusy(true);
    setError("");
    try {
      setJob(
        await generationRequest("/style-it/generate", {
          product_id: product.id,
          user_image_id: photo.id,
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    if (!photo) return;
    setBusy(true);
    setError("");
    try {
      await api(`/assets/${photo.id}`, "DELETE");
      setPhoto(undefined);
      setJob(undefined);
      sessionStorage.removeItem(storageKey);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const processing = !!job && !terminal(job);
  const canUpload =
    consent &&
    (health?.validator_ready || health?.generation_mode === "fixture");
  const previousRequest = savedGeneration("/style-it/generate");
  const canResume =
    !!photo &&
    !!product &&
    previousRequest?.payload.product_id === product.id &&
    previousRequest?.payload.user_image_id === photo.id;
  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <dialog
        className="tryon-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tryon-title"
        tabIndex={-1}
        ref={dialog}
        onKeyDown={containFocus}
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right)
              onClose();
          }
        }}
      >
        <div className="drawer-header">
          <div>
            <h2 id="tryon-title">Style it your way</h2>
            <p>Your garment. A new perspective.</p>
          </div>
          <button
            className="icon-button"
            aria-label="Close try-on"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="drawer-body">
          {health?.generation_mode === "fixture" && (
            <div className="notice">
              Demo mode: the result is a fixed, labelled sample. It will not
              show your face or garment.
            </div>
          )}
          {product ? (
            <div className="selected-product">
              {product.images[0] && <img src={product.images[0].url} alt="" />}
              <div>
                <span>Your selected garment</span>
                <h3>{product.name}</h3>
                <p>{product.sku}</p>
              </div>
            </div>
          ) : (
            <div className="chat-message">
              <h3>What would you like to try?</h3>
              <p>Select a garment from the collection to begin.</p>
            </div>
          )}
          {products.length > 1 && (
            <label className="field">
              Choose a garment
              <select
                aria-label="Choose a garment"
                value={product?.id || ""}
                disabled={processing || busy}
                onChange={(e) => {
                  const selected = products.find(
                    (p) => p.id === e.target.value,
                  );
                  if (selected) {
                    onSelect(selected);
                    setJob(undefined);
                  }
                }}
              >
                <option value="" disabled>
                  Select garment
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {product && !photo && (
            <>
              <div className="chat-message">
                <h3>Let’s start with your photo</h3>
                <p>
                  Use one clear photo of yourself, facing forward or at a slight
                  angle. Show your full body for a saree or suit, with even
                  lighting and no filters.
                </p>
                <p>A face-only selfie won’t show how the garment drapes.</p>
              </div>
              <div className="privacy-box">
                <h3>Your photo stays private</h3>
                <p>
                  Live generation sends your photo to FASHN. Local photos and
                  results expire one hour after upload. You can delete them
                  sooner. Provider request records may remain under its{" "}
                  <a
                    href="https://docs.fashn.ai/api-overview/data-retention-privacy"
                    target="_blank"
                    rel="noreferrer"
                  >
                    retention policy
                  </a>
                  .
                </p>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  I am 18 or older, have permission to use this photo, and
                  consent to its processing.
                </label>
              </div>
              <details>
                <summary>Add height or usual size (optional)</summary>
                <p className="muted">
                  For your reference only. These values do not predict fit or
                  change body measurements.
                </p>
                <div className="form-columns">
                  <label className="field">
                    Height (cm)
                    <input
                      type="number"
                      min="80"
                      max="250"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    Usual size
                    <input
                      maxLength={80}
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                      placeholder="e.g. M"
                    />
                  </label>
                </div>
              </details>
              <input
                className="visually-hidden"
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Upload your photo"
                disabled={!canUpload || busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f);
                }}
              />
              <button
                className="upload-panel"
                disabled={!canUpload || busy}
                onClick={() => fileInput.current?.click()}
              >
                <Icon name="upload" size={28} />
                <strong>
                  {busy ? "Checking photo…" : "Choose your photo"}
                </strong>
                <span>JPEG, PNG or WebP · up to 10 MiB · at least 512 px</span>
              </button>
              {health &&
                !health.validator_ready &&
                health.generation_mode !== "fixture" && (
                  <p className="notice">
                    Local photo validation is not ready. Ask the prototype
                    operator to run model setup.
                  </p>
                )}
            </>
          )}
          {photo && (
            <>
              <div className="photo-ready">
                <img src={photo.url} alt="Your uploaded photo" />
                <div>
                  <strong>Your photo is ready</strong>
                  <p>{photo.checks.message}</p>
                  <span className="muted">
                    Private · expires in {remaining}
                  </span>
                </div>
              </div>
              {!job && (
                <button
                  className="gold wide"
                  onClick={generate}
                  disabled={busy || (!health?.provider_ready && !canResume)}
                >
                  {busy
                    ? "Starting…"
                    : canResume
                      ? "Resume my request"
                      : "Generate my look"}
                  <Icon name="spark" />
                </button>
              )}
              {!health?.provider_ready && !canResume && (
                <p className="notice">
                  Live image generation is not configured or its allowance is
                  exhausted. The local prototype operator can enable it.
                </p>
              )}
            </>
          )}
          {processing && (
            <div className="job-progress" role="status">
              <span className="spinner" />
              <h3>
                {job.status === "queued"
                  ? "Your look is queued"
                  : job.status === "submitting"
                    ? "Submitting your request"
                    : "Creating your visual preview"}
              </h3>
              <p>
                You can close this panel and return. Your request will stay
                linked to this session.
              </p>
            </div>
          )}
          {job?.status === "completed" && job.result_image_url && photo && (
            <div className="result">
              <h3>
                {job.fixture ? "Demonstration result" : "Your AI visualization"}
              </h3>
              <p className="muted">
                {job.fixture
                  ? "Fixed sample, not a personalized try-on."
                  : "An approximate preview. AI may change fabric, drape or body details."}
              </p>
              <div className="comparison">
                <figure>
                  <img src={photo.url} alt="Your original photo" />
                  <figcaption>Original</figcaption>
                </figure>
                <figure>
                  <img
                    src={job.result_image_url}
                    alt={
                      job.fixture
                        ? "Labelled demonstration sample"
                        : "AI-generated garment preview"
                    }
                  />
                  <figcaption>
                    {job.fixture ? "Demo sample" : "AI-generated"}
                  </figcaption>
                </figure>
              </div>
              <a
                className="gold button wide"
                href={`${job.result_image_url}?download=true`}
                download
              >
                Download {job.fixture ? "demo sample" : "result"}
                <Icon name="arrow" />
              </a>
              <button
                className="wide"
                onClick={() => {
                  clearGeneration("/style-it/generate");
                  setJob(undefined);
                }}
              >
                Try another look with this photo
              </button>
            </div>
          )}
          {job && terminal(job) && job.status !== "completed" && (
            <div className="notice" role="status">
              <h3>We couldn’t complete this look</h3>
              <p>
                {job.message ||
                  "Please change your photo or garment and try again."}
              </p>
              {job.status !== "needs_review" && (
                <button
                  onClick={() => {
                    clearGeneration("/style-it/generate");
                    setJob(undefined);
                  }}
                >
                  Try again
                </button>
              )}
            </div>
          )}
          {photo && (
            <div className="photo-actions">
              <button onClick={clear} disabled={busy}>
                Change photo
              </button>
              <button className="danger-link" onClick={clear} disabled={busy}>
                Delete my photo & results
              </button>
            </div>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="drawer-footer">
          A visual preview, never a fit guarantee.
        </div>
      </dialog>
    </div>
  );
}
