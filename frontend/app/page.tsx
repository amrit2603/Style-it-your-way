"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import TryOn from "@/components/TryOn";
import Icon from "@/components/Icon";
import { api, Product, money, errorText, Health } from "@/lib/api";
export default function Store() {
  const [products, setProducts] = useState<Product[]>([]),
    [category, setCategory] = useState("all"),
    [search, setSearch] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<Product | null>(null),
    [open, setOpen] = useState(false),
    [health, setHealth] = useState<Health>();
  const load = () => {
    setLoading(true);
    setError("");
    api<Product[]>("/products")
      .then(setProducts)
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    api<Health>("/health")
      .then(setHealth)
      .catch(() => {});
  }, []);
  const shown = products.filter(
    (p) =>
      (category === "all" || p.category === category) &&
      `${p.name} ${p.sku}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <Header />
      <nav className="category-nav" aria-label="Collections">
        {[
          ["all", "All garments"],
          ["saree", "Sarees"],
          ["suit", "Suits"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={category === value ? "active" : ""}
            onClick={() => setCategory(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {health?.generation_mode === "fixture" && (
        <div className="fixture-banner">
          Demonstration catalog · AI previews are labelled samples, not
          personalized results
        </div>
      )}
      <main className="store-main">
        <div className="collection-heading">
          <div>
            <h1>
              {category === "saree"
                ? "Sarees"
                : category === "suit"
                  ? "Suits"
                  : "The collection"}
            </h1>
            <p>Find your garment. Make the look your own.</p>
          </div>
          <label className="search">
            <Icon name="search" />
            <input
              aria-label="Search garments"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the collection"
            />
          </label>
        </div>
        <div className="collection-meta">
          <span>
            {loading
              ? "Loading collection…"
              : `${shown.length} garment${shown.length === 1 ? "" : "s"}`}
          </span>
          <span>Chosen by you. Visualized with AI.</span>
        </div>
        {error ? (
          <div className="empty" role="alert">
            <h2>The collection couldn’t load</h2>
            <p>{error}</p>
            <button onClick={load}>Try again</button>
          </div>
        ) : loading ? (
          <div className="product-grid" aria-label="Loading garments">
            {[0, 1, 2, 3].map((i) => (
              <div className="skeleton" key={i} />
            ))}
          </div>
        ) : shown.length ? (
          <div className="product-grid">
            {shown.map((p) => (
              <article className="product-card" key={p.id}>
                <Link href={`/products/${p.id}`} className="product-photo">
                  {p.images[0] ? (
                    <img src={p.images[0].url} alt={p.name} />
                  ) : (
                    <div className="image-empty">Image coming soon</div>
                  )}
                  {p.images[0]?.kind === "generated" && (
                    <span className="image-label">AI catalog image</span>
                  )}
                </Link>
                <div className="product-caption">
                  <Link href={`/products/${p.id}`}>
                    <h2>{p.name}</h2>
                  </Link>
                  <span>{money(p)}</span>
                </div>
                <p className="product-category">
                  {p.category === "saree" ? "Saree" : "Suit"}
                  {p.sizes ? ` · ${p.sizes}` : ""}
                </p>
                <button
                  className="gold wide"
                  onClick={() => {
                    setSelected(p);
                    setOpen(true);
                  }}
                >
                  Style it on me <Icon name="arrow" size={16} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">
            <Icon name="bag" size={36} />
            <h2>
              {products.length
                ? "No garments match your search"
                : "The collection is being prepared"}
            </h2>
            <p>
              {products.length
                ? "Try another name or collection."
                : "Reviewed sarees and suits will appear here once the merchant publishes them."}
            </p>
            {products.length ? (
              <button
                onClick={() => {
                  setSearch("");
                  setCategory("all");
                }}
              >
                Clear filters
              </button>
            ) : (
              <Link className="text-link" href="/merchant">
                Open merchant studio <Icon name="arrow" size={16} />
              </Link>
            )}
          </div>
        )}
      </main>
      <footer className="site-footer">
        <span className="footer-brand">VYUMI</span>
        <p>A new perspective on your personal style.</p>
        <span>
          AI visuals are illustrative. Garment details remain the merchant’s.
        </span>
      </footer>
      <button
        className="chat-launcher"
        aria-label="Style it your way"
        title="Style it your way"
        onClick={() => setOpen(true)}
      >
        <Icon name="spark" />
        <span className="visually-hidden">Style it your way</span>
      </button>
      {open && (
        <TryOn
          product={selected}
          products={products}
          onSelect={setSelected}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
