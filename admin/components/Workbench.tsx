"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  api,
  ensureSession,
  errorText,
  generationRequest,
  Health,
  Job,
  money,
  Product,
  savedGeneration,
  terminal,
} from "@/lib/api";
import { categories, categoryName } from "@/lib/catalog";
import Icon from "@/components/Icon";

type Order = {
  id: string;
  name: string;
  address: string;
  phone: string;
  total: number;
  currency: string;
  status: string;
  created: number;
  items: {
    product_id: string;
    name: string;
    sku: string;
    quantity: number;
    price: number;
    size: string;
    color: string;
  }[];
};
type LibraryPhoto = {
  id: string;
  url: string;
  label: string;
  gender: string;
  body_type: string;
  room_type: string;
};
type Stats = {
  total_products: number;
  total_orders: number;
  pending_orders: number;
  recent_orders: Order[];
};
const roomCategories = ["furniture", "decor", "curtains"];
const currency = (amount: number, code: string) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: code }).format(
    amount / 100,
  );
const date = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
function useLoad<T>(path: string) {
  const [data, setData] = useState<T>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++revision.current;
    setLoading(true);
    setError("");
    try {
      const next = await api<T>(path);
      if (current === revision.current) setData(next);
    } catch (e) {
      if (current === revision.current) setError(errorText(e));
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void refresh();
    return () => {
      revision.current += 1;
    };
  }, [refresh]);
  return { data, error, loading, refresh };
}
function Failure({ message, retry }: { message: string; retry?: () => void }) {
  return message ? (
    <div role="alert" className="admin-callout error">
      <p>{message}</p>
      {retry && <button onClick={retry}>Try again</button>}
    </div>
  ) : null;
}
function Empty({
  title,
  text,
  href,
  action,
}: {
  title: string;
  text: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="admin-empty">
      <h2>{title}</h2>
      <p>{text}</p>
      {href && (
        <Link className="button gold" href={href}>
          {action}
        </Link>
      )}
    </div>
  );
}
function Status({ value }: { value: string }) {
  return <span className={`admin-status ${value.toLowerCase()}`}>{value}</span>;
}
function ProductLabel({ product }: { product: Product }) {
  const image =
    product.images.find((i) => i.kind === "generated" && i.approved) ||
    product.images[0];
  return (
    <div className="product-cell">
      {image ? (
        <img src={image.url} alt="" loading="lazy" />
      ) : (
        <span className="photo-empty" />
      )}
      <div>
        <strong>{product.name}</strong>
        <small>
          {product.sku} · {categoryName(product.category)}
        </small>
        {product.fixture && <small>Demonstration product</small>}
      </div>
    </div>
  );
}

