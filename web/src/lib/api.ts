const API_URL = typeof window === "undefined"
  ? (process.env.API_INTERNAL_URL ?? "http://api:3001")
  : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001");

export async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}
