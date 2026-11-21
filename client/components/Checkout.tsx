"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError, errorText } from "@/lib/api";
import Header from "./Header";
import Footer from "./Footer";
import { formatMoney, useCommerce } from "../lib/Commerce";
import { useResource } from "../lib/useResource";
export type Order = {
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
function EmptyCart() {
  return (
    <div className="empty">
      <h2>Your cart is waiting.</h2>
      <p>Choose something you’d like to make your own.</p>
      <Link className="button gold" href="/shop">
        Explore the collection
      </Link>
    </div>
  );
}
export function Cart() {
  const { cart, ready, quantity, remove } = useCommerce();
  const currency = cart[0]?.currency || "INR",
    mixed = cart.some((item) => item.currency !== currency);
  return (
    <>
      <Header />
      <main id="customer-content" className="customer-section">
        <div className="customer-section-heading">
          <div>
            <h1>Your cart</h1>
            <p>A little closer to your next look.</p>
          </div>
          <Link href="/shop">Continue shopping</Link>
        </div>
        {!ready ? (
          <p role="status">Opening your cart…</p>
        ) : !cart.length ? (
          <EmptyCart />
        ) : (
          <div className="checkout-layout">
            <section className="cart-items">
              {cart.map((item) => (
                <article key={item.key} className="cart-item">
                  {item.image && <img src={item.image} alt={item.name} />}
                  <div>
                    <Link href={`/products/${item.product_id}`}>
                      <h2>{item.name}</h2>
                    </Link>
                    <p>{[item.size, item.color].filter(Boolean).join(" · ")}</p>
                    <p>{formatMoney(item.price_minor, item.currency)} each</p>
                    <div className="cart-item-actions">
                      <label>
                        Quantity
                        <input
                          aria-label={`Quantity for ${item.name}`}
                          type="number"
                          min={1}
                          max={20}
                          value={item.quantity}
                          onChange={(e) =>
                            quantity(item.key, Number(e.target.value))
                          }
                        />
                      </label>
                      <button
                        onClick={() => remove(item.key)}
                        aria-label={`Remove ${item.name}`}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <strong>
                    {formatMoney(
                      item.price_minor * item.quantity,
                      item.currency,
                    )}
                  </strong>
                </article>
              ))}
            </section>
            <aside className="order-summary">
              <h2>Order summary</h2>
              <div className="summary-total">
                <span>Estimated subtotal</span>
                <strong>
                  {mixed
                    ? "Multiple currencies"
                    : formatMoney(
                        cart.reduce(
                          (sum, item) => sum + item.price_minor * item.quantity,
                          0,
                        ),
                        currency,
                      )}
                </strong>
              </div>
              <p>
                Prices are confirmed when your order is recorded. Delivery and
                payment are arranged with the store.
              </p>
              {mixed ? (
                <p role="alert" className="error">
                  Place separate orders for different currencies.
                </p>
              ) : (
                <Link className="button gold wide" href="/checkout">
                  Continue to checkout
                </Link>
              )}
            </aside>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
export function Checkout() {
  const router = useRouter(),
    { cart, ready, user, accountReady, clear } = useCommerce();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [uncertain, setUncertain] = useState(false);
  const currency = cart[0]?.currency || "INR",
    mixed = cart.some((item) => item.currency !== currency);
  return (
    <>
      <Header />
      <main id="customer-content" className="customer-section">
        <Link href="/cart" className="back-link">
          Back to cart
        </Link>
        <h1>Checkout</h1>
        {!ready || !accountReady ? (
          <p role="status">Preparing checkout…</p>
        ) : !cart.length ? (
          <EmptyCart />
        ) : !user ? (
          <div className="empty">
            <h2>Sign in to place your order</h2>
            <p>Your cart is saved while you sign in.</p>
            <Link className="button gold" href="/account?next=/checkout">
              Sign in or create an account
            </Link>
          </div>
        ) : (
          <div className="checkout-layout">
            <form
              className="checkout-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                setUncertain(false);
                const values = new FormData(e.currentTarget),
                  slot = `vyumi-checkout:${user.id}`;
                const payload = {
                  items: cart.map((item) => ({
                    product_id: item.product_id,
                    quantity: item.quantity,
                    size: item.size,
                    color: item.color,
                  })),
                  name: String(values.get("name")).trim(),
                  address: String(values.get("address")).trim(),
                  phone: String(values.get("phone")).trim(),
                };
                try {
                  const hash = [
                    ...new Uint8Array(
                      await crypto.subtle.digest(
                        "SHA-256",
                        new TextEncoder().encode(JSON.stringify(payload)),
                      ),
                    ),
                  ]
                    .map((value) => value.toString(16).padStart(2, "0"))
                    .join("");
                  const saved = JSON.parse(
                    sessionStorage.getItem(slot) || "null",
                  );
                  if (saved?.hash && saved.hash !== hash) {
                    setUncertain(true);
                    throw new Error(
                      "An earlier checkout is unconfirmed. Check your orders before starting a different checkout.",
                    );
                  }
                  const key =
                    saved?.hash === hash && typeof saved.key === "string"
                      ? saved.key
                      : crypto.randomUUID();
                  sessionStorage.setItem(slot, JSON.stringify({ hash, key }));
                  let order: Order;
                  try {
                    order = await api<Order>("/orders", "POST", {
                      ...payload,
                      idempotency_key: key,
                    });
                  } catch (err) {
                    if (
                      err instanceof ApiError &&
                      err.status >= 400 &&
                      err.status < 500
                    )
                      sessionStorage.removeItem(slot);
                    else setUncertain(true);
                    throw err;
                  }
                  sessionStorage.removeItem(slot);
                  clear();
                  router.push(`/orders/${order.id}`);
                } catch (err) {
                  setError(errorText(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h2>Delivery details</h2>
              <label className="field">
                Full name
                <input
                  name="name"
                  defaultValue={user.name}
                  autoComplete="shipping name"
                  maxLength={120}
                  required
                />
              </label>
              <label className="field">
                Delivery address
                <textarea
                  name="address"
                  autoComplete="shipping street-address"
                  minLength={10}
                  maxLength={1000}
                  rows={4}
                  required
                />
              </label>
              <label className="field">
                Phone number
                <input
                  name="phone"
                  type="tel"
                  autoComplete="shipping tel"
                  minLength={7}
                  maxLength={30}
                  required
                />
              </label>
              <p className="privacy-note">
                This records an unpaid order. No online payment is collected.
              </p>
              <button className="gold wide" disabled={busy || mixed}>
                {busy ? "Recording your order…" : "Place order"}
              </button>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              {uncertain && (
                <div className="checkout-recovery">
                  <p>
                    The request may have reached the store. Retry the same
                    details to reuse it, or check your order history first.
                  </p>
                  <Link href="/account">Check my orders</Link>
                  <button
                    type="button"
                    onClick={() => {
                      sessionStorage.removeItem(`vyumi-checkout:${user.id}`);
                      setUncertain(false);
                      setError("");
                    }}
                  >
                    Start a different checkout
                  </button>
                </div>
              )}
            </form>
            <aside className="order-summary">
              <h2>Your selection</h2>
              <ul>
                {cart.map((item) => (
                  <li key={item.key}>
                    <span>
                      {item.quantity} × {item.name}
                    </span>
                    <strong>
                      {formatMoney(
                        item.price_minor * item.quantity,
                        item.currency,
                      )}
                    </strong>
                  </li>
                ))}
              </ul>
              <div className="summary-total">
                <span>Estimated subtotal</span>
                <strong>
                  {mixed
                    ? "Multiple currencies"
                    : formatMoney(
                        cart.reduce(
                          (sum, item) => sum + item.price_minor * item.quantity,
                          0,
                        ),
                        currency,
                      )}
                </strong>
              </div>
              {mixed && (
                <p role="alert" className="error">
                  Return to your cart and place separate orders for different
                  currencies.
                </p>
              )}
              <p>The store confirms delivery and payment separately.</p>
            </aside>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
export function Receipt({ id }: { id: string }) {
  const { user, accountReady } = useCommerce(),
    order = useResource<Order>(user ? `/orders/${id}` : undefined);
  return (
    <>
      <Header />
      <main id="customer-content" className="customer-section receipt-main">
        {!accountReady ? (
          <p role="status">Opening your order…</p>
        ) : !user ? (
          <div className="empty">
            <h1>Sign in to view this order</h1>
            <Link
              href={`/account?next=${encodeURIComponent(`/orders/${id}`)}`}
              className="button gold"
            >
              Sign in
            </Link>
          </div>
        ) : order.error ? (
          <div className="empty" role="alert">
            <h1>Order unavailable</h1>
            <p>{order.error}</p>
          </div>
        ) : !order.data ? (
          <p role="status">Loading your order…</p>
        ) : (
          <>
            <h1>Order received.</h1>
            <p>
              Thank you, {order.data.name}. The store has received your order.
            </p>
            <div className="receipt-reference">
              <strong>Order {order.data.id.slice(0, 8)}</strong>
              <span className="order-status">{order.data.status}</span>
              <time>
                {new Date(order.data.created * 1000).toLocaleDateString(
                  "en-IN",
                )}
              </time>
            </div>
            <section className="order-summary">
              <h2>Your order</h2>
              <ul>
                {order.data.items.map((item, index) => (
                  <li key={index}>
                    <span>
                      {item.quantity} × {item.name}
                      {item.size && ` · ${item.size}`}
                      {item.color && ` · ${item.color}`}
                    </span>
                    <strong>
                      {formatMoney(
                        item.price * item.quantity,
                        order.data!.currency,
                      )}
                    </strong>
                  </li>
                ))}
              </ul>
              <div className="summary-total">
                <span>Confirmed total</span>
                <strong>
                  {formatMoney(order.data.total, order.data.currency)}
                </strong>
              </div>
              <p>
                Payment is arranged separately. This receipt does not confirm
                payment or reserve stock.
              </p>
            </section>
            <section className="receipt-address">
              <h2>Delivery details</h2>
              <address>
                {order.data.name}
                <br />
                {order.data.address}
                <br />
                {order.data.phone}
              </address>
            </section>
            <div className="receipt-actions">
              <Link className="button gold" href="/shop">
                Continue shopping
              </Link>
              <Link className="button" href="/account">
                View your orders
              </Link>
            </div>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
