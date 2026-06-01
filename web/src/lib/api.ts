// Server-side fetches go directly to the API service inside the Docker
// network (or localhost during `next dev`). Client-side fetches use a
// relative URL so they go through the same origin as the page — Next.js
// proxies `/api/*` to the API service (see web/next.config.ts). Single-
// origin keeps HTTPS + LAN access working without mixed-content blocks.
const API_URL =
  typeof window === "undefined"
    ? process.env.API_INTERNAL_URL ?? "http://localhost:3001"
    : "";

export async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}
