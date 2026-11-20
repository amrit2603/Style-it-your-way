"use client";
import { useEffect, useState } from "react";
import { ensureSession, errorText, merchantLogin } from "@/lib/api";
import Header from "./Header";

export default function MerchantGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false),
    [loading, setLoading] = useState(true),
    [token, setToken] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    ensureSession()
      .then((s) => setReady(s.role === "merchant"))
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false));
  }, []);
  if (ready) return <>{children}</>;
  return (
    <>
      <Header merchant />
      <main className="login-page">
        <div className="login-intro">
          <h1>
            Your collection,
            <br />
            ready for its close-up.
          </h1>
          <p>
            Upload garment photos or a PDF catalog, create AI previews, and
            publish only the images you approve.
          </p>
          <div className="workflow-inline">
            <span>Upload</span>
            <span>Generate</span>
            <span>Review</span>
            <span>Publish</span>
          </div>
        </div>
        <form
          className="login-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            setError("");
            try {
              await merchantLogin(token);
              setReady(true);
            } catch (err) {
              setError(errorText(err));
            } finally {
              setLoading(false);
            }
          }}
        >
          <h2>Merchant studio</h2>
          <p>
            This local workspace is protected by the merchant token in your
            backend settings.
          </p>
          <label className="field">
            Local access token
            <input
              type="password"
              autoComplete="current-password"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          <button className="gold wide" disabled={loading}>
            {loading ? "Connecting…" : "Open studio"}
          </button>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <p className="muted">
            Prototype access only. This workspace is not configured for public
            hosting.
          </p>
        </form>
      </main>
    </>
  );
}
