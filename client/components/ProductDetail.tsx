"use client";
import { useState } from "react";
import Link from "next/link";
import { Product, errorText, money } from "@/lib/api";
import { audienceOf, categoryName } from "@/lib/catalog";
import Icon from "@/components/Icon";
import Header from "./Header";
import Footer from "./Footer";
import { useCommerce } from "../lib/Commerce";
import { useResource } from "../lib/useResource";
export default function ProductDetail({ id }: { id: string }) {
  const item = useResource<Product>(`/products/${id}`),
    { add } = useCommerce();
  const [active, setActive] = useState(0),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const product = item.data,
    sizes =
      product?.sizes
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean) || [],
    room =
      !!product &&
      ["furniture", "decor", "curtains"].includes(product.category);
  return (
    <>
      <Header />
      <main id="customer-content" className="customer-section">
        <Link className="back-link" href="/shop">
          Back to the collection
        </Link>
        {item.error ? (
          <div role="alert" className="empty">
            <h1>Product unavailable</h1>
            <p>{item.error}</p>
            <button onClick={item.reload}>Try again</button>
          </div>
        ) : !product ? (
          <p role="status">Loading your product…</p>
        ) : (
          <div className="product-detail customer-detail">
            <section aria-label="Product images">
              <div className="detail-image">
                {product.images[active] && (
                  <img
                    src={product.images[active].url}
                    alt={`${product.name}, ${product.images[active].role} view`}
                  />
                )}
              </div>
              <div className="thumbnails">
                {product.images.map((image, index) => (
                  <button
                    key={image.id}
                    aria-label={`View ${image.role} image ${index + 1}`}
                    aria-pressed={active === index}
                    onClick={() => setActive(index)}
                  >
                    <img src={image.url} alt="" />
                  </button>
                ))}
              </div>
              <p className="muted">
                {product.images[active]?.kind === "generated"
                  ? "AI-generated catalog visualization. Check the original product details before ordering."
                  : "Original product photo."}
              </p>
            </section>
            <section className="detail-copy">
              <p className="product-meta">
                {categoryName(product.category)} · {audienceOf(product)} ·{" "}
                {product.sku}
              </p>
              <h1>{product.name}</h1>
              <p className="price">
                {product.fixture
                  ? "Demonstration sample · not for sale"
                  : money(product) || "Price on request"}
              </p>
              <p className="description">{product.description}</p>
              {product.fixture && (
                <p className="fixture-banner">
                  AI-created demonstration product. You can explore styling, but
                  this sample cannot be ordered.
                </p>
              )}
              <Link className="gold button wide" href={`/style/${id}`}>
                <Icon name="spark" />
                {room ? "View in your room" : "Try it on me"}
              </Link>
              <p className="privacy-note">
                Use your own photo for a private preview. Photos and results
                expire after one hour.
              </p>
              <form
                className="purchase-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!product) return;
                  const form = new FormData(e.currentTarget);
                  setError("");
                  try {
                    add(
                      product,
                      Number(form.get("quantity")),
                      String(form.get("size") || ""),
                      String(form.get("color") || ""),
                    );
                    setMessage("Added to your cart.");
                  } catch (err) {
                    setError(errorText(err));
                  }
                }}
              >
                {sizes.length > 0 && (
                  <label className="field">
                    Size
                    <select
                      name="size"
                      required
                      defaultValue={sizes.length === 1 ? sizes[0] : ""}
                    >
                      <option value="" disabled>
                        Choose a size
                      </option>
                      {sizes.map((size) => (
                        <option key={size}>{size}</option>
                      ))}
                    </select>
                  </label>
                )}
                {!!product.colors?.length && (
                  <label className="field">
                    Color
                    <select
                      name="color"
                      required
                      defaultValue={
                        product.colors.length === 1 ? product.colors[0] : ""
                      }
                    >
                      <option value="" disabled>
                        Choose a color
                      </option>
                      {product.colors.map((color) => (
                        <option key={color}>{color}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="field">
                  Quantity
                  <input
                    name="quantity"
                    type="number"
                    min={1}
                    max={20}
                    defaultValue={1}
                    required
                  />
                </label>
                <button
                  className="wide"
                  disabled={product.fixture || product.price_minor === null}
                >
                  Add to cart <Icon name="bag" size={17} />
                </button>
              </form>
              {message && (
                <p className="cart-feedback" role="status">
                  {message} <Link href="/cart">View cart</Link>
                </p>
              )}
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <details className="product-notes">
                <summary>About your preview</summary>
                <p>
                  {room
                    ? "Upload a clear room photo. Placement previews may change details and do not measure room dimensions."
                    : "Upload a clear photo of yourself. AI can change details; compare the face, natural body shape and chosen product."}
                </p>
                <p>
                  Back and side previews use separate photos for those views. A
                  preview is not a fit guarantee.
                </p>
              </details>
            </section>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
