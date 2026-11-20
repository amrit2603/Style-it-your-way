"use client";
import { useRef, useState } from "react";
import { api, errorText, Product } from "@/lib/api";
import Icon from "./Icon";

type Pdf = { id: string; name: string; page_count: number };
type Crop = { x: number; y: number; width: number; height: number };
export default function PdfSelector({
  productId,
  onImported,
}: {
  productId: string;
  onImported: (p: Product) => void;
}) {
  const [pdf, setPdf] = useState<Pdf>(),
    [page, setPage] = useState(0),
    [crop, setCrop] = useState<Crop>({ x: 0, y: 0, width: 1, height: 1 }),
    [role, setRole] = useState("main"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    image = useRef<HTMLImageElement>(null),
    start = useRef<{ x: number; y: number } | null>(null);
  const upload = async (file: File) => {
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("file", file);
      setPdf(await api<Pdf>("/merchant/pdfs", "POST", body));
      setPage(0);
      setCrop({ x: 0, y: 0, width: 1, height: 1 });
      setLoaded(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  const point = (e: React.PointerEvent) => {
    const r = image.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };
  const importCrop = async () => {
    if (!pdf) return;
    setBusy(true);
    setError("");
    try {
      onImported(
        await api<Product>(`/merchant/pdfs/${pdf.id}/crops`, "POST", {
          product_id: productId,
          page,
          ...crop,
          role,
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="pdf-selector">
      <div className="section-heading">
        <div>
          <h3>Import from a PDF catalog</h3>
          <p>
            Choose a page, select one garment, and confirm its details yourself.
          </p>
        </div>
        <button disabled={busy} onClick={() => input.current?.click()}>
          <Icon name="upload" />
          {pdf ? "Choose another PDF" : "Upload PDF"}
        </button>
      </div>
      <input
        ref={input}
        className="visually-hidden"
        aria-label="Upload PDF catalog"
        type="file"
        accept="application/pdf"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />
      {busy && !pdf && <p role="status">Reading your catalog…</p>}
      {pdf && (
        <>
          <div className="pdf-meta">
            <strong>{pdf.name}</strong>
            <span>{pdf.page_count} pages · source stays private</span>
          </div>
          <div className="pdf-pages" aria-label="PDF pages">
            {Array.from({ length: pdf.page_count }, (_, i) => (
              <button
                key={i}
                className={i === page ? "selected" : ""}
                onClick={() => {
                  setPage(i);
                  setCrop({ x: 0, y: 0, width: 1, height: 1 });
                  setLoaded(false);
                }}
                aria-label={`Select PDF page ${i + 1}`}
                aria-pressed={i === page}
              >
                <img
                  loading="lazy"
                  src={`/api/merchant/pdfs/${pdf.id}/pages/${i}?thumbnail=true`}
                  alt=""
                />
                <span>{i + 1}</span>
              </button>
            ))}
          </div>
          <div className="pdf-workspace">
            <div>
              <p className="muted">
                Drag over the garment, or use the crop fields. One garment per
                selection.
              </p>
              <div className="pdf-scroll">
                <div
                  className="pdf-canvas"
                  onPointerDown={(e) => {
                    if (!loaded || !image.current) return;
                    start.current = point(e);
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (!start.current) return;
                    const end = point(e),
                      s = start.current;
                    setCrop({
                      x: Math.min(s.x, end.x),
                      y: Math.min(s.y, end.y),
                      width: Math.max(0.001, Math.abs(s.x - end.x)),
                      height: Math.max(0.001, Math.abs(s.y - end.y)),
                    });
                  }}
                  onPointerUp={() => {
                    start.current = null;
                  }}
                  onPointerCancel={() => {
                    start.current = null;
                  }}
                >
                  <img
                    ref={image}
                    draggable={false}
                    src={`/api/merchant/pdfs/${pdf.id}/pages/${page}`}
                    alt={`PDF page ${page + 1}; use crop fields to select a garment`}
                    onLoad={() => setLoaded(true)}
                    onError={() =>
                      setError(
                        "This page preview could not load. Select another page or try uploading the PDF again.",
                      )
                    }
                  />
                  {loaded && (
                    <div
                      className="crop-outline"
                      style={{
                        left: `${crop.x * 100}%`,
                        top: `${crop.y * 100}%`,
                        width: `${crop.width * 100}%`,
                        height: `${crop.height * 100}%`,
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
            <div className="crop-controls">
              <h4>Selected region</h4>
              <div className="crop-fields">
                {(
                  [
                    ["x", "Left"],
                    ["y", "Top"],
                    ["width", "Width"],
                    ["height", "Height"],
                  ] as const
                ).map(([key, label]) => (
                  <label className="field" key={key}>
                    {label} (%)
                    <input
                      aria-label={`Crop ${label.toLowerCase()} percent`}
                      type="number"
                      min={key === "width" || key === "height" ? 1 : 0}
                      max="100"
                      step="0.1"
                      value={Math.round(crop[key] * 1000) / 10}
                      onChange={(e) =>
                        setCrop({
                          ...crop,
                          [key]: Number(e.target.value) / 100,
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <button
                className="wide"
                onClick={() => setCrop({ x: 0, y: 0, width: 1, height: 1 })}
              >
                Use whole page
              </button>
              <label className="field">
                Image role
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="main">Main garment</option>
                  <option value="reverse">Reverse view</option>
                  <option value="detail">Fabric / detail</option>
                </select>
              </label>
              <p className="muted">
                The region must be at least 512 px on its shorter side after
                rendering.
              </p>
              <button
                className="gold wide"
                onClick={importCrop}
                disabled={busy || !loaded}
              >
                {busy ? "Importing…" : "Add selection to garment"}
              </button>
            </div>
          </div>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
