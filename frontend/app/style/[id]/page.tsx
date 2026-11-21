"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import TryOn from "@/components/TryOn";
import { api, Product, errorText } from "@/lib/api";
import { categoryName } from "@/lib/catalog";

const views = ["front", "back", "left", "right"];
export default function StylePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [product, setProduct] = useState<Product>(),
    [view, setView] = useState("front"),
    [error, setError] = useState("");
  useEffect(() => {
    api<Product>(`/products/${id}`)
      .then(setProduct)
      .catch((e) => setError(errorText(e)));
  }, [id]);
  return (
    <>
      <Header />
      <main className="style-main">
        <Link className="back-link" href={`/products/${id}`}>
          ← Back to product
        </Link>
        {error ? (
          <div className="empty" role="alert">
            <h1>Product unavailable</h1>
            <p>{error}</p>
          </div>
        ) : !product ? (
          <p role="status">Loading your styling space…</p>
        ) : (
          <>
            <div className="style-heading">
              <h1>
                {["furniture", "decor", "curtains"].includes(product.category)
                  ? "See it in your space."
                  : "Style it on you."}
              </h1>
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
                <nav className="view-tabs" aria-label="Photo views">
                  {views.map((v) => (
                    <button
                      key={v}
                      aria-pressed={v === view}
                      className={v === view ? "active" : ""}
                      onClick={() => setView(v)}
                    >
                      {v === "front"
                        ? "Front"
                        : v === "back"
                          ? "Back"
                          : `${v[0].toUpperCase() + v.slice(1)} side`}
                    </button>
                  ))}
                </nav>
                <p className="view-guidance">
                  {["furniture", "decor", "curtains"].includes(product.category)
                    ? "Upload a room photo from each direction you want to preview."
                    : "Upload a matching photo for each view you want. Side and back previews need side and back photos; we don’t know your unseen shape from a front photo."}{" "}
                  Unseen product details may be approximated.
                </p>
                <TryOn key={`${id}:${view}`} product={product} view={view} />
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}
