"use client";
import { useState } from "react";
import Link from "next/link";
import { Product } from "@/lib/api";
import { canCombine, categoryName } from "@/lib/catalog";
import TryOn from "@/components/TryOn";
import Header from "./Header";
import Footer from "./Footer";
import { useResource } from "../lib/useResource";
const views = ["front", "back", "left", "right"];
export default function Styling({ id }: { id: string }) {
  const item = useResource<Product>(`/products/${id}`),
    [view, setView] = useState("front");
  const product = item.data,
    room =
      !!product &&
      ["furniture", "decor", "curtains"].includes(product.category);
  return (
    <>
      <Header />
      <main id="customer-content" className="style-main customer-section">
        <Link className="back-link" href={`/products/${id}`}>
          Back to product
        </Link>
        {item.error ? (
          <div className="empty" role="alert">
            <h1>Product unavailable</h1>
            <p>{item.error}</p>
          </div>
        ) : !product ? (
          <p role="status">Opening your styling space…</p>
        ) : (
          <>
            <div className="style-heading">
              <h1>{room ? "See it in your space." : "Style it on you."}</h1>
              <p>One selected product. Your own photo.</p>
            </div>
            <div className="style-workspace">
              <aside className="style-product">
                {product.images[0] && (
                  <img src={product.images[0].url} alt={product.name} />
                )}
                <h2>{product.name}</h2>
                <p>
                  {categoryName(product.category)} · {product.sku}
                </p>
                {product.sizes && <p>Available sizes: {product.sizes}</p>}
                <p className="muted">This page previews only this product.</p>
              </aside>
              <div className="style-controls">
                {!room && (
                  <nav className="view-tabs" aria-label="Photo views">
                    {views.map((value) => (
                      <button
                        key={value}
                        aria-pressed={view === value}
                        className={view === value ? "active" : ""}
                        onClick={() => setView(value)}
                      >
                        {value === "front"
                          ? "Front"
                          : value === "back"
                            ? "Back"
                            : `${value[0].toUpperCase() + value.slice(1)} side`}
                      </button>
                    ))}
                  </nav>
                )}
                <TryOn
                  key={`${id}:${view}`}
                  product={product}
                  view={view}
                  comparisonSlider
                />
              </div>
            </div>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
export function Outfit() {
  const collection = useResource<{ items: Product[] }>("/shop?limit=60"),
    [selected, setSelected] = useState<Product[]>([]);
  const clothing =
    collection.data?.items.filter(
      (product) =>
        !["shoes", "watch", "furniture", "decor", "curtains"].includes(
          product.category,
        ),
    ) || [];
  return (
    <>
      <Header />
      <main id="customer-content" className="customer-section">
        <div className="customer-section-heading">
          <div>
            <h1>Style an outfit</h1>
            <p>
              Choose up to three compatible pieces, then use one clear front
              photo.
            </p>
          </div>
          <Link href="/shop">Back to shopping</Link>
        </div>
        {collection.error && (
          <p className="error" role="alert">
            {collection.error}
          </p>
        )}
        <div className="outfit-layout">
          <section>
            <div className="customer-grid">
              {clothing.map((product) => {
                const checked = selected.some((item) => item.id === product.id),
                  disabled = !checked && !canCombine(selected, product);
                return (
                  <label
                    key={product.id}
                    className={`outfit-choice ${checked ? "selected" : ""} ${disabled ? "unavailable" : ""}`}
                  >
                    <img src={product.images[0]?.url} alt="" loading="lazy" />
                    <span>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() =>
                          setSelected((items) =>
                            checked
                              ? items.filter((item) => item.id !== product.id)
                              : [...items, product],
                          )
                        }
                      />
                      {product.name}
                    </span>
                  </label>
                );
              })}
            </div>
            {!collection.loading && !clothing.length && (
              <p>The store has not published clothing to combine yet.</p>
            )}
          </section>
          <section className="outfit-preview">
            <h2>Your selected outfit</h2>
            {selected.length ? (
              <>
                <ul>
                  {selected.map((product) => (
                    <li key={product.id}>{product.name}</li>
                  ))}
                </ul>
                <p className="muted">
                  Inspect every piece in the result. Multi-piece transfers may
                  change earlier details.
                </p>
                <TryOn
                  key={selected.map((product) => product.id).join(",")}
                  product={selected[0]}
                  additionalProducts={selected.slice(1)}
                  view="front"
                  comparisonSlider
                />
              </>
            ) : (
              <p>
                Select a piece to begin. A full outfit such as a saree or suit
                cannot be combined with another top or bottom.
              </p>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
