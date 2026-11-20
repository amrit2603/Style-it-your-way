"use client";
import { categoryName, audienceOf } from "@/lib/catalog";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import TryOn from "@/components/TryOn";
import Icon from "@/components/Icon";
import { api, Product, money, errorText } from "@/lib/api";
export default function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [product, setProduct] = useState<Product>(),
    [active, setActive] = useState(0),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false);
  useEffect(() => {
    api<Product>(`/products/${id}`)
      .then(setProduct)
      .catch((e) => setError(errorText(e)));
  }, [id]);
  return (
    <>
      <Header />
      {product?.fixture && (
        <div className="fixture-banner">
          AI-created demonstration garment · not real merchandise or a
          personalized result
        </div>
      )}
      <main className="detail-main">
        <Link href="/" className="back-link">
          ← Back to the collection
        </Link>
        {error ? (
          <div role="alert" className="empty">
            <h1>Garment unavailable</h1>
            <p>{error}</p>
          </div>
        ) : !product ? (
          <p role="status">Loading garment…</p>
        ) : (
          <div className="product-detail">
            <div>
              <div className="detail-image">
                {product.images[active] && (
                  <img
                    src={product.images[active].url}
                    alt={`${product.name}, ${product.images[active].role} view`}
                  />
                )}
              </div>
              <div className="thumbnails">
                {product.images.map((img, i) => (
                  <button
                    key={img.id}
                    className={active === i ? "selected" : ""}
                    onClick={() => setActive(i)}
                    aria-label={`View ${img.role} image ${i + 1}`}
                    aria-pressed={active === i}
                  >
                    <img src={img.url} alt="" />
                  </button>
                ))}
              </div>
              <p className="muted">
                {product.images[active]?.kind === "generated"
                  ? "AI-generated catalog visualization. Inspect the original views for garment details."
                  : "Original garment photograph."}
              </p>
            </div>
            <div className="detail-copy">
              <p className="muted">
                {categoryName(product.category)} · {audienceOf(product)} ·{" "}
                {product.sku}
              </p>
              <h1>{product.name}</h1>
              {money(product) && <p className="price">{money(product)}</p>}
              <p className="description">{product.description}</p>
              {product.sizes && (
                <p>
                  <strong>Size information</strong>
                  <br />
                  {product.sizes}
                </p>
              )}
              <button className="gold wide" onClick={() => setOpen(true)}>
                <Icon name="spark" />
                Try it on me
              </button>
              <p className="privacy-note">
                Your photo stays private and expires after one hour. A visual
                preview, not a fit guarantee.
              </p>
              <details open>
                <summary>About your visualization</summary>
                <p>
                  See this garment in a new way using a photo of yourself. AI
                  may change color, pattern, drape or body details. Refer to the
                  product photographs and description when choosing your
                  garment.
                </p>
              </details>
              <details>
                <summary>Photo guidance</summary>
                <p>
                  Use a clear, well-lit photo of one consenting adult. A
                  full-body view works best for sarees and suits. Avoid a
                  face-only selfie, heavy blur and hidden garment areas.
                </p>
              </details>
            </div>
          </div>
        )}
      </main>
      {open && product && (
        <TryOn
          product={product}
          products={[product]}
          onSelect={() => {}}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
