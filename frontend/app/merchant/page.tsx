"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, errorText, Product, Health, logout } from "@/lib/api";
import MerchantGate from "@/components/MerchantGate";
import { categoryName, audienceOf } from "@/lib/catalog";
import Header from "@/components/Header";
import Icon from "@/components/Icon";
function Catalog() {
  const [products, setProducts] = useState<Product[]>([]),
    [filter, setFilter] = useState("all"),
    [health, setHealth] = useState<Health>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = () => {
    setLoading(true);
    Promise.all([api<Product[]>("/merchant/products"), api<Health>("/health")])
      .then(([p, h]) => {
        setProducts(p);
        setHealth(h);
      })
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    const timer = setInterval(
      () =>
        api<Product[]>("/merchant/products")
          .then(setProducts)
          .catch(() => {}),
      4000,
    );
    return () => clearInterval(timer);
  }, []);
  const status = (p: Product) =>
    p.status || (p.published ? "Published" : "Draft");
  const visible = products.filter(
    (p) =>
      filter === "all" ||
      (filter === "Published" ? p.published : status(p) === filter),
  );
  return (
    <>
      <Header merchant />
      <main className="studio-main">
        <div className="studio-heading">
          <div>
            <h1>Merchant studio</h1>
            <p>
              Good imagery starts with the garment. You choose what goes live.
            </p>
          </div>
          <Link className="gold button" href="/merchant/products/new">
            <Icon name="upload" />
            Add a garment
          </Link>
        </div>
        <div className="studio-toolbar">
          <div className="tabs">
            {["all", "Draft", "Generating", "Needs review", "Published"].map(
              (s) => (
                <button
                  key={s}
                  className={filter === s ? "active" : ""}
                  onClick={() => setFilter(s)}
                >
                  {s === "all" ? "All garments" : s}
                </button>
              ),
            )}
          </div>
          <button
            className="text-link"
            onClick={async () => {
              await logout();
              window.location.reload();
            }}
          >
            Lock studio
          </button>
        </div>
        {health && (
          <div className="setup-status">
            {health.generation_mode === "fixture" ? (
              <>
                <span className="status-dot demo" />
                Demonstration mode — labelled samples, no paid calls
              </>
            ) : (
              <>
                <span
                  className={`status-dot ${health.provider_ready ? "ready" : ""}`}
                />
                {health.provider_ready
                  ? `${health.remaining_allowance} generation requests remaining`
                  : "Live generation not configured"}
                <span className="status-separator" />
                Photo validation{" "}
                {health.validator_ready ? "ready" : "requires setup"}
              </>
            )}
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={load}>Reload</button>
          </div>
        )}
        {loading ? (
          <p role="status">Loading your catalog…</p>
        ) : visible.length ? (
          <div className="catalog-table">
            <div className="table-heading">
              <span>Garment</span>
              <span>Category</span>
              <span>Photos</span>
              <span>Status</span>
              <span />
            </div>
            {visible.map((p) => (
              <Link
                href={`/merchant/products/${p.id}`}
                className="catalog-row"
                key={p.id}
              >
                <div className="catalog-product">
                  {p.images[0] ? (
                    <img src={p.images[0].url} alt="" />
                  ) : (
                    <span className="catalog-placeholder">
                      <Icon name="bag" />
                    </span>
                  )}
                  <div>
                    <strong>{p.name}</strong>
                    <small>{p.sku}</small>
                  </div>
                </div>
                <span className="capitalize">
                  {categoryName(p.category)}
                  <small className="catalog-audience">{audienceOf(p)}</small>
                </span>
                <span>{p.images.length} images</span>
                <span className={`pill ${p.published ? "published" : ""}`}>
                  {status(p)}
                </span>
                <Icon name="chevron" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty">
            <Icon name="bag" size={40} />
            <h2>
              {products.length
                ? "No garments in this view"
                : "Start with one garment"}
            </h2>
            <p>
              Use clear product photos, or select a garment from a PDF catalog.
              Your work stays in draft until you publish.
            </p>
            <Link className="gold button" href="/merchant/products/new">
              Add your first garment
              <Icon name="arrow" />
            </Link>
          </div>
        )}
        <div className="studio-footnote">
          <strong>Originals stay intact.</strong>
          <p>
            Each generated image needs your review. Check color, print, border,
            drape and all included pieces before publishing.
          </p>
        </div>
      </main>
    </>
  );
}
export default function Merchant() {
  return (
    <MerchantGate>
      <Catalog />
    </MerchantGate>
  );
}
