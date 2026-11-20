export type ProductImage = {
  id: string;
  url: string;
  kind: "original" | "generated";
  role: string;
  approved: boolean;
  public: boolean;
};
export type Product = {
  id: string;
  version: number;
  sku: string;
  name: string;
  category: "saree" | "suit";
  description: string;
  price_minor: number | null;
  currency: string;
  sizes: string;
  published: boolean;
  reference_id: string | null;
  images: ProductImage[];
  fixture?: boolean;
  status?: "Draft" | "Generating" | "Needs review" | "Published";
  latest_job?: Job | null;
};
export type Job = {
  job_id: string;
  operation: string;
  status: string;
  result_image_url?: string;
  error_code?: string;
  message?: string;
  fixture: boolean;
  expires_at?: number;
};
export type Health = {
  status: string;
  provider_ready: boolean;
  provider?: "Gemini" | "FASHN";
  validator_ready: boolean;
  generation_mode: "live" | "fixture";
  remaining_allowance: number;
};
export type Photo = {
  id: string;
  url: string;
  expires_at: number;
  checks: { accepted: boolean; code: string; message: string };
};
type Session = { role: string; csrf_token: string };
let session: Session | undefined;
let pending: Promise<Session> | undefined;
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function ensureSession(): Promise<Session> {
  if (session) return session;
  if (!pending)
    pending = fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then(read<Session>)
      .then((s) => (session = s))
      .finally(() => {
        pending = undefined;
      });
  return pending;
}
async function read<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      data?.detail?.code || "request_failed",
      data?.detail?.message ||
        "The request could not be completed. Please try again.",
      response.status,
    );
  return data as T;
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== "GET")
    headers["X-CSRF-Token"] = (await ensureSession()).csrf_token;
  if (body !== undefined && !(body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body:
      body instanceof FormData
        ? body
        : body === undefined
          ? undefined
          : JSON.stringify(body),
    cache: "no-store",
  });
  if (response.status === 401) {
    session = undefined;
  }
  return read<T>(response);
}
export async function merchantLogin(token: string) {
  session = await read<Session>(
    await fetch("/api/merchant/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }),
  );
  return session;
}
export async function logout() {
  await api("/sessions/logout", "POST", {});
  session = undefined;
}

type SavedGeneration = {
  scope: string;
  payload: Record<string, unknown>;
  key: string;
  job?: Job;
};
const requestSlot = (path: string) => `vyumi-generation:${path}`;
export function savedGeneration(path: string): SavedGeneration | undefined {
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(requestSlot(path)) || "null",
    );
    return saved?.scope === session?.csrf_token ? saved : undefined;
  } catch {
    return undefined;
  }
}
export function clearGeneration(path: string) {
  sessionStorage.removeItem(requestSlot(path));
}
export async function generationRequest(
  path: string,
  payload: Record<string, unknown>,
  completedJobId?: string,
): Promise<Job> {
  const current = await ensureSession();
  const previous = savedGeneration(path);
  const key =
    previous &&
    JSON.stringify(previous.payload) === JSON.stringify(payload) &&
    !(completedJobId && previous.job?.job_id === completedJobId)
      ? previous.key
      : crypto.randomUUID();
  const saved: SavedGeneration = { scope: current.csrf_token, payload, key };
  sessionStorage.setItem(requestSlot(path), JSON.stringify(saved));
  const job = await api<Job>(path, "POST", {
    ...payload,
    idempotency_key: key,
  });
  sessionStorage.setItem(requestSlot(path), JSON.stringify({ ...saved, job }));
  return job;
}
export const money = (p: Product) =>
  p.price_minor === null
    ? ""
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: p.currency,
        maximumFractionDigits: 2,
      }).format(p.price_minor / 100);
export const terminal = (j: Job) =>
  ["completed", "failed", "expired", "cancelled", "needs_review"].includes(
    j.status,
  );
export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";
