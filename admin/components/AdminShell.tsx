"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Account,
  Health,
  accountLogin,
  api,
  errorText,
  logout,
} from "@/lib/api";

const links = [
  ["dashboard", "Overview"],
  ["products", "Products"],
  ["ai-generate", "Create catalog images"],
  ["models", "Photo library"],
  ["orders", "Orders"],
];
export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [user, setUser] = useState<Account>(),
    [checking, setChecking] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [health, setHealth] = useState<Health>();
  useEffect(() => {
    api<Account>("/auth/me")
      .then((u) => {
        if (u.role === "admin") setUser(u);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
    api<Health>("/health")
      .then(setHealth)
      .catch(() => {});
  }, []);
  const signOut = async () => {
    try {
      await logout();
      setUser(undefined);
    } catch (err) {
      setError(errorText(err));
    }
  };
  if (checking)
    return (
      <main className="admin-loading" role="status">
        Opening Merchant Studio…
      </main>
    );
  if (!user)
    return (
      <main className="admin-login">
        <section className="studio-welcome">
          <Link href="/" className="brand">
            VYUMI<span>MERCHANT STUDIO</span>
          </Link>
          <h1>
            A beautiful catalog
            <br />
            starts here.
          </h1>
          <p>
            Bring your product photos, choose a model, and publish the images
            you’re proud of.
          </p>
          <ol className="studio-process">
            <li>Prepare your product</li>
            <li>Create a catalog preview</li>
            <li>Review, then publish</li>
          </ol>
          <p className="muted">
            Your original photos stay private until you choose what to publish.
          </p>
        </section>
        <form
          className="studio-signin"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const data = new FormData(e.currentTarget);
            try {
              const session = await accountLogin(
                String(data.get("email")),
                String(data.get("password")),
              );
              if (session.user?.role !== "admin") {
                await logout();
                throw new Error(
                  "This account does not have store access. Sign in with your administrator account.",
                );
              }
              setUser(session.user);
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>Welcome to your studio</h2>
          <p>Sign in with your store administrator account.</p>
          <label className="field">
            Email
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label className="field">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="gold wide" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <p className="muted">Need access? Contact the store owner.</p>
        </form>
      </main>
    );
  return (
    <div className="admin-shell">
      <a className="admin-skip" href="#studio-content">
        Skip to content
      </a>
      <aside className="admin-sidebar">
        <Link href="/admin/dashboard" className="brand">
          VYUMI<span>MERCHANT STUDIO</span>
        </Link>
        <nav aria-label="Studio navigation">
          {links.map(([id, label]) => (
            <Link
              key={id}
              href={`/admin/${id}`}
              aria-current={
                pathname.startsWith(`/admin/${id}`) ? "page" : undefined
              }
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="admin-owner">
          <span>{user.name}</span>
          <small>{user.email}</small>
          <button onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <span>Merchant Studio</span>
          <div className="admin-actions">
            <a
              href={
                process.env.NEXT_PUBLIC_CLIENT_URL || "http://127.0.0.1:3003"
              }
            >
              Open storefront
            </a>
            <button className="admin-mobile-signout" onClick={signOut}>
              Sign out
            </button>
          </div>
        </header>
        {health?.generation_mode === "fixture" && (
          <div className="studio-notice">
            Demo workspace · Generated results are fixed samples, not
            personalized images.
          </div>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <main id="studio-content" className="admin-content">
          {children}
        </main>
      </div>
    </div>
  );
}
