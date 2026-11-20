"use client";
import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  api,
  errorText,
  Product,
  Job,
  Health,
  terminal,
  generationRequest,
  savedGeneration,
} from "@/lib/api";
import MerchantGate from "@/components/MerchantGate";
import Header from "@/components/Header";
import Icon from "@/components/Icon";
import PdfSelector from "@/components/PdfSelector";

const empty = {
  name: "",
  sku: "",
  category: "saree" as "saree" | "suit",
  description: "",
  price: "",
  currency: "INR",
  sizes: "",
};
function Editor({ id }: { id: string }) {
  const router = useRouter();
  const [product, setProduct] = useState<Product>(),
    [form, setForm] = useState(empty),
    [step, setStep] = useState(0),
    [loading, setLoading] = useState(id !== "new"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [role, setRole] = useState("main"),
    [prompt, setPrompt] = useState(
      "Adult model, neutral studio setting, natural light.",
    ),
    [job, setJob] = useState<Job>(),
    [health, setHealth] = useState<Health>();
  const fileInput = useRef<HTMLInputElement>(null);
  const base = product ? `/merchant/products/${product.id}` : "";
  const refresh = () =>
    api<Product>(`/merchant/products/${id}`).then(setProduct);
  useEffect(() => {
    api<Health>("/health")
      .then(setHealth)
      .catch(() => {});
    if (id === "new") {
      setLoading(false);
      return;
    }
    api<Product>(`/merchant/products/${id}`)
      .then((p) => {
        setProduct(p);
        if (p.latest_job) {
          setJob(p.latest_job);
          if (!terminal(p.latest_job)) setStep(2);
        }
        const pending = savedGeneration(`/merchant/products/${p.id}/generate`);
        if (
          pending?.payload.version === p.version &&
          typeof pending.payload.prompt === "string"
        )
          setPrompt(pending.payload.prompt);
        if (
          new URLSearchParams(window.location.search).get("step") ===
            "images" &&
          !p.latest_job
        )
          setStep(1);
        setForm({
          name: p.name,
          sku: p.sku,
          category: p.category,
          description: p.description,
          price: p.price_minor === null ? "" : String(p.price_minor / 100),
          currency: p.currency,
          sizes: p.sizes,
        });
      })
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => {
    if (!job || terminal(job)) return;
    let active = true;
    const poll = () =>
      api<Job>(`/style-it/jobs/${job.job_id}`)
        .then((j) => {
          if (!active) return;
          setJob(j);
          if (j.status === "completed") {
            refresh()
              .then(() => {
                setStep(3);
                setMessage(
                  "Your preview is ready. Compare it with the original before approval.",
                );
              })
              .catch((e) => setError(errorText(e)));
          }
        })
        .catch((e) => {
          if (active) setError(errorText(e));
        });
    const timer = setInterval(poll, 1200);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [job?.job_id, job?.status]);
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    action(async () => {
      const price =
        form.price === "" ? null : Math.round(Number(form.price) * 100);
      if (price !== null && (!Number.isFinite(price) || price < 0))
        throw new Error("Enter a valid price, or leave it blank.");
      const payload = {
        name: form.name,
        sku: form.sku,
        category: form.category,
        description: form.description,
        price_minor: price,
        currency: form.currency,
        sizes: form.sizes,
      };
      const p = await api<Product>(
        product ? base : "/merchant/products",
        product ? "PUT" : "POST",
        { ...payload, ...(product ? { version: product.version } : {}) },
      );
      if (id === "new") {
        setLoading(true);
        router.replace(`/merchant/products/${p.id}?step=images`);
        return;
      }
      setProduct(p);
      setMessage("Product details saved.");
      setStep(1);
    });
  const upload = (file: File) =>
    action(async () => {
      const body = new FormData();
      body.set("file", file);
      body.set("role", role);
      setProduct(await api<Product>(base + "/images", "POST", body));
      setMessage(
        "Original photo added. Confirm the main try-on reference below.",
      );
      if (fileInput.current) fileInput.current.value = "";
    });
  const selectReference = (asset_id: string) =>
    action(async () => {
      setProduct(
        await api<Product>(base + "/reference", "POST", {
          asset_id,
          version: product!.version,
        }),
      );
      setMessage("Original try-on reference confirmed.");
    });
  const review = (asset_id: string, approved: boolean, visible: boolean) =>
    action(async () => {
      setProduct(
        await api<Product>(base + `/images/${asset_id}/review`, "POST", {
          approved,
          public: visible,
          version: product!.version,
        }),
      );
      setMessage(
        approved
          ? "Image approved for this garment revision."
          : "Image selection updated.",
      );
    });
  const processing = !!job && !terminal(job);
  const originals = product?.images.filter((i) => i.kind === "original") || [],
    generated = product?.images.filter((i) => i.kind === "generated") || [];
  if (loading)
    return (
      <>
        <Header merchant />
        <main className="studio-main">
          <p role="status">Loading garment…</p>
        </main>
      </>
    );
  return (
    <>
      <Header merchant />
      <main className="studio-main editor-main">
        <Link href="/merchant" className="back-link">
          <Icon name="chevron" size={14} />
          Back to catalog
        </Link>
        <div className="studio-heading">
          <div>
            <h1>{product ? product.name : "Add a garment"}</h1>
            <p>
              {product
                ? `${product.sku} · Revision ${product.version}`
                : "Start with the garment details. Add photos or choose images from your PDF next."}
            </p>
          </div>
          {product && (
            <span className={`pill ${product.published ? "published" : ""}`}>
              {product.published
                ? "Published version available"
                : "Private draft"}
            </span>
          )}
        </div>
        <nav className="editor-steps" aria-label="Product preparation">
          {["Details", "Images", "Generate", "Review & publish"].map((s, i) => (
            <button
              key={s}
              aria-current={step === i ? "step" : undefined}
              className={step === i ? "active" : ""}
              disabled={!product && i > 0}
              onClick={() => {
                setStep(i);
                setError("");
                setMessage("");
              }}
            >
              <span>{i + 1}</span>
              {s}
            </button>
          ))}
        </nav>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="success" role="status">
            {message}
          </p>
        )}
        {step === 0 && (
          <form
            className="editor-section details-form"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="section-heading">
              <div>
                <h2>Tell us about the garment</h2>
                <p>
                  These details come from you and stay unchanged by AI
                  generation.
                </p>
              </div>
            </div>
            <div className="form-columns">
              <label className="field">
                Product name
                <input
                  required
                  maxLength={160}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Emerald silk saree"
                />
              </label>
              <label className="field">
                SKU
                <input
                  required
                  maxLength={80}
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  placeholder="Your unique product code"
                />
              </label>
              <label className="field">
                Category
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      category: e.target.value as "saree" | "suit",
                    })
                  }
                >
                  <option value="saree">Saree</option>
                  <option value="suit">Suit</option>
                </select>
              </label>
              <label className="field">
                Size information (optional)
                <input
                  maxLength={200}
                  value={form.sizes}
                  onChange={(e) => setForm({ ...form, sizes: e.target.value })}
                  placeholder="e.g. 6.2 metres, blouse unstitched"
                />
              </label>
            </div>
            <label className="field">
              Garment details & included pieces
              <textarea
                required
                rows={4}
                maxLength={3000}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Describe the fabric, color, work and every included piece. For a suit, name the tunic, bottoms and dupatta if included."
              />
            </label>
            <div className="form-columns price-fields">
              <label className="field">
                Price (optional)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1000000"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </label>
              <label className="field">
                Currency
                <select
                  value={form.currency}
                  onChange={(e) =>
                    setForm({ ...form, currency: e.target.value })
                  }
                >
                  {["INR", "USD", "EUR", "GBP", "AED"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="editor-actions">
              <button className="gold" disabled={busy}>
                {busy ? "Saving…" : "Save & add images"}
                <Icon name="arrow" />
              </button>
            </div>
          </form>
        )}
        {step === 1 && product && (
          <>
            <section className="editor-section">
              <div className="section-heading">
                <div>
                  <h2>Show the garment clearly</h2>
                  <p>
                    Use even lighting, a simple background and no filters. Add
                    the full garment, reverse and fabric details.
                  </p>
                </div>
                <span className="muted">
                  {originals.length} / 10 references
                </span>
              </div>
              <div className="photo-guidance">
                <strong>
                  {product.category === "saree" ? "For a saree" : "For a suit"}
                </strong>
                <p>
                  {product.category === "saree"
                    ? "Show the complete drape, pallu and border. A close-up helps you check the weave or print later."
                    : "Show all included pieces clearly, including the tunic, bottoms and dupatta where relevant."}{" "}
                  More views support your review; AI uses the selected primary
                  reference.
                </p>
              </div>
              <div className="upload-controls">
                <label className="field">
                  Image role
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    <option value="main">Main garment</option>
                    <option value="reverse">Reverse view</option>
                    <option value="detail">Fabric / detail</option>
                  </select>
                </label>
                <button
                  className="gold"
                  disabled={busy || originals.length >= 10}
                  onClick={() => fileInput.current?.click()}
                >
                  <Icon name="upload" />
                  {busy ? "Uploading…" : "Add photo"}
                </button>
                <span className="muted">
                  JPEG, PNG, WebP · max 10 MiB · min 512 px
                </span>
                <input
                  ref={fileInput}
                  className="visually-hidden"
                  type="file"
                  aria-label="Upload garment photo"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload(f);
                  }}
                />
              </div>
              {originals.length > 0 && (
                <div className="reference-grid">
                  {originals.map((image) => (
                    <div
                      className={`reference-image ${product.reference_id === image.id ? "is-reference" : ""}`}
                      key={image.id}
                    >
                      <img
                        src={image.url}
                        alt={`${image.role} original garment reference`}
                      />
                      <div>
                        <span className="capitalize">{image.role}</span>
                        <button
                          className={
                            product.reference_id === image.id
                              ? "selected-action"
                              : ""
                          }
                          disabled={busy}
                          onClick={() => selectReference(image.id)}
                        >
                          {product.reference_id === image.id
                            ? "Confirmed reference"
                            : "Use for try-on"}
                        </button>
                        <button
                          className="text-link"
                          disabled={busy}
                          onClick={() =>
                            action(async () => {
                              await api(`/assets/${image.id}`, "DELETE");
                              await refresh();
                            })
                          }
                        >
                          Remove photo
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <PdfSelector
              productId={product.id}
              onImported={(p) => {
                setProduct(p);
                setMessage(
                  "PDF selection added as an original garment reference.",
                );
              }}
            />
            <div className="editor-actions">
              <button
                className="gold"
                disabled={!product.reference_id}
                onClick={() => setStep(2)}
              >
                Continue to generate
                <Icon name="arrow" />
              </button>
              {!product.reference_id && (
                <p className="muted">
                  Confirm an original try-on reference to continue.
                </p>
              )}
            </div>
          </>
        )}
        {step === 2 && product && (
          <section className="editor-section">
            <div className="section-heading">
              <div>
                <h2>Create a catalog preview</h2>
                <p>
                  One image per request. Nothing is published automatically.
                </p>
              </div>
            </div>
            {health?.generation_mode === "fixture" && (
              <div className="notice">
                Demonstration mode returns a fixed labelled sample, not a new
                image of this garment. No paid API call is made.
              </div>
            )}
            <div className="generate-layout">
              <div>
                {originals.find((i) => i.id === product.reference_id) ? (
                  <img
                    className="generation-reference"
                    src={
                      originals.find((i) => i.id === product.reference_id)!.url
                    }
                    alt="Confirmed original garment reference"
                  />
                ) : (
                  <div className="empty">
                    <p>Choose a reference in Images first.</p>
                  </div>
                )}
                <p className="muted">
                  The confirmed original is also used for shopper try-on.
                </p>
              </div>
              <div>
                <label className="field">
                  Model & scene direction
                  <textarea
                    rows={4}
                    maxLength={1000}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                  />
                </label>
                <p>
                  We’ll create an adult model wearing your garment. Check
                  details carefully: AI can change patterns, borders and drape.
                </p>
                <button
                  className="gold wide"
                  disabled={
                    busy ||
                    processing ||
                    !product.reference_id ||
                    !health?.provider_ready
                  }
                  onClick={() =>
                    action(async () => {
                      const next = await generationRequest(
                        base + "/generate",
                        { version: product.version, prompt },
                        job && terminal(job) ? job.job_id : undefined,
                      );
                      setJob(next);
                      if (next.status === "completed") {
                        await refresh();
                        setStep(3);
                      }
                    })
                  }
                >
                  {processing
                    ? "Generation in progress"
                    : busy
                      ? "Starting…"
                      : "Generate catalog preview"}
                  <Icon name="spark" />
                </button>
                {!health?.provider_ready && (
                  <p className="notice">
                    Live generation needs a backend Gemini or FASHN key and a
                    positive generation allowance. Configure these locally, then
                    reload.
                  </p>
                )}
                {job && (
                  <div className="job-progress" role="status">
                    {!terminal(job) && <span className="spinner" />}
                    <strong className="capitalize">
                      {job.status.replace("_", " ")}
                    </strong>
                    <p>
                      {job.message ||
                        (job.status === "completed"
                          ? "Your preview is ready for review."
                          : "This is the actual server job state. You can keep working while it processes.")}
                    </p>
                    {job.status === "completed" && (
                      <button onClick={() => setStep(3)}>Review preview</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
        {step === 3 && product && (
          <section className="editor-section">
            <div className="section-heading">
              <div>
                <h2>Review before it goes live</h2>
                <p>
                  Compare every generated image with the original garment.
                  Approve only faithful previews.
                </p>
              </div>
            </div>
            <div className="review-checklist">
              <strong>Check the details</strong>
              <span>Color & fabric</span>
              <span>Print & embroidery</span>
              <span>Border & drape</span>
              <span>Included pieces</span>
              <span>Anatomy</span>
            </div>
            {generated.length ? (
              <div className="review-layout">
                <aside>
                  <h3>Original reference</h3>
                  {originals.find((i) => i.id === product.reference_id) && (
                    <img
                      src={
                        originals.find((i) => i.id === product.reference_id)!
                          .url
                      }
                      alt="Original garment for comparison"
                    />
                  )}
                  <p className="muted">Your source of truth.</p>
                </aside>
                <div className="generated-grid">
                  {generated.map((image) => (
                    <div className="generated-image" key={image.id}>
                      <img
                        src={image.url}
                        alt="AI-generated catalog preview awaiting review"
                      />
                      <div>
                        <span
                          className={`pill ${image.approved ? "published" : ""}`}
                        >
                          {image.approved ? "Approved" : "Needs review"}
                        </span>
                        <label className="check-row">
                          <input
                            type="checkbox"
                            checked={image.public}
                            disabled={busy}
                            onChange={(e) =>
                              review(image.id, image.approved, e.target.checked)
                            }
                          />
                          Include in gallery
                        </label>
                        <button
                          className={image.approved ? "" : "gold"}
                          disabled={busy}
                          onClick={() =>
                            review(image.id, !image.approved, image.public)
                          }
                        >
                          {image.approved
                            ? "Revoke approval"
                            : "Approve this image"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty">
                <h3>No previews to review yet</h3>
                <p>
                  Generate a catalog image first, then compare it with the
                  original.
                </p>
                <button onClick={() => setStep(2)}>Go to Generate</button>
              </div>
            )}
            <details>
              <summary>Original photos in the public gallery</summary>
              {originals.map((image) => (
                <label className="check-row" key={image.id}>
                  <input
                    type="checkbox"
                    checked={image.public}
                    disabled={busy}
                    onChange={(e) => review(image.id, false, e.target.checked)}
                  />
                  <span className="capitalize">{image.role} original</span>
                </label>
              ))}
            </details>
            <div className="publish-bar">
              <div>
                <strong>
                  {product.published
                    ? "Update the published gallery"
                    : "Ready to share this garment?"}
                </strong>
                <p>
                  Only selected, approved generated images and selected
                  originals go live.
                </p>
              </div>
              <div>
                <button
                  className="gold"
                  disabled={
                    busy || !generated.some((i) => i.approved && i.public)
                  }
                  onClick={() =>
                    action(async () => {
                      setProduct(
                        await api<Product>(base + "/publish", "POST", {
                          version: product.version,
                        }),
                      );
                      setMessage(
                        "Published. This garment is now visible in the storefront.",
                      );
                    })
                  }
                >
                  Publish garment
                  <Icon name="arrow" />
                </button>
                {product.published && (
                  <>
                    <Link className="button" href={`/products/${product.id}`}>
                      View product
                    </Link>
                    <button
                      onClick={() =>
                        action(async () => {
                          setProduct(
                            await api<Product>(base + "/unpublish", "POST", {}),
                          );
                          setMessage(
                            "Removed from the public storefront. Your draft is preserved.",
                          );
                        })
                      }
                    >
                      Unpublish
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
export default function EditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <MerchantGate>
      <Editor id={id} />
    </MerchantGate>
  );
}
