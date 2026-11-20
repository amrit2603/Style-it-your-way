"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { canCombine } from "@/lib/catalog";
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
  products: initialProducts,
  onSelect,
  onClose,
}: {
  product: Product | null;
  products: Product[];
  onSelect: (p: Product) => void;
  onClose: () => void;
}) {
  const [products, setProducts] = useState(initialProducts),
    [extras, setExtras] = useState<string[]>([]),
    [health, setHealth] = useState<Health>(),
    [photo, setPhoto] = useState<Photo>(),
    [job, setJob] = useState<Job>(),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [scope, setScope] = useState(""),
    [remaining, setRemaining] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    uploading = useRef(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement,
      overflow = document.body.style.overflow,
      active = dialog.current;
    document.body.style.overflow = "hidden";
    active?.showModal();
    Promise.all([
      ensureSession(),
      api<Product[]>("/products"),
      api<Health>("/health"),
    ])
      .then(([session, available, status]) => {
        setScope(session.csrf_token);
        setProducts(available);
        setHealth(status);
        try {
          const saved = JSON.parse(
            sessionStorage.getItem(storageKey) || "null",
          );
          if (
            saved?.scope === session.csrf_token &&
            (!product || saved.productId === product.id)
          ) {
            const selected = available.find((p) => p.id === saved.productId);
            if (selected && saved.photo?.expires_at > Date.now() / 1000) {
              onSelect(selected);
              setPhoto(saved.photo);
              setConsent(true);
              const extraIds = Array.isArray(saved.extras)
                ? saved.extras.slice(0, 2)
                : [];
              setExtras(extraIds);
              const pending = savedGeneration("/style-it/generate");
              const matches =
                pending?.payload.product_id === selected.id &&
                pending?.payload.user_image_id === saved.photo.id &&
                JSON.stringify(pending.payload.additional_product_ids || []) ===
                  JSON.stringify(extraIds);
              setJob(saved.job || (matches ? pending?.job : undefined));
            }
          }
        } catch {
          sessionStorage.removeItem(storageKey);
        }
      })
      .catch((e) => setError(errorText(e)));
    return () => {
      active?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
    // Restore once when opening, not when selecting another garment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (photo && product && scope)
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ photo, job, productId: product.id, scope, extras }),
      );
  }, [photo, job, product, scope, extras]);
  useEffect(() => {
    if (!job || terminal(job)) return;
    let active = true;
    const poll = () =>
      api<Job>(`/style-it/jobs/${job.job_id}`)
        .then((j) => {
          if (active) setJob(j);
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
      const seconds = Math.max(0, photo.expires_at - Date.now() / 1000);
      setRemaining(`${Math.ceil(seconds / 60)} min`);
      if (!seconds) {
        setPhoto(undefined);
        setJob(undefined);
        sessionStorage.removeItem(storageKey);
        setError("Your photo expired. Choose it again to continue.");
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [photo]);
  const processing = !!job && !terminal(job),
    pending = savedGeneration("/style-it/generate");
  const canResume =
    !!photo &&
    pending?.payload.product_id === product?.id &&
    pending?.payload.user_image_id === photo.id &&
    JSON.stringify(pending?.payload.additional_product_ids || []) ===
      JSON.stringify(extras);
  const start = async (input: Photo) => {
    if (!product) return;
    setBusy(true);
    setError("");
    try {
      setJob(
        await generationRequest("/style-it/generate", {
          product_id: product.id,
          user_image_id: input.id,
          additional_product_ids: extras,
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const upload = async (file: File) => {
    if (uploading.current || !product || !consent) return;
    uploading.current = true;
    setBusy(true);
    setError("");
    try {
      if (photo) await api(`/assets/${photo.id}`, "DELETE");
      setPhoto(undefined);
      setJob(undefined);
      clearGeneration("/style-it/generate");
      sessionStorage.removeItem(storageKey);
      const body = new FormData();
      body.set("file", file);
      body.set("consent", "true");
      const uploaded = await api<Photo>("/style-it/photos", "POST", body);
      setPhoto(uploaded);
      // Persist before submitting so response loss can resume the same request.
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          photo: uploaded,
          productId: product.id,
          scope,
          extras,
        }),
      );
      await start(uploaded);
    } catch (e) {
      setError(errorText(e));
    } finally {
      uploading.current = false;
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
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
      clearGeneration("/style-it/generate");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const containFocus = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab") return;
    const nodes = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],summary,[tabindex="0"]',
      ),
    ).filter(
      (n) =>
        n.getClientRects().length && !n.classList.contains("visually-hidden"),
    );
    if (!nodes.length) return;
    if (
      event.shiftKey &&
      (document.activeElement === nodes[0] ||
        document.activeElement === event.currentTarget)
    ) {
      event.preventDefault();
      nodes.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
      event.preventDefault();
      nodes[0].focus();
    }
  };
  const privacy =
    health?.provider === "FASHN demo"
      ? "https://huggingface.co/privacy"
      : health?.provider === "Gemini"
        ? "https://ai.google.dev/gemini-api/terms"
        : health?.provider === "Cloudflare"
          ? "https://developers.cloudflare.com/workers-ai/platform/data-usage/"
          : "https://docs.fashn.ai/api-overview/data-retention-privacy";
  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <dialog
        className="tryon-drawer"
        aria-modal="true"
        aria-labelledby="tryon-title"
        tabIndex={-1}
        ref={dialog}
        onKeyDown={containFocus}
        onCancel={(e) => {
          e.preventDefault();
          onClose();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            const box = e.currentTarget.getBoundingClientRect();
            if (e.clientX < box.left || e.clientX > box.right) onClose();
          }
        }}
      >
        <div className="drawer-header">
          <div>
            <h2 id="tryon-title">Try it on you</h2>
            <p>Choose your photo. We’ll do the rest.</p>
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
            <p className="notice">
              Demo mode: fixed labelled sample, not a personalized result.
            </p>
          )}
          {product ? (
            <div className="selected-product">
              {product.images[0] && <img src={product.images[0].url} alt="" />}
              <div>
                <span>Your selected garment</span>
                <h3>{product.name}</h3>
              </div>
            </div>
          ) : (
            <label className="field">
              Choose a garment
              <select
                aria-label="Choose a garment"
                value=""
                onChange={(e) => {
                  const p = products.find((p) => p.id === e.target.value);
                  if (p) onSelect(p);
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
          {product && (
            <>
              <details className="outfit-builder">
                <summary>Change garment or add outfit pieces</summary>
                <label className="field">
                  Choose a garment
                  <select
                    aria-label="Choose a garment"
                    value={product.id}
                    disabled={busy || processing}
                    onChange={(e) => {
                      const p = products.find((p) => p.id === e.target.value);
                      if (p) {
                        onSelect(p);
                        setExtras([]);
                        setJob(undefined);
                        setError("");
                      }
                    }}
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                {extras.map((id) => {
                  const p = products.find((p) => p.id === id);
                  return (
                    <div className="outfit-piece" key={id}>
                      {p?.images[0] && <img src={p.images[0].url} alt="" />}
                      <span>{p?.name}</span>
                      <button
                        disabled={busy || processing}
                        aria-label={`Remove ${p?.name}`}
                        onClick={() => {
                          setExtras(extras.filter((x) => x !== id));
                          setJob(undefined);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
                <label className="field">
                  Add another piece
                  <select
                    aria-label="Add another piece"
                    value=""
                    disabled={
                      busy ||
                      processing ||
                      extras.length >= 2 ||
                      health?.provider === "FASHN"
                    }
                    onChange={(e) => {
                      if (e.target.value) {
                        setExtras([...extras, e.target.value]);
                        setJob(undefined);
                      }
                    }}
                  >
                    <option value="">Choose a matching piece</option>
                    {products
                      .filter((p) =>
                        canCombine(
                          [
                            product,
                            ...products.filter((p) => extras.includes(p.id)),
                          ],
                          p,
                        ),
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </label>
              </details>
              {!photo && (
                <>
                  <h3>Upload your photo</h3>
                  <p className="muted">
                    Portraits are accepted. A clear body photo shows more of the
                    outfit.
                  </p>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    I am 18 or older, have permission to use this photo, and
                    agree to photo processing.
                  </label>
                  <input
                    ref={fileInput}
                    className="visually-hidden"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,.heic,.heif"
                    aria-label="Upload your photo"
                    disabled={!consent || busy || !health?.provider_ready}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) upload(file);
                    }}
                  />
                  <button
                    className="upload-panel"
                aria-label="Upload photo & try on"
                    disabled={!consent || busy || !health?.provider_ready}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Icon name="upload" size={28} />
                    <strong>
                      {busy ? "Uploading & starting…" : "Upload photo & try on"}
                    </strong>
                    <span>JPEG, PNG or WebP · up to 10 MiB</span>
                  </button>
                  <p className="privacy-note">
                    Processed by {health?.provider || "the try-on service"}.
                    Private here; deleted locally after one hour.{" "}
                    <a href={privacy} target="_blank" rel="noreferrer">
                      Provider privacy
                    </a>
                  </p>
                </>
              )}
              {photo && (
                <div className="photo-ready">
                  <img src={photo.url} alt="Your uploaded photo" />
                  <div>
                    <strong>Your photo is ready</strong>
                    <p>{photo.checks.message}</p>
                    <span className="muted">
                      Private · {remaining} remaining
                    </span>
                  </div>
                </div>
              )}
              {photo && !job && !busy && (
                <button
                  className="gold wide"
                  disabled={!health?.provider_ready && !canResume}
                  onClick={() => start(photo)}
                >
                  {canResume ? "Resume my request" : "Try this outfit"}
                  <Icon name="spark" />
                </button>
              )}
              {((busy && photo) || processing) && (
                <div className="job-progress" role="status">
                  <span className="spinner" />
                  <h3>
                    {job?.status === "queued"
                      ? "Your look is queued"
                      : "Creating your look…"}
                  </h3>
                  <p>
                    You can close this panel and return. We’ll keep your
                    request.
                  </p>
                </div>
              )}
              {job?.status === "completed" && job.result_image_url && photo && (
                <div className="result">
                  <h3>
                    {job.fixture ? "Demonstration result" : "Your new look"}
                  </h3>
                  <div className="comparison">
                    <figure>
                      <img src={photo.url} alt="Your original photo" />
                      <figcaption>You</figcaption>
                    </figure>
                    <figure>
                      <img
                        src={job.result_image_url}
                        alt={
                          job.fixture
                            ? "Labelled demonstration sample"
                            : "Your AI-generated clothing preview"
                        }
                      />
                      <figcaption>
                        {job.fixture ? "Demo sample" : "Try-on preview"}
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
                  <p className="muted">
                    AI preview, not a fit measurement. Check your face and
                    garment details.
                  </p>
                  <button
                    className="wide"
                    disabled={busy}
                    onClick={() => {
                      clearGeneration("/style-it/generate");
                      start(photo);
                    }}
                  >
                    Create another preview
                  </button>
                </div>
              )}
              {job && terminal(job) && job.status !== "completed" && (
                <div className="notice" role="status">
                  <h3>This look couldn’t finish</h3>
                  <p>{job.message || "Please try again."}</p>
                  {job.status !== "needs_review" && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        clearGeneration("/style-it/generate");
                        setJob(undefined);
                        if (photo) start(photo);
                      }}
                    >
                      Try again
                    </button>
                  )}
                </div>
              )}
              {photo && (
                <div className="photo-actions">
                  <button disabled={busy || processing} onClick={clear}>
                    Change photo
                  </button>
                  <button
                    className="danger-link"
                    disabled={busy}
                    onClick={clear}
                  >
                    Delete my photo & results
                  </button>
                </div>
              )}
            </>
          )}
          {health && !health.provider_ready && !canResume && (
            <p className="notice">
              Image generation is temporarily unavailable. Please try again
              later.
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="drawer-footer">
          Your photo. Your garment. Your look.
        </div>
      </dialog>
    </div>
  );
}