export function Dashboard() {
  const stats = useLoad<Stats>("/admin/dashboard"),
    products = useLoad<Product[]>("/admin/products");
  return (
    <>
      <div className="admin-heading">
        <div>
          <h1>Your store, at a glance</h1>
          <p>Prepare your collection and keep every order moving.</p>
        </div>
        <Link className="button gold" href="/admin/products/new">
          Add a product <Icon name="arrow" size={16} />
        </Link>
      </div>
      <Failure
        message={stats.error || products.error}
        retry={() => {
          void stats.refresh();
          void products.refresh();
        }}
      />
      {stats.loading && !stats.data ? (
        <p role="status">Loading your store…</p>
      ) : (
        stats.data && (
          <dl className="admin-stats">
            <div>
              <dt>Products</dt>
              <dd>{stats.data.total_products}</dd>
            </div>
            <div>
              <dt>Orders</dt>
              <dd>{stats.data.total_orders}</dd>
            </div>
            <div>
              <dt>Awaiting confirmation</dt>
              <dd>{stats.data.pending_orders}</dd>
            </div>
            <div>
              <dt>Published products</dt>
              <dd>{products.data?.filter((p) => p.published).length ?? "—"}</dd>
            </div>
          </dl>
        )
      )}
      <section className="admin-panel">
        <div className="admin-heading">
          <div>
            <h2>From product photo to catalog</h2>
            <p>
              Choose the product and model, create a preview, then review before
              publishing.
            </p>
          </div>
          <Link className="button" href="/admin/ai-generate">
            Create catalog images
          </Link>
        </div>
        <ol className="studio-process">
          <li>
            Add a product and confirm the original photo or PDF selection.
          </li>
          <li>Choose a reusable model or room photo from your library.</li>
          <li>Compare the result, approve it, and publish your selection.</li>
        </ol>
      </section>
      <section>
        <div className="admin-heading">
          <h2>Recent orders</h2>
          <Link href="/admin/orders">View all orders</Link>
        </div>
        {stats.data?.recent_orders.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {stats.data.recent_orders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.name}</td>
                    <td>{date(o.created)}</td>
                    <td>
                      <Status value={o.status} />
                    </td>
                    <td className="money">{currency(o.total, o.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Your first order starts here"
            text="Customer orders will appear here after checkout. No orders have been recorded yet."
          />
        )}
      </section>
    </>
  );
}

export function Products() {
  const list = useLoad<Product[]>("/admin/products");
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [state, setState] = useState(""),
    [archive, setArchive] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const items = (list.data || []).filter(
    (p) =>
      `${p.name} ${p.sku}`.toLowerCase().includes(search.toLowerCase()) &&
      (!category || p.category === category) &&
      (!state || (state === "published" ? p.published : !p.published)),
  );
  return (
    <>
      <div className="admin-heading">
        <div>
          <h1>Your products</h1>
          <p>
            Original photos, catalog previews and published selections in one
            place.
          </p>
        </div>
        <Link className="button gold" href="/admin/products/new">
          Add a product
        </Link>
      </div>
      <div className="admin-filterbar">
        <label className="field">
          Search products
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Product name or SKU"
          />
        </label>
        <label className="field">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Visibility
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">All products</option>
            <option value="published">Published</option>
            <option value="draft">Drafts</option>
          </select>
        </label>
      </div>
      <Failure
        message={error || list.error}
        retry={() => void list.refresh()}
      />
      {message && <p role="status">{message}</p>}
      {list.loading && !list.data ? (
        <p role="status">Loading products…</p>
      ) : !items.length ? (
        <Empty
          title={
            list.data?.length
              ? "No matching products"
              : "Add your first product"
          }
          text={
            list.data?.length
              ? "Try another name or category."
              : "Start with product details, then upload photos or select a garment from a PDF."
          }
          href="/admin/products/new"
          action="Add a product"
        />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Price</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/admin/products/${p.id}`}>
                      <ProductLabel product={p} />
                    </Link>
                  </td>
                  <td className="money">{money(p) || "Price needed"}</td>
                  <td>
                    <Status
                      value={p.status || (p.published ? "Published" : "Draft")}
                    />
                  </td>
                  <td>
                    {archive === p.id ? (
                      <div>
                        <p>Hide this product from the store?</p>
                        <div className="admin-actions">
                          <button
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              setError("");
                              try {
                                await api(`/admin/products/${p.id}`, "DELETE");
                                setArchive("");
                                setMessage(
                                  "Product archived. Existing order records are preserved.",
                                );
                                await list.refresh();
                              } catch (e) {
                                setError(errorText(e));
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            Archive product
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => setArchive("")}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="admin-actions">
                        <Link href={`/admin/products/${p.id}`}>Edit</Link>
                        <Link href={`/admin/ai-generate?product=${p.id}`}>
                          Create images
                        </Link>
                        <button onClick={() => setArchive(p.id)}>
                          Archive
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function Orders() {
  const orders = useLoad<Order[]>("/admin/orders");
  const [filter, setFilter] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const sequence = ["pending", "confirmed", "shipped", "delivered"];
  const filtered =
    orders.data?.filter((o) => !filter || o.status === filter) || [];
  return (
    <>
      <div className="admin-heading">
        <div>
          <h1>Orders</h1>
          <p>
            Confirm new orders, prepare shipments and keep customers informed.
          </p>
        </div>
      </div>
      <div className="admin-filterbar">
        <label className="field">
          Order status
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All statuses</option>
            {sequence.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Failure
        message={error || orders.error}
        retry={() => void orders.refresh()}
      />
      {message && <p role="status">{message}</p>}
      {orders.loading && !orders.data ? (
        <p role="status">Loading orders…</p>
      ) : !filtered.length ? (
        <Empty
          title="No orders to show"
          text={
            filter
              ? "There are no orders with this status."
              : "Orders will appear here when customers complete checkout."
          }
        />
      ) : (
        filtered.map((o) => (
          <details className="admin-order" key={o.id}>
            <summary>
              <strong>
                {o.name} · {o.id.slice(0, 8)}
              </strong>
              <span>{date(o.created)}</span>
              <Status value={o.status} />
              <span className="money">{currency(o.total, o.currency)}</span>
            </summary>
            <div className="admin-order-details">
              <ul className="admin-order-lines">
                {o.items.map((item, index) => (
                  <li key={index}>
                    {item.quantity} × {item.name}{" "}
                    {item.size && `· ${item.size}`}{" "}
                    {item.color && `· ${item.color}`} —{" "}
                    {currency(item.price * item.quantity, o.currency)}
                  </li>
                ))}
              </ul>
              <strong>Delivery details</strong>
              <address>
                {o.name}
                <br />
                {o.address}
                <br />
                <a href={`tel:${o.phone}`}>{o.phone}</a>
              </address>
              <p>Order recorded · Payment is arranged separately.</p>
              {o.status !== "delivered" && (
                <button
                  className="gold"
                  disabled={busy === o.id}
                  onClick={async () => {
                    setBusy(o.id);
                    setError("");
                    const next = sequence[sequence.indexOf(o.status) + 1];
                    try {
                      await api(`/admin/orders/${o.id}`, "PUT", {
                        status: next,
                      });
                      setMessage(`Order ${o.id.slice(0, 8)} marked ${next}.`);
                      await orders.refresh();
                    } catch (e) {
                      setError(errorText(e));
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  {busy === o.id
                    ? "Updating…"
                    : `Mark ${sequence[sequence.indexOf(o.status) + 1]}`}
                </button>
              )}
            </div>
          </details>
        ))
      )}
    </>
  );
}

export function Library() {
  const [kind, setKind] = useState("stock-models"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const photos = useLoad<LibraryPhoto[]>(`/admin/${kind}`);
  const room = kind === "room-templates";
  return (
    <>
      <div className="admin-heading">
        <div>
          <h1>Your photo library</h1>
          <p>Reusable model and room photos for a consistent store catalog.</p>
        </div>
      </div>
      <div className="admin-tabs">
        <button
          aria-pressed={!room}
          disabled={busy}
          onClick={() => {
            setKind("stock-models");
            setError("");
            setMessage("");
          }}
        >
          Models
        </button>
        <button
          aria-pressed={room}
          disabled={busy}
          onClick={() => {
            setKind("room-templates");
            setError("");
            setMessage("");
          }}
        >
          Rooms
        </button>
      </div>
      <Failure
        message={error || photos.error}
        retry={() => void photos.refresh()}
      />
      {message && <p role="status">{message}</p>}
      <div className="admin-split">
        <section>
          {photos.loading ? (
            <p role="status">Loading library…</p>
          ) : photos.data?.length ? (
            <div className="admin-library-grid">
              {photos.data.map((photo) => (
                <figure className="library-photo" key={photo.id}>
                  <img src={photo.url} alt={photo.label} loading="lazy" />
                  <figcaption>
                    <strong>{photo.label}</strong>
                    <small>
                      {room
                        ? photo.room_type
                        : [photo.gender, photo.body_type]
                            .filter(Boolean)
                            .join(" · ")}
                    </small>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <Empty
              title={room ? "Add your first room" : "Add your first model"}
              text={
                room
                  ? "Use a well-lit room photo with a clear place for the product."
                  : "Upload a full-length model photo that you have permission to reuse."
              }
            />
          )}
        </section>
        <form
          key={kind}
          className="admin-panel"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const body = new FormData(form);
            setBusy(true);
            setError("");
            body.set("permission", "true");
            try {
              await api(`/admin/${kind}`, "POST", body);
              setMessage("Photo added to your private library.");
              form.reset();
              await photos.refresh();
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>{room ? "Add a room photo" : "Add a model photo"}</h2>
          <p className="muted">
            {room
              ? "Show the floor and walls clearly, without strong filters."
              : "Show the person from head to toe, in even lighting. Their pose and body shape guide the preview."}
          </p>
          <label className="field">
            Photo label
            <input
              name="label"
              required
              maxLength={120}
              placeholder={
                room ? "e.g. Sunlit living room" : "e.g. Asha · front pose"
              }
            />
          </label>
          {room ? (
            <label className="field">
              Room type
              <input
                name="room_type"
                maxLength={120}
                placeholder="e.g. Living room"
              />
            </label>
          ) : (
            <>
              <label className="field">
                Collection
                <select name="gender" defaultValue="unisex">
                  <option value="unisex">Unisex</option>
                  <option value="women">Women</option>
                  <option value="men">Men</option>
                </select>
              </label>
              <label className="field">
                Body or pose notes (optional)
                <input
                  name="body_type"
                  maxLength={120}
                  placeholder="Describe the supplied photo"
                />
              </label>
            </>
          )}
          <label className="field">
            {room ? "Room photo" : "Model photo"}
            <input
              name="file"
              type="file"
              aria-label={room ? "Room photo" : "Model photo"}
              aria-describedby="library-photo-hint"
              accept="image/jpeg,image/png,image/webp"
              required
            />
            <small id="library-photo-hint">
              JPEG, PNG or WebP · up to 10 MiB · at least 512 px.
            </small>
          </label>
          <label className="check">
            <input type="checkbox" required />I have permission to reuse this
            photo for catalog previews.
          </label>
          <button className="gold wide" disabled={busy}>
            {busy ? "Adding photo…" : "Add to library"}
          </button>
        </form>
      </div>
    </>
  );
}

export function Generator() {
  const products = useLoad<Product[]>("/admin/products"),
    models = useLoad<LibraryPhoto[]>("/admin/stock-models"),
    rooms = useLoad<LibraryPhoto[]>("/admin/room-templates"),
    health = useLoad<Health>("/health");
  const [productId, setProductId] = useState(""),
    [photoId, setPhotoId] = useState(""),
    [job, setJob] = useState<Job>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const product = products.data?.find((p) => p.id === productId),
    room = !!product && roomCategories.includes(product.category),
    unsupported = !!product && ["watch", "shoes"].includes(product.category);
  const path = `/admin/ai-generate/${room ? "room-placement" : "model-tryon"}`;
  const choices = (room ? rooms.data : models.data) || [];
  const processing = !!job && !terminal(job);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get(
      "product",
    );
    if (requested) setProductId(requested);
    void ensureSession()
      .then(() => {
        for (const route of [
          "/admin/ai-generate/model-tryon",
          "/admin/ai-generate/room-placement",
        ]) {
          const pending = savedGeneration(route);
          if (
            pending &&
            (!requested || requested === pending.payload.product_id) &&
            (!pending.job || !terminal(pending.job))
          ) {
            setProductId(String(pending.payload.product_id));
            setPhotoId(
              String(
                pending.payload.stock_model_id ||
                  pending.payload.room_template_id,
              ),
            );
            setJob(pending.job);
            break;
          }
        }
      })
      .catch((e) => setError(errorText(e)));
  }, []);
  useEffect(() => {
    if (!job || terminal(job)) return;
    let active = true;
    const timer = setInterval(() => {
      void api<Job>(`/style-it/jobs/${job.job_id}`)
        .then((next) => {
          if (active) setJob(next);
        })
        .catch((e) => {
          if (active) setError(errorText(e));
        });
    }, 1800);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [job?.job_id, job?.status]);
  return (
    <>
      <div className="admin-heading">
        <div>
          <h1>Create catalog images</h1>
          <p>
            Your product, your chosen model or room. Every result stays a draft
            until reviewed.
          </p>
        </div>
      </div>
      <Failure
        message={error || products.error || models.error || rooms.error}
      />
      <div className="admin-split">
        <section className="admin-panel">
          <h2>Choose a product</h2>
          <label className="field">
            Product
            <select
              value={productId}
              disabled={busy || processing}
              onChange={(e) => {
                setProductId(e.target.value);
                setPhotoId("");
                setJob(undefined);
                setError("");
              }}
            >
              <option value="">Choose a product</option>
              {products.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.sku}
                </option>
              ))}
            </select>
          </label>
          {product && <ProductLabel product={product} />}
          {product && !product.reference_id && (
            <div className="admin-callout">
              Confirm an original product reference before generating.{" "}
              <Link href={`/admin/products/${product.id}?step=images`}>
                Prepare product photos
              </Link>
            </div>
          )}
          {unsupported ? (
            <div className="admin-callout">
              <p>
                Watches and shoes use the product editor’s image-editing
                provider. The clothing model does not support these items.
              </p>
              <Link className="button" href={`/admin/products/${productId}`}>
                Open product editor
              </Link>
            </div>
          ) : (
            product && (
              <>
                <h2 style={{ marginTop: 30 }}>
                  {room ? "Choose a room" : "Choose a model"}
                </h2>
                <p className="muted">
                  {room
                    ? "This photo becomes the background for your product preview."
                    : "The preview uses this person’s photo and your confirmed original garment. Start with a clear front pose."}
                </p>
                {choices.length ? (
                  <div className="admin-library-grid">
                    {choices.map((photo) => (
                      <button
                        type="button"
                        className="library-choice"
                        key={photo.id}
                        aria-label={`Choose ${photo.label}`}
                        aria-pressed={photoId === photo.id}
                        disabled={busy || processing}
                        onClick={() => setPhotoId(photo.id)}
                      >
                        <figure className="library-photo">
                          <img src={photo.url} alt="" loading="lazy" />
                          <figcaption>
                            <strong>{photo.label}</strong>
                            <small>
                              {room
                                ? photo.room_type
                                : [photo.gender, photo.body_type]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </small>
                          </figcaption>
                        </figure>
                      </button>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title={
                      room
                        ? "Add a room to your library"
                        : "Add a model to your library"
                    }
                    text="Upload a photo before creating this preview."
                    href="/admin/models"
                    action="Open photo library"
                  />
                )}
                {room && health.data?.room_provider === "composite" && (
                  <p className="admin-callout">
                    Room placement is an approximate overlay, labelled “ROOM
                    PLACEMENT DEMO – not to scale”. It does not measure fit or
                    perspective.
                  </p>
                )}
                <button
                  style={{ marginTop: 24 }}
                  className="gold wide"
                  disabled={
                    busy || processing || !photoId || !product.reference_id
                  }
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      setJob(
                        await generationRequest(
                          path,
                          {
                            product_id: productId,
                            [room ? "room_template_id" : "stock_model_id"]:
                              photoId,
                            view: "front",
                          },
                          job && terminal(job) ? job.job_id : undefined,
                        ),
                      );
                    } catch (e) {
                      setError(errorText(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy
                    ? "Starting preview…"
                    : processing
                      ? "Creating your preview…"
                      : job?.status === "completed"
                        ? "Create another preview"
                        : "Create preview"}
                </button>
              </>
            )
          )}
        </section>
        <section className="admin-panel" aria-live="polite">
          <h2>Preview & review</h2>
          {!job ? (
            <p className="muted">
              Your preview will appear here. Compare the person, product details
              and shape before publishing.
            </p>
          ) : (
            <>
              {processing && (
                <>
                  <p role="status">Creating your catalog preview…</p>
                  <div className="admin-progress" />
                  <p className="muted">
                    This can take a minute or longer. You can return to this
                    page to check the same request.
                  </p>
                </>
              )}
              {job.result_image_url && (
                <img
                  className="admin-preview"
                  src={job.result_image_url}
                  alt={
                    job.fixture
                      ? "Fixed demonstration result, not personalized"
                      : "Catalog preview awaiting review"
                  }
                />
              )}
              {job.fixture && (
                <p className="admin-callout">
                  Fixed demonstration sample · This is not a personalized
                  result.
                </p>
              )}
              {job.visualization_kind === "room_composite" && (
                <p className="admin-callout">
                  Room placement demo · Approximate overlay, not to scale.
                </p>
              )}
              {job.message && <p>{job.message}</p>}
              {job.status === "completed" && (
                <>
                  <p>
                    The image is still private. Review it with the original,
                    approve your selection, then publish.
                  </p>
                  <Link
                    className="button gold"
                    href={`/admin/products/${productId}?step=review`}
                  >
                    Review & publish <Icon name="arrow" size={16} />
                  </Link>
                </>
              )}
              {job.status === "needs_review" && (
                <p className="admin-callout">
                  This request needs attention.{" "}
                  <Link href={`/admin/products/${productId}`}>
                    Open the product editor
                  </Link>{" "}
                  to review its status before another attempt.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
