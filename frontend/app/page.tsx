"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { categories, audiences, categoryName, audienceOf } from "@/lib/catalog";
import Header from "@/components/Header";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { api, Product, money, errorText, Health } from "@/lib/api";
export default function Store() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]),
    [category, setCategory] = useState("all"),
    [audience, setAudience] = useState("all"),
    [search, setSearch] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
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
      (audience === "all" ||
        audienceOf(p) === audience ||
        (audience !== "unisex" && audienceOf(p) === "unisex")) &&
      `${p.name} ${p.sku}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <Header />
      <nav className="category-nav" aria-label="Collections">
        {[
          ["all", "All products"],
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
        <div className="collection-intro">
          <h1>Find your next look.</h1>
          <p>
            Clothing, accessories and pieces for your space. Preview your
            choice.
          </p>
        </div>
        <div className="collection-filters">
          <div
            className="audience-tabs"
            role="group"
            aria-label="Shop by collection"
          >
            {audiences.map(([value, label]) => (
              <button
                key={value}
                aria-pressed={audience === value}
                className={audience === value ? "active" : ""}
                onClick={() => setAudience(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="category-select">
            Garment type
            <select
              aria-label="Garment type"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">All products</option>
              {categories.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="collection-heading">
          <div>
            <h2>
              {category === "saree"
                ? "Sarees"
                : category === "suit"
                  ? "Suits"
                  : category !== "all"
                    ? categoryName(category)
                    : "The collection"}
            </h2>
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
                  {categoryName(p.category)} · {audienceOf(p)}
                  {p.sizes ? ` · ${p.sizes}` : ""}
                </p>
                <button
                  className="gold wide"
                  onClick={() => {
                    router.push(`/style/${p.id}`);
                  }}
                >
                  {["furniture", "decor", "curtains"].includes(p.category)
                    ? "See it in my room"
                    : "Style it on me"}{" "}
                  <Icon name="arrow" size={16} />
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
                : "Reviewed garments will appear here once the merchant publishes them."}
            </p>
            {products.length ? (
              <button
                onClick={() => {
                  setSearch("");
                  setCategory("all");
                  setAudience("all");
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
        onClick={() => {
          document
            .querySelector(".product-grid")
            ?.scrollIntoView({ behavior: "smooth" });
        }}
      >
        <Icon name="spark" />
        <span className="visually-hidden">Style it your way</span>
      </button>
    </>
  );
}
