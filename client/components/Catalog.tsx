"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Product, money } from "@/lib/api";
import { audiences, categories } from "@/lib/catalog";
import Icon from "@/components/Icon";
import Header from "./Header";
import Footer from "./Footer";
import { useResource } from "../lib/useResource";
type Collection = {
  items: Product[];
  total: number;
  page: number;
  limit: number;
};
export function ProductCard({ product }: { product: Product }) {
  const image = product.images[0];
  return (
    <article className="product-card customer-product-card">
      <Link
        href={`/products/${product.id}`}
        className="product-photo"
        aria-label={`View ${product.name}`}
      >
        {image ? (
          <img src={image.url} alt={product.name} loading="lazy" />
        ) : (
          <span>Image coming soon</span>
        )}
        {product.fixture && (
          <span className="sample-label">Demonstration sample</span>
        )}
      </Link>
      <div className="card-copy">
        <Link href={`/products/${product.id}`}>
          <h3>{product.name}</h3>
        </Link>
        <p>
          {product.fixture
            ? "Sample · not for sale"
            : money(product) || "Price on request"}
        </p>
        <Link className="card-try" href={`/style/${product.id}`}>
          <Icon name="spark" size={15} />
          {["furniture", "decor", "curtains"].includes(product.category)
            ? "View in your room"
            : "Try it on me"}
        </Link>
      </div>
    </article>
  );
}
function Skeletons() {
  return (
    <div className="customer-grid" aria-label="Loading products">
      {[0, 1, 2, 3].map((value) => (
        <div key={value} className="product-skeleton" aria-hidden="true" />
      ))}
    </div>
  );
}
export function Home() {
  const collection = useResource<Collection>("/shop?sort=newest&limit=8");
  const hero = collection.data?.items[0];
  return (
    <>
      <Header />
      <main id="customer-content">
        <section className="customer-hero">
          <div className="hero-copy">
            <h1>
              Find your
              <br />
              next look.
            </h1>
            <p>
              Clothing, accessories and pieces for your space. Discover the
              collection, then make it your own.
            </p>
            <Link href="/shop" className="button gold">
              Explore the collection <Icon name="arrow" size={18} />
            </Link>
            <Link href="/studio" className="hero-secondary">
              Style an outfit with your photo
            </Link>
          </div>
          {hero ? (
            <Link href={`/products/${hero.id}`} className="hero-photo">
              <img
                src={hero.images[0]?.url}
                alt={hero.name}
                fetchPriority="high"
              />
              <span>
                {hero.name}
                {hero.fixture && " · demonstration sample"}
              </span>
            </Link>
          ) : (
            <div className="hero-photo product-skeleton" aria-hidden="true" />
          )}
        </section>
        <section className="customer-section">
          <div className="customer-section-heading">
            <div>
              <h2>Explore your way</h2>
              <p>For everyday moments and the ones you dress up for.</p>
            </div>
          </div>
          <nav className="category-links" aria-label="Explore categories">
            {[
              ["saree", "Sarees"],
              ["suit", "Suits & sets"],
              ["dress", "Dresses"],
              ["watch", "Watches"],
              ["furniture", "Furniture"],
              ["decor", "Home decor"],
            ].map(([id, label]) => (
              <Link href={`/shop?category=${id}`} key={id}>
                {label}
                <Icon name="arrow" size={17} />
              </Link>
            ))}
          </nav>
        </section>
        <section className="customer-section">
          <div className="customer-section-heading">
            <div>
              <h2>New to the collection</h2>
              <p>Browse the latest published products.</p>
            </div>
            <Link href="/shop">View all products</Link>
          </div>
          {collection.error ? (
            <div role="alert" className="empty">
              <p>{collection.error}</p>
              <button onClick={collection.reload}>Try again</button>
            </div>
          ) : collection.loading ? (
            <Skeletons />
          ) : collection.data?.items.length ? (
            <div className="customer-grid">
              {collection.data.items.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="empty">
              <h3>The collection is on its way</h3>
              <p>Products will appear here after the store publishes them.</p>
            </div>
          )}
        </section>
        <section className="customer-how">
          <h2>See it in your own way.</h2>
          <p>
            Choose a product, upload a clear photo and explore a private
            preview. Your photo and result expire after one hour, and you can
            delete them sooner.
          </p>
          <Link href="/shop" className="button">
            Find something to try
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
export function Shop({ query }: { query: string }) {
  const router = useRouter(),
    params = new URLSearchParams(query);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const apiQuery = new URLSearchParams(query);
  apiQuery.set("limit", "16");
  const collection = useResource<Collection>(`/shop?${apiQuery}`);
  const pageLink = (page: number) => {
    const next = new URLSearchParams(query);
    next.set("page", String(page));
    return `/shop?${next}`;
  };
  return (
    <>
      <Header />
      <main id="customer-content" className="customer-section customer-shop">
        <div className="customer-section-heading">
          <div>
            <h1>The collection</h1>
            <p>Find a piece for you, or something for your space.</p>
          </div>
          <Link href="/studio" className="button">
            Style an outfit <Icon name="spark" size={17} />
          </Link>
        </div>
        <button
          className="mobile-filter-button"
          aria-controls="shop-filter-panel"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((value) => !value)}
        >
          {filtersOpen ? "Close filters" : "Search & filters"}
        </button>
        <div className="customer-shop-layout">
          <aside
            id="shop-filter-panel"
            className={`shop-filters ${filtersOpen ? "filters-open" : ""}`}
          >
            <form
              key={query}
              onSubmit={(e) => {
                e.preventDefault();
                const values = new FormData(e.currentTarget),
                  next = new URLSearchParams();
                for (const [key, raw] of values) {
                  const value = String(raw).trim();
                  if (value)
                    next.set(
                      key,
                      ["min_price", "max_price"].includes(key)
                        ? String(Math.round(Number(value) * 100))
                        : value,
                    );
                }
                setFiltersOpen(false);
                router.push(`/shop?${next}`);
              }}
            >
              <h2>Find your piece</h2>
              <label className="field">
                Search
                <input
                  name="q"
                  type="search"
                  defaultValue={params.get("q") || ""}
                  placeholder="Product name or SKU"
                />
              </label>
              <label className="field">
                Collection
                <select
                  name="audience"
                  defaultValue={params.get("audience") || ""}
                >
                  {audiences.map(([id, label]) => (
                    <option key={id} value={id === "all" ? "" : id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Category
                <select
                  name="category"
                  defaultValue={params.get("category") || ""}
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
                Color
                <input
                  name="color"
                  defaultValue={params.get("color") || ""}
                  placeholder="e.g. Emerald"
                />
              </label>
              <label className="field">
                Size
                <input
                  name="size"
                  defaultValue={params.get("size") || ""}
                  placeholder="e.g. M"
                />
              </label>
              <div className="price-range">
                <label className="field">
                  Min. price
                  <input
                    name="min_price"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={
                      params.has("min_price")
                        ? Number(params.get("min_price")) / 100
                        : ""
                    }
                  />
                </label>
                <label className="field">
                  Max. price
                  <input
                    name="max_price"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={
                      params.has("max_price")
                        ? Number(params.get("max_price")) / 100
                        : ""
                    }
                  />
                </label>
              </div>
              <label className="field">
                Sort by
                <select
                  name="sort"
                  defaultValue={params.get("sort") || "newest"}
                >
                  <option value="newest">Newest first</option>
                  <option value="price_asc">Price: low to high</option>
                  <option value="price_desc">Price: high to low</option>
                  <option value="popular">Popular</option>
                </select>
              </label>
              <button className="gold wide">Apply filters</button>
              <Link className="clear-filters" href="/shop">
                Clear filters
              </Link>
            </form>
          </aside>
          <section className="shop-results" aria-label="Products">
            <p className="result-count" role="status">
              {collection.loading
                ? "Finding your products…"
                : `${collection.data?.total || 0} products`}
            </p>
            {collection.error ? (
              <div role="alert" className="empty">
                <p>{collection.error}</p>
                <button onClick={collection.reload}>Try again</button>
              </div>
            ) : collection.loading ? (
              <Skeletons />
            ) : !collection.data?.items.length ? (
              <div className="empty">
                <h2>No matching products</h2>
                <p>Try another category, name or price range.</p>
                <Link href="/shop">Clear filters</Link>
              </div>
            ) : (
              <>
                <div className="customer-grid">
                  {collection.data.items.map((product) => (
                    <ProductCard product={product} key={product.id} />
                  ))}
                </div>
                <nav className="shop-pagination" aria-label="Product pages">
                  {collection.data.page > 1 && (
                    <Link
                      className="button"
                      href={pageLink(collection.data.page - 1)}
                    >
                      Previous
                    </Link>
                  )}
                  <span>
                    Page {collection.data.page} of{" "}
                    {Math.max(
                      1,
                      Math.ceil(collection.data.total / collection.data.limit),
                    )}
                  </span>
                  {collection.data.page * collection.data.limit <
                    collection.data.total && (
                    <Link
                      className="button"
                      href={pageLink(collection.data.page + 1)}
                    >
                      Next
                    </Link>
                  )}
                </nav>
              </>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
