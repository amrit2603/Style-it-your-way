"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { accountLogin, accountSignup, errorText, logout } from "@/lib/api";
import Header from "./Header";
import Footer from "./Footer";
import { formatMoney, useCommerce } from "../lib/Commerce";
import { useResource } from "../lib/useResource";
import type { Order } from "./Checkout";
export default function AccountPage() {
  const router = useRouter(),
    { user, accountReady, refreshAccount } = useCommerce();
  const orders = useResource<Order[]>(user ? "/orders" : undefined);
  const [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <Header />
      <main id="customer-content" className="customer-section account-main">
        {!accountReady ? (
          <p role="status">Opening your account…</p>
        ) : !user ? (
          <div className="customer-account-layout">
            <section>
              <h1>{signup ? "Make yourself at home." : "Welcome back."}</h1>
              <p>
                Keep track of your orders and return to the pieces you love.
              </p>
              <p className="muted">
                Signing in starts a new private photo session. Your cart stays
                with you.
              </p>
            </section>
            <form
              className="customer-account-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                const values = new FormData(e.currentTarget);
                try {
                  if (signup)
                    await accountSignup(
                      String(values.get("name")),
                      String(values.get("email")),
                      String(values.get("password")),
                    );
                  else
                    await accountLogin(
                      String(values.get("email")),
                      String(values.get("password")),
                    );
                  await refreshAccount();
                  const next =
                    new URLSearchParams(window.location.search).get("next") ||
                    "/account";
                  router.replace(
                    /^\/(checkout|orders\/[a-zA-Z0-9-]+)$/.test(next)
                      ? next
                      : "/account",
                  );
                } catch (err) {
                  setError(errorText(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h2>{signup ? "Create an account" : "Sign in"}</h2>
              {signup && (
                <label className="field">
                  Your name
                  <input
                    name="name"
                    autoComplete="name"
                    maxLength={120}
                    required
                  />
                </label>
              )}
              <label className="field">
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                />
              </label>
              <label className="field">
                Password
                <input
                  name="password"
                  aria-label="Password"
                  aria-describedby={signup ? "password-help" : undefined}
                  type="password"
                  autoComplete={signup ? "new-password" : "current-password"}
                  minLength={12}
                  maxLength={128}
                  required
                />
                {signup && (
                  <small id="password-help">Use at least 12 characters.</small>
                )}
              </label>
              <button className="gold wide" disabled={busy}>
                {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
              </button>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <button
                type="button"
                className="account-switch"
                onClick={() => {
                  setSignup((value) => !value);
                  setError("");
                }}
              >
                {signup ? "I already have an account" : "Create an account"}
              </button>
            </form>
          </div>
        ) : (
          <>
            <div className="customer-section-heading">
              <div>
                <h1>Hello, {user.name}.</h1>
                <p>{user.email}</p>
              </div>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await logout();
                    await refreshAccount();
                  } catch (err) {
                    setError(errorText(err));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Sign out
              </button>
            </div>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <h2>Your orders</h2>
            {orders.error ? (
              <div role="alert" className="empty">
                <p>{orders.error}</p>
                <button onClick={orders.reload}>Try again</button>
              </div>
            ) : orders.loading ? (
              <p role="status">Loading your orders…</p>
            ) : orders.data?.length ? (
              <div className="customer-orders">
                {orders.data.map((order) => (
                  <Link
                    className="customer-order"
                    href={`/orders/${order.id}`}
                    key={order.id}
                  >
                    <div>
                      <strong>Order {order.id.slice(0, 8)}</strong>
                      <span>
                        {new Date(order.created * 1000).toLocaleDateString(
                          "en-IN",
                        )}
                      </span>
                    </div>
                    <span>
                      {order.items.reduce(
                        (sum, item) => sum + item.quantity,
                        0,
                      )}{" "}
                      items
                    </span>
                    <span className="order-status">{order.status}</span>
                    <strong>{formatMoney(order.total, order.currency)}</strong>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="empty">
                <h3>Your first order starts here.</h3>
                <p>Explore the collection and find your next piece.</p>
                <Link className="button gold" href="/shop">
                  Explore the collection
                </Link>
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
