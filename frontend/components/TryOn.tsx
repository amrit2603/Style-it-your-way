"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import PhotoGuide from "./PhotoGuide";
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

export default function TryOn({
  product,
  view,
}: {
  product: Product;
  view: string;
}) {
  const room = product.category === "furniture";
  const primary = ["shoes", "watch", "furniture"].includes(product.category);
  const endpoint = `/style-it/generate?product=${product.id}&view=${view}`;
  const storageKey = `vyumi-look:${product.id}:${view}`;
  const [health, setHealth] = useState<Health>(),
    [photo, setPhoto] = useState<Photo>(),
    [job, setJob] = useState<Job>(),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [scope, setScope] = useState(""),
    [remaining, setRemaining] = useState(""),
    [height, setHeight] = useState(""),
    [weight, setWeight] = useState(""),
    [width, setWidth] = useState(""),
    [size, setSize] = useState("");
  const fileInput = useRef<HTMLInputElement>(null),
    uploading = useRef(false);
  const ready = primary
    ? (health?.catalog_ready ?? health?.provider_ready)
    : health?.provider_ready;
  const processing = !!job && !terminal(job);
  useEffect(() => {
    let active = true;
    Promise.all([ensureSession(), api<Health>("/health")])
      .then(([session, status]) => {
        if (!active) return;
        setScope(session.csrf_token);
        setHealth(status);
        try {
          const saved = JSON.parse(
            sessionStorage.getItem(storageKey) || "null",
          );
          if (
            saved?.scope === session.csrf_token &&
            saved.photo?.expires_at > Date.now() / 1000
          ) {
            setPhoto(saved.photo);
            setConsent(true);
            const pending = savedGeneration(endpoint);
            setJob(
              saved.job ||
                (pending?.payload.user_image_id === saved.photo.id
                  ? pending?.job
                  : undefined),
            );
          }
        } catch {
          sessionStorage.removeItem(storageKey);
        }
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [endpoint, storageKey]);
  useEffect(() => {
    if (photo && scope)
      sessionStorage.setItem(storageKey, JSON.stringify({ photo, job, scope }));
  }, [photo, job, scope, storageKey]);
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
        clearGeneration(endpoint);
        setError("Your photo expired. Upload it again to continue.");
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [photo, storageKey, endpoint]);
  const pending = savedGeneration(endpoint);
  const canResume = !!photo && pending?.payload.user_image_id === photo.id;
  const start = async (input: Photo) => {
    setBusy(true);
    setError("");
    try {
      setJob(
        await generationRequest(endpoint, {
          product_id: product.id,
          user_image_id: input.id,
          view,
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const upload = async (file: File) => {
    if (uploading.current || !consent) return;
    uploading.current = true;
    setBusy(true);
    setError("");
    try {
      if (photo) await api(`/assets/${photo.id}`, "DELETE");
      setPhoto(undefined);
      setJob(undefined);
      clearGeneration(endpoint);
      sessionStorage.removeItem(storageKey);
      const body = new FormData();
      body.set("file", file);
      body.set("consent", "true");
      body.set("view", view);
      body.set("purpose", room ? "room" : "person");
      if (height) body.set("height_cm", height);
      if (weight) body.set("weight_kg", weight);
      if (width) body.set("body_width_cm", width);
      if (size) body.set("usual_size", size);
      const uploaded = await api<Photo>("/style-it/photos", "POST", body);
      setPhoto(uploaded);
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ photo: uploaded, scope }),
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
      clearGeneration(endpoint);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const provider = primary ? health?.catalog_provider : health?.provider;
  const privacy =
    provider === "FASHN demo"
      ? "https://huggingface.co/privacy"
      : provider === "Gemini"
        ? "https://ai.google.dev/gemini-api/terms"
        : provider === "Cloudflare"
          ? "https://developers.cloudflare.com/workers-ai/platform/data-usage/"
          : "https://docs.fashn.ai/api-overview/data-retention-privacy";
  return (
    <section className="style-form" aria-label={`${view} visualization`}>
      {health?.generation_mode === "fixture" && (
        <p className="notice">
          Demo mode: fixed labelled sample, not a personalized result.
        </p>
      )}
      {!photo && (
        <>
          <PhotoGuide view={view} room={room} category={product.category} />
          {!room && (
            <details className="measurement-details">
              <summary>Add your measurements (optional)</summary>
              <p>
                Enter values you know. We don’t estimate height or weight from
                pixels. Your photo supplies your natural silhouette; these
                details are reference only, not a size or fit calculation.
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
                  Weight (kg)
                  <input
                    type="number"
                    min="20"
                    max="400"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                  />
                </label>
                <label className="field">
                  Shoulder width (cm)
                  <input
                    type="number"
                    min="10"
                    max="150"
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                  />
                </label>
                <label className="field">
                  Usual size
                  <input
                    maxLength={80}
                    placeholder={product.sizes || "e.g. XL"}
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                  />
                </label>
              </div>
            </details>
          )}
          <label className="check-row">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I have permission to use this photo and consent to photo processing.
          </label>
          <input
            ref={fileInput}
            className="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,.heic,.heif"
            aria-label="Upload your photo"
            disabled={!consent || busy || !ready}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
          <button
            className="upload-panel"
            aria-label="Upload photo & try on"
            disabled={!consent || busy || !ready}
            onClick={() => fileInput.current?.click()}
          >
            <Icon name="upload" size={28} />
            <strong>
              {busy
                ? "Uploading & starting…"
                : room
                  ? "Upload room & visualize"
                  : `Upload ${view} photo & try on`}
            </strong>
            <span>JPEG, PNG, WebP, HEIC or AVIF · up to 10 MiB</span>
          </button>
          <p className="privacy-note">
            Processed by {provider || "the image service"}. Private in this app;
            deleted locally after one hour.{" "}
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
            <span className="muted">Private · {remaining} remaining</span>
          </div>
        </div>
      )}
      {photo && !job && !busy && (
        <button
          className="gold wide"
          disabled={!ready && !canResume}
          onClick={() => start(photo)}
        >
          {canResume ? "Resume my request" : "Generate this view"}
          <Icon name="spark" />
        </button>
      )}
      {((busy && photo) || processing) && (
        <div className="job-progress" role="status">
          <span className="spinner" />
          <h3>
            {job?.status === "queued"
              ? "Your view is queued"
              : "Creating your preview…"}
          </h3>
          <p>You can leave and return to this page. Your request is saved.</p>
        </div>
      )}
      {job?.status === "completed" && job.result_image_url && photo && (
        <div className="result">
          <h2>{job.fixture ? "Demonstration result" : "Your new look"}</h2>
          <div className="comparison">
            <figure>
              <img src={photo.url} alt="Your original photo" />
              <figcaption>Your {view} photo</figcaption>
            </figure>
            <figure>
              <img
                src={job.result_image_url}
                alt={
                  job.fixture
                    ? "Labelled demonstration sample"
                    : `Your AI-generated ${view} preview`
                }
              />
              <figcaption>
                {job.fixture ? "Demo sample" : `${view} preview`}
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
            Check the{" "}
            {room
              ? "placement and product details"
              : "face, natural body shape and product details"}
            . AI may alter details; this preview is not a fit or scale
            measurement.
          </p>
          <button
            className="wide"
            disabled={busy || !ready}
            onClick={() => {
              clearGeneration(endpoint);
              start(photo);
            }}
          >
            Create another preview
          </button>
        </div>
      )}
      {job && terminal(job) && job.status !== "completed" && (
        <div className="notice" role="status">
          <h3>This preview couldn’t finish</h3>
          <p>{job.message || "Please try again."}</p>
          {job.status !== "needs_review" && photo && (
            <button
              disabled={busy || !ready}
              onClick={() => {
                clearGeneration(endpoint);
                setJob(undefined);
                start(photo);
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
          <button className="danger-link" disabled={busy} onClick={clear}>
            Delete my photo & results
          </button>
        </div>
      )}
      {health && !ready && !canResume && (
        <p className="notice">
          Image generation is unavailable or the store’s generation allowance is
          used. Please contact the store or try again later.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
